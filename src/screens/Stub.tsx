// Placeholder for a region a later build step fills in. Delete once nothing uses it.
interface Props {
  children: React.ReactNode;
  minHeight?: number;
  /** Fill the parent's height instead of using a min-height. */
  fill?: boolean;
}

export function Stub({ children, minHeight, fill }: Props) {
  const style: React.CSSProperties = fill ? { height: '100%', minHeight: 0, boxSizing: 'border-box' } : { minHeight };
  return (
    <div className="stub" style={style}>
      {children}
    </div>
  );
}
