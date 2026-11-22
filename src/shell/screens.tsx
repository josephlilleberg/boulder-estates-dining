import type { ReactNode } from 'react';
import { EventsIcon, PrintIcon, ResidentsIcon, SeatingIcon, SettingsIcon } from './icons';

/** 'designer' (Room Designer) isn't in the bar: it opens from Settings. */
export type Screen = 'seating' | 'residents' | 'designer' | 'view' | 'events' | 'settings';

export interface ScreenDef {
  id: Screen;
  label: string;
  icon: ReactNode;
  /** Whether the shared meal switch applies to this screen. */
  usesMeal: boolean;
  /** Setup screens (used now and then) sit after a divider, apart from the daily ones. */
  setup?: boolean;
}

// Left to right like a shift: seat people, adjust residents, check and print the sheets.
// Then Settings (Room Designer opens from there).
export const SCREENS: ScreenDef[] = [
  { id: 'seating', label: 'Seating', icon: <SeatingIcon />, usesMeal: true },
  // The resident card has its own meal tabs (with each meal's On/Off), so the bar's meal switch stays away here.
  { id: 'residents', label: 'Residents', icon: <ResidentsIcon />, usesMeal: false },
  // Sheets: see them on screen, and print them from there.
  { id: 'view', label: 'Sheets', icon: <PrintIcon />, usesMeal: true },
  // Holidays: an event has its own meal, so the shared meal switch doesn't apply.
  { id: 'events', label: 'Events', icon: <EventsIcon />, usesMeal: false },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon />, usesMeal: false, setup: true },
];
