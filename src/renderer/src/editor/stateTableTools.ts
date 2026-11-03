import type { ToolDefinition } from './tools'

export type StateTableTool = 'add' | 'delete'

export const STATE_TABLE_TOOLS: ToolDefinition<StateTableTool>[] = [
  { id: 'add', label: 'Neuer Zustand', icon: 'plus' },
  { id: 'delete', label: 'Zustand löschen', icon: 'delete' }
]
