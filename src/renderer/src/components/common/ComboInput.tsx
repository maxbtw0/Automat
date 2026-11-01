import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { classNames } from '@/utils/dom'

/** Eintrag am Ende der Liste, der eine Aktion auslöst statt einen Wert einzutragen. */
export interface ComboAction {
  label: string
  onSelect(): void
}

type Item = { kind: 'option'; label: string } | { kind: 'action'; label: string; action: ComboAction }

interface ComboInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'defaultValue'> {
  value: string
  /** Vorschläge – beim Öffnen alle, beim Tippen gefiltert */
  options: string[]
  actions?: ComboAction[]
  /**
   * Wird bei Auswahl, Enter oder Fokusverlust aufgerufen – nur wenn sich der Wert geändert hat.
   * Gibt der Aufrufer `false` zurück, wird der Wert abgelehnt und das Feld zurückgesetzt.
   */
  onCommit(value: string): void | boolean
}

/**
 * Texteingabe mit eigener Vorschlagsliste (wie CommitInput, aber mit Dropdown).
 * Enter übernimmt den getippten Text – ein Vorschlag wird nur per Klick oder Pfeiltasten gewählt.
 */
export function ComboInput({
  value,
  options,
  actions = [],
  onCommit,
  className,
  onFocus,
  ...rest
}: ComboInputProps) {
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  /** Erst filtern, wenn getippt wurde – direkt nach dem Fokus sollen alle Vorschläge sichtbar sein. */
  const [filtering, setFiltering] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const cancelled = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => setDraft(value), [value])

  /** Einträge der Liste – nur für das gerade offene Feld, eine Tabelle hat sehr viele davon */
  const buildItems = (): Item[] => {
    const query = draft.trim().toLowerCase()
    const shown = filtering ? options.filter((o) => o.toLowerCase().includes(query)) : options
    return [
      ...shown.map((label): Item => ({ kind: 'option', label })),
      ...actions.map((action): Item => ({ kind: 'action', label: action.label, action }))
    ]
  }
  const items = open ? buildItems() : []

  useEffect(() => {
    if (activeIndex < 0) return
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const close = (): void => {
    setOpen(false)
    setFiltering(false)
    setActiveIndex(-1)
  }

  const commit = (next: string): void => {
    if (next !== value && onCommit(next) === false) setDraft(value)
  }

  const choose = (item: Item): void => {
    cancelled.current = true // der folgende Fokusverlust soll nicht noch einmal übernehmen
    if (item.kind === 'action') {
      setDraft(value)
      item.action.onSelect()
    } else {
      setDraft(item.label)
      commit(item.label)
    }
    close()
    inputRef.current?.blur()
  }

  return (
    <div className="combo">
      <input
        {...rest}
        ref={inputRef}
        className={classNames('input', className)}
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-autocomplete="list"
        autoComplete="off"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setFiltering(true)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={(e) => {
          setOpen(true)
          onFocus?.(e)
        }}
        onBlur={() => {
          if (!cancelled.current) commit(draft)
          cancelled.current = false
          close()
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const count = (open ? items : buildItems()).length
            if (count === 0) return
            setOpen(true)
            const step = e.key === 'ArrowDown' ? 1 : -1
            setActiveIndex((i) => (i + step + count) % count)
          } else if (e.key === 'Enter') {
            const item = open ? items[activeIndex] : undefined
            if (item) choose(item)
            else e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            cancelled.current = true
            setDraft(value)
            e.currentTarget.blur()
          }
        }}
      />
      {open && items.length > 0 && (
        <ul ref={listRef} className="combo-list" role="listbox">
          {items.map((item, i) => (
            <li
              key={`${item.kind}:${item.label}`}
              role="option"
              aria-selected={i === activeIndex}
              className={classNames(
                'combo-item',
                i === activeIndex && 'is-active',
                item.kind === 'option' && item.label === value && 'is-current',
                item.kind === 'action' && 'is-action'
              )}
              // mousedown statt click: sonst verliert das Eingabefeld vorher den Fokus
              onMouseDown={(e) => {
                e.preventDefault()
                choose(item)
              }}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
