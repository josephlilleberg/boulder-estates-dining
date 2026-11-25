import type { ReactNode } from 'react';
import { EventsIcon, MealPlanIcon, ResidentsIcon, SeatingIcon, SettingsIcon, SetupIcon } from './icons';

/** 'designer' (Room Designer) isn't in the bar: it opens from Settings. */
export type Screen = 'seating' | 'residents' | 'mealplan' | 'designer' | 'view' | 'events' | 'settings';

export interface ScreenDef {
  id: Screen;
  label: string;
  icon: ReactNode;
  /** Used now and then (holidays, setup): under the bar's More menu rather than a tab of its own. */
  more?: boolean;
}

// Left to right like a shift: seat people, adjust residents, set the tables and pour the drinks;
// then the executive director's meal plan. Events (holidays) and Settings (Room Designer opens
// from there) sit under More.
export const SCREENS: ScreenDef[] = [
  { id: 'seating', label: 'Seating', icon: <SeatingIcon /> },
  { id: 'residents', label: 'Residents', icon: <ResidentsIcon /> },
  // The setup sheet and the server sheets: see them on screen, and print them from there.
  { id: 'view', label: 'Setup & Drinks', icon: <SetupIcon /> },
  // The executive director's weekly sheet, every meal side by side.
  { id: 'mealplan', label: 'Meal Plan', icon: <MealPlanIcon /> },
  // Holidays: each event has its own meal.
  { id: 'events', label: 'Events', icon: <EventsIcon />, more: true },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon />, more: true },
];
