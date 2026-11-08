import type { frMusic } from './fr.music';

/** English catalogue of the Song to Show stepper, typed against fr.music.ts. */
export const enMusic: Record<keyof typeof frMusic, string> = {
  'music.steps.label': 'Song to Show steps',
  'music.steps.track': 'Track',
  'music.steps.track.hint': 'Import an audio file: it is analysed (tempo, sections).',
  'music.steps.intent': 'Intent',
  'music.steps.intent.hint': 'Describe the mood you want, then generate the show.',
  'music.steps.show': 'Show',
  'music.steps.show.hint': 'Retouch the sections, try a variant or open the timeline.',
  'music.steps.play': 'Play',
  'music.steps.play.hint': 'The track plays with its show: adjust live.',
};
