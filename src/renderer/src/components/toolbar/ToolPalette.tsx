import { Icon } from '@/components/common/Icon'
import type { ToolDefinition } from '@/editor/tools'
import { shortcutTitle } from '@/hooks/useShortcutTitle'
import { useSettingsStore } from '@/store/settingsStore'
import { classNames } from '@/utils/dom'

interface ToolPaletteProps<T extends string> {
  tools: ToolDefinition<T>[]
  /** Aktives Werkzeug – `null`, wenn die Buttons Aktionen statt Modi sind */
  active: T | null
  /** `button` ist der geklickte Button – z. B. um ein Menü daneben zu öffnen */
  onSelect(id: T, button: HTMLButtonElement): void
}
export function ToolPalette<T extends string>({ tools, active, onSelect }: ToolPaletteProps<T>) {
  const bindings = useSettingsStore((s) => s.settings.keybindings)
  return (
    <div className="tool-palette" role="toolbar" aria-orientation="vertical">
      {tools.map((tool) => (
        <button
          key={tool.id}
          className={classNames('tool-button', active === tool.id && 'is-active')}
          onClick={(e) => onSelect(tool.id, e.currentTarget)}
          title={shortcutTitle(tool.label, bindings, tool.keyAction)}
          aria-pressed={active === null ? undefined : active === tool.id}
        >
          <Icon name={tool.icon} size={18} />
        </button>
      ))}
    </div>
  )
}
