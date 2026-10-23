import { useEffect, useReducer } from 'react';
import { Anchor, Eye, EyeOff, FlipHorizontal2, Lock, Maximize2, Minimize2, ShieldAlert, Unlock, Upload, X } from 'lucide-react';
import type { StageProp } from '../../../core/model/schemas';
import { EQUIPMENT, EQUIPMENT_CATEGORIES, lineArrayModules, paramOf, sanitizeParams, type ParamSpec, type ParamValue, type PropKind } from '../../../core/visualizer/equipment';
import { alignProp, snapPropToTruss, type AlignMode, type SceneRef } from '../../../core/visualizer/sceneEdit';
import { useT } from '../../i18n';
import { useStore } from '../../store';
import { mirrorSceneElement } from '../../sceneActions';
import { MODEL_MAX_BYTES, modelStatus, onModelChange } from '../stage3d/equipment/models';
import { Card, DeleteBtn, NameInput, Num, patchEl, type Vis } from './sceneCards';

/* Properties of a set piece / equipment: placement and size, the settings of its kind (catalogue parameters),
   visibility and lock, alignment, mirror copy, scale, hanging under a truss and an optional imported GLB model. */

const KINDS_BY_CATEGORY = EQUIPMENT_CATEGORIES.map((c) => ({ ...c, kinds: (Object.keys(EQUIPMENT) as PropKind[]).filter((k) => EQUIPMENT[k].category === c.id) })).filter((c) => c.kinds.length);
const ALIGNS: AlignMode[] = ['center', 'front', 'back', 'left', 'right', 'floor'];
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function ParamField({ spec, value, onChange }: { spec: ParamSpec; value: ParamValue | undefined; onChange: (v: ParamValue) => void }) {
  const tr = useT();
  switch (spec.type) {
    case 'number':
      return <Num label={spec.unit ? `${spec.label} (${spec.unit})` : spec.label} title={spec.label} value={Number(value ?? spec.default)} min={spec.min} max={spec.max} step={spec.step} onChange={onChange} />;
    case 'choice':
      return (
        <label className="scene-num"><span>{spec.label}</span>
          <select className="select" value={String(value ?? spec.default)} onChange={(e) => onChange(e.target.value)} data-testid={`param-${spec.key}`}>
            {spec.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      );
    case 'bool':
      return <label className="row small scene-check"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} data-testid={`param-${spec.key}`} />{spec.label}</label>;
    default:
      return (
        <label className="scene-num span3" title={spec.key === 'angles' ? tr('equip.anglesHint') : spec.label}><span>{spec.label}</span>
          <input key={String(value ?? '')} className="input" defaultValue={String(value ?? '')} maxLength={spec.max} placeholder={spec.hint} data-testid={`param-${spec.key}`}
            onBlur={(e) => { if (e.target.value !== String(value ?? '')) onChange(e.target.value); }} />
        </label>
      );
  }
}

/** Reads a .glb file as a data URL the project schema accepts (checked: size and binary glTF header). */
async function readGlb(file: File): Promise<string> {
  if (file.size > MODEL_MAX_BYTES) throw new Error('size');
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (String.fromCharCode(...head) !== 'glTF') throw new Error('format');
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('format'));
    r.readAsDataURL(file);
  });
  return `data:model/gltf-binary;base64,${url.slice(url.indexOf(',') + 1)}`;
}

function ModelRow({ p, set }: { p: StageProp; set: (patch: Partial<StageProp>) => void }) {
  const tr = useT();
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onModelChange(refresh), []);
  const status = p.model ? modelStatus(p.model) : null;
  const label = status === 'ready' ? tr('equip.modelReady') : status === 'loading' ? tr('equip.modelLoading') : status === 'error' ? tr('equip.modelError') : tr('equip.modelProcedural');
  const toast = (title: string) => useStore.getState().toast({ kind: 'error', title });
  return (
    <div className={`scene-num span3 equip-model ${status === 'error' ? 'warn' : ''}`} data-testid="prop-model">
      <span>{tr('equip.model')} : {label}</span>
      <div className="row" style={{ gap: 4 }}>
        <label className="btn ghost sm" title={tr('equip.modelImport')}><Upload size={12} />{tr('equip.modelImport')}
          <input type="file" accept=".glb,model/gltf-binary" hidden onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) readGlb(file).then((model) => set({ model })).catch((err: Error) => toast(err.message === 'size' ? tr('equip.modelTooBig', { mb: MODEL_MAX_BYTES / 1024 / 1024 }) : tr('equip.modelInvalid')));
          }} />
        </label>
        {p.model && <button className="btn ghost sm" onClick={() => set({ model: null })} title={tr('equip.modelRemove')} aria-label={tr('equip.modelRemove')}><X size={12} /></button>}
      </div>
    </div>
  );
}

