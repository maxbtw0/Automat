import { KEY_ACTIONS, actionForCombo, comboFromEvent, hasModifier } from '@shared/keybindings'
import type { KeyAction, KeyScope } from '@shared/keybindings'
import { getAutomatonDefinition } from '@/core/automaton/registry'
import { useEditorStore } from '@/store/editorStore'
import type { Screen } from '@/store/screenStore'
import { useSettingsStore } from '@/store/settingsStore'
import { isEditableTarget } from '@/utils/dom'
import { runMenuAction } from './fileActions'
import { openHelp } from './helpActions'
import { selectAll } from './selectAll'
import { openSettings } from './settingsActions'
import {
  openAlphabetEditor,
  openGraphEditor,
  openRegularExpressionsEditor,
  openSimulationEditor,
  openTransitionTableEditor
} from './screenActions'

/** Welche screen-gebundenen Kürzel auf einem Screen gelten. */
export function scopeOfScreen(screen: Screen): KeyScope {
  if (screen === 'graph') return 'graph'
  if (screen === 'simulation') return 'simulation'
  return 'global'
}

/**
 * Aktion zu einem Tastendruck – `null`, wenn keine passt oder die Taste dem Eingabefeld bzw.
 * dem Knopf gehört, in dem sie gedrückt wurde.
 */
export function keyActionForEvent(e: KeyboardEvent, scope: KeyScope): KeyAction | null {
  const combo = comboFromEvent(e)
  if (!combo) return null
  const action = actionForCombo(useSettingsStore.getState().settings.keybindings, combo, scope)
  if (!action) return null
  if (
    isEditableTarget(e.target) &&
    !(KEY_ACTIONS[action].inTextFields && hasModifier(combo)) &&
    !(action === 'edit.selectAll' && wholeCellSelected(e.target))
  ) {
    return null
  }
  // Leertaste/Enter auf einem Knopf löst schon dessen Klick aus.
  if (e.target instanceof HTMLButtonElement && (combo === 'Space' || combo === 'Enter')) {
    return null
  }
  return action
}

/**
 * Tabellenzelle, deren Text schon ganz markiert ist (wie direkt nach dem Fokus): „Alles
 * auswählen“ geht dann an die Tabelle statt an das Feld.
 */
function wholeCellSelected(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLInputElement) || !target.closest('.data-table')) return false
  const { selectionStart, selectionEnd, value } = target
  return selectionStart === 0 && selectionEnd === value.length
}

/** Führt eine Aktion aus – außer denen der Simulation, die steuert ihr Screen selbst. */
export function runKeyAction(action: KeyAction): void {
  const store = useEditorStore.getState()
  const definition = getAutomatonDefinition(store.document.type)
  switch (action) {
    case 'file.new':
      return runMenuAction('new')
    case 'file.open':
      return runMenuAction('open')
    case 'file.save':
      return runMenuAction('save')
    case 'file.saveAs':
      return runMenuAction('saveAs')
    case 'file.export':
      return runMenuAction('export')
    case 'edit.undo':
      return store.undo()
    case 'edit.redo':
      return store.redo()
    case 'edit.delete':
      return store.deleteSelection()
    case 'edit.selectAll':
      return selectAll()
    case 'edit.settings':
      return openSettings()
    case 'view.graph':
      return openGraphEditor()
    case 'view.alphabet':
      return openAlphabetEditor()
    case 'view.transitionTable':
      return openTransitionTableEditor()
    case 'view.regex':
      if (definition.regex) openRegularExpressionsEditor()
      return
    case 'view.simulation':
      return openSimulationEditor()
    case 'view.resetViewport':
      return store.resetViewport()
    case 'tool.select':
      return store.setTool('select')
    case 'tool.lasso':
      return store.setTool('lasso')
    case 'tool.state':
      return store.setTool('state')
    case 'tool.transition':
      return store.setTool('transition')
    case 'tool.delete':
      return store.setTool('delete')
    case 'tool.cancel':
      store.select(null)
      return store.setTool('select')
    case 'sim.togglePlay':
    case 'sim.stepForward':
    case 'sim.stepBack':
    case 'sim.reset':
    case 'sim.runToEnd':
      return
    case 'help.open':
      return openHelp()
  }
}
