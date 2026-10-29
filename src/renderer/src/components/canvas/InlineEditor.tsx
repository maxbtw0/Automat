import { useEffect, useRef, useState } from 'react'

interface InlineEditorProps {
  /** Position relativ zum Canvas-Container (Bildschirm-Pixel) */
  x: number
  y: number
  initialValue: string
  placeholder?: string
  /** Breiter für längere Eingaben (Stackregeln) */
  wide?: boolean
  onCommit(value: string): void
  onCancel(): void
}

/** Kleines Eingabefeld direkt über dem Canvas (Zustand umbenennen, Symbole eintragen). */
export function InlineEditor({
  x,
  y,
  initialValue,
  placeholder,
  wide = false,
  onCommit,
  onCancel
}: InlineEditorProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const finished = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const finish = (commit: boolean): void => {
    if (finished.current) return
    finished.current = true
    if (commit) onCommit(value)
    else onCancel()
  }

  return (
    <input
      ref={inputRef}
      className={wide ? 'inline-editor is-wide' : 'inline-editor'}
      style={{ left: x, top: y }}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
    />
  )
}
