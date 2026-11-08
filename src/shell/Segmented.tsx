// The mockup's segmented pill control (.segwrap / .seg). Used for site, meal,
// section and sheet switches.

export interface SegOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  role?: 'group' | 'tablist';
  style?: React.CSSProperties;
}

export function Segmented<T extends string>({ label, options, value, onChange, role = 'group', style }: Props<T>) {
  return (
    <div className="segwrap" role={role} aria-label={label} style={style}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            className={on ? 'seg on' : 'seg'}
            {...(role === 'tablist' ? { role: 'tab', 'aria-selected': on } : { 'aria-pressed': on })}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
