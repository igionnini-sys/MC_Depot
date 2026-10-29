/** Small UI primitives (replace Streamlit widgets). */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help">
      <button type="button" className="help-btn" aria-label="?" aria-expanded={open} title={text} onClick={() => setOpen((o) => !o)}>
        ?
      </button>
      {open && <span className="help-pop" role="note">{text}</span>}
    </span>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  help?: string;
  suffix?: string;
  compact?: boolean;
}

/** Numeric input that lets the user type freely and clamps on blur. */
export function NumberField({ label, value, onChange, min, max, step = 1, decimals, help, suffix, compact }: NumberFieldProps) {
  const id = useId();
  const fmt = (v: number) => (decimals !== undefined ? v.toFixed(decimals) : String(v));
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const parse = (s: string) => Number(s.replace(',', '.'));

  return (
    <div className={`field ${compact ? 'compact' : ''}`}>
      <label htmlFor={id}>
        {label}
        {help && <Help text={help} />}
      </label>
      <div className="input-wrap">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          onFocus={() => (focused.current = true)}
          onChange={(e) => {
            setText(e.target.value);
            const v = parse(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(clamp(v));
          }}
          onBlur={() => {
            focused.current = false;
            const v = parse(text);
            const next = Number.isFinite(v) && text.trim() !== '' ? clamp(v) : value;
            onChange(next);
            setText(fmt(next));
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            const next = clamp(+(value + (e.key === 'ArrowUp' ? step : -step)).toFixed(6));
            onChange(next);
            setText(fmt(next));
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    </div>
  );
}

export function Switch({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  const id = useId();
  return (
    <div className="switch-row">
      <label className="switch" htmlFor={id}>
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="track" aria-hidden />
        <span className="switch-label">{label}</span>
      </label>
      {help && <Help text={help} />}
    </div>
  );
}

export function Select<T extends string | number>({ label, value, options, onChange }: { label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          if (opt) onChange(opt.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs }: { tabs: { id: string; label: string; content: () => ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className="tabs">
      <div className="tab-list" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={t.id === current.id} onClick={() => setActive(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">{current.content()}</div>
    </div>
  );
}

export type Tone = 'info' | 'success' | 'warning' | 'danger';
const toneIcon: Record<Tone, string> = { info: 'i', success: '✓', warning: '!', danger: '!' };

export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`alert ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="alert-icon" aria-hidden>{toneIcon[tone]}</span>
      <div>
        {title && <strong>{title}</strong>}
        {title && children ? ' ' : null}
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, help, tone }: { label: string; value: ReactNode; help?: string; tone?: Tone }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-label">
        {label}
        {help && <Help text={help} />}
      </div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}

export function Collapsible({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="collapsible" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="collapsible-body">{children}</div>
    </details>
  );
}

export function DataTable({ columns, rows, numeric }: { columns: string[]; rows: ReactNode[][]; numeric?: boolean[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c, i) => <th key={i} className={numeric?.[i] ? 'num' : ''}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={numeric?.[j] ? 'num' : ''}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ title, open, onClose, closeLabel, children }: { title: string; open: boolean; onClose: () => void; closeLabel: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onCancel={onClose}>
      <header className="card-head">
        <h2>{title}</h2>
        <button type="button" className="btn ghost" onClick={onClose}>{closeLabel}</button>
      </header>
      <div className="modal-body">{open && children}</div>
    </dialog>
  );
}
