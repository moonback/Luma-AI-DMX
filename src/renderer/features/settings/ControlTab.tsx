import { useEffect, useState, useSyncExternalStore } from 'react';
import { act } from '../../api';
import { Field, NumberInput, Panel } from '../../components/ui';
import { SHORTCUT_ACTIONS, type Settings } from '../../../core/settings/settings';
import { externalControl } from '../../control';
import { audioEngine } from '../../audioEngine';
import { useT } from '../../i18n';
import { Setting } from './Setting';

const OSC_ADDRESSES = [
  ['/luma/go [liste]', 'go'], ['/luma/back [liste]', 'back'], ['/luma/goto <cue> [liste]', 'goto'],
  ['/luma/pause [liste] · /luma/resume [liste]', 'pause'], ['/luma/blackout [0|1]', 'blackout'],
  ['/luma/master <0..1>', 'master'], ['/luma/bpm <bpm>', 'bpm'], ['/luma/release', 'release'],
  ['/luma/stop', 'stop'], ['/luma/releaseall', 'releaseAll'], ['/luma/timecode <secondes>', 'timecode'],
] as const;

export function ControlTab({ value, onChange }: { value: Settings['control']; onChange: (v: Settings['control']) => void }) {
  const tr = useT();
  const status = useSyncExternalStore((l) => externalControl.subscribe(l), () => externalControl.status);
  const [learnFor, setLearnFor] = useState<string | null>(null);
  const [newAction, setNewAction] = useState('go');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [ips, setIps] = useState<string[]>([]);
  useEffect(() => { void audioEngine.devices().then(setDevices); void act({ type: 'output.interfaces' }).then((x) => setIps(x ?? [])); }, []);
  const r = value.remote;
  useEffect(() => () => { externalControl.learn = null; }, []);
  const learn = async () => {
    setLearnFor(newAction);
    externalControl.learn = (key) => {
      setLearnFor(null);
      onChange({ ...value, midi: { ...value.midi, mappings: [...value.midi.mappings.filter((m) => m.key !== key), { key, action: newAction }] } });
    };
    await externalControl.ensureMidi();
  };
  const actionLabel = (id: string) => (id === 'master' ? tr('settings.midi.master') : SHORTCUT_ACTIONS.find((a) => a.id === id)?.label ?? id);
  return (
    <>
      <Panel title={tr('settings.midi.title')}>
        <Setting path="control.midi.enabled"><label className="check"><input type="checkbox" checked={value.midi.enabled} onChange={(e) => onChange({ ...value, midi: { ...value.midi, enabled: e.target.checked } })} />{tr('settings.midi.enable')}</label></Setting>
        <p className="small dim">{tr('settings.midi.inputs', { list: status.midiInputs.length ? status.midiInputs.join(', ') : tr('settings.midi.none') })}{status.error ? <span className="badge err" style={{ marginLeft: 6 }}>{status.error}</span> : null}</p>
        <table className="table small" data-testid="midi-mappings"><tbody>
          {value.midi.mappings.map((m) => (
            <tr key={m.key}><td className="mono">{m.key}</td><td>{actionLabel(m.action)}</td>
              <td style={{ textAlign: 'right' }}><button className="btn ghost sm" onClick={() => onChange({ ...value, midi: { ...value.midi, mappings: value.midi.mappings.filter((x) => x.key !== m.key) } })}>{tr('settings.midi.remove')}</button></td></tr>
          ))}
        </tbody></table>
        <div className="row">
          <select className="select" style={{ width: 320 }} value={newAction} onChange={(e) => setNewAction(e.target.value)}>
            <option value="master">{tr('settings.midi.master')}</option>
            {SHORTCUT_ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {learnFor ? <span className="badge violet">{tr('settings.midi.waiting')}</span> : <button className="btn" onClick={() => void learn()} data-testid="midi-learn">{tr('settings.midi.learn')}</button>}
        </div>
      </Panel>
      <Panel title={tr('settings.osc.title')}>
        <div className="grid g2">
          <Setting path="control.osc.enabled"><label className="check"><input type="checkbox" checked={value.osc.enabled} onChange={(e) => onChange({ ...value, osc: { ...value.osc, enabled: e.target.checked } })} />{tr('settings.osc.enable')}</label></Setting>
          <Setting path="control.osc.port"><Field label={tr('settings.osc.port')}><NumberInput value={value.osc.port} min={1024} max={65535} onChange={(port) => onChange({ ...value, osc: { ...value.osc, port } })} /></Field></Setting>
          <Setting path="control.osc.bind"><Field label={tr('settings.osc.bind')} hint={tr('settings.osc.bindHint')}>
            <select className="select" value={value.osc.bind} onChange={(e) => onChange({ ...value, osc: { ...value.osc, bind: e.target.value as Settings['control']['osc']['bind'] } })}>
              <option value="127.0.0.1">{tr('settings.bind.local')}</option>
              <option value="0.0.0.0">{tr('settings.bind.lan')}</option>
            </select>
          </Field></Setting>
          <Field label={tr('settings.osc.allow')} hint={tr('settings.osc.allowHint')}>
            <input className="input mono" data-testid="osc-allow" defaultValue={value.osc.allow.join(', ')} placeholder="192.168.1.0/24" onBlur={(e) => onChange({ ...value, osc: { ...value.osc, allow: e.target.value.split(/[\s,;]+/u).filter(Boolean) } })} />
          </Field>
          <Field label={tr('settings.osc.feedback')} hint={tr('settings.osc.feedbackHint')}>
            <input className="input mono" data-testid="osc-feedback" defaultValue={value.osc.feedback.map((f) => `${f.host}:${f.port}`).join(', ')} placeholder="192.168.1.20:9000" onBlur={(e) => onChange({ ...value, osc: { ...value.osc, feedback: e.target.value.split(/[\s,;]+/u).filter(Boolean).map((x) => { const [host = '', port = ''] = x.split(':'); return { host, port: Number(port) }; }) } })} />
          </Field>
          <Setting path="control.osc.ack"><label className="check"><input type="checkbox" checked={value.osc.ack} onChange={(e) => onChange({ ...value, osc: { ...value.osc, ack: e.target.checked } })} />{tr('settings.osc.ackToggle')}</label></Setting>
        </div>
        <table className="table small"><tbody>{OSC_ADDRESSES.map(([a, d]) => <tr key={a}><td className="mono">{a}</td><td>{tr(`settings.osc.cmd.${d}`)}</td></tr>)}</tbody></table>
        <p className="small dim" style={{ marginBottom: 0 }}>{tr('settings.osc.ackBefore')}<span className="mono">{tr('settings.osc.ack')}</span>{tr('settings.osc.ackAfter')}</p>
      </Panel>
      <Panel title={tr('settings.remote.title')}>
        <div className="grid g2">
          <Setting path="control.remote.enabled"><label className="check"><input type="checkbox" data-testid="remote-enabled" checked={r.enabled} onChange={(e) => onChange({ ...value, remote: { ...r, enabled: e.target.checked } })} />{tr('settings.remote.enable')}</label></Setting>
          <Setting path="control.remote.port"><Field label={tr('settings.remote.port')}><NumberInput value={r.port} min={1024} max={65535} onChange={(port) => onChange({ ...value, remote: { ...r, port } })} /></Field></Setting>
          <Field label={tr('settings.remote.bind')} hint={tr('settings.remote.bindHint')}>
            <select className="select" data-testid="remote-bind" value={r.bind} onChange={(e) => onChange({ ...value, remote: { ...r, bind: e.target.value } })}>
              <option value="0.0.0.0">{tr('settings.bind.all')}</option>
              {[...new Set([...ips, r.bind])].filter((ip) => ip !== '0.0.0.0' && ip !== '127.0.0.1').map((ip) => <option key={ip} value={ip}>{ip}{ips.includes(ip) ? '' : tr('settings.remote.missing')}</option>)}
              <option value="127.0.0.1">{tr('settings.bind.local')}</option>
            </select>
          </Field>
        </div>
        <p className="small dim">{tr('settings.remote.scope')}</p>
        <p className="small"><span className="badge warn">{tr('settings.remote.private')}</span> {tr('settings.remote.privateHint')}</p>
        {r.enabled && r.token && (
          <table className="table small" data-testid="remote-urls"><tbody>
            {(r.bind === '0.0.0.0' ? (ips.length ? ips : [tr('settings.remote.ipPlaceholder')]) : [r.bind]).map((ip) => <tr key={ip}><td className="mono">{`http://${ip}:${r.port}/?t=${r.token}`}</td></tr>)}
          </tbody></table>
        )}
        <button className="btn" data-testid="remote-new-token" onClick={() => onChange({ ...value, remote: { ...r, token: crypto.randomUUID() } })}>{tr('settings.remote.newToken')}</button>
      </Panel>
      <Panel title={tr('settings.timecode.title')}>
        <div className="grid g2">
          <Setting path="control.timecode.source"><Field label={tr('settings.timecode.source')} hint={tr('settings.timecode.sourceHint')}>
            <select className="select" value={value.timecode.source} onChange={(e) => onChange({ ...value, timecode: { ...value.timecode, source: e.target.value as Settings['control']['timecode']['source'] } })}>
              <option value="off">{tr('settings.off')}</option><option value="mtc">{tr('settings.timecode.mtc')}</option><option value="ltc">{tr('settings.timecode.ltc')}</option>
            </select>
          </Field></Setting>
          {value.timecode.source === 'ltc' && (
            <Field label={tr('settings.timecode.ltcInput')}>
              <select className="select" value={value.timecode.ltcDeviceId ?? ''} onChange={(e) => onChange({ ...value, timecode: { ...value.timecode, ltcDeviceId: e.target.value || null } })}>
                <option value="">{tr('settings.timecode.defaultInput')}</option>
                {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
              </select>
            </Field>
          )}
        </div>
        <p className="small">{tr('settings.timecode.last')}<span className="mono">{status.timecode ?? '—'}</span></p>
      </Panel>
    </>
  );
}
