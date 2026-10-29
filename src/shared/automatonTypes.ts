/** Alle Automatentypen, die der Editor kennt. Neue Typen hier ergänzen. */
export const AUTOMATON_TYPES = ['DFA', 'NFA', 'DPDA', 'NPDA', 'TM'] as const
export type AutomatonType = (typeof AUTOMATON_TYPES)[number]

/** Akzeptanz des Kellerautomaten: Endzustand oder leerer Stack */
export type StackAcceptance = 'final' | 'empty'

/** Kopfbewegung der Turingmaschine: links, rechts, stehen bleiben (neutral) */
export type TapeMove = 'L' | 'R' | 'N'
/** Reihenfolge in der Oberfläche: links, stehen bleiben, rechts */
export const TAPE_MOVES: readonly TapeMove[] = ['L', 'N', 'R']
