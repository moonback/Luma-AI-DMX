import { useState } from 'react';
import { Music2, Trash2, Upload } from 'lucide-react';
import type { MusicTrack } from '../../../core/model/schemas';
import { useT } from '../../i18n';
import { fmt } from './names';

export type LibrarySort = 'recent' | 'name' | 'bpm' | 'state';
type Status = 'playing' | 'show' | 'analysed';

export const trackStatus = (tk: Pick<MusicTrack, 'id' | 'plan'>, playingId: string | null): Status => (playingId === tk.id ? 'playing' : tk.plan ? 'show' : 'analysed');

/** Tracks matching `query` (name, accent-insensitive), in the chosen order. `recent`: last imported first (tracks are appended on import). */
export function libraryView<T extends Pick<MusicTrack, 'id' | 'name' | 'plan'> & { analysis: { bpm: number } }>(tracks: readonly T[], query: string, sort: LibrarySort, playingId: string | null): T[] {
  const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = fold(query.trim());
  const list = tracks.filter((tk) => !q || fold(tk.name).includes(q));
  const rank: Record<Status, number> = { playing: 0, show: 1, analysed: 2 };
  if (sort === 'recent') return list.reverse();
  if (sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'bpm') return list.sort((a, b) => a.analysis.bpm - b.analysis.bpm);
  return list.sort((a, b) => rank[trackStatus(a, playingId)] - rank[trackStatus(b, playingId)]);
}

/** Library of the analysed tracks: always visible beside the four steps, with import, filter and sort. */
export function TrackLibrary({ tracks, selectedId, playingId, importing, onSelect, onImport, onRemove }: {
  tracks: readonly MusicTrack[]; selectedId: string | null; playingId: string | null; importing: boolean;
  onSelect: (id: string) => void; onImport: () => void; onRemove: (id: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const shown = libraryView(tracks, query, sort, playingId);
  return (
    <aside className="music-library" aria-label={t('music.library.title')} data-testid="music-library">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{t('music.library.title')}</b>
        <button className="btn primary sm" disabled={importing} onClick={onImport} data-testid="music-import"><Upload size={13} />{t('music.import')}</button>
      </div>
      {tracks.length > 1 && (
        <div className="col" style={{ gap: 6 }}>
          <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('music.library.filter')} aria-label={t('music.library.filter')} data-testid="music-library-filter" />
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)} aria-label={t('music.library.sort')} data-testid="music-library-sort">
            {(['recent', 'name', 'bpm', 'state'] as const).map((s) => <option key={s} value={s}>{t(`music.library.sort.${s}`)}</option>)}
          </select>
        </div>
      )}
      <div className="music-library-list" role="list">
        {shown.map((tk) => {
          const status = trackStatus(tk, playingId);
          return (
            <div key={tk.id} role="listitem" className={`music-library-item ${tk.id === selectedId ? 'on' : ''}`} data-testid="music-library-item">
              <button type="button" className="music-library-open" aria-current={tk.id === selectedId ? 'true' : undefined} onClick={() => onSelect(tk.id)} data-testid="music-library-select">
                <Music2 size={14} className="dim" />
                <span className="col grow" style={{ minWidth: 0, gap: 2 }}>
                  <span className="music-library-name" title={tk.name}>{tk.name}</span>
                  <span className="small dim">{t('music.library.meta', { bpm: Math.round(tk.analysis.bpm), duration: fmt(tk.analysis.duration) })}</span>
                </span>
                <span className={`badge sm ${status === 'playing' ? 'ok' : status === 'show' ? 'cyan' : ''}`}>{t(`music.library.status.${status}`)}</span>
              </button>
              <button type="button" className="btn ghost sm icon music-library-remove" title={t('music.remove')} aria-label={t('music.library.remove', { name: tk.name })} onClick={() => onRemove(tk.id)} data-testid="music-library-remove"><Trash2 size={13} /></button>
            </div>
          );
        })}
        {!!tracks.length && !shown.length && <p className="small dim">{t('music.library.none')}</p>}
        {!tracks.length && <p className="small dim">{t('music.emptyHint')}</p>}
      </div>
    </aside>
  );
}
