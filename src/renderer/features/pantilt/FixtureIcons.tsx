import type { ReactNode } from 'react';

/** Icônes de projecteurs dessinées pour l'app (trait 24×24, même style que lucide) : lyres, PAR, barre LED, strobe, gradateur. */
export type FixtureIcon = (props: { size?: number; strokeWidth?: number }) => ReactNode;

const svg = (children: ReactNode): FixtureIcon => function Icon({ size = 24, strokeWidth = 1.75 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
};

/** Lyre spot : étrier en U, tête inclinée avec optique et faisceau étroit. */
export const MovingHeadSpot = svg(
  <>
    <path d="M4 4v8a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V4" />
    <rect x="8.5" y="3.5" width="7" height="10" rx="2.5" transform="rotate(-18 12 8.5)" />
    <circle cx="11" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <path d="M9 20h6M12 16v4" />
  </>,
);

/** Lyre wash : même étrier, tête ronde à lentille de Fresnel. */
export const MovingHeadWash = svg(
  <>
    <path d="M3 4v8a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4V4" />
    <circle cx="12" cy="9" r="5" />
    <circle cx="12" cy="9" r="2.2" />
    <path d="M9 20h6M12 16v4" />
  </>,
);

/** PAR : corps cylindrique évasé, lentille elliptique et lyre de fixation. */
export const ParCan = svg(
  <>
    <path d="M6 5.5h12l2 10H4z" />
    <ellipse cx="12" cy="15.5" rx="8" ry="3" />
    <ellipse cx="12" cy="15.5" rx="3.5" ry="1.2" />
    <path d="M9 21h6" />
  </>,
);

/** Barre LED : boîtier allongé et cellules. */
export const LedBar = svg(
  <>
    <rect x="2" y="8.5" width="20" height="7" rx="2" />
    <circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" />
    <path d="M6 19.5h12" />
  </>,
);

/** Strobe : boîtier rectangulaire et éclair. */
export const StrobeBox = svg(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M13.5 7.5 9.5 12.5h4l-3 4.5" />
  </>,
);

/** Gradateur : bouton rotatif gradué. */
export const DimmerKnob = svg(
  <>
    <circle cx="12" cy="13" r="6" />
    <path d="M12 13V9" />
    <path d="M4.5 7.5 6 9M19.5 7.5 18 9M12 3.5V5" />
  </>,
);

/** Projecteur générique. */
export const GenericFixture = svg(
  <>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
  </>,
);
