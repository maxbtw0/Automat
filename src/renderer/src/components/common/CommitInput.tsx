import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { classNames } from '@/utils/dom'

interface CommitInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'defaultValue'> {
  value: string
  /**
   * Wird bei Enter oder Fokusverlust aufgerufen – nur wenn sich der Wert geändert hat.
   * Gibt der Aufrufer `false` zurück, wird der Wert abgelehnt und das Feld zurückgesetzt.
   */
  onCommit(value: string): void | boolean
}

/** Texteingabe, die erst beim Bestätigen in den Store schreibt (ein Undo-Schritt statt vieler). */
export function CommitInput({ value, onCommit, className, ...rest }: CommitInputProps) {
  const [draft, setDraft] = useState(value)
  const cancelled = useRef(false)

  useEffect(() => setDraft(value), [value])

  return (
    <input
      {...rest}
      className={classNames('input', className)}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (!cancelled.current && draft !== value && onCommit(draft) === false) setDraft(value)
        cancelled.current = false
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          cancelled.current = true
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}
