import { useEffect, useRef } from 'react'
import { classNames } from '@/utils/dom'

export type ContextMenuEntry =
  | { label: string; onSelect(): void; danger?: boolean; checked?: boolean }
  | 'separator'

interface ContextMenuProps {
  x: number
  y: number
  entries: ContextMenuEntry[]
  onClose(): void
}

export function ContextMenu({ x, y, entries, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: x, top: y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) =>
        entry === 'separator' ? (
          <div key={i} className="context-menu-separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={classNames('context-menu-item', entry.danger && 'is-danger')}
            onClick={() => {
              entry.onSelect()
              onClose()
            }}
          >
            <span className="context-menu-check">{entry.checked ? '✓' : ''}</span>
            {entry.label}
          </button>
        )
      )}
    </div>
  )
}
