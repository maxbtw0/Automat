import { DEFAULT_SIMULATION } from '@shared/simulationSettings'
import {
  tapeSettings,
  type AutomatonDocument,
  type StateId,
  type TransitionEdge,
  type TransitionLabel
} from '@/model/graph'
import { asTuring } from './labels'
import { simulationLimits } from './limits'
import type { SimulationResult, SimulationStep, Simulator, TapeSnapshot } from './types'
import { startState } from './validation'
import { tokenizeWord } from './word'

/**
 * Standard-Schrittlimit – eine Turingmaschine hält nicht immer. Gilt, solange die Einstellungen
 * nichts anderes sagen (`simulationLimits().tmStepLimit`, 0 = unbegrenzt).
 */
export const STEP_LIMIT = DEFAULT_SIMULATION.tmStepLimit

/**
 * Beidseitig unendliches Band. Gespeichert werden nur Zellen, auf denen kein Blank steht –
 * jede andere Zelle (auch links von 0) enthält das Blank.
 */
export class Tape {
  private readonly cells = new Map<number, string>()

  constructor(
    readonly blank: string,
    symbols: string[] = []
  ) {
    symbols.forEach((symbol, i) => this.write(i, symbol))
  }

  read(position: number): string {
    return this.cells.get(position) ?? this.blank
  }

  write(position: number, symbol: string): void {
    if (symbol === this.blank) this.cells.delete(position)
    else this.cells.set(position, symbol)
  }

  /** Ausschnitt vom ersten bis zum letzten beschriebenen Feld – inklusive Kopfposition. */
  snapshot(head: number): TapeSnapshot {
    let start = head
    let end = head
    for (const position of this.cells.keys()) {
      if (position < start) start = position
      if (position > end) end = position
    }
    const symbols = new Array<string>(end - start + 1).fill(this.blank)
    for (const [position, symbol] of this.cells) symbols[position - start] = symbol
    return { start, symbols }
  }

  /** Beschriebener Teil ohne Blanks am Rand – z. B. das Ergebnis einer Rechnung. */
  content(): string[] {
    if (this.cells.size === 0) return []
    let start = Infinity
    let end = -Infinity
    for (const position of this.cells.keys()) {
      if (position < start) start = position
      if (position > end) end = position
    }
    const symbols: string[] = []
    for (let i = start; i <= end; i++) symbols.push(this.read(i))
    return symbols
  }

  /** Anzahl beschriebener Zellen (ohne Blanks) */
  get size(): number {
    return this.cells.size
  }

  copy(): Tape {
    const tape = new Tape(this.blank)
    for (const [position, symbol] of this.cells) tape.cells.set(position, symbol)
    return tape
  }
}

/** Mindestabstand zweier Checkpoints in Schritten */
const MIN_CHECKPOINT_GAP = 64
/** So viele zuletzt angefragte Bandausschnitte merkt sich der Verlauf (die Anzeige fragt oft nach) */
const SNAPSHOT_CACHE = 4

interface Checkpoint {
  step: number
  tape: Tape
}

/**
 * Bandverlauf eines Laufs. Statt in jedem Schritt das ganze Band zu kopieren (Speicher
 * Schritte × Bandlänge), merkt er sich nur, was jeder Schritt schreibt, und ab und zu das ganze
 * Band (Checkpoint). Band nach Schritt k = letzter Checkpoint davor + Schreibvorgänge bis k.
 *
 * Ein neuer Checkpoint entsteht erst, wenn seit dem letzten mindestens so viele Schritte
 * vergangen sind, wie jener Zellen hat (mindestens `MIN_CHECKPOINT_GAP`). Jeder Schritt
 * beschreibt höchstens eine neue Zelle – alle Checkpoints zusammen belegen deshalb höchstens etwa
 * doppelt so viele Zellen, wie es Schritte gibt, und ein Band nachzuspielen kostet etwa so viel,
 * wie es lang ist (so viel wie der Ausschnitt selbst). Wer die Schritte der Reihe nach liest
 * (Tabelle, Export), spielt vom zuletzt gelesenen Schritt aus weiter.
 */
class TapeHistory {
  /** Schritt k (ab 1) schreibt `symbols[k - 1]` in Zelle `positions[k - 1]` */
  private readonly positions: number[] = []
  private readonly symbols: string[] = []
  /** Band nach `step` Schritten, aufsteigend nach `step` */
  private readonly checkpoints: Checkpoint[]
  /** Arbeitskopie zum Nachspielen, steht auf Schritt `cursor.step` */
  private cursor: Checkpoint | null = null
  private readonly cache = new Map<number, TapeSnapshot>()

