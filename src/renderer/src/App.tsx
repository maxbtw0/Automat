import { useEffect } from 'react'
import { useCloseGuard } from '@/hooks/useCloseGuard'
import { useShortcuts } from '@/hooks/useShortcuts'
import { displayName, runMenuAction } from '@/services/fileActions'
import { initSettings } from '@/services/settingsActions'
import { useEditorStore } from '@/store/editorStore'
import { DialogHost } from '@/components/common/DialogHost'
import { ExportDialog } from '@/components/export/ExportDialog'
import { HelpDialog } from '@/components/help/HelpDialog'
import { ScreenRouter } from '@/components/layout/ScreenRouter'
import { StatusBar } from '@/components/layout/StatusBar'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { Toolbar } from '@/components/toolbar/Toolbar'

export function App() {
  useShortcuts()
  useCloseGuard()

  useEffect(() => window.api?.onMenuAction(runMenuAction), [])
  useEffect(() => initSettings(), [])

  const dirty = useEditorStore((s) => s.dirty)
  const filePath = useEditorStore((s) => s.filePath)

  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${displayName(filePath)} – Automat`
  }, [dirty, filePath])


return (
  <div className="app-frame">
    <header className="area-toolbar">
      <Toolbar />
    </header>
    <main className="app-frame-content">
      <ScreenRouter />
    </main>
    <footer className="area-status">
      <StatusBar />
    </footer>
    <ExportDialog />
    <SettingsDialog />
    <HelpDialog />
    {/* Zuletzt: Rückfragen liegen über allen anderen Fenstern */}
    <DialogHost />
  </div>
)
}
