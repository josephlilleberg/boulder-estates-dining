import { useState, type ReactNode } from 'react';
import type { SaveStatus } from '../state/store';
import type { Screen } from './screens';
import type { Site, SiteId } from '../domain/sites';
import { SCREENS } from './screens';
import { Segmented } from './Segmented';
import { installUpdate, useUpdateState } from '../state/updates';
import { CheckIcon, MoreIcon, UndoIcon } from './icons';
import { isTauri } from '../db/tauriDb';

interface Props {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  status: SaveStatus;
  error: string | null;
  /** Label of the change Undo would reverse; null when there's nothing to undo. */
  undoLabel: string | null;
  onUndo: () => void;
  sites: Site[];
  site: Site;
  onSite: (id: SiteId) => void;
}

export function TopBar({ screen, onNavigate, status, error, undoLabel, onUndo, sites, site, onSite }: Props) {
  const enabledSites = sites.filter((s) => s.enabled);
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">BE</div>
        <div className="brand-text">
          <div className="brand-name">Dining</div>
          <div className="brand-sub">{site.name} kitchen</div>
          {/* The test app (npm run test-app): plain to see, so it's never mistaken for the real one. */}
          {import.meta.env.DEV && isTauri() && <div style={{ fontSize: 11, fontWeight: 800, color: '#B91C1C', letterSpacing: '.06em' }}>TEST APP</div>}
        </div>
      </div>

      <nav aria-label="Main" className="topnav">
        {SCREENS.filter((s) => !s.more).map((s) => (
          <NavButton key={s.id} on={screen === s.id} onClick={() => onNavigate(s.id)} icon={s.icon}>
            {s.label}
          </NavButton>
        ))}
        <MoreMenu screen={screen} onNavigate={onNavigate} />
      </nav>

      <div className="topmeal">
        {/* v1 has one dining room, so its picker only appears once there's a choice. */}
        {enabledSites.length > 1 && <Segmented label="Dining room" options={enabledSites.map((s) => ({ value: s.id, label: s.name }))} value={site.id} onChange={onSite} />}
      </div>

      <div className="topbar-right">
        <UpdateButton />
        <SaveIndicator status={status} error={error} />
        <button
          type="button"
          className="btn sm"
          onClick={onUndo}
          disabled={!undoLabel || status === 'saving'}
          title={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'}
        >
          <UndoIcon />
          Undo
        </button>
      </div>
    </header>
  );
}

// Not in the mockup: shown only when a newer version is on GitHub (checked at launch and in Settings).
function UpdateButton() {
  const u = useUpdateState();
  if (u.kind === 'installing') {
    return (
      <button type="button" className="btn sm primary" disabled>
        Updating{u.percent !== null ? ` ${u.percent}%` : '…'}
      </button>
    );
  }
  if (u.kind !== 'available') return null;
  return (
    <button type="button" className="btn sm primary" onClick={() => void installUpdate()} title={`Install version ${u.version} and restart. Your data is kept.`}>
      Update to {u.version}
    </button>
  );
}

// "All changes saved" in the mockup. Saving is usually too quick to see; an error stays until the next good save.
function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === 'error') {
    return (
      <div className="saved error" role="alert" title={error ?? undefined}>
        <span aria-hidden="true">!</span>
        <span className="savedtxt">Couldn't save that change</span>
      </div>
    );
  }
  const text = status === 'saving' ? 'Saving…' : 'All changes saved';
  return (
    <div className="saved" title={text} aria-live="polite">
      <CheckIcon />
      <span className="savedtxt">{text}</span>
    </div>
  );
}

function NavButton({ on, onClick, icon, expanded, children }: { on: boolean; onClick: () => void; icon: ReactNode; expanded?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className={on ? 'nav on' : 'nav'}
      aria-current={on ? 'page' : undefined}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      onClick={onClick}
      title={typeof children === 'string' ? children : undefined}
    >
      {icon}
      <span className="navlabel">{children}</span>
    </button>
  );
}

/** Events and Settings: used now and then, so they share one button. On one of them, it's named after it. */
function MoreMenu({ screen, onNavigate }: { screen: Screen; onNavigate: (screen: Screen) => void }) {
  const [open, setOpen] = useState(false);
  const items = SCREENS.filter((s) => s.more);
  // Room Designer opens from Settings, so it counts as Settings here.
  const current = items.find((s) => s.id === screen || (screen === 'designer' && s.id === 'settings'));
  return (
    <div style={{ position: 'relative' }}>
      <NavButton on={!!current} onClick={() => setOpen(!open)} icon={current?.icon ?? <MoreIcon />} expanded={open}>
        {current?.label ?? 'More'}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginLeft: 4, verticalAlign: '-2px' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </NavButton>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div role="menu" style={{ position: 'absolute', top: 44, left: 0, zIndex: 41, minWidth: 180, padding: 6, background: '#FFFFFF', border: '1px solid var(--card-border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(17,24,39,.16)' }}>
            {items.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                className={s === current ? 'nav on' : 'nav'}
                style={{ width: '100%' }}
                onClick={() => {
                  setOpen(false);
                  onNavigate(s.id);
                }}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