  constructor(initial: Tape) {
    this.checkpoints = [{ step: 0, tape: initial.copy() }]
  }

  /** Der nächste Schritt hat `symbol` in Zelle `position` geschrieben, `live` = Band danach. */
  record(position: number, symbol: string, live: Tape): void {
    this.positions.push(position)
    this.symbols.push(symbol)
    const step = this.positions.length
    const last = this.checkpoints[this.checkpoints.length - 1]
    if (step - last.step >= Math.max(MIN_CHECKPOINT_GAP, last.tape.size)) {
      this.checkpoints.push({ step, tape: live.copy() })
    }
  }

  /** Gespeicherte Zellen: Schreibvorgänge + alle Checkpoints */
  get storedCells(): number {
    return this.positions.length + this.checkpoints.reduce((sum, c) => sum + c.tape.size, 0)
  }

  /** Ausschnitt des Bands nach `step` Schritten mit dem Kopf in Zelle `head` */
  snapshot(step: number, head: number): TapeSnapshot {
    const cached = this.cache.get(step)
    if (cached) return cached
    const snapshot = this.tapeAt(step).snapshot(head)
    this.cache.set(step, snapshot)
    if (this.cache.size > SNAPSHOT_CACHE) {
      const [oldest] = this.cache.keys()
      this.cache.delete(oldest)
    }
    return snapshot
  }

  /** Band nach `step` Schritten – nur zum Lesen, die Arbeitskopie wird weiterverwendet */
  private tapeAt(step: number): Tape {
    const checkpoint = this.checkpointBefore(step)
    if (checkpoint.step === step) return checkpoint.tape
    let cursor = this.cursor
    // Vom zuletzt gelesenen Schritt weiterspielen, wenn er zwischen Checkpoint und Ziel liegt
    if (!cursor || cursor.step > step || cursor.step < checkpoint.step) {
      cursor = { step: checkpoint.step, tape: checkpoint.tape.copy() }
      this.cursor = cursor
    }
    for (let i = cursor.step; i < step; i++) cursor.tape.write(this.positions[i], this.symbols[i])
    cursor.step = step
    return cursor.tape
  }

  /** Letzter Checkpoint vor oder bei `step` (binäre Suche) */
  private checkpointBefore(step: number): Checkpoint {
    let low = 0
    let high = this.checkpoints.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (this.checkpoints[middle].step <= step) low = middle
      else high = middle - 1
    }
    return this.checkpoints[low]
  }
}

const OFFSET: Record<string, number> = { L: -1, R: 1, N: 0 }

/**
 * Simulation der deterministischen Turingmaschine.
 *
 * Start: Eingabewort ab Zelle 0 auf dem Band, Kopf auf Zelle 0, Startzustand. Ein Schritt
 * wendet die eine Regel an, die zu (Zustand, Symbol unter dem Kopf) passt: Symbol schreiben,
 * Kopf bewegen, Zustand wechseln. Passt keine Regel, hält die Maschine – akzeptiert, wenn sie
 * dabei in einem Endzustand ist. Weil sie auch nie halten kann, endet die Simulation spätestens
 * nach `stepLimit` Schritten (dann verworfen mit `abortReason`) – bei 0 nie von selbst.
 *
 * Anders als beim Kellerautomaten gibt es nichts zu suchen – jeder Schritt wird erst berechnet,
 * wenn er gebraucht wird.
 */
export class TuringSimulator implements Simulator {
  private readonly tokens: string[]
  private readonly blank: string
  private readonly start: StateId | null
  private readonly finals: Set<StateId>
  /** Zustand → Lesesymbol → Regel (bei Nichtdeterminismus gewinnt die erste) */
  private readonly rules = new Map<StateId, Map<string, { edge: TransitionEdge; label: TransitionLabel }>>()

  /** Symbol des Eingabeworts, das nicht in Σ liegt – dann verwirft die Maschine sofort */
  private readonly foreign: string | null
  private tape: Tape
  private history: TapeHistory
  private state: StateId | null
  private head = 0
  private count = 0
  private lastEdge: TransitionEdge | null = null
  private lastLabel: TransitionLabel | null = null

