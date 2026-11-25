// Icon paths copied from the mockup so the stroke weights match exactly.
import type { ReactNode } from 'react';

function Svg({ size = 19, width = 1.8, children }: { size?: number; width?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const SeatingIcon = () => (
  <Svg><path d="M7 3v9h10V3" /><path d="M5 12h14v3H5z" /><path d="M7 15v6M17 15v6" /></Svg>
);
export const ResidentsIcon = () => (
  <Svg>
    <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
    <circle cx="10" cy="8" r="3.5" />
    <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35" />
    <path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6" />
  </Svg>
);
export const DesignerIcon = () => (
  <Svg><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="2.5" /><rect x="12" y="13" width="7" height="4" rx="1" /></Svg>
);
export const EventsIcon = () => (
  <Svg><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M12 13.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z" /></Svg>
);
export const ViewIcon = () => (
  <Svg><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const PrintIcon = ({ size = 19 }: { size?: number }) => (
  <Svg size={size}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></Svg>
);
/** A place setting: fork, plate and a glass (setting the tables and pouring the drinks). */
export const SetupIcon = () => (
  <Svg><path d="M3.5 4v4.5a1.5 1.5 0 0 0 3 0V4M5 10v10" /><circle cx="12.5" cy="12.5" r="4.5" /><path d="M18.5 4h3l-.4 5.2a1.1 1.1 0 0 1-2.2 0z" /><path d="M20 10.5V20M18.5 20h3" /></Svg>
);
export const MealPlanIcon = () => (
  <Svg><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M8.5 10l1.5 1.5 3-3M8.5 16l1.5 1.5 3-3" /><path d="M15 10.5h1.5M15 16.5h1.5" /></Svg>
);
export const SettingsIcon = () => (
  <Svg>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
  </Svg>
);
export const MoreIcon = () => (
  <Svg>
    <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
  </Svg>
);
export const CheckIcon = () => (
  <Svg size={16} width={2}><path d="M5 12l5 5L20 7" /></Svg>
);
export const UndoIcon = () => (
  <Svg size={16}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Svg>
);
