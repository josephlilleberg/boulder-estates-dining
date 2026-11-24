import { useState } from 'react';
import { attendanceSummary, drinkSubtitle, extraText, seatLabel, statusText } from '../../domain/labels';
import { CHAIR_LABEL, WEEKDAYS, drinkUnits, fullName, pouredInto, pouredTogether, type Chair, type Resident } from '../../domain/model';
import type { MealName } from '../../domain/sites';
import { act } from '../../state/act';
import * as A from '../../state/residentActions';
import { useStore } from '../../state/store';
import { SwitchMark } from '../../ui/Switch';
import type { ScreenProps } from '../types';
import { ArchiveDialog, DeleteDialog, DrinkDialog, ExtraDialog, NameDialog, type DrinkTarget, type ExtraTarget } from './dialogs';

interface Props extends ScreenProps {
  resident: Resident;
  height: string;
}

const CHAIRS: Chair[] = ['arm', 'no_arm', 'none'];
/** The status dropdown: active, gone on certain weekdays, or gone until further notice. */
type StatusChoice = 'active' | 'days' | 'gone';
const STATUS_CHOICES: { value: StatusChoice; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'days', label: 'Gone certain days' },
  { value: 'gone', label: 'Gone until further notice' },
];
const STATUS_HINT: Record<StatusChoice, string> = {
  active: 'Seated at every meal on their plan',
  days: 'Their seat is kept; it prints empty on these days',
  gone: 'Their seat is kept but prints empty',
};

