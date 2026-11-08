import { useEffect, useRef, type ReactNode } from 'react';

// Plain modal in the mockup's card style. Esc or clicking outside closes it.
// The mockup has no design for these forms; this is deliberately quiet so a
// later mockup pass can restyle it without touching behaviour.

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Dialog({ title, subtitle, onClose, children, footer, width = 460 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass inline arrows; keep the latest without re-running the mount effect (which would steal focus).
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // Focus the first field if there is one, else the dialog itself.
    (el?.querySelector<HTMLElement>('input, [data-autofocus]') ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="dlg" style={{ width }}>
        <div className="dlg-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="dlg-title">{title}</h2>
            {subtitle && <div className="dlg-sub">{subtitle}</div>}
          </div>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="dlg-body">{children}</div>
        {footer && <div className="dlg-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** A labelled row inside a dialog. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dlg-field">
      <div className="sdlbl">{label}</div>
      {children}
    </div>
  );
}
