import type { ToolDefinition } from './tools'

export type AlphabetTool = 'add' | 'delete' | 'preset' | 'sort'

export const ALPHABET_TOOLS: ToolDefinition<AlphabetTool>[] = [
  { id: 'add', label: 'Neu', icon: 'plus' },
  { id: 'delete', label: 'Löschen', icon: 'delete' },
  { id: 'preset', label: 'Voreinstellung', icon: 'preset' },
  { id: 'sort', label: 'Sortieren', icon: 'sort' }
]
