import { AUTOMATON_TYPES, type AutomatonType } from '@/model/graph'

/** Ein Reiter der Hilfe: Automatentyp, Dateiformat, Tastenkürzel oder Programm. */
export type HelpTab =
  | { kind: 'type'; type: AutomatonType }
  | { kind: 'saving' }
  | { kind: 'tooltips' }
  | { kind: 'program' }

export interface HelpGroup {
  label: string
  tabs: HelpTab[]
}

export const HELP_GROUPS: HelpGroup[] = [
  {
    label: 'Automatentypen',
    tabs: AUTOMATON_TYPES.map((type) => ({ kind: 'type', type }))
  },
  { label: 'Allgemein', tabs: [{ kind: 'saving' }, { kind: 'tooltips' }, { kind: 'program' }] }
]

/** Eindeutiger Schlüssel eines Reiters (für `key` und Vergleiche). */
export function helpTabKey(tab: HelpTab): string {
  return tab.kind === 'type' ? `type:${tab.type}` : tab.kind
}

/** Die Hilfe geht beim aktuellen Automatentyp auf. */
export function initialHelpTab(type: AutomatonType): HelpTab {
  return { kind: 'type', type }
}
