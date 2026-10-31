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
