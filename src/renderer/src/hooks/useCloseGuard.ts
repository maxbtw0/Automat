import { useEffect } from 'react'
import { closeWindow, isElectron } from '@/services/fileActions'
import { useEditorStore } from '@/store/editorStore'

/**
 * Schließen nur nach Rückfrage, solange es ungespeicherte Änderungen gibt. In Electron hält
 * der Hauptprozess das Fenster an und der Renderer fragt im App-Dialog; im Browser bleibt nur
 * die Standard-Rückfrage von `beforeunload`.
 */
export function useCloseGuard(): void {
  const dirty = useEditorStore((s) => s.dirty)

  useEffect(() => window.api?.onCloseRequest(() => void closeWindow()), [])

  useEffect(() => {
    window.api?.setDirty(dirty)
    if (isElectron || !dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent): void => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}
