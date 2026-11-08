import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Inter is bundled with the app, never fetched or assumed installed.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles/tokens.css';
import './styles/mockup.css';
import './styles/shell.css';
import './styles/ui.css';
import { App } from './App';
import { migrate } from './db/migrate';
import { openDb } from './db/openDb';
import { backupBeforeUpgrade, scheduleBackups } from './state/backup';
import { Store, setStore } from './state/store';
import { checkForUpdate } from './state/updates';
import { installAppMenu } from './shell/appMenu';

const root = createRoot(document.getElementById('root')!);

async function boot() {
  const db = await openDb();
  await backupBeforeUpgrade(db);
  await migrate(db);
  const store = await Store.open(db);
  setStore(store);
  scheduleBackups(db, () => store.get().data.settings, (e) => console.error('Backup failed', e));
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  void installAppMenu().catch((e) => console.error('Menu failed', e));
  void checkForUpdate({ quiet: true });
}

boot().catch((e) => {
  console.error(e);
  root.render(
    <div style={{ padding: 40, fontFamily: 'Inter, system-ui, sans-serif', color: '#111827' }}>
      <h1 style={{ fontSize: 20 }}>The dining app couldn't open its data</h1>
      <p style={{ color: '#4B5563' }}>Nothing has been changed. Please tell Joe and include this message:</p>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#F3F4F6', padding: 12, borderRadius: 8 }}>{String(e?.message ?? e)}</pre>
    </div>,
  );
});
