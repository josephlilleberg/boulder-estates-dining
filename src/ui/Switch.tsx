// The mockup's toggle (.sw). Render inside a button row, or standalone with `onClick`.
export function SwitchMark({ on }: { on: boolean }) {
  return <span className={on ? 'sw on' : 'sw'} aria-hidden="true" />;
}
