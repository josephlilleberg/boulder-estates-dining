import type { Resident } from '../../domain/model';

export type SortKey = 'last' | 'first';

export interface ListGroup {
  letter: string;
  rows: { id: string; name: string }[];
}

const collator = new Intl.Collator('en', { sensitivity: 'base' });

/** Search, sort and group residents with letter headers, as the mockup's list does. */
export function buildList(residents: Resident[], query: string, sort: SortKey): { groups: ListGroup[]; ids: string[] } {
  const q = query.trim().toLowerCase();
  const key = (r: Resident) => (sort === 'first' ? `${r.first} ${r.last}` : `${r.last} ${r.first}`);
  const label = (r: Resident) => (sort === 'first' ? `${r.first} ${r.last}` : `${r.last}, ${r.first}`);
  const matches = (r: Resident) => !q || `${r.first} ${r.last} ${r.last}, ${r.first}`.toLowerCase().includes(q);

  const list = residents.filter(matches).sort((a, b) => collator.compare(key(a), key(b)));
  const groups: ListGroup[] = [];
  for (const r of list) {
    const letter = (sort === 'first' ? r.first : r.last).charAt(0).toUpperCase();
    let g = groups[groups.length - 1];
    if (!g || g.letter !== letter) groups.push((g = { letter, rows: [] }));
    g.rows.push({ id: r.id, name: label(r) });
  }
  return { groups, ids: list.map((r) => r.id) };
}
