import type { ReactNode } from 'react';
import { DesignerIcon, PrintIcon, ResidentsIcon, SeatingIcon, SettingsIcon, ViewIcon } from './icons';

export type Screen = 'seating' | 'residents' | 'designer' | 'view' | 'print' | 'settings';

export interface ScreenDef {
  id: Screen;
  label: string;
  icon: ReactNode;
  /** Whether the shared meal switch applies to this screen. */
  usesMeal: boolean;
}

export const SCREENS: ScreenDef[] = [
  { id: 'seating', label: 'Seating', icon: <SeatingIcon />, usesMeal: true },
  { id: 'residents', label: 'Residents', icon: <ResidentsIcon />, usesMeal: true },
  { id: 'designer', label: 'Room Designer', icon: <DesignerIcon />, usesMeal: false },
  { id: 'view', label: 'View', icon: <ViewIcon />, usesMeal: true },
  { id: 'print', label: 'Print', icon: <PrintIcon />, usesMeal: true },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon />, usesMeal: false },
];
