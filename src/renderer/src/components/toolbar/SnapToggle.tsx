import { Icon } from '@/components/common/Icon'
import { shortcutTitle } from '@/hooks/useShortcutTitle'
import { toggleSnapToGrid } from '@/services/settingsActions'
import { useSettingsStore } from '@/store/settingsStore'
import { classNames } from '@/utils/dom'

/** Umschaltknopf „Einrasten“ (Magnet) unter den Werkzeugen des Grapheneditors */
export function SnapToggle() {
  const bindings = useSettingsStore((s) => s.settings.keybindings)
  const snap = useSettingsStore((s) => s.settings.snapToGrid)
  return (
    <div className="tool-palette is-toggles">
      <button
        className={classNames('tool-button', snap && 'is-active')}
        onClick={toggleSnapToGrid}
        title={shortcutTitle('Einrasten', bindings, 'tool.snap')}
        aria-pressed={snap}
      >
        <Icon name="magnet" size={18} />
      </button>
    </div>
  )
}
