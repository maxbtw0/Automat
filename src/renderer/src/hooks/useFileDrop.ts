import { useEffect, useState } from 'react'
import { openDroppedFile } from '@/services/fileActions'
import { isModalOpen } from '@/store/dialogStore'

function carriesFiles(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes('Files') ?? false
}

/**
 * Dateien, die irgendwo ins Fenster gezogen werden, öffnen wie „Öffnen“ (erst die Rückfrage
 * bei ungespeicherten Änderungen). Ohne `preventDefault` würde Electron zur Datei navigieren.
 * Liefert, ob gerade eine Datei über dem Fenster schwebt.
 */
export function useFileDrop(): boolean {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    // dragenter/dragleave feuern für jedes Kindelement – erst beim letzten dragleave ist sie weg
    let depth = 0
    const onDragEnter = (e: DragEvent): void => {
      if (!carriesFiles(e)) return
      depth++
      setDragging(!isModalOpen())
    }
    const onDragLeave = (e: DragEvent): void => {
      if (!carriesFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDragOver = (e: DragEvent): void => {
      if (!carriesFiles(e) || !e.dataTransfer) return
      e.preventDefault()
      e.dataTransfer.dropEffect = isModalOpen() ? 'none' : 'copy'
    }
    const onDrop = (e: DragEvent): void => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file && !isModalOpen()) void openDroppedFile(file)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return dragging
}
