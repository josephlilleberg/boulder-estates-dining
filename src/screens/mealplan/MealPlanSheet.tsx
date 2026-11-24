import type { MealName } from '../../domain/sites';
import { PAGE } from '../../sheets/model';
import { dayLabel, mainMeal, type PlanRow } from './plan';

// The weekly meal plan sheet, after the paper one: residents down the side, each day's meals across,
// * where someone isn't on the plan and an empty box to mark by hand where they are.

export const ROWS_PER_PAGE = 28;
const ROW_H = 21;
const SIDE = 28;
const NAME_W = 184;
const APT_W = 46;
const SIDE_MEAL_W = 26;
const INK = '#111827';
const LINE = '1px solid #6B7280';
const DAY_LINE = '2px solid #111827';
const TAN = '#F6E3CB';
const LAVENDER = '#DCD9EE';
const BOX = '#ECEBF2';
export const DIABETIC = '#FFF176';

const LEGEND: [string, string][][] = [
  [
    ['Meal eaten', '✓'],
    ['Meal canceled', 'C'],
  ],
  [
    ['No meal plan', '*'],
    ['Sick tray', 'S.T.'],
  ],
  [
    ['Diabetic diet', ''],
    ['Nursing notified', 'N.N.'],
  ],
  [
    ['Sack lunch', 'SL'],
    ['Room tray', 'RT'],
  ],
];

interface Props {
  title: string;
  month: string;
  week: string;
  days: Date[];
  meals: MealName[];
  rows: PlanRow[];
  page: number;
  pages: number;
  shadow?: boolean;
}

export function MealPlanSheet({ title, month, week, days, meals, rows, page, pages, shadow = true }: Props) {
  const { w, h } = PAGE.letter;
  const main = mainMeal(meals);
  const dayW = (w - 2 * SIDE - NAME_W - APT_W) / 7;
  const mealW = meals.map((_, i) => (meals.length === 1 ? dayW : i === main ? dayW - (meals.length - 1) * SIDE_MEAL_W : SIDE_MEAL_W));
  const cell = {
    border: LINE,
    padding: 0,
    height: ROW_H,
    boxSizing: 'border-box' as const,
  };
  const dayEdge = (i: number) => ({
    ...(i === 0 ? { borderLeft: DAY_LINE } : {}),
    ...(i === meals.length - 1 ? { borderRight: DAY_LINE } : {}),
  });

  return (
    <div
      className="sheet-page"
      style={{
        width: w,
        height: h,
        boxSizing: 'border-box',
        padding: `20px ${SIDE}px 0`,
        background: '#FFFFFF',
        color: INK,
        boxShadow: shadow ? '0 2px 10px rgba(0,0,0,.18)' : undefined,
        fontFamily: '"Times New Roman", Times, serif',
        position: 'relative',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          fontSize: 21,
          fontWeight: 700,
          lineHeight: '26px',
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 24,
          marginTop: 8,
        }}
      >
        {[
          ['Month:', month],
          ['Week Of:', week],
        ].map(([k, v]) => (
          <div
            key={k}
            style={{
              flex: '0 1 400px',
              background: TAN,
              padding: '4px 16px',
              fontSize: 17,
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            {k}&nbsp; {v}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: 8,
          border: '1px solid #4B5563',
          fontSize: 12,
        }}
      >
        {LEGEND.map((col, ci) => (
          <div
            key={ci}
            style={{
              flex: 1,
              padding: '3px 10px',
              borderLeft: ci ? '1px solid #D1D5DB' : undefined,
            }}
          >
            {col.map(([label, mark]) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  lineHeight: '17px',
                }}
              >
                <span>{label}</span>
                {label === 'Diabetic diet' ? (
                  <span
                    style={{
                      width: 54,
                      height: 13,
                      marginTop: 2,
                      background: DIABETIC,
                    }}
                  />
                ) : (
                  <span style={{ fontWeight: 700 }}>{mark}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <table
        style={{
          marginTop: 10,
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          width: w - 2 * SIDE,
          fontSize: 13,
        }}
      >
        <colgroup>
          <col style={{ width: NAME_W }} />
          <col style={{ width: APT_W }} />
          {days.map((d) => mealW.map((mw, i) => <col key={`${d.getDate()}-${i}`} style={{ width: mw }} />))}
        </colgroup>
        <thead>
          <tr>
            <th colSpan={2} style={{ border: 0 }} />
            {days.map((d) => (
              <th
                key={d.getDate()}
                colSpan={meals.length}
                style={{
                  background: LAVENDER,
                  border: DAY_LINE,
                  fontSize: 12,
                  height: 22,
                  padding: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {dayLabel(d)}
              </th>
            ))}
          </tr>
          <tr>
            <th
              style={{
                ...cell,
                border: DAY_LINE,
                textAlign: 'left',
                padding: '0 6px',
                fontSize: 13,
              }}
            >
              Name
            </th>
            <th style={{ ...cell, border: DAY_LINE, fontSize: 13 }}>Apt. #</th>
            {days.map((d) =>
              meals.map((m, i) => (
                <th key={`${d.getDate()}-${m}`} style={{ ...cell, ...dayEdge(i), fontSize: 11 }}>
                  {meals.length === 1 ? '' : m.charAt(0)}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td
                style={{
                  ...cell,
                  borderLeft: DAY_LINE,
                  padding: '0 6px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  background: r.diabetic ? DIABETIC : undefined,
                }}
              >
                {r.name}
              </td>
              <td
                style={{
                  ...cell,
                  borderRight: DAY_LINE,
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              >
                {r.apt ?? ''}
              </td>
              {r.away ? (
                <td
                  colSpan={days.length * meals.length}
                  style={{
                    ...cell,
                    border: DAY_LINE,
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 4,
                    color: '#4B5563',
                    background: '#F3F4F6',
                  }}
                >
                  {r.away}
                </td>
              ) : (
                days.map((d) =>
                  r.plan.map((on, i) => (
                    <td
                      key={`${d.getDate()}-${i}`}
                      style={{
                        ...cell,
                        ...dayEdge(i),
                        textAlign: 'center',
                        fontSize: 14,
                        background: on ? BOX : undefined,
                      }}
                    >
                      {on ? '' : '*'}
                    </td>
                  )),
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {pages > 1 && (
        <div
          style={{
            position: 'absolute',
            right: SIDE,
            bottom: 10,
            fontSize: 11,
            color: '#4B5563',
          }}
        >
          Page {page} of {pages}
        </div>
      )}
    </div>
  );
}
