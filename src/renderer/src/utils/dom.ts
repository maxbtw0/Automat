/** `true`, wenn das Tastatur-Event aus einem Eingabefeld stammt. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/**
 * Übernimmt eine angefangene Eingabe: Das Feld mit dem Fokus verliert ihn, sein `onBlur`
 * schreibt den Entwurf in den Store. Vor Speichern, Neu, Öffnen und Schließen nötig – sonst
 * sieht `dirty` die Änderung nicht.
 */
export function commitActiveInput(): void {
  if (typeof document === 'undefined') return
  const active = document.activeElement
  if (isEditableTarget(active)) (active as HTMLElement).blur()
}

export function classNames(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ')
}

/** Wie viele offene Fenster ein Element gerade sperren – übereinanderliegende zählen mit */
const inertBy = new WeakMap<Element, number>()

/**
 * Ref-Callback für den Hintergrund (`.dialog-backdrop`) eines modalen Fensters: Alles außerhalb
 * wird `inert` – kein Fokus per Tab, keine Klicks, keine Enter-Taste auf Knöpfen dahinter –,
 * bis das Fenster verschwindet. Ein Fenster über einem anderen sperrt auch das untere.
 */
export function inertOutside(element: HTMLElement | null): (() => void) | undefined {
  if (!element) return undefined
  const locked: HTMLElement[] = []
  for (let node = element; node.parentElement && node !== document.body; ) {
    const parent: HTMLElement = node.parentElement
    for (const sibling of parent.children) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue
      inertBy.set(sibling, (inertBy.get(sibling) ?? 0) + 1)
      sibling.inert = true
      locked.push(sibling)
    }
    node = parent
  }
  return () => {
    for (const sibling of locked) {
      const count = (inertBy.get(sibling) ?? 1) - 1
      inertBy.set(sibling, count)
      if (count === 0) sibling.inert = false
    }
  }
}