export function ResidentCard({ resident: r, height, site, meal, onMeal }: Props) {
  const data = useStore((s) => s.data);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<null | 'rename' | 'archive' | 'delete'>(null);
  const [drink, setDrink] = useState<DrinkTarget | null>(null);
  const [extra, setExtra] = useState<ExtraTarget | null>(null);
  // "Gone certain days" picked before any day is: show the day buttons anyway.
  const [daysOpen, setDaysOpen] = useState(false);
  const choice: StatusChoice = r.status === 'gone' ? 'gone' : r.goneDays.length || daysOpen ? 'days' : 'active';
  const setChoice = (c: StatusChoice) => {
    setDaysOpen(c === 'days');
    if (c === 'days') return; // nothing changes until a day is picked
    void act(`${name}: ${STATUS_CHOICES.find((x) => x.value === c)!.label}`, A.setStatus(r.id, c === 'gone' ? 'gone' : 'here'));
  };
  const toggleDay = (d: number) => {
    const days = r.goneDays.includes(d) ? r.goneDays.filter((x) => x !== d) : [...r.goneDays, d];
    void act(`${name}: gone ${WEEKDAYS[d]}`, A.setStatus(r.id, 'here', days));
  };

  const meals = site.meals.map((m) => m.meal);
  const name = fullName(r);

  return (
    <section className="card" style={{ flex: '999 1 520px', minWidth: 0, height, overflowY: 'auto' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: '18px 24px', background: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            {name}
            {r.nickname && <span style={{ fontSize: 15, fontWeight: 500, color: '#4B5563' }}> · goes by {r.nickname}</span>}
          </h2>
          <div style={{ fontSize: 13, color: '#4B5563', marginTop: 3 }}>
            {statusText(r) && <span style={{ color: '#B45309', fontWeight: 600 }}>{statusText(r)} · </span>}
            {attendanceSummary(r, site)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          <button type="button" className="iconbtn" aria-label="More" aria-haspopup="menu" aria-expanded={menuOpen} title="More" onClick={() => setMenuOpen((o) => !o)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
              <div role="menu" className="menu">
                <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), setDialog('rename'))}>
                  Edit name
                </button>
                {r.archived ? (
                  <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), act(`Restore ${name}`, A.restoreResident(r.id)))}>
                    Restore resident
                  </button>
                ) : (
                  <button type="button" role="menuitem" className="danger" onClick={() => (setMenuOpen(false), setDialog('archive'))}>
                    Archive resident
                  </button>
                )}
                <button type="button" role="menuitem" className="danger" onClick={() => (setMenuOpen(false), setDialog('delete'))}>
                  Delete resident
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {r.archived && (
        <div className="archived-banner">
          <span style={{ flex: 1 }}>Archived. Hidden from seating and every sheet.</span>
          <button type="button" className="btn sm" onClick={() => act(`Restore ${name}`, A.restoreResident(r.id))}>
            Restore
          </button>
        </div>
      )}

      <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <div className="seclbl">Every meal</div>
          <div className="group">
            <div className="grow" style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#111827' }}>Meal plan</div>
                <div style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>Signed up for: they come and are seated</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Meal plan">
                {meals.map((m) => {
                  const on = r.onPlan.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={on}
                      aria-label={`On the meal plan for ${m}`}
                      onClick={() => act(`${name}: ${on ? 'off' : 'on'} the ${m} meal plan`, A.setMealPlan(r.id, m, !on))}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 10px 0 12px', border: `1px solid ${on ? '#93C5FD' : '#D1D5DB'}`, background: on ? '#EFF6FF' : '#FFFFFF', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: '#111827' }}
                    >
                      {m}
                      <SwitchMark on={on} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grow" style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#111827' }}>Status</div>
                <div style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>{STATUS_HINT[choice]}</div>
              </div>
              <select
                aria-label="Status"
                value={choice}
                onChange={(ev) => setChoice(ev.target.value as StatusChoice)}
                style={{ height: 36, padding: '0 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: '#111827', background: '#FFFFFF' }}
              >
                {STATUS_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {choice === 'days' && (
              <div className="grow" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 160px', fontSize: 14, color: '#111827' }}>Gone on</span>
                <div className="segwrap" role="group" aria-label="Gone on">
                  {WEEKDAYS.map((d, i) => (
                    <button key={d} type="button" className={r.goneDays.includes(i) ? 'seg on' : 'seg'} aria-pressed={r.goneDays.includes(i)} onClick={() => toggleDay(i)} style={{ padding: '0 10px' }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grow" style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 120px', fontSize: 14, color: '#111827' }}>Apt #</span>
              <AptInput key={r.apt ?? ''} id={r.id} apt={r.apt} />
            </div>
            <div className="grow" style={{ cursor: 'default' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#111827' }}>Diabetic diet</div>
                <div style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>Highlighted on the meal plan sheet</div>
              </div>
              <button type="button" className="swbtn" aria-pressed={r.diabetic} aria-label="Diabetic diet" onClick={() => act(r.diabetic ? 'Not diabetic' : 'Diabetic diet', A.setDiabetic(r.id, !r.diabetic))}>
                <SwitchMark on={r.diabetic} />
              </button>
            </div>
            <div className="grow" style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 120px', fontSize: 14, color: '#111827' }}>Chair</span>
              <div className="segwrap" role="group" aria-label="Chair">
                {CHAIRS.map((c) => (
                  <button key={c} type="button" className={r.chair === c ? 'seg on' : 'seg'} aria-pressed={r.chair === c} onClick={() => act(`Chair: ${CHAIR_LABEL[c]}`, A.setChair(r.id, c))}>
                    {CHAIR_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grow" style={{ cursor: 'default', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ flex: '1 1 120px', fontSize: 14, color: '#111827' }}>Allergies &amp; notes</span>
              <Notes resident={r} />
            </div>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <div className="seclbl" style={{ margin: 0 }}>
              Meals
            </div>
            {meals.length > 1 && (
              <div className="segwrap" role="tablist" aria-label="Meal">
                {meals.map((m) => {
                  const on = r.attends.includes(m);
                  return (
                    <button key={m} type="button" role="tab" aria-selected={m === meal} className={(m === meal ? 'seg on' : 'seg') + (on ? '' : ' dim')} onClick={() => onMeal(m)}>
                      {m}
                      <span className={on ? 'mtag on' : 'mtag'}>{on ? 'On' : 'Off'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {mealPanel(r, meal, meals.length > 1)}
        </div>
      </div>

      {dialog === 'rename' && <NameDialog mode="rename" site={site} resident={r} onClose={() => setDialog(null)} onSaved={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteDialog resident={r} onClose={() => setDialog(null)} />}
      {dialog === 'archive' && <ArchiveDialog resident={r} seats={data.seating.filter((s) => s.residentId === r.id).length} onClose={() => setDialog(null)} />}
      {drink && <DrinkDialog target={drink} resident={r} onTarget={setDrink} onClose={() => setDrink(null)} />}
      {extra && <ExtraDialog target={extra} resident={r} onClose={() => setExtra(null)} />}
    </section>
  );

  // A render helper, not a component: defining a component inside another remounts it every render.
  function mealPanel(resident: Resident, m: MealName, siteHasSwitch: boolean) {
    const onDrink = setDrink;
    const onExtra = setExtra;
    const on = resident.attends.includes(m);
    const seat = data.seating.find((s) => s.siteId === site.id && s.meal === m && s.residentId === resident.id);
    const where = !on ? `Not on the ${siteHasSwitch ? m : ''} meal plan: turn it on above`.replace('  ', ' ') : seat ? seatLabel(site, m, seat, data.tables) : 'Not seated yet';
    const p = resident.prefs[m];
    const drinks = p?.drinks.filter((d) => d.slot === 'drink') ?? [];
    const coffee = p?.drinks.filter((d) => d.slot === 'coffee') ?? [];
    const isBk = site.id === 'BE' && m === 'Breakfast';
    const bev = (n: string) => data.beverages.find((b) => b.siteId === site.id && b.name === n);
    const units = A.unitsUsed(data, site.id, drinks);
    const fullJuice = drinks.find((d) => drinkUnits(d, bev(d.beverage)?.kind) === 2);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="group" style={{ marginBottom: 14 }}>
            <div className="grow" style={{ cursor: 'default', minHeight: 56 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{siteHasSwitch ? m : 'All meals'}</div>
                <div className={on && !seat ? 'mwhere warn' : 'mwhere'}>{where}</div>
              </div>
            </div>
          </div>

          {on && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px 16px', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="group">
                  <div className="ghead">Drinks · {isBk ? 'up to 2 + coffee' : 'up to 2'}</div>
                  {drinks.map((d, i) => (
                    <DrinkRow key={d.id} label={`Drink ${i + 1}`} main={d.beverage} sub={drinkSubtitle(d, bev(d.beverage))} onClick={() => onDrink({ kind: 'edit', drinkId: d.id, meal: m })} />
                  ))}
                  {pouredTogether(drinks) && (
                    <div className="grow" style={{ cursor: 'default', fontSize: 13, color: '#374151', background: '#F0FDF4' }}>
                      Both are {pouredTogether(drinks)}, so they’re poured together in one {pouredInto(drinks) === 'Glass' ? 'glass' : 'to-go cup'}.
                    </div>
                  )}
                  {fullJuice && (
                    <div className="grow" style={{ cursor: 'default', fontSize: 13, color: '#374151', background: '#F0FDF4' }}>
                      A full {fullJuice.drinkware.toLowerCase()} of juice counts as 2 drinks.
                    </div>
                  )}
                  {units < A.MAX_DRINKS && (
                    <button type="button" className="grow" onClick={() => onDrink({ kind: 'add', meal: m })} style={{ color: '#1D4ED8', fontSize: 14, fontWeight: 600 }}>
                      + Add a drink
                    </button>
                  )}
                  {isBk && (
                    <>
                      <button type="button" className="grow" aria-pressed={coffee.length > 0} onClick={() => act(`Breakfast coffee ${coffee.length ? 'off' : 'on'}`, A.setBreakfastCoffee(resident.id, !coffee.length))}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14, color: '#111827' }}>Coffee</span>
                          <span style={{ display: 'block', fontSize: 12, color: '#4B5563', marginTop: 2 }}>Doesn’t count toward the 2</span>
                        </span>
                        <SwitchMark on={coffee.length > 0} />
                      </button>
                      {coffee.map((d) => (
                        <DrinkRow key={d.id} label="Coffee" main={d.beverage} sub={drinkSubtitle(d, bev(d.beverage))} onClick={() => onDrink({ kind: 'edit', drinkId: d.id, meal: m })} />
                      ))}
                    </>
                  )}
                </div>

                <div className="group">
                  <div className="ghead">Extras</div>
                  <div style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {(p?.extras ?? []).map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => onExtra({ kind: 'edit', extraId: x.id, meal: m })}
                        style={{ display: 'inline-flex', alignItems: 'center', minHeight: 30, padding: '0 10px', borderRadius: 6, background: '#F3F4F6', border: '1px solid #D1D5DB', fontSize: 13, color: '#1F2937', fontFamily: 'inherit', cursor: 'pointer' }}
                      >
                        {extraText(x)}
                      </button>
                    ))}
                    <button type="button" className="btn sm" onClick={() => onExtra({ kind: 'add', meal: m })}>
                      + Add an extra
                    </button>
                  </div>
                </div>
              </div>

              <div className="group">
                <div className="ghead">Water &amp; portion</div>
                <div className="grow" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <span style={{ fontSize: 14, color: '#111827' }}>Special water</span>
                  <div className="segwrap" role="group" aria-label="Special water" style={{ display: 'flex', flexWrap: 'nowrap' }}>
                    {A.SPECIAL_WATER.map(({ value, label }) => (
                      <button key={value} type="button" style={{ flex: 1, whiteSpace: 'nowrap' }} className={A.specialWaterOf(p) === value ? 'seg on' : 'seg'} aria-pressed={A.specialWaterOf(p) === value} onClick={() => act(`Special water: ${label}`, A.setSpecialWater(resident.id, m, value))}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grow" style={{ cursor: 'default' }}>
                  <span style={{ flex: 1, fontSize: 14, color: '#111827' }}>Portion</span>
                  <div className="segwrap" role="group" aria-label="Portion">
                    {(['Full', 'Half'] as const).map((portion) => (
                      <button key={portion} type="button" className={(p?.portion ?? 'Full') === portion ? 'seg on' : 'seg'} aria-pressed={(p?.portion ?? 'Full') === portion} onClick={() => act(`${portion} portion`, A.setPortion(resident.id, m, portion))}>
                        {portion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}

function DrinkRow({ label, main, sub, onClick }: { label: string; main: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className="grow" onClick={onClick}>
      <span style={{ width: 74, flex: 'none', fontSize: 12, color: '#4B5563' }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#111827' }}>{main}</span>
        <span style={{ display: 'block', fontSize: 12, color: '#4B5563', marginTop: 2 }}>{sub}</span>
      </span>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/** Note chips with ×, plus an inline field behind "+ Add note" (Enter adds, Esc cancels). */
function Notes({ resident: r }: { resident: Resident }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const save = async () => {
    if (text.trim()) await act('Add note', A.addNote(r.id, text));
    setText('');
    setAdding(false);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
      {r.notes.map((n) => (
        <span key={n.id} className="tag">
          {n.text}
          <button type="button" aria-label={`Remove note: ${n.text}`} onClick={() => act('Remove note', A.removeNote(n.id))} style={{ border: 0, background: 'transparent', color: '#9A3412', cursor: 'pointer', fontSize: 15, padding: '0 2px' }}>
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input autoComplete="off"
          autoFocus
          className="text-input note-input"
          aria-label="New note"
          placeholder="e.g. Nut allergy"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') (setText(''), setAdding(false));
          }}
          onBlur={() => void save()}
        />
      ) : (
        <button type="button" className="btn sm" onClick={() => setAdding(true)}>
          + Add note
        </button>
      )}
    </div>
  );
}

/** Saves when focus leaves or Enter is pressed; Escape puts it back. */
function AptInput({ id, apt }: { id: string; apt: string | null }) {
  const [v, setV] = useState(apt ?? '');
  const save = () => {
    if (v.trim().toUpperCase() !== (apt ?? '')) void act('Apt #', A.setApt(id, v));
  };
  return (
    <input autoComplete="off"
      type="text"
      aria-label="Apt #"
      placeholder="—"
      value={v}
      maxLength={8}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setV(apt ?? '');
      }}
      style={{ width: 96, boxSizing: 'border-box', height: 34, padding: '0 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: '#111827', textAlign: 'center' }}
    />
  );
}
