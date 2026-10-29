import {
  EPSILON,
  edgeSymbols,
  type AutomatonDocument,
  type EditorGraph,
  type StateId,
  type StateNode
} from '@/model/graph'
import type { ValidationIssue } from './types'

/**
 * Prüfungen, die mehrere Automatentypen gemeinsam haben.
 * Jede Funktion liefert eine (evtl. leere) Liste von Meldungen.
 */

export function startState(graph: EditorGraph): StateNode | undefined {
  return graph.states.find((s) => s.isStart)
}

/**
 * Grundgerüst des Graphen, für alle Automatentypen: jeder Übergang verbindet vorhandene
 * Zustände (`checkReferences`) und es gibt genau einen Startzustand.
 */
export function checkStart(graph: EditorGraph): ValidationIssue[] {
  const issues = checkReferences(graph)
  const starts = graph.states.filter((s) => s.isStart)
  if (graph.states.length > 0 && starts.length === 0) {
    issues.push({ severity: 'error', message: 'Kein Startzustand' })
  }
  if (starts.length > 1) {
    const stateIds = starts.map((s) => s.id)
    issues.push({ severity: 'error', message: 'Mehrere Startzustände', stateIds })
  }
  return issues
}

/**
 * Übergänge von oder zu Zuständen, die es nicht gibt (z. B. aus einer von Hand geänderten
 * Datei). δ wäre dort nicht definiert – das ist ein Fehler, kein Hinweis.
 */
export function checkReferences(graph: EditorGraph): ValidationIssue[] {
  const ids = new Set(graph.states.map((s) => s.id))
  const issues: ValidationIssue[] = []
  for (const t of graph.transitions) {
    const message = !ids.has(t.from)
      ? `Übergang von fehlendem Zustand „${t.from}“`
      : !ids.has(t.to)
        ? `Übergang zu fehlendem Zustand „${t.to}“`
        : null
    if (message) issues.push({ severity: 'error', message, transitionIds: [t.id] })
  }
  return issues
}

/** Symbole der Übergänge liegen in Σ (ε nur, wenn erlaubt); Übergänge ohne Symbol. */
export function checkSymbols(
  document: AutomatonDocument,
  { allowEpsilon }: { allowEpsilon: boolean }
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const t of document.graph.transitions) {
    if (t.labels.length === 0) {
      issues.push({ severity: 'warning', message: 'Übergang ohne Symbol', transitionIds: [t.id] })
    }
    for (const symbol of edgeSymbols(t)) {
      if (symbol === EPSILON) {
        if (!allowEpsilon) {
          issues.push({
            severity: 'error',
            message: 'ε-Übergang ist nur beim NEA erlaubt',
            transitionIds: [t.id]
          })
        }
      } else if (!document.alphabet.includes(symbol)) {
        issues.push({
          severity: 'error',
          message: `„${symbol}“ nicht im Alphabet`,
          transitionIds: [t.id]
        })
      }
    }
  }
  return issues
}

export function checkFinal(graph: EditorGraph): ValidationIssue[] {
  if (graph.states.length === 0 || graph.states.some((s) => s.isFinal)) return []
  return [{ severity: 'info', message: 'Kein Endzustand' }]
}

/** Zustände, die vom Start aus nicht erreichbar sind. */
export function checkReachability(graph: EditorGraph): ValidationIssue[] {
  const start = startState(graph)
  if (!start) return []
  const reachable = reachableStates(graph, start.id)
  const unreachable = graph.states.filter((s) => !reachable.has(s.id))
  if (unreachable.length === 0) return []
  return [
    {
      severity: 'info',
      message: `Nicht erreichbar: ${unreachable.map((s) => s.label).join(', ')}`,
      stateIds: unreachable.map((s) => s.id)
    }
  ]
}

/** Alle Zustände, die vom Start aus über irgendeinen Übergang (auch ε) erreichbar sind. */
export function reachableStates(graph: EditorGraph, start: StateId): Set<StateId> {
  const result = new Set([start])
  const todo = [start]
  while (todo.length > 0) {
    const current = todo.pop() as StateId
    for (const t of graph.transitions) {
      if (t.from === current && t.labels.length > 0 && !result.has(t.to)) {
        result.add(t.to)
        todo.push(t.to)
      }
    }
  }
  return result
}
