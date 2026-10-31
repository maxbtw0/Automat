import { useEffect, useState } from 'react'
import { closeWindow, isElectron } from '@/services/fileActions'
import { useEditorStore } from '@/store/editorStore'
import { commitActiveInput, isEditableTarget } from '@/utils/dom'

/**
 * Schließen nur nach Rückfrage, solange es ungespeicherte Änderungen gibt. In Electron hält
 * der Hauptprozess das Fenster an und der Renderer fragt im App-Dialog; im Browser bleibt nur
 * die Standard-Rückfrage von `beforeunload`.
 *
 * Ein Eingabefeld mit Fokus kann einen Entwurf halten, den `dirty` noch nicht kennt. Solange
 * eins den Fokus hat, fragt der Hauptprozess deshalb auch nach – `closeWindow` übernimmt die
 * Eingabe und schließt ohne Rückfrage, wenn sich nichts geändert hat.
 */
export function useCloseGuard(): void {
  const dirty = useEditorStore((s) => s.dirty)
  const [editing, setEditing] = useState(false)

  useEffect(() => window.api?.onCloseRequest(() => void closeWindow()), [])

  useEffect(() => {
    const onFocusIn = (e: FocusEvent): void => setEditing(isEditableTarget(e.target))
    const onFocusOut = (e: FocusEvent): void => setEditing(isEditableTarget(e.relatedTarget))
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  useEffect(() => window.api?.setDirty(dirty || editing), [dirty, editing])

  useEffect(() => {
    if (isElectron) return
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      commitActiveInput()
      if (useEditorStore.getState().dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
}
