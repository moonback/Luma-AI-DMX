import { useState } from 'react';
import { Gift } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { LATEST_NOTES, RELEASE_NOTES } from '../i18n/releaseNotes';
import { Modal } from '../components/ui';

const SEEN_KEY = 'luma.whatsNew';

/** True when the latest release notes have not been shown on this machine yet. */
export function whatsNewPending(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== LATEST_NOTES.version;
  } catch {
    return false;
  }
}

/** Remembers that the latest notes were seen (also called on first run, where the welcome screen replaces them). */
export function markWhatsNewSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, LATEST_NOTES.version);
  } catch {
    /* storage unavailable: the notes simply show again next time */
  }
}

/** Mounted in App: shows the notes when the help surface is 'whatsnew' (at startup after an update, or from the help menu). */
export function WhatsNewHost() {
  const open = useStore((s) => s.help === 'whatsnew' && !!s.project);
  return open ? <WhatsNew /> : null;
}

/** Release notes of the current version, with the previous ones on demand. */
function WhatsNew() {
  const tr = useT();
  const lang = useStore((s) => s.language);
  const [all, setAll] = useState(false);
  const close = () => { markWhatsNewSeen(); useStore.getState().setHelp(null); };
  const shown = all ? RELEASE_NOTES : [LATEST_NOTES];
  return (
    <Modal title={tr('whatsnew.title')} onClose={close} wide footer={<>
      {!all && RELEASE_NOTES[1] && <button className="btn ghost" onClick={() => setAll(true)}>{tr('whatsnew.previous')}</button>}
      <div className="grow" />
      <button className="btn primary" autoFocus onClick={close} data-testid="whatsnew-ok">{tr('whatsnew.ok')}</button>
    </>}>
      <div className="col gap-lg" data-testid="whatsnew">
        {shown.map((n) => (
          <section key={n.version} className="col" style={{ gap: 6 }}>
            <b><Gift size={15} style={{ verticalAlign: -3 }} /> {tr('whatsnew.version', { version: n.version, date: n.date })}</b>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>{n.items[lang].map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
