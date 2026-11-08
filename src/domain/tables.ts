import type { Shape } from './model';

// Seat positions relative to the table centre, at rotation 0, in room units.
// [dx, dy, outward normal x, outward normal y]. Seat index = position in this list,
// which is what seating rows store. Values from the mockup's geom().
export type SeatGeom = readonly [number, number, number, number];

const ROUND: readonly SeatGeom[] = [
  [0, -59, 0, -1], // top
  [59, 0, 1, 0], // right
  [0, 59, 0, 1], // bottom
  [-59, 0, -1, 0], // left
];

const RECT: readonly SeatGeom[] = [
  [-46, -59, 0, -1], // top left
  [46, -59, 0, -1], // top right
  [105, 0, 1, 0], // right end
  [46, 59, 0, 1], // bottom right
  [-46, 59, 0, 1], // bottom left
  [-105, 0, -1, 0], // left end
];

export const seatGeom = (shape: Shape): readonly SeatGeom[] => (shape === 'round' ? ROUND : RECT);
export const seatCount = (shape: Shape): number => seatGeom(shape).length;
