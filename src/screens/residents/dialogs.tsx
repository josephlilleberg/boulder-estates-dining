import { useEffect, useMemo, useState } from 'react';
import { extraText } from '../../domain/labels';
import { fullName, hasAmount, shortName, tidyName, type Beverage, type BeverageKind, type Resident } from '../../domain/model';
import type { MealName, Site } from '../../domain/sites';
import { act, actUndoable } from '../../state/act';
import * as A from '../../state/residentActions';
import { extrasFor } from '../../state/settingsActions';
import { useStore } from '../../state/store';
import { Dialog, Field } from '../../ui/Dialog';
import { SwitchMark } from '../../ui/Switch';

// Forms the mockup leaves as "this opens a form in the real app". Plain, same tokens.

// ---- Add / rename ----------------------------------------------------------

type NameProps =
  | { mode: 'add'; site: Site; defaultMeal: MealName; onClose: () => void; onSaved: (id: string) => void }
  | { mode: 'rename'; site: Site; resident: Resident; onClose: () => void; onSaved: (id: string) => void };

export function NameDialog(props: NameProps) {
  const r = props.mode === 'rename' ? props.resident : null;
  const [first, setFirst] = useState(r?.first ?? '');
  const [last, setLast] = useState(r?.last ?? '');
  const [nickname, setNickname] = useState(r?.nickname ?? '');
  const [meals, setMeals] = useState<MealName[]>(props.mode === 'add' ? [props.defaultMeal] : []);
  const residents = useStore((s) => s.data.residents);
  // Caught as you type, so the button never saves a second copy of someone.
  const dup = A.duplicateMessage(A.duplicateOf({ residents }, props.site.id, first, last, r?.id));
  const ok = first.trim() && last.trim() && !dup;

  const submit = async () => {
    if (!ok) return;
    if (props.mode === 'add') {
      const { id, ops } = A.addResident({ siteId: props.site.id, first, last, nickname, meals });
      if (await act(`Add ${tidyName(first)} ${tidyName(last)}`, ops)) props.onSaved(id);
    } else if (await act('Edit name', A.renameResident(r!.id, first, last, nickname))) {
      props.onSaved(r!.id);
    }
  };

  return (
    <Dialog
      title={props.mode === 'add' ? 'Add a resident' : 'Edit name'}
      onClose={props.onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" form="name-form" className="btn primary" disabled={!ok}>
            {props.mode === 'add' ? 'Add resident' : 'Save'}
          </button>
        </>
      }
    >
      <form
        id="name-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="First name">
            <input className="text-input" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Last name">
            <input className="text-input" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        {dup && (
          <p role="alert" style={{ margin: '-6px 0 0', fontSize: 13, color: '#9A3412' }}>
            {dup}
          </p>
        )}
        <Field label="Nickname (optional)">
          <input className="text-input" value={nickname} onChange={(e) => setNickname(e.target.value)} autoComplete="off" placeholder="What they go by" />
          <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#4B5563' }}>
            Shown on the seating map and server sheets{first.trim() || last.trim() ? `, as “${shortName({ first: tidyName(first) || 'First', last: tidyName(last) || 'L', nickname: tidyName(nickname) || null })}”` : ''}.
          </span>
        </Field>
        {props.mode === 'add' && props.site.meals.length > 1 && (
          <Field label="Comes to">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {props.site.meals.map(({ meal }) => {
                const on = meals.includes(meal);
                return (
                  <button key={meal} type="button" className="check-row" aria-pressed={on} onClick={() => setMeals((m) => (on ? m.filter((x) => x !== meal) : [...m, meal]))}>
                    <span className={on ? 'box on' : 'box'}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    </span>
                    {meal}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
      </form>
    </Dialog>
  );
}

// ---- Archive ---------------------------------------------------------------

export function ArchiveDialog({ resident: r, seats, onClose }: { resident: Resident; seats: number; onClose: () => void }) {
  const name = fullName(r);
  return (
    <Dialog
      title={`Archive ${name}?`}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose} data-autofocus>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              await actUndoable(`Archive ${name}`, A.archiveResident(r.id), `Archived ${name}`);
              onClose();
            }}
          >
            Archive
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
        They’ll be hidden from seating and every sheet{seats ? `, and their ${seats === 1 ? 'seat is' : `${seats} seats are`} freed` : ''}. Their drinks and notes are kept, so you can
        restore them from Archived residents at the bottom of the list.
      </p>
    </Dialog>
  );
}

export function DeleteDialog({ resident: r, onClose }: { resident: Resident; onClose: () => void }) {
  const name = fullName(r);
  return (
    <Dialog
      title={`Delete ${name}?`}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose} data-autofocus>
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (await actUndoable(`Delete ${name}`, A.deleteResident(r.id), `Deleted ${name}`)) onClose();
            }}
          >
            Delete
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
        This removes {name} with their drinks, extras, notes and seats. Undo (top right) brings them back. If they might return, Archive keeps everything instead.
      </p>
    </Dialog>
  );
}

