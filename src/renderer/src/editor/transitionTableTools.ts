import type { ToolDefinition } from './tools'

export type TransitionTableTool = 'add' | 'delete' | 'sort'

export const TRANSITION_TABLE_TOOLS: ToolDefinition<TransitionTableTool>[] = [
  { id: 'add', label: 'Neu', icon: 'plus' },
  { id: 'delete', label: 'Löschen', icon: 'delete' },
  { id: 'sort', label: 'Sortieren', icon: 'sort' }
]
