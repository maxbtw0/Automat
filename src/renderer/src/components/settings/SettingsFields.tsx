import type { ReactNode } from 'react'
import { classNames } from '@/utils/dom'

/** Eine Zeile im Formular eines Reiters: Bezeichnung links, Eingabe rechts, Fehler darunter. */
export function SettingsField({
  label,
  htmlFor,
  error,
  children
}: {
  label: string
  htmlFor?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="settings-field">
      <label className="settings-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="settings-field-control">{children}</div>
      {error && <p className="settings-field-error">{error}</p>}
    </div>
  )
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h3 className="section-label">{title}</h3>
      {children}
    </section>
  )
}

/** Auswahl wie ein Schalter mit mehreren Stellungen */
export function SettingsSegmented<T extends string>({
  label,
  options,
  value,
  compact = false,
  onChange
}: {
  label: string
  options: { value: T; label: string; title?: string }[]
  value: T
  /** Schmale Knöpfe in Schreibmaschinenschrift (L · N · R) */
  compact?: boolean
  onChange(value: T): void
}) {
  return (
    <div
      className={classNames('segmented', compact && 'is-compact')}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={classNames('segmented-option', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
