import { DEFAULT_SIMULATION } from '@shared/simulationSettings'
import {
  EPSILON,
  stackSettings,
  type AutomatonDocument,
  type StateId,
  type TransitionEdge,
  type TransitionLabel
} from '@/model/graph'
import { asPushdown } from './labels'
import { simulationLimits } from './limits'
import type { SimulationResult, SimulationStep, Simulator } from './types'
import { startState } from './validation'
import { tokenizeWord } from './word'

/** Standard: so viele Konfigurationen untersucht die Suche höchstens */
export const CONFIGURATION_LIMIT = DEFAULT_SIMULATION.pdaConfigurationLimit
/** Standard: höher darf der Stack nicht werden (ε-Schleifen, die immer weiter ablegen) */
export const STACK_LIMIT = DEFAULT_SIMULATION.pdaStackLimit

export interface PushdownLimits {
  configurations: number
  stackHeight: number
}

/** Grenzen aus den Einstellungen */
function currentLimits(): PushdownLimits {
  const { pdaConfigurationLimit, pdaStackLimit } = simulationLimits()
  return { configurations: pdaConfigurationLimit, stackHeight: pdaStackLimit }
}

/** Konfiguration (q, Rest der Eingabe, Stack) als Knoten im Konfigurationsbaum */
export interface PushdownConfiguration {
  state: StateId | null
  /** Anzahl gelesener Eingabesymbole */
  position: number
  /** Stackinhalt, oben = letztes Element */
  stack: string[]
  /** Woher die Konfiguration kommt – `null` bei der Startkonfiguration */
  parent: PushdownConfiguration | null
  edge: TransitionEdge | null
  label: TransitionLabel | null
}

export interface PushdownSearch {
  /** Angezeigter Lauf von der Startkonfiguration bis zur letzten Konfiguration */
  path: PushdownConfiguration[]
  accepted: boolean
  /** Warum die Suche abgebrochen wurde – `null`, wenn alle Konfigurationen untersucht sind */
  abortReason: string | null
}

/** Schlüssel für „schon besucht“ – als JSON, damit „|“ in IDs oder Symbolen nichts verwechselt */
const keyOf = (c: PushdownConfiguration): string => JSON.stringify([c.state, c.position, c.stack])

function pathTo(node: PushdownConfiguration): PushdownConfiguration[] {
  const path: PushdownConfiguration[] = []
  for (let n: PushdownConfiguration | null = node; n; n = n.parent) path.push(n)
  return path.reverse()
}

/** Alle Folgekonfigurationen: jede passende Regel an jedem Übergang aus dem Zustand. */
function successors(
  node: PushdownConfiguration,
  outgoing: TransitionEdge[],
  tokens: string[]
): PushdownConfiguration[] {
  const result: PushdownConfiguration[] = []
  for (const edge of outgoing) {
    for (const label of edge.labels) {
      const { read, pop, push } = asPushdown(label)
      if (read !== EPSILON && tokens[node.position] !== read) continue
      // Jede Regel nimmt das oberste Symbol – bei leerem Stack passt keine
      if (node.stack.at(-1) !== pop) continue
      const rest = node.stack.slice(0, -1)
      result.push({
        state: edge.to,
        position: read === EPSILON ? node.position : node.position + 1,
        // push[0] soll oben liegen → in umgekehrter Reihenfolge ablegen
        stack: [...rest, ...[...push].reverse()],
        parent: node,
        edge,
        label
      })
    }
  }
  return result
}

/**
 * Breitensuche im Konfigurationsbaum des Kellerautomaten.
 *
 * Ein Kellerautomat ist im Allgemeinen nichtdeterministisch: Aus einer Konfiguration können
 * mehrere Regeln passen. Die Breitensuche findet deshalb den kürzesten akzeptierenden Lauf,
 * falls es einen gibt. Schon besuchte Konfigurationen werden übersprungen; gegen endlose
 * ε-Schleifen helfen die Limits für Konfigurationen und Stackhöhe.
 *
 * Akzeptiert: ganzes Wort gelesen und Endzustand (bzw. leerer Stack, je nach Dokument).
 * Verworfen: Angezeigt wird der Lauf, der am weitesten liest (bei Gleichstand der längste).
 */
