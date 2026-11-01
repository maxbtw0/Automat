/**
 * Schnittstellen zwischen Editor-UI und Automaten-Logik.
 *
 * Die UI arbeitet ausschließlich gegen diese Interfaces. Jeder Automatentyp
 * (DEA, später NEA, Kellerautomat, Turingmaschine, …) implementiert sie und
 * wird in `registry.ts` eingetragen.
 */

import type {
  AutomatonDocument,
  AutomatonType,
  StateId,
  TransitionId,
  TransitionLabel
} from '@/model/graph'

export type IssueSeverity = 'error' | 'warning' | 'info'

/** Ein Problem im gezeichneten Automaten, z. B. "kein Startzustand". */
export interface ValidationIssue {
  severity: IssueSeverity
  message: string
  /** Betroffene Zustände – werden in der UI beim Anklicken ausgewählt */
  stateIds?: StateId[]
  transitionIds?: TransitionId[]
}

/**
 * Turingmaschine: Ausschnitt des Bands – `symbols[i]` steht in Zelle `start + i`. Enthält alles
 * Beschriebene und die Kopfposition, außerhalb steht überall das Blank.
 */
export interface TapeSnapshot {
  start: number
  symbols: string[]
}

/** Momentaufnahme (Konfiguration) während einer Simulation. */
export interface SimulationStep {
  /** 0 = Startkonfiguration, danach 1, 2, … */
  index: number
  /** Aktuelle Zustände (beim DEA genau einer, beim NEA ggf. mehrere) – werden im Canvas hervorgehoben */
  activeStateIds: StateId[]
  /** Im letzten Schritt benutzte Übergänge – werden im Canvas hervorgehoben */
  usedTransitionIds: TransitionId[]
  /** Bereits gelesener Teil des Eingabeworts */
  consumed: string
  /** Noch zu lesender Teil des Eingabeworts */
  remaining: string
  /** Im letzten Schritt gelesenes Symbol (Kellerautomat auch ε) – `null` in der Startkonfiguration */
  symbol: string | null
  /** Anzahl gelesener Eingabesymbole (Position auf dem Eingabeband) */
  inputPosition: number
  /** Kellerautomat: Stackinhalt, oben = letztes Element */
  stack?: string[]
  /** Kellerautomat, Turingmaschine, Mealy-Automat: im letzten Schritt angewendete Regel */
  label?: TransitionLabel
  /** Turingmaschine: Bandinhalt */
  tape?: TapeSnapshot
  /** Turingmaschine: Zelle unter dem Kopf (0 = erstes Symbol des Eingabeworts) */
  head?: number
  /**
   * Transduktor: bisherige Ausgabe, ein Stück pro Schritt – `output[i]` hat Schritt i erzeugt.
   * Moore: `output[0]` = Ausgabe des Startzustands; Mealy: `output[0]` ist leer.
   */
  output?: string[][]
}

export interface SimulationResult {
  accepted: boolean
  steps: SimulationStep[]
}

/** Schrittweise Abarbeitung eines Eingabeworts. */
export interface Simulator {
  readonly word: string
  /** `true`, sobald keine weiteren Schritte möglich sind (Wort gelesen oder Automat hängt) */
  readonly isFinished: boolean
  /** Ergebnis, sobald `isFinished` gilt – vorher `null` */
  readonly accepted: boolean | null
  /** Grund, warum die Suche vorzeitig aufgehört hat (Limit erreicht) – sonst `null` */
  readonly abortReason?: string | null
  /** Lauf an einem Limit abgebrochen – über das Wort ist damit nichts entschieden */
  readonly undecided?: boolean
  /** Setzt auf die Startkonfiguration zurück und liefert sie. */
  reset(): SimulationStep
  /** Führt genau einen Schritt aus und liefert die neue Konfiguration. */
  step(): SimulationStep
  /**
   * Läuft bis zum Ende (höchstens `maxSteps` Schritte) und liefert alle Schritte ab der
   * aktuellen Konfiguration. Ist danach `isFinished` noch falsch, geht es später weiter.
   */
  run(maxSteps?: number): SimulationResult
}

export interface Automaton {
  readonly type: AutomatonType
  /** Prüft den gezeichneten Automaten auf Fehler (z. B. Determinismus beim DEA). */
  validate(): ValidationIssue[]
  /** Schnelltest: Wird das Wort akzeptiert? */
  accepts(word: string): boolean
  createSimulator(word: string): Simulator
}

/** Eintrag in der Registry – beschreibt einen Automatentyp und erzeugt Instanzen. */
export interface AutomatonDefinition {
  type: AutomatonType
  /** Kurzname für die UI, z. B. "DEA" */
  name: string
  description: string
  create(document: AutomatonDocument): Automaton
  /** ε-Übergänge (lesen ohne Eingabe) erlaubt */
  epsilon: boolean
  /** Reguläre Ausdrücke – nur bei endlichen Automaten */
  regex: boolean
  /** Die Simulation zeigt pro Schritt genau einen Zustand (einen Lauf statt einer Menge) */
  singlePath: boolean
}