export function PropCard({ p, vis }: { p: StageProp; vis: Vis }) {
  const tr = useT();
  const sel: SceneRef = { kind: 'prop', id: p.id };
  const set = (patch: Partial<StageProp>) => patchEl(vis, sel, patch);
  const spec = EQUIPMENT[p.kind];
  const setParam = (key: string, v: ParamValue) => {
    const params = sanitizeParams(p.kind, { ...p.params, [key]: v });
    // A line array keeps the height of its modules when their number changes.
    if (p.kind === 'line-array' && key === 'modules') {
      const before = lineArrayModules(p), after = lineArrayModules({ kind: p.kind, params });
      set({ params, height: r2(clamp((p.height * after) / before, 0.05, 20)) });
    } else set({ params });
  };
  const scale = (k: number) => set({ width: r2(clamp(p.width * k, 0.05, 40)), depth: r2(clamp(p.depth * k, 0.05, 40)), height: r2(clamp(p.height * k, 0.05, 20)) });
  const hang = spec.hangable && vis.trusses.length ? snapPropToTruss(p, vis.trusses, Infinity) : null;
  return (
    <Card testId="prop-row" sel={sel} at={{ x: p.x, y: p.y, height: p.elevation + p.height / 2 }} head={<>
      <NameInput value={p.name} label={tr('select.name')} onChange={(name) => set({ name })} />
      <select className="select" style={{ width: 120 }} value={p.kind} aria-label={tr('equip.category')} title={EQUIPMENT_CATEGORIES.find((c) => c.id === spec.category)?.label} data-testid="prop-kind"
        onChange={(e) => { const kind = e.target.value as PropKind, params = sanitizeParams(kind, p.params); set({ kind, params: Object.keys(params).length ? params : undefined }); }}>
        {KINDS_BY_CATEGORY.map((c) => <optgroup key={c.id} label={c.label}>{c.kinds.map((k) => <option key={k} value={k}>{EQUIPMENT[k].label}</option>)}</optgroup>)}
      </select>
      <button className={`btn ghost sm icon ${p.hidden ? 'on' : ''}`} onClick={() => set({ hidden: !p.hidden })} aria-pressed={!!p.hidden} title={tr(p.hidden ? 'equip.show' : 'equip.hide')} aria-label={tr(p.hidden ? 'equip.show' : 'equip.hide')} data-testid="prop-hide">{p.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>
      <button className={`btn ghost sm icon ${p.locked ? 'on' : ''}`} onClick={() => set({ locked: !p.locked })} aria-pressed={!!p.locked} title={tr(p.locked ? 'equip.unlock' : 'equip.lock')} aria-label={tr(p.locked ? 'equip.unlock' : 'equip.lock')} data-testid="prop-lock">{p.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
      <DeleteBtn name={p.name} sel={sel} />
    </>}>
      <Num label="X" title={tr('equip.x')} value={p.x} min={-100} max={100} onChange={(v) => set({ x: v })} />
      <Num label="Y" title={tr('equip.y')} value={p.y} min={-100} max={100} onChange={(v) => set({ y: v })} />
      <Num label="°" title={tr('equip.rotation')} value={p.rotation} min={-360} max={360} step={15} onChange={(v) => set({ rotation: v })} />
      <Num label="L" title={tr('equip.width')} value={p.width} min={0.05} max={40} step={0.1} onChange={(v) => set({ width: v })} />
      <Num label="P" title={tr('equip.depth')} value={p.depth} min={0.05} max={40} step={0.1} onChange={(v) => set({ depth: v })} />
      <Num label="H" title={tr('equip.height')} value={p.height} min={0.05} max={20} step={0.1} onChange={(v) => set({ height: v })} />
      <Num label="Z" title={tr('equip.elevation')} value={p.elevation} min={0} max={20} step={0.1} onChange={(v) => set({ elevation: v })} />
      <label className="scene-num"><span>{tr('select.color')}</span>
        <input type="color" value={p.color} aria-label={tr('select.color')} onChange={(e) => set({ color: e.target.value })} className="scene-color" />
      </label>
      <div className="scene-num"><span>{tr('equip.scale')}</span>
        <div className="row" style={{ gap: 2 }}>
          <button className="btn ghost sm icon" onClick={() => scale(0.9)} title={tr('equip.scaleDown')} aria-label={tr('equip.scaleDown')} data-testid="prop-scale-down"><Minimize2 size={12} /></button>
          <button className="btn ghost sm icon" onClick={() => scale(1.1)} title={tr('equip.scaleUp')} aria-label={tr('equip.scaleUp')} data-testid="prop-scale-up"><Maximize2 size={12} /></button>
        </div>
      </div>
      <div className="scene-num span3"><span>{tr('equip.align')}</span>
        <div className="chips">
          {ALIGNS.map((m) => <button key={m} className="chip" onClick={() => set(alignProp(p, vis, m))} data-testid={`prop-align-${m}`}>{tr(`equip.align.${m}`)}</button>)}
          <button className="chip" onClick={() => mirrorSceneElement(sel)} title={tr('equip.mirror')} data-testid="prop-mirror"><FlipHorizontal2 size={11} /></button>
          {hang && <button className="chip" onClick={() => set({ x: hang.x, y: hang.y, elevation: hang.elevation })} title={`${tr('equip.hangOnTruss')} : ${hang.truss.name}`} data-testid="prop-hang"><Anchor size={11} /> {hang.truss.name}</button>}
        </div>
      </div>
      {spec.params.length > 0 && <span className="scene-num span3 equip-params-head">{tr('equip.params')}</span>}
      {spec.params.map((ps) => <ParamField key={ps.key} spec={ps} value={paramOf(p, ps.key)} onChange={(v) => setParam(ps.key, v)} />)}
      <ModelRow p={p} set={set} />
      {spec.rigging && <p className="scene-hint span3 equip-rigging" data-testid="prop-rigging"><ShieldAlert size={12} /> {tr('equip.rigging')}</p>}
    </Card>
  );
}