// ---- Drinks ----------------------------------------------------------------

export type DrinkTarget = { kind: 'add'; meal: MealName } | { kind: 'edit'; meal: MealName; drinkId: string };

/** Drink types in the order they're picked; only types that have a drink are shown. */
const DRINK_TYPES: { kind: BeverageKind; label: string }[] = [
  { kind: 'milk', label: 'Milk' },
  { kind: 'juice', label: 'Juice' },
  { kind: 'coffee', label: 'Coffee' },
  { kind: 'tea', label: 'Tea' },
  { kind: 'other', label: 'Other' },
];

/**
 * Top-down drink choice: pick the type (Milk, Juice, Coffee…), then the drink within it
 * (2% Milk, Skim Milk…). A type with only one drink, like Coffee, is picked in one click.
 */
function DrinkPicker({ beverages, value, onPick }: { beverages: Beverage[]; value?: string; onPick: (name: string) => void }) {
  const current = beverages.find((b) => b.name === value);
  const [kind, setKind] = useState<BeverageKind | null>(current?.kind ?? null);
  const types = DRINK_TYPES.filter((t) => beverages.some((b) => b.kind === t.kind));
  const options = beverages.filter((b) => b.kind === kind);
  return (
    <>
      <Field label="Type">
        <div className="chips" role="group" aria-label="Drink type">
          {types.map((t, i) => {
            const inType = beverages.filter((b) => b.kind === t.kind);
            return (
              <button
                key={t.kind}
                type="button"
                className={kind === t.kind ? 'chipbtn on' : 'chipbtn'}
                aria-pressed={kind === t.kind}
                data-autofocus={(!current && i === 0) || undefined}
                onClick={() => {
                  setKind(t.kind);
                  if (inType.length === 1 && inType[0]!.name !== value) onPick(inType[0]!.name);
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </Field>
      {kind && options.length > 1 && (
        <Field label={DRINK_TYPES.find((t) => t.kind === kind)!.label}>
          <div className="chips" role="group" aria-label="Drink">
            {options.map((b) => (
              <button key={b.name} type="button" className={b.name === value ? 'chipbtn on' : 'chipbtn'} aria-pressed={b.name === value} onClick={() => b.name !== value && onPick(b.name)}>
                {b.name}
              </button>
            ))}
          </div>
        </Field>
      )}
    </>
  );
}

export function DrinkDialog({ target, resident: r, onTarget, onClose }: { target: DrinkTarget; resident: Resident; onTarget: (t: DrinkTarget) => void; onClose: () => void }) {
  const data = useStore((s) => s.data);
  const beverages = data.beverages.filter((b) => b.siteId === r.siteId);
  const drinkware = data.drinkware.filter((w) => w.siteId === r.siteId).map((w) => w.name);
  const drinks = r.prefs[target.meal]?.drinks ?? [];
  const d = target.kind === 'edit' ? drinks.find((x) => x.id === target.drinkId) : undefined;
  const gone = target.kind === 'edit' && !d; // e.g. removed, or Undo took it away

  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);
  if (gone) return null;

  if (target.kind === 'add') {
    return (
      <Dialog title="Add a drink" subtitle={`${fullName(r)} · ${target.meal}`} onClose={onClose}>
        <DrinkPicker
          beverages={beverages}
          onPick={async (name) => {
            const { id, ops } = A.addDrink(r.id, target.meal, 'drink', name);
            if (await act(`Add ${name}`, ops)) onTarget({ kind: 'edit', meal: target.meal, drinkId: id });
          }}
        />
        <div />
      </Dialog>
    );
  }

  const drink = d!;
  const bev = beverages.find((b) => b.name === drink.beverage);
  const kind = bev?.kind ?? 'other';
  const isCoffeeSlot = drink.slot === 'coffee';
  const index = drinks.filter((x) => x.slot === 'drink').findIndex((x) => x.id === drink.id);
  const set = (label: string, p: A.DrinkPatch) => act(label, A.updateDrink(drink.id, p));

  return (
    <Dialog
      title={isCoffeeSlot ? 'Breakfast coffee' : `Drink ${index + 1}`}
      subtitle={`${fullName(r)} · ${target.meal} · changes save as you go`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn sm warn"
            onClick={async () => {
              await act(`Remove ${drink.beverage}`, A.removeDrink(drink.id));
              onClose();
            }}
          >
            Remove drink
          </button>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={onClose} data-autofocus>
            Done
          </button>
        </>
      }
    >
      {!isCoffeeSlot && <DrinkPicker key={drink.id} beverages={beverages} value={drink.beverage} onPick={(name) => set(`Drink: ${name}`, { beverage: name })} />}
      {kind === 'tea' && (
        <Field label="Tea">
          <Seg options={A.TEAS} value={drink.tea ?? ''} onPick={(tea) => set(`Tea: ${tea}`, { tea })} label="Tea" />
        </Field>
      )}
      <Field label="Cup">
        {/* Chips, not pills: five options wrap badly in a segmented track. */}
        <div className="chips" role="group" aria-label="Cup">
          {drinkware.map((w) => (
            <button key={w} type="button" className={w === drink.drinkware ? 'chipbtn on' : 'chipbtn'} aria-pressed={w === drink.drinkware} onClick={() => w !== drink.drinkware && set(`Cup: ${w}`, { drinkware: w })}>
              {w}
            </button>
          ))}
        </div>
      </Field>
      {/* Only a glass or to-go cup has Full / Half; a juice glass or mug is one serving. */}
      {hasAmount(drink.drinkware) && (
        <Field label="Amount">
          <Seg options={['Full', 'Half']} value={drink.amount} onPick={(a) => set(`${a} ${drink.beverage}`, { amount: a as 'Full' | 'Half' })} label="Amount" />
        </Field>
      )}
      {(kind === 'coffee' || kind === 'milk' || kind === 'juice' || kind === 'other') && (
        <div className="group">
          {kind === 'coffee' ? (
            <button type="button" className="grow" aria-pressed={drink.creamer} onClick={() => set(`Creamer ${drink.creamer ? 'off' : 'on'}`, { creamer: !drink.creamer })}>
              <span style={{ flex: 1, fontSize: 14, color: '#111827' }}>Creamer</span>
              <SwitchMark on={drink.creamer} />
            </button>
          ) : (
            <button type="button" className="grow" aria-pressed={drink.extraGlass} onClick={() => set(`Extra glass ${drink.extraGlass ? 'off' : 'on'}`, { extraGlass: !drink.extraGlass })}>
              <span style={{ flex: 1, fontSize: 14, color: '#111827' }}>Extra glass</span>
              <SwitchMark on={drink.extraGlass} />
            </button>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Seg({ options, value, onPick, label }: { options: string[]; value: string; onPick: (v: string) => void; label: string }) {
  return (
    <div className="segwrap" role="group" aria-label={label} style={{ alignSelf: 'flex-start' }}>
      {options.map((o) => (
        <button key={o} type="button" className={o === value ? 'seg on' : 'seg'} aria-pressed={o === value} onClick={() => o !== value && onPick(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

// ---- Extras ----------------------------------------------------------------

export type ExtraTarget = { kind: 'add'; meal: MealName } | { kind: 'edit'; meal: MealName; extraId: string };

// The list comes from Settings; at Breakfast, anything already used at this site is added to it.
const OTHER = '__other__';

export function ExtraDialog({ target, resident: r, onClose }: { target: ExtraTarget; resident: Resident; onClose: () => void }) {
  const residents = useStore((s) => s.data.residents);
  const catalog = useStore((s) => s.data.extraOptions);
  const options = useMemo(() => extrasFor({ extraOptions: catalog }, r.siteId, target.meal), [catalog, r.siteId, target.meal]);
  const existing = target.kind === 'edit' ? r.prefs[target.meal]?.extras.find((x) => x.id === target.extraId) : undefined;
  const isBk = target.meal === 'Breakfast';

  // Everything this site has used at breakfast, so the list grows with real use.
  const used = useMemo(() => {
    const names = new Set<string>();
    const variants: Record<string, Set<string>> = {};
    for (const x of residents.filter((y) => y.siteId === r.siteId).flatMap((y) => y.prefs.Breakfast?.extras ?? [])) {
      names.add(x.name);
      if (x.variant) (variants[x.name] ??= new Set()).add(x.variant);
    }
    return { names, variants };
  }, [residents, r.siteId]);

  const names = isBk ? [...new Set([...options.map((o) => o.name), ...used.names])] : options.map((o) => o.name);
  const onlyOne = !isBk && names.length === 1;
  const startKnown = !existing || names.includes(existing.name);
  const [pick, setPick] = useState<string>(existing ? (startKnown ? existing.name : OTHER) : onlyOne ? names[0]! : '');
  const [custom, setCustom] = useState(existing && !startKnown ? existing.name : '');
  const [variant, setVariant] = useState<string | null>(existing?.variant ?? null);
  const [count, setCount] = useState(existing?.count ?? (isBk ? 1 : 2));

  const name = pick === OTHER ? custom.trim() : pick;
  const opt = options.find((o) => o.name === name);
  const variants = name ? [...new Set([...(opt?.variants ?? []), ...(used.variants[name] ?? [])])] : [];
  const needsVariant = !!opt?.variants.length;
  const showCount = opt?.counted ?? true;
  const ok = !!name && (!needsVariant || !!variant);
  const input = { name, variant: variants.length || pick === OTHER ? variant : null, count: showCount ? count : 1 };

  const save = async () => {
    if (!ok) return;
    const done =
      target.kind === 'add' ? await act(`Add ${extraText(input)}`, A.addExtra(r.id, target.meal, input)) : await act(`Change ${extraText(input)}`, A.updateExtra(target.extraId, input));
    if (done) onClose();
  };

  if (target.kind === 'edit' && !existing) return null;

  return (
    <Dialog
      title={target.kind === 'add' ? 'Add an extra' : 'Extra'}
      subtitle={`${fullName(r)} · ${target.meal}`}
      onClose={onClose}
      footer={
        <>
          {target.kind === 'edit' && (
            <button
              type="button"
              className="btn sm warn"
              onClick={async () => {
                await act(`Remove ${extraText(existing!)}`, A.removeExtra(target.extraId));
                onClose();
              }}
            >
              Remove
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!ok} onClick={() => void save()}>
            {target.kind === 'add' ? 'Add' : 'Save'}
          </button>
        </>
      }
    >
      {onlyOne ? (
        <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>Only extra {names[0]!.toLowerCase()} at {target.meal}.</p>
      ) : names.length || isBk ? (
        <Field label="Item">
          <div className="chips">
            {names.map((n, i) => (
              <button
                key={n}
                type="button"
                className={pick === n ? 'chipbtn on' : 'chipbtn'}
                aria-pressed={pick === n}
                data-autofocus={i === 0 || undefined}
                onClick={() => {
                  setPick(n);
                  setVariant(null);
                }}
              >
                {n}
              </button>
            ))}
            {isBk && (
              <button type="button" className={pick === OTHER ? 'chipbtn on' : 'chipbtn'} aria-pressed={pick === OTHER} onClick={() => setPick(OTHER)}>
                Something else…
              </button>
            )}
          </div>
          {pick === OTHER && (
            <input className="text-input" style={{ marginTop: 8 }} autoFocus placeholder="e.g. Extra toast" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
          )}
        </Field>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>No extras are offered at {target.meal}. Add some in Settings.</p>
      )}

      {variants.length > 0 && (
        <Field label={name === 'Fruit' ? 'Which fruit' : 'Kind'}>
          <div className="chips">
            {variants.map((v) => (
              <button key={v} type="button" className={variant === v ? 'chipbtn on' : 'chipbtn'} aria-pressed={variant === v} onClick={() => setVariant(v)}>
                {v}
              </button>
            ))}
          </div>
        </Field>
      )}

      {name && showCount && (
        <Field label="How many">
          <div className="stepper">
            <button type="button" className="btn" aria-label="One fewer" disabled={count <= 1} onClick={() => setCount((c) => c - 1)}>
              −
            </button>
            <output aria-live="polite">{count}</output>
            <button type="button" className="btn" aria-label="One more" disabled={count >= 9} onClick={() => setCount((c) => c + 1)}>
              +
            </button>
          </div>
        </Field>
      )}
    </Dialog>
  );
}