  constructor(
    document: AutomatonDocument,
    readonly word: string,
    /** Höchstens so viele Schritte, 0 = unbegrenzt */
    readonly stepLimit: number = simulationLimits().tmStepLimit
  ) {
    const { graph } = document
    this.tokens = tokenizeWord(word, document.alphabet)
    this.foreign = this.tokens.find((t) => !document.alphabet.includes(t)) ?? null
    this.blank = tapeSettings(document).blank
    this.start = startState(graph)?.id ?? null
    this.finals = new Set(graph.states.filter((s) => s.isFinal).map((s) => s.id))
    for (const edge of graph.transitions) {
      const byRead = this.rules.get(edge.from) ?? new Map()
      for (const label of edge.labels) {
        if (!byRead.has(label.read)) byRead.set(label.read, { edge, label })
      }
      this.rules.set(edge.from, byRead)
    }
    this.tape = new Tape(this.blank, this.tokens)
    this.history = new TapeHistory(this.tape)
    this.state = this.start
  }

  /** Hält die Maschine – passt in der aktuellen Konfiguration keine Regel? */
  get isHalted(): boolean {
    return this.nextRule() === null
  }

  get isFinished(): boolean {
    if (this.foreign !== null) return true
    return this.isHalted || (this.stepLimit > 0 && this.count >= this.stepLimit)
  }

  get accepted(): boolean | null {
    if (!this.isFinished) return null
    if (this.foreign !== null) return false
    return this.isHalted && this.state !== null && this.finals.has(this.state)
  }

  get undecided(): boolean {
    return this.isFinished && !this.isHalted && this.foreign === null
  }

  get abortReason(): string | null {
    // Ein Wort außerhalb von Σ* gehört nicht zur Sprache – die Maschine rechnet gar nicht erst
    if (this.foreign !== null) return `„${this.foreign}“ nicht in Σ`
    if (!this.isFinished || this.isHalted) return null
    return `Abbruch nach ${this.stepLimit.toLocaleString('de-DE')} Schritten`
  }

  /** Gespeicherte Bandzellen des bisherigen Laufs (Schreibprotokoll + Checkpoints) */
  get storedTapeCells(): number {
    return this.history.storedCells
  }

  /** Bandinhalt ohne Blanks am Rand (Ergebnis einer Rechnung). */
  get output(): string[] {
    return this.tape.content()
  }

  reset(): SimulationStep {
    this.tape = new Tape(this.blank, this.tokens)
    // Neuer Verlauf – Schritte des vorigen Laufs behalten ihren eigenen
    this.history = new TapeHistory(this.tape)
    this.state = this.start
    this.head = 0
    this.count = 0
    this.lastEdge = null
    this.lastLabel = null
    return this.snapshot()
  }

  step(): SimulationStep {
    const rule = this.isFinished ? null : this.nextRule()
    if (rule) {
      const { write, move } = asTuring(rule.label)
      this.tape.write(this.head, write)
      this.history.record(this.head, write, this.tape)
      this.head += OFFSET[move] ?? 0
      this.state = rule.edge.to
      this.count += 1
      this.lastEdge = rule.edge
      this.lastLabel = rule.label
    }
    return this.snapshot()
  }

  run(maxSteps = Infinity): SimulationResult {
    const steps: SimulationStep[] = []
    while (!this.isFinished && steps.length < maxSteps) steps.push(this.step())
    return { accepted: this.accepted ?? false, steps }
  }

  private nextRule(): { edge: TransitionEdge; label: TransitionLabel } | null {
    if (this.state === null) return null
    return this.rules.get(this.state)?.get(this.tape.read(this.head)) ?? null
  }

  /**
   * Konfiguration nach dem aktuellen Schritt. Band, `consumed` und `remaining` entstehen erst
   * beim Lesen aus dem Verlauf – pro Schritt wird nur wenig gespeichert.
   */
  private snapshot(): SimulationStep {
    const history = this.history
    const step = this.count
    const head = this.head
    const tape = (): TapeSnapshot => history.snapshot(step, head)
    return {
      index: step,
      activeStateIds: this.state === null ? [] : [this.state],
      usedTransitionIds: this.lastEdge ? [this.lastEdge.id] : [],
      get consumed() {
        const { start, symbols } = tape()
        return symbols.slice(0, head - start).join('')
      },
      get remaining() {
        const { start, symbols } = tape()
        return symbols.slice(head - start).join('')
      },
      symbol: this.lastLabel ? this.lastLabel.read : null,
      inputPosition: head,
      ...(this.lastLabel ? { label: this.lastLabel } : {}),
      get tape() {
        return tape()
      },
      head
    }
  }
}