export function searchPushdown(
  document: AutomatonDocument,
  tokens: string[],
  limits: PushdownLimits = currentLimits()
): PushdownSearch {
  const { graph } = document
  const settings = stackSettings(document)
  const finals = new Set(graph.states.filter((s) => s.isFinal).map((s) => s.id))
  const isAccepting = (c: PushdownConfiguration): boolean =>
    c.position === tokens.length &&
    (settings.acceptance === 'empty' ? c.stack.length === 0 : c.state !== null && finals.has(c.state))

  const root: PushdownConfiguration = {
    state: startState(graph)?.id ?? null,
    position: 0,
    stack: settings.start === null ? [] : [settings.start],
    parent: null,
    edge: null,
    label: null
  }
  const outgoing = new Map<StateId, TransitionEdge[]>()
  for (const t of graph.transitions) outgoing.set(t.from, [...(outgoing.get(t.from) ?? []), t])

  const queue = [root]
  const visited = new Set([keyOf(root)])
  let best = root
  let abortReason: string | null = null
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]
    if (isAccepting(node)) return { path: pathTo(node), accepted: true, abortReason: null }
    // Breitensuche: spätere Knoten sind nie kürzer – bei gleicher Position gewinnt der längere Lauf
    if (node.position >= best.position) best = node
    if (node.state !== null) {
      for (const next of successors(node, outgoing.get(node.state) ?? [], tokens)) {
        // Zu hoch: eine Konfiguration, die es gäbe, bleibt ununtersucht → Abbruch
        if (next.stack.length > limits.stackHeight) {
          abortReason ??= `Abbruch bei Stackhöhe ${limits.stackHeight.toLocaleString('de-DE')}`
          continue
        }
        const key = keyOf(next)
        if (visited.has(key)) continue
        visited.add(key)
        queue.push(next)
      }
    }
    // Grenze erreicht – ein Abbruch nur, wenn noch Konfigurationen auf ihre Untersuchung warten
    if (i + 1 >= limits.configurations && i + 1 < queue.length) {
      abortReason = `Abbruch nach ${limits.configurations.toLocaleString('de-DE')} Konfigurationen`
      break
    }
  }
  return { path: pathTo(best), accepted: false, abortReason }
}

/**
 * Simulation des Kellerautomaten – für DKA und NKA.
 *
 * Der Lauf wird vorab gesucht (`searchPushdown`), jeder Schritt wendet genau eine Regel an –
 * auch ε-Schritte, die nur den Stack ändern. Angezeigt wird ein Zustand pro Schritt, der
 * benutzte Übergang und der Stackinhalt.
 */
export class PushdownSimulator implements Simulator {
  private readonly tokens: string[]
  private readonly search: PushdownSearch
  private position = 0

  constructor(
    document: AutomatonDocument,
    readonly word: string
  ) {
    this.tokens = tokenizeWord(word, document.alphabet)
    this.search = searchPushdown(document, this.tokens)
  }

  get isFinished(): boolean {
    return this.position >= this.search.path.length - 1
  }

  get accepted(): boolean | null {
    return this.isFinished ? this.search.accepted : null
  }

  get abortReason(): string | null {
    return this.isFinished && !this.search.accepted ? this.search.abortReason : null
  }

  reset(): SimulationStep {
    this.position = 0
    return this.snapshot()
  }

  step(): SimulationStep {
    if (!this.isFinished) this.position += 1
    return this.snapshot()
  }

  run(maxSteps = Infinity): SimulationResult {
    const steps: SimulationStep[] = []
    while (!this.isFinished && steps.length < maxSteps) steps.push(this.step())
    return { accepted: this.accepted ?? false, steps }
  }

  private snapshot(): SimulationStep {
    const c = this.search.path[this.position]
    return {
      index: this.position,
      activeStateIds: c.state === null ? [] : [c.state],
      usedTransitionIds: c.edge ? [c.edge.id] : [],
      consumed: this.tokens.slice(0, c.position).join(''),
      remaining: this.tokens.slice(c.position).join(''),
      symbol: c.label ? c.label.read : null,
      inputPosition: c.position,
      stack: c.stack,
      ...(c.label ? { label: c.label } : {})
    }
  }
}
