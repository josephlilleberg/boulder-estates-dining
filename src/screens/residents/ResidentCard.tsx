import { useState } from 'react';
import { attendanceSummary, drinkSubtitle, extraText, seatLabel } from '../../domain/labels';
import { CHAIR_LABEL, fullName, pouredTogether, type Chair, type Resident } from '../../domain/model';
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

export function ResidentCard({ resident: r, height, site, meal, onMeal }: Props) {
  const data = useStore((s) => s.data);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<null | 'rename' | 'archive' | 'delete'>(null);
  const [drink, setDrink] = useState<DrinkTarget | null>(null);
  const [extra, setExtra] = useState<ExtraTarget | null>(null);

  const meals = site.meals.map((m) => m.meal);
  const name = fullName(r);

  return (
    <section className="card" style={{ flex: '999 1 520px', minWidth: 0, height, overflowY: 'auto' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: '18px 24px', background: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{name}</h2>
          <div style={{ fontSize: 13, color: '#4B5563', marginTop: 3 }}>{attendanceSummary(r, site)}</div>
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
    const where = !on ? `Turn on if they start coming to ${m}` : seat ? seatLabel(site, m, seat, data.tables) : 'Not seated yet';
    const p = resident.prefs[m];
    const drinks = p?.drinks.filter((d) => d.slot === 'drink') ?? [];
    const coffee = p?.drinks.filter((d) => d.slot === 'coffee') ?? [];
    const isBk = site.id === 'BE' && m === 'Breakfast';
    const bev = (n: string) => data.beverages.find((b) => b.siteId === site.id && b.name === n);
    // Mockup: at Dinner and Supper the only extra is napkins.
    const extrasNote = isBk ? '' : `Only extra napkins at ${m}.`;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="group" style={{ marginBottom: 14 }}>
            <div className="grow" style={{ cursor: 'default', minHeight: 56 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{siteHasSwitch ? `Comes to ${m}` : 'All meals'}</div>
                <div className={on && !seat ? 'mwhere warn' : 'mwhere'}>{where}</div>
              </div>
              {siteHasSwitch && (
                <button type="button" className="swbtn" aria-pressed={on} aria-label={`Comes to ${m}`} onClick={() => act(`${on ? 'Stop' : 'Start'} coming to ${m}`, A.setAttendance(resident.id, m, !on))}>
                  <SwitchMark on={on} />
                </button>
              )}
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
                      Both are {pouredTogether(drinks)}, so they’re poured together in one glass.
                    </div>
                  )}
                  {coffee.map((d) => (
                    <DrinkRow key={d.id} label="Breakfast coffee" main={d.beverage} sub={`${drinkSubtitle(d, bev(d.beverage))} · doesn’t count toward the 2`} onClick={() => onDrink({ kind: 'edit', drinkId: d.id, meal: m })} />
                  ))}
                  {drinks.length < A.MAX_DRINKS && (
                    <button type="button" className="grow" onClick={() => onDrink({ kind: 'add', meal: m })} style={{ color: '#1D4ED8', fontSize: 14, fontWeight: 600 }}>
                      + Add a drink
                    </button>
                  )}
                  {isBk && coffee.length === 0 && (
                    <button
                      type="button"
                      className="grow"
                      onClick={async () => {
                        const { id, ops } = A.addDrink(resident.id, m, 'coffee', 'Coffee');
                        if (await act('Add breakfast coffee', ops)) onDrink({ kind: 'edit', drinkId: id, meal: m });
                      }}
                      style={{ color: '#1D4ED8', fontSize: 14, fontWeight: 600 }}
                    >
                      + Add breakfast coffee
                    </button>
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
                    {extrasNote && <span style={{ fontSize: 13, color: '#4B5563' }}>{extrasNote}</span>}
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
        <input
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
