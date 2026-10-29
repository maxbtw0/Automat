import { Canvas } from '@/components/canvas/Canvas'
import { PropertiesPanel } from '@/components/panels/PropertiesPanel'
import { ToolPalette } from '@/components/toolbar/ToolPalette'
import { useEditorStore } from '@/store/editorStore'
import { TOOLS } from '@/editor/tools'
import { classNames } from '@/utils/dom'

export function AppShell() {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  // Seitenleiste nur bei Auswahl – sonst bekommt der Canvas die ganze Breite
  const hasSelection = useEditorStore((s) => s.selection !== null)
  return (
    <div className={classNames('app-shell', !hasSelection && 'is-side-hidden')}>
      <nav className="area-tools">
        <ToolPalette tools={TOOLS} active={tool} onSelect={setTool} />
      </nav>
      <main className="area-canvas">
        <Canvas />
      </main>
      {hasSelection && (
        <aside className="area-side">
          <PropertiesPanel />
        </aside>
      )}
    </div>
  )
}
