import { useState } from 'react';
import type { MealName, SiteId } from './domain/sites';
import { DEFAULT_MEAL, DEFAULT_SITE, getOpening } from './domain/sites';
import { ContextStrip } from './shell/ContextStrip';
import { TopBar } from './shell/TopBar';
import type { Screen } from './shell/screens';
import { SCREENS } from './shell/screens';
import { DesignerScreen } from './screens/designer/DesignerScreen';
import { PrintScreen } from './screens/print/PrintScreen';
import { ResidentsScreen } from './screens/residents/ResidentsScreen';
import { SeatingScreen } from './screens/seating/SeatingScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import type { ScreenProps } from './screens/types';
import { ViewScreen } from './screens/view/ViewScreen';
import { getStore, useStore } from './state/store';

const SCREEN_COMPONENTS: Record<Screen, (p: ScreenProps) => JSX.Element> = {
  seating: SeatingScreen,
  residents: ResidentsScreen,
  designer: DesignerScreen,
  view: ViewScreen,
  print: PrintScreen,
  settings: SettingsScreen,
};

export function App() {
  const sites = useStore((s) => s.data.sites);
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const undoLabel = useStore((s) => s.undoLabel);

  const [screen, setScreen] = useState<Screen>('seating');
  const [siteId, setSiteId] = useState<SiteId>(DEFAULT_SITE);
  const [meal, setMeal] = useState<MealName>(DEFAULT_MEAL);
  const [residentId, setResidentId] = useState<string | null>(null);

  const site = sites.find((s) => s.id === siteId) ?? sites[0]!;
  const opening = getOpening(site, meal);
  const usesMeal = SCREENS.find((s) => s.id === screen)?.usesMeal ?? false;
  const Active = SCREEN_COMPONENTS[screen];

  const changeSite = (id: SiteId) => {
    setSiteId(id);
    setResidentId(null);
    // Each site has its own meals (HSP: "All meals"), so fall back to its first.
    const next = sites.find((s) => s.id === id);
    if (next && !next.meals.some((m) => m.meal === meal)) setMeal(next.meals[0]!.meal);
  };

  return (
    <div className="app">
      <TopBar
        screen={screen}
        onNavigate={setScreen}
        status={status}
        error={error}
        undoLabel={undoLabel}
        onUndo={() => getStore().undoLast().catch(() => {})}
      />
      <ContextStrip sites={sites} site={site} meal={opening.meal} showMeals={usesMeal} onSite={changeSite} onMeal={setMeal} />
      <div className="content">
        <main className="main">
          {/* key resets per-screen UI state (section pick etc.) when the site changes */}
          <Active
            key={site.id}
            site={site}
            meal={opening.meal}
            opening={opening}
            onMeal={setMeal}
            residentId={residentId}
            onResident={setResidentId}
            navigate={setScreen}
          />
        </main>
      </div>
    </div>
  );
}
