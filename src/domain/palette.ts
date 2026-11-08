// Server-sheet pill colours. One family (same lightness, only the hue changes):
// black text is at least 7:1 on every colour except Cranberry, which takes white.
// The first nine are the brief's; the last four are extra hues for drinks added in Settings.

export const DRINK_PALETTE = [
  '#6AB3FD', // 2% Milk
  '#F0B4CA', // Skim Milk
  '#D69A72', // Chocolate Milk
  '#FFA14B', // Orange Juice
  '#F2DD5A', // Apple Juice
  '#C11749', // Cranberry Juice (white text)
  '#FF8179', // V8 Juice
  '#B995F6', // Prune Juice
  '#6BD586', // Tea
  '#4FD1D9', // teal
  '#A8D85A', // lime
  '#F29BE0', // orchid
  '#9DB4FF', // periwinkle
] as const;

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export function contrast(a: string, b: string): number {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Black text when it reaches 7:1 on the colour, else white. */
export const textColorFor = (bg: string) => (contrast(bg, '#000000') >= 7 ? '#000000' : '#FFFFFF');

/** The first palette colour no drink at the site uses yet. */
export const nextColor = (used: (string | null)[]): string => DRINK_PALETTE.find((c) => !used.some((u) => u?.toUpperCase() === c)) ?? '#9DB4FF';
