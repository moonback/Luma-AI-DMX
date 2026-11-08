import { Field, NumberInput, Panel } from '../../components/ui';
import type { Settings } from '../../../core/settings/settings';
import { useT } from '../../i18n';
import { Setting } from './Setting';
import { setAt } from './registry';

/** « Sécurité du show »: the guards that protect the audience and the rig (audit T8), whatever schema section holds them. */
export function SafetyPanel({ s, onChange }: { s: Settings; onChange: (s: Settings) => void }) {
  const tr = useT();
  const put = (path: string, v: unknown) => onChange(setAt(s, path, v));
  return (
    <Panel title={tr('settings.tab.safety')}>
      <p className="small muted" style={{ marginTop: 0 }}>{tr('settings.safety.intro')}</p>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Setting path="ai.allowStrobe">
          <label className="check" title={tr('settings.safety.allowStrobeHint')}><input type="checkbox" data-testid="allow-strobe" checked={s.ai.allowStrobe} onChange={(e) => put('ai.allowStrobe', e.target.checked)} />{tr('settings.safety.allowStrobe')}</label>
          <span className="small dim">{tr('settings.safety.allowStrobeHint')}</span>
        </Setting>
        <Setting path="engine.maxStrobeHz">
          <Field label={tr('settings.engine.maxStrobe')} hint={tr('settings.engine.maxStrobeHint')}><NumberInput value={s.engine.maxStrobeHz} min={1} max={25} onChange={(v) => put('engine.maxStrobeHz', v)} /></Field>
        </Setting>
        <Setting path="engine.flashGuard">
          <Field label={tr('settings.engine.flashGuard')} hint={tr('settings.engine.flashGuardHint')}>
            <select className="select" data-testid="flash-guard" value={s.engine.flashGuard} onChange={(e) => put('engine.flashGuard', e.target.value)}>
              <option value="off">{tr('settings.off')}</option>
              <option value="warn">{tr('settings.engine.flashGuard.warn')}</option>
              <option value="limit">{tr('settings.engine.flashGuard.limit')}</option>
            </select>
          </Field>
        </Setting>
        <Setting path="engine.blackoutPolicy">
          <Field label={tr('settings.engine.blackout')} hint={tr('settings.engine.blackoutHint')}>
            <select className="select" value={s.engine.blackoutPolicy} onChange={(e) => put('engine.blackoutPolicy', e.target.value)}>
              <option value="intensity">{tr('settings.engine.blackout.intensity')}</option>
              <option value="intensity-shutter">{tr('settings.engine.blackout.intensity-shutter')}</option>
              <option value="all-zero">{tr('settings.engine.blackout.all-zero')}</option>
            </select>
          </Field>
        </Setting>
        <Setting path="general.autoArmOnStart">
          <label className="check"><input type="checkbox" data-testid="auto-arm-on-start" checked={s.general.autoArmOnStart} onChange={(e) => put('general.autoArmOnStart', e.target.checked)} />{tr('settings.network.autoArm')}</label>
          <span className="small dim">{tr('settings.network.armingNever')}</span>
        </Setting>
      </div>
    </Panel>
  );
}
