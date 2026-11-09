import { isTauri } from '../db/tauriDb';
import { getStore } from '../state/store';
import { appVersion, checkForUpdate, getUpdateState, installUpdate, onUpdateState } from '../state/updates';

// The native menu bar: on the Mac the app menu (About, Check for Updates…, Quit) plus
// the standard Edit and Window menus; on Windows a File menu under the title bar.

const APP_NAME = 'Boulder Estates Dining';

/** "Check for Updates…" from the menu: always answers, unlike the quiet launch check. */
export async function checkForUpdatesFromMenu(): Promise<void> {
  const { ask, message } = await import('@tauri-apps/plugin-dialog');
  await checkForUpdate();
  const s = getUpdateState();
  const current = await appVersion();
  if (s.kind === 'available') {
    const yes = await ask(`Version ${s.version} is available. You have ${current}.\n\nUpdating restarts the app. Your data and backups are kept.`, {
      title: 'Update available',
      kind: 'info',
      okLabel: 'Update now',
      cancelLabel: 'Later',
    });
    if (yes) await installUpdate();
  } else if (s.kind === 'current') {
    await message(`You’re up to date. Version ${current} is the latest.`, { title: APP_NAME, kind: 'info' });
  } else if (s.kind === 'error') {
    await message(s.message, { title: APP_NAME, kind: 'error' });
  }
}

export async function installAppMenu(): Promise<void> {
  if (!isTauri()) return;
  const { Menu, MenuItem, PredefinedMenuItem, Submenu } = await import('@tauri-apps/api/menu');
  const version = (await appVersion()) ?? undefined;
  const about = await PredefinedMenuItem.new({
    text: `About ${APP_NAME}`,
    item: { About: { name: APP_NAME, version, comments: 'Seating, setup sheets and server sheets for the dining room.' } },
  });
  const checkUpdates = await MenuItem.new({ text: 'Check for Updates…', action: () => void checkForUpdatesFromMenu() });
  // When a newer version is found (at launch or by the periodic check), the menu says so.
  onUpdateState((u) => void checkUpdates.setText(u.kind === 'available' ? `Update to ${u.version}…` : 'Check for Updates…'));
  const sep = () => PredefinedMenuItem.new({ item: 'Separator' });
  const isMac = navigator.userAgent.includes('Mac');

  const menu = isMac
    ? await Menu.new({
        items: [
          await Submenu.new({
            text: APP_NAME,
            items: [
              about,
              checkUpdates,
              await sep(),
              await PredefinedMenuItem.new({ item: 'Services' }),
              await sep(),
              await PredefinedMenuItem.new({ item: 'Hide', text: `Hide ${APP_NAME}` }),
              await PredefinedMenuItem.new({ item: 'HideOthers' }),
              await PredefinedMenuItem.new({ item: 'ShowAll' }),
              await sep(),
              await PredefinedMenuItem.new({ item: 'Quit', text: `Quit ${APP_NAME}` }),
            ],
          }),
          // Text editing shortcuts (⌘C, ⌘V, …) only work in a Mac app if the Edit menu has them.
          await Submenu.new({
            text: 'Edit',
            items: [
              // ⌘Z: undo typing inside a text box, otherwise undo the last change in the app.
              await MenuItem.new({
                text: 'Undo',
                accelerator: 'CmdOrCtrl+Z',
                action: () => {
                  const el = document.activeElement;
                  const typing = el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA'].includes(el.tagName));
                  if (typing) document.execCommand('undo');
                  else void getStore().undoLast().catch(() => {});
                },
              }),
              await PredefinedMenuItem.new({ item: 'Redo' }),
              await sep(),
              await PredefinedMenuItem.new({ item: 'Cut' }),
              await PredefinedMenuItem.new({ item: 'Copy' }),
              await PredefinedMenuItem.new({ item: 'Paste' }),
              await PredefinedMenuItem.new({ item: 'SelectAll' }),
            ],
          }),
          await Submenu.new({
            text: 'Window',
            items: [
              await PredefinedMenuItem.new({ item: 'Minimize' }),
              await PredefinedMenuItem.new({ item: 'Maximize', text: 'Zoom' }),
              await PredefinedMenuItem.new({ item: 'Fullscreen' }),
              await sep(),
              await PredefinedMenuItem.new({ item: 'CloseWindow' }),
            ],
          }),
        ],
      })
    : await Menu.new({
        items: [
          await Submenu.new({ text: 'File', items: [checkUpdates, about, await sep(), await PredefinedMenuItem.new({ item: 'Quit', text: 'Exit' })] }),
        ],
      });
  await menu.setAsAppMenu();
}
