import type { AppData } from '../db/repo';
import type { DiningTable, Shape } from '../domain/model';
import { arrange, arrangeRules, clampX, clampY, freeSpot } from '../domain/room';
import type { SiteId } from '../domain/sites';
import { del, patch, put, type Op } from './ops';

// Room Designer edits on the active layout. Each is one undo step. Seating rows
// point at (table, seat index); shapes never change, so moving or rotating a
// table keeps everyone in their seat.

const newId = () => crypto.randomUUID();

function table(data: AppData, id: string): DiningTable {
  const t = data.tables.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown table ${id}`);
  return t;
}

function activeLayout(data: AppData, siteId: SiteId) {
  const l = data.layouts.find((x) => x.siteId === siteId && x.active);
  if (!l) throw new Error(`No active layout for ${siteId}`);
  return l;
}

const inSection = (data: AppData, layoutId: string, section: number) => data.tables.filter((t) => t.layoutId === layoutId && t.section === section);
const nextNumber = (tables: DiningTable[]) => tables.reduce((m, t) => Math.max(m, t.number), 0) + 1;

const tableRow = (t: DiningTable) => ({ id: t.id, layout_id: t.layoutId, section: t.section, number: t.number, shape: t.shape, x: t.x, y: t.y, rotation: t.rotation });

export const moveTable = (id: string, x: number, y: number) => (data: AppData): Op[] => {
  const t = table(data, id);
  const nx = clampX(Math.round(x));
  const ny = clampY(Math.round(y));
  return nx === t.x && ny === t.y ? [] : [patch('dining_table', { id }, { x: nx, y: ny })];
};

/** Rotate in 45° steps; `steps` may be negative. Stored as 0–315. */
export const rotateTable = (id: string, steps: number) => (data: AppData): Op[] => {
  const t = table(data, id);
  return [patch('dining_table', { id }, { rotation: (((t.rotation + steps * 45) % 360) + 360) % 360 })];
};

/** New table in the first free spot of the section, numbered after the highest. */
export function addTable(siteId: SiteId, section: number, shape: Shape): { id: string; ops: (data: AppData) => Op[] } {
  const id = newId();
  return {
    id,
    ops: (data) => {
      const layout = activeLayout(data, siteId);
      const here = inSection(data, layout.id, section);
      const { x, y } = freeSpot(here, shape);
      return [put('dining_table', tableRow({ id, layoutId: layout.id, section, number: nextNumber(here), shape, x, y, rotation: 0 }))];
    },
  };
}

/** Same shape and rotation, down and to the right of the original. */
export function duplicateTable(sourceId: string): { id: string; ops: (data: AppData) => Op[] } {
  const id = newId();
  return {
    id,
    ops: (data) => {
      const t = table(data, sourceId);
      const number = nextNumber(inSection(data, t.layoutId, t.section));
      return [put('dining_table', tableRow({ ...t, id, number, x: clampX(t.x + 60), y: clampY(t.y + 60) }))];
    },
  };
}

/** Residents seated at this table, at any meal. */
export const seatedAt = (data: AppData, id: string) => data.seating.filter((s) => s.tableId === id);

/** Frees every seat at the table (all meals), then removes it. Undo puts both back. */
export const deleteTable = (id: string) => (data: AppData): Op[] => {
  table(data, id);
  return [
    ...seatedAt(data, id).map((s) => del('seating', { site_id: s.siteId, meal: s.meal, table_id: s.tableId, seat: s.seat })),
    del('dining_table', { id }),
  ];
};

/** "Even out spacing" for one section. Only tables that actually move are written. */
export const evenOutSpacing = (siteId: SiteId, section: number) => (data: AppData): Op[] => {
  const layout = activeLayout(data, siteId);
  const here = inSection(data, layout.id, section);
  const pos = arrange(here, arrangeRules(siteId, section));
  return here.flatMap((t) => {
    const p = pos.get(t.id);
    return p && (p.x !== t.x || p.y !== t.y) ? [patch('dining_table', { id: t.id }, { x: p.x, y: p.y })] : [];
  });
};
