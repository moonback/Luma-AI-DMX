import { Fragment, useState } from 'react';
import { ArrowDown, ArrowUp, Camera, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import { act } from '../api';
import { useT } from '../i18n';
import { Field, Modal, NumberInput } from '../components/ui';
import { shrinkImage } from './visualizer/sceneCards';
import { attributeLabel } from '../../core/fixtures/attributes';
import { slug } from '../../core/fixtures/ofl';
import { BUILTIN_ATTRIBUTES, FIXTURE_TYPES, RANGE_KINDS, profileSchema, type Channel, type ChannelRange, type FixtureProfile } from '../../core/model/schemas';

/** Manual tables have small print: keep more pixels than for a stage photo. */
const MANUAL_MAX_PX = 2400;
const MAX_PAGES = 4;

/** Same id as the core gives, so a corrected name still replaces the profile of the same fixture. */
const photoId = (manufacturer: string, name: string) => `photo-${slug(manufacturer)}-${slug(name)}`.slice(0, 64);

/** Values in these ranges are only sent after confirmation (same rule as the AI transcription). */
const DANGEROUS_KINDS = new Set<string>(['reset', 'lamp-off']);

/** Ranges of one channel: value span, label, kind and (colour wheel) slot colour shown on the live console chips. */
function RangesEditor({ ranges, onChange }: { ranges: ChannelRange[]; onChange: (r: ChannelRange[]) => void }) {
  const tr = useT();
  const setRange = (i: number, patch: Partial<ChannelRange>) => onChange(ranges.map((r, k) => {
    if (k !== i) return r;
    const next = { ...r, ...patch };
    return { ...next, dangerous: DANGEROUS_KINDS.has(next.kind) };
  }));
  // Moving a range swaps its meaning (label, kind, colour) with the neighbour; the DMX spans stay in value order.
  const move = (i: number, j: number) => {
    const a = ranges[i]!, b = ranges[j]!;
    const next = [...ranges];
    next[i] = { ...b, from: a.from, to: a.to };
    next[j] = { ...a, from: b.from, to: b.to };
    onChange(next);
  };
  const last = ranges[ranges.length - 1];
  const fresh = (from: number): ChannelRange => ({ from, to: 255, label: tr('pphoto.range.new'), kind: 'other', dangerous: false });
  // New range after the last one; when the last already ends at 255, split it in two.
  const add = () => {
    if (!last) return onChange([fresh(0)]);
    if (last.to < 255) return onChange([...ranges, fresh(last.to + 1)]);
    const mid = Math.floor((last.from + last.to) / 2);
    onChange([...ranges.slice(0, -1), { ...last, to: mid }, fresh(mid + 1)]);
  };
  return (
    <div className="col" style={{ gap: 4, padding: '4px 0 8px 24px' }} data-testid="range-editor">
      {ranges.map((r, i) => (
        <div key={i} className="row" style={{ gap: 6 }}>
          <NumberInput value={r.from} min={0} max={255} onChange={(v) => setRange(i, { from: v })} title={tr('pphoto.range.from')} />
          <span className="muted">–</span>
          <NumberInput value={r.to} min={0} max={255} onChange={(v) => setRange(i, { to: v })} title={tr('pphoto.range.to')} />
          <input className="input" value={r.label} aria-label={tr('pphoto.range.label', { n: i + 1 })} onChange={(e) => setRange(i, { label: e.target.value })} />
          <select className="select" value={r.kind} aria-label={tr('pphoto.range.kind', { n: i + 1 })} onChange={(e) => setRange(i, { kind: e.target.value as ChannelRange['kind'] })}>
            {RANGE_KINDS.map((k) => <option key={k} value={k}>{tr(`pphoto.kind.${k}`)}</option>)}
          </select>
          <input type="color" value={r.color ?? '#ffffff'} aria-label={tr('pphoto.range.color', { n: i + 1 })} onChange={(e) => setRange(i, { color: e.target.value })} style={{ opacity: r.color ? 1 : 0.35, width: 32, flexShrink: 0 }} />
          <button className="btn sm" disabled={i === 0} aria-label={tr('pphoto.range.up', { n: i + 1 })} onClick={() => move(i, i - 1)}><ArrowUp size={13} /></button>
          <button className="btn sm" disabled={i === ranges.length - 1} aria-label={tr('pphoto.range.down', { n: i + 1 })} onClick={() => move(i, i + 1)}><ArrowDown size={13} /></button>
          <button className="btn sm danger" aria-label={tr('pphoto.range.remove', { n: i + 1 })} onClick={() => onChange(ranges.filter((_, k) => k !== i))}><Trash2 size={13} /></button>
        </div>
      ))}
      <div><button className="btn sm" disabled={!!last && last.from >= 255} onClick={add}><Plus size={13} />{tr('pphoto.range.add')}</button></div>
    </div>
  );
}

/**
 * Photo(s) of the manual's DMX chart → profile read by the AI, reviewed and corrected here, then saved to the library.
 * With `initial`, edits a saved profile directly (same id: patched fixtures keep it).
 */
export function ProfileFromPhotoDialog({ onClose, initial }: { onClose: () => void; initial?: FixtureProfile }) {
  const tr = useT();
  const known = useStore((s) => s.project!.project.profiles);
  const [images, setImages] = useState([] as string[]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<FixtureProfile | null>(initial ?? null);
  const [summary, setSummary] = useState('');
  const [modeIdx, setModeIdx] = useState(0);
  const [openCh, setOpenCh] = useState(-1);

  const addFiles = async (files: FileList | null) => {
    const picked = [...(files ?? [])].slice(0, MAX_PAGES - images.length);
    try {
      const shrunk = await Promise.all(picked.map((f) => shrinkImage(f, MANUAL_MAX_PX)));
      setImages((cur) => [...cur, ...shrunk].slice(0, MAX_PAGES));
    } catch (err) {
      useStore.getState().toast({ kind: 'error', title: tr('pphoto.unreadable'), detail: (err as Error).message });
    }
  };
  const analyse = async () => {
    setBusy(true);
    const r = await act({ type: 'ai.profileFromPhoto', images });
    setBusy(false);
    if (!r?.profile) return; // error already shown
    setDraft(r.profile);
    setModeIdx(0);
    setSummary([r.summary, r.dropped ? tr('pphoto.dropped', { n: r.dropped }) : '', ...r.notices].filter(Boolean).join(' '));
  };

  const mode = draft?.modes[modeIdx];
  const setChannels = (f: (chs: Channel[]) => Channel[]) => setDraft((d) => d && { ...d, modes: d.modes.map((m, i) => (i === modeIdx ? { ...m, channels: f(m.channels) } : m)) });
  const setChannel = (i: number, patch: Partial<Channel>) => setChannels((chs) => chs.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const check = draft ? profileSchema.safeParse(draft) : null;
  const error = check && !check.success ? check.error.issues.map((i) => i.message)[0] : null;
  const replaces = draft && known.some((p) => p.id === draft.id);

  const save = async () => {
    if (!check?.success) return;
    const r = await act({ type: 'profile.save', profile: check.data });
    if (!r) return;
    useStore.getState().toast({ kind: 'success', title: tr('pphoto.saved', { name: `${check.data.manufacturer} ${check.data.name}` }), detail: tr('pphoto.savedDetail') });
    onClose();
  };

  if (!draft) {
    return (
      <Modal title={tr('pphoto.title')} wide onClose={onClose} footer={<>
        <button className="btn" onClick={() => { if (busy) void act({ type: 'ai.cancel' }); onClose(); }}>{tr('pphoto.cancel')}</button>
        <button className="btn primary" data-testid="profile-photo-analyse" disabled={!images.length || busy} onClick={() => void analyse()}>{tr(busy ? 'pphoto.analysing' : 'pphoto.analyse')}</button>
      </>}>
        <p className="muted" style={{ marginTop: 0 }}>{tr('pphoto.intro', { n: MAX_PAGES })}</p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {images.map((src, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={src} alt={tr('pphoto.page', { n: i + 1 })} style={{ height: 120, borderRadius: 4, display: 'block' }} />
              <button className="btn sm" style={{ position: 'absolute', top: 4, right: 4 }} aria-label={tr('pphoto.removePage', { n: i + 1 })} disabled={busy} onClick={() => setImages(images.filter((_, k) => k !== i))}><X size={12} /></button>
            </div>
          ))}
          {images.length < MAX_PAGES && (
            <label className="btn" style={{ height: 120, minWidth: 140, justifyContent: 'center' }}>
              <Camera size={15} />{tr(images.length ? 'pphoto.addPage' : 'pphoto.pick')}
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-testid="profile-photo-file" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={tr(initial ? 'pphoto.editTitle' : 'pphoto.reviewTitle')} wide onClose={onClose} locked={!!initial} footer={<>
      {error && <span className="small" style={{ color: '#fca5a5', marginRight: 'auto' }}>{error}</span>}
      {!initial && <button className="btn" onClick={() => setDraft(null)}>{tr('pphoto.restart')}</button>}
      <button className="btn primary" data-testid="profile-photo-save" disabled={!!error} onClick={() => void save()}>{tr(replaces ? 'pphoto.replace' : 'pphoto.save')}</button>
    </>}>
      {summary && <p className="muted small" style={{ marginTop: 0 }}>{summary}</p>}
      <p className="small" style={{ color: '#fbbf24', marginTop: 0 }}>{tr('pphoto.warning')}</p>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <Field label={tr('pphoto.manufacturer')}><input className="input" value={draft.manufacturer} onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value, ...(initial ? {} : { id: photoId(e.target.value, draft.name) }) })} /></Field>
        <Field label={tr('pphoto.model')}><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, ...(initial ? {} : { id: photoId(draft.manufacturer, e.target.value) }) })} /></Field>
        <Field label={tr('pphoto.type')}>
          <select className="select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as FixtureProfile['type'] })}>
            {FIXTURE_TYPES.map((t) => <option key={t} value={t}>{tr(`pphoto.type.${t}`)}</option>)}
          </select>
        </Field>
      </div>
      <div className="row" style={{ gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
        {draft.modes.map((m, i) => <button key={i} className={`chip ${i === modeIdx ? 'on' : ''}`} onClick={() => { setModeIdx(i); setOpenCh(-1); }}>{tr('pphoto.modeChip', { name: m.name, n: m.channels.length })}</button>)}
      </div>
      {mode && (
        <>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <Field label={tr('pphoto.modeName')}><input className="input" value={mode.name} onChange={(e) => setDraft({ ...draft, modes: draft.modes.map((m, i) => (i === modeIdx ? { ...m, name: e.target.value } : m)) })} /></Field>
            <button className="btn sm danger" disabled={draft.modes.length < 2} title={tr('pphoto.removeMode')} onClick={() => { setDraft({ ...draft, modes: draft.modes.filter((_, i) => i !== modeIdx) }); setModeIdx(0); }}><Trash2 size={13} />{tr('pphoto.mode')}</button>
          </div>
          <div style={{ maxHeight: '50vh', overflow: 'auto', marginTop: 8 }}>
            <table className="table" data-testid="profile-photo-channels">
              <thead><tr>
                <th>{tr('pphoto.col.channel')}</th><th>{tr('pphoto.col.name')}</th><th>{tr('pphoto.col.attribute')}</th>
                <th title={tr('pphoto.col.fineTitle')}>{tr('pphoto.col.fine')}</th><th>{tr('pphoto.col.default')}</th><th>{tr('pphoto.col.ranges')}</th><th />
              </tr></thead>
              <tbody>
                {mode.channels.map((c, i) => (
                  <Fragment key={i}>
                  <tr>
                    <td className="mono">{i + 1}</td>
                    <td><input className="input" value={c.name} aria-label={tr('pphoto.chName', { n: i + 1 })} onChange={(e) => setChannel(i, { name: e.target.value })} /></td>
                    <td>
                      <select className="select" value={c.attribute} aria-label={tr('pphoto.chAttr', { n: i + 1 })} onChange={(e) => setChannel(i, { attribute: e.target.value === 'custom' ? `custom:${slug(c.name)}` : e.target.value })}>
                        {BUILTIN_ATTRIBUTES.map((a) => <option key={a} value={a}>{attributeLabel(a)}</option>)}
                        {c.attribute.startsWith('custom:') ? <option value={c.attribute}>{tr('pphoto.customNamed', { name: attributeLabel(c.attribute) })}</option> : <option value="custom">{tr('pphoto.custom')}</option>}
                      </select>
                    </td>
                    <td><input type="checkbox" checked={c.fine} aria-label={tr('pphoto.chFine', { n: i + 1 })} onChange={(e) => setChannel(i, { fine: e.target.checked })} /></td>
                    <td><NumberInput value={c.default} min={0} max={255} onChange={(v) => setChannel(i, { default: v })} title={tr('pphoto.chDefault')} /></td>
                    <td className="small">
                      <button className={`chip ${openCh === i ? 'on' : ''}`} aria-expanded={openCh === i} aria-label={tr('pphoto.range.edit', { n: i + 1 })} onClick={() => setOpenCh(openCh === i ? -1 : i)}>
                        {c.ranges.length ? c.ranges.map((r) => <span key={`${r.from}`} style={{ marginRight: 6 }}>{r.color && <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: r.color, marginRight: 3 }} />}{r.from}-{r.to} {r.label}</span>) : '0-255'}
                      </button>
                    </td>
                    <td><button className="btn sm danger" aria-label={tr('pphoto.chRemove', { n: i + 1 })} disabled={mode.channels.length < 2} onClick={() => { setChannels((chs) => chs.filter((_, k) => k !== i)); setOpenCh(-1); }}><Trash2 size={13} /></button></td>
                  </tr>
                  {openCh === i && <tr><td colSpan={7}><RangesEditor ranges={c.ranges} onChange={(ranges) => setChannel(i, { ranges })} /></td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn sm" style={{ marginTop: 8 }} disabled={mode.channels.length >= 512} onClick={() => setChannels((chs) => [...chs, { name: tr('pphoto.newChannel', { n: chs.length + 1 }), attribute: `custom:canal-${chs.length + 1}`, fine: false, default: 0, ranges: [] }])}><Plus size={13} />{tr('pphoto.addChannel')}</button>
        </>
      )}
    </Modal>
  );
}
