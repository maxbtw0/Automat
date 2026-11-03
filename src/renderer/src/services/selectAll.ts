import { useEffect, useRef, type RefObject } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import { commitActiveInput } from '@/utils/dom'

/** Eine Tabelle, deren Zeilen „Alles auswählen“ markieren kann. */
export interface SelectAllHandlers {
  selectAll(): void
  clear(): void
}

interface SelectAllTarget extends SelectAllHandlers {
  /** Bereich der Tabelle samt Werkzeugleiste – ein Klick darin macht sie aktiv */
  area(): HTMLElement | null
}

const targets = new Set<SelectAllTarget>()
/** Tabelle, in die zuletzt geklickt oder getippt wurde – `null` = keine */
let active: SelectAllTarget | null = null
let tracking = false

/** Klick oder Fokus in einem Tabellen-Screen: die Tabelle darunter wird aktiv, sonst keine. */
function track(e: Event): void {
  const node = e.target
  if (!(node instanceof Node)) return
  const element = node instanceof Element ? node : node.parentElement
  // Toolbar, Dialoge usw. ändern nichts
  if (!element?.closest('.table-screen')) return
  active = [...targets].find((t) => t.area()?.contains(node)) ?? null
}

function registerTarget(target: SelectAllTarget): () => void {
  if (!tracking) {
    window.addEventListener('pointerdown', track, true)
    window.addEventListener('focusin', track, true)
    tracking = true
  }
  targets.add(target)
  return () => {
    targets.delete(target)
    if (active === target) active = null
  }
}

/**
 * Meldet eine Tabelle für „Alles auswählen“ an, solange die Komponente lebt. `handlers` =
 * `null` meldet nichts an.
 */
export function useSelectAllTarget(
  area: RefObject<HTMLElement | null>,
  handlers: SelectAllHandlers | null
): void {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  const enabled = handlers !== null
  useEffect(() => {
    if (!enabled) return undefined
    return registerTarget({
      area: () => area.current,
      selectAll: () => latest.current?.selectAll(),
      clear: () => latest.current?.clear()
    })
  }, [area, enabled])
}

/** Alle Zeilen der aktiven Tabelle – ist keine aktiv, die aller Tabellen des Screens. */
export function selectAllInTables(): void {
  const chosen = active && targets.has(active) ? active : null
  // Tippen soll danach nicht mehr die Zelle überschreiben, in der Strg+A gedrückt wurde
  commitActiveInput()
  for (const target of targets) {
    if (!chosen || target === chosen) target.selectAll()
    else target.clear()
  }
}

/**
 * „Alles auswählen“: im Grapheneditor alle Zustände und Übergänge, auf den Tabellen-Screens
 * alle Zeilen. Simulation und reguläre Ausdrücke haben nichts auszuwählen.
 */
export function selectAll(): void {
  const { screen } = useScreenStore.getState()
  if (screen === 'graph') useEditorStore.getState().selectAll()
  else if (screen === 'alphabet' || screen === 'transitionTable') selectAllInTables()
}
