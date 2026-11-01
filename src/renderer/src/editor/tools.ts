import type { KeyAction } from '@shared/keybindings'
import type { Tool } from '@/store/editorStore'
import type { IconName } from '@/components/common/Icon'



export interface ToolDefinition<T extends string = Tool> {
  id: T
  label: string
  icon: IconName        // neu: Icon getrennt von der id
  keyAction?: KeyAction // Tastenkürzel aus den Einstellungen (nur im Tooltip)
  hint?: string
}

export const TOOLS: ToolDefinition[] = [
  {
    id: 'select',
    label: 'Auswählen',
    icon: 'select',
    keyAction: 'tool.select',
    hint: 'Klicken: auswählen · Ziehen: verschieben · Ziehen auf Fläche: Rechteck auswählen · Doppelklick auf Fläche: neuer Zustand · Strg/Leertaste/Mittelklick + Ziehen: Ansicht verschieben'
  },
  {
    id: 'lasso',
    label: 'Lasso',
    icon: 'lasso',
    keyAction: 'tool.lasso',
    hint: 'Frei umfahren: mehrere Elemente auswählen · Auswahl ziehen: verschieben'
  },
  {
    id: 'state',
    label: 'Zustand',
    icon: 'state',
    keyAction: 'tool.state',
    hint: 'Auf die Fläche klicken, um einen Zustand anzulegen'
  },
  {
    id: 'transition',
    label: 'Übergang',
    icon: 'transition',
    keyAction: 'tool.transition',
    hint: 'Von einem Zustand zu einem anderen (oder demselben) ziehen'
  },
  {
    id: 'delete',
    label: 'Löschen',
    icon: 'delete',
    keyAction: 'tool.delete',
    hint: 'Zustand oder Übergang anklicken, um ihn zu löschen'
  }
]
