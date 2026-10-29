import type { ToolDefinition } from './tools'

export type TuringTableTool = 'add' | 'delete'

export const TURING_TABLE_TOOLS: ToolDefinition<TuringTableTool>[] = [
  { id: 'add', label: 'Neuer Zustand', icon: 'plus' },
  { id: 'delete', label: 'Zustand löschen', icon: 'delete' }
]
