import type { MealName, MealOpening, Site } from '../domain/sites';
import type { Screen } from '../shell/screens';

export interface ScreenProps {
  site: Site;
  meal: MealName;
  opening: MealOpening;
  onMeal: (meal: MealName) => void;
  /** Resident shown on the Residents screen; Seating's "Open in Residents →" sets it. */
  residentId: string | null;
  onResident: (id: string | null) => void;
  navigate: (screen: Screen) => void;
}
