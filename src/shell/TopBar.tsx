import type { ReactNode } from 'react';
import type { SaveStatus } from '../state/store';
import type { Screen } from './screens';
import { SCREENS } from './screens';
import { CheckIcon, UndoIcon } from './icons';

interface Props {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  status: SaveStatus;
  error: string | null;
  /** Label of the change Undo would reverse; null when there's nothing to undo. */
  undoLabel: string | null;
  onUndo: () => void;
}

export function TopBar({ screen, onNavigate, status, error, undoLabel, onUndo }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">BE</div>
        <div>
          <div className="brand-name">Dining</div>
          <div className="brand-sub">Boulder Estates kitchen</div>
        </div>
      </div>

      <nav aria-label="Main" className="topnav">
        {SCREENS.map((s) => (
          <NavButton key={s.id} on={screen === s.id} onClick={() => onNavigate(s.id)} icon={s.icon}>
            {s.label}
          </NavButton>
        ))}
      </nav>

      <div className="topbar-right">
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

function NavButton({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" className={on ? 'nav on' : 'nav'} aria-current={on ? 'page' : undefined} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
