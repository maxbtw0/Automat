import { layoutByDepth } from '@/core/algorithms/layout'
import { tokenizeWord } from '@/core/automaton/word'
import { STATE_RADIUS } from '@/utils/geometry'
import { childNamed, childrenNamed, parseXml, type XmlElement } from '@/utils/xml'
import {
  createEmptyDocument,
  createId,
  createTapeSettings,
  EPSILON,
  normalizeSymbol,
  type AutomatonDocument,
  type AutomatonType,
  type StackSettings,
  type StateNode,
  type TapeMove,
  type TapeSettings,
  type TransitionEdge,
  type TransitionLabel
} from './graph'

/**
 * Import aus AutoEdit (AtoCC): XML-Format FADL.
 *
 * ```xml
 * <AUTOMATON>
 *   <TYPE value="NEA"/>
 *   <ALPHABET><ITEM value="a"/></ALPHABET>
 *   <STATE name="q_0" finalstate="false">
 *     <TRANSITION target="q_1"><LABEL read="a"/><LABEL read="EPSILON"/></TRANSITION>
 *   </STATE>
 *   <INITIALSTATE value="q_0"/>
 *   <LAYOUT><STATELAYOUT name="q_0"><LEFT value="175"/><TOP value="155"/></STATELAYOUT></LAYOUT>
 * </AUTOMATON>
 * ```
 *
 * Kellerautomat (DKA/NKA): `STACKALPHABET`, `STACKINITIALCHAR`, Regeln
 * `<LABEL read="a" topofstack="$" write="A$"/>` (Push als ein Wort, links = oben).
 * Turingmaschine (TM): `TAPEALPHABET`, `TAPEINITIALCHAR` = Blank, Regeln
 * `<LABEL read="a" write="X" direction="RIGHT"/>` (LEFT, RIGHT, NONE).
 */

const TYPES: Record<string, AutomatonType> = {
  DEA: 'DFA',
  NEA: 'NFA',
  DKA: 'DPDA',
  NKA: 'NPDA',
  TM: 'TM'
}

const MOVES: Record<string, TapeMove> = { LEFT: 'L', RIGHT: 'R', NONE: 'N' }

/** Sieht der Text nach XML aus (statt nach einer Automat-Datei)? */
export function looksLikeXml(text: string): boolean {
  return text.replace(/^﻿/, '').trimStart().startsWith('<')
}

function attribute(element: XmlElement, name: string): string {
  const value = element.attributes[name]
  if (value === undefined) throw new Error(`<${element.name}> ohne Attribut „${name}“`)
  return value
}

function valueOf(parent: XmlElement, name: string): string | undefined {
  const child = childNamed(parent, name)
  return child && attribute(child, 'value')
}

/**
 * AutoEdit schreibt Indizes als „q_0“ bzw. „q_{10}“. Ohne Tiefstellung wird daraus „q0“ –
 * nur wenn die Namen dabei verschieden bleiben.
 */
function plainNames(names: string[]): string[] {
  const plain = names.map((n) => n.replace(/_\{([^}]*)\}|_/g, '$1') || n)
  return new Set(plain).size === names.length ? plain : names
}

/**
 * Position aus dem Layout: AutoEdit speichert die linke obere Ecke (Radius über `RADIUS`),
 * Automat den Mittelpunkt.
 */
function positions(root: XmlElement): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  const layout = childNamed(root, 'LAYOUT')
  for (const state of layout ? childrenNamed(layout, 'STATELAYOUT') : []) {
    const left = Number(valueOf(state, 'LEFT'))
    const top = Number(valueOf(state, 'TOP'))
    const radius = Number(valueOf(state, 'RADIUS') ?? STATE_RADIUS)
    const r = Number.isFinite(radius) && radius > 0 ? radius : STATE_RADIUS
    if (Number.isFinite(left) && Number.isFinite(top)) {
      result.set(attribute(state, 'name'), { x: left + r, y: top + r })
    }
  }
  return spreadOut(result)
}

/** So weit stehen zwei Zustände mindestens auseinander – sonst überlappen die Beschriftungen. */
const MIN_DISTANCE = 150

/**
 * AutoEdit zeichnet kleiner und setzt Zustände oft dichter. Das ganze Layout wird dann
 * gleichmäßig gestreckt (um die linke obere Ecke), die Anordnung bleibt erhalten.
 */
function spreadOut(
  points: Map<string, { x: number; y: number }>
): Map<string, { x: number; y: number }> {
  const list = [...points.values()]
  // Zustände auf derselben Stelle zählen hier nicht – die trennt `separateCoincident`
  let closest = Infinity
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y)
      if (d > 0) closest = Math.min(closest, d)
    }
  }
  if (!(closest < MIN_DISTANCE)) return separateCoincident(points)
  const factor = MIN_DISTANCE / closest
  const left = Math.min(...list.map((p) => p.x))
  const top = Math.min(...list.map((p) => p.y))
  return separateCoincident(
    new Map(
      [...points].map(([name, p]) => [
        name,
        { x: left + (p.x - left) * factor, y: top + (p.y - top) * factor }
      ])
    )
  )
}

/**
 * Liegen Zustände genau übereinander, rückt jeder weitere so weit nach rechts, bis er
 * mindestens `MIN_DISTANCE` von allen schon gesetzten entfernt ist.
 */
function separateCoincident(
  points: Map<string, { x: number; y: number }>
): Map<string, { x: number; y: number }> {
  const placed: { x: number; y: number }[] = []
  const result = new Map<string, { x: number; y: number }>()
  const near = (p: { x: number; y: number }, limit: number): boolean =>
    placed.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < limit)
  for (const [name, original] of points) {
    let p = original
    if (near(p, 1)) {
      while (near(p, MIN_DISTANCE)) p = { x: p.x + MIN_DISTANCE, y: p.y }
    }
    placed.push(p)
    result.set(name, p)
  }
  return result
}

/** Symbole aus `<ALPHABET>`, `<STACKALPHABET>` usw. – ohne Doppelte und ohne ε */
function items(root: XmlElement, name: string): string[] {
  const element = childNamed(root, name)
  return [
    ...new Set(
      (element ? childrenNamed(element, 'ITEM') : [])
        .map((item) => normalizeSymbol(attribute(item, 'value')))
        .filter((s) => s !== '' && s !== EPSILON)
    )
  ]
}

/** Γ und Startsymbol; Akzeptanz kennt AutoEdit nur über Endzustände. */
function readStack(root: XmlElement): StackSettings {
  const alphabet = items(root, 'STACKALPHABET')
  const start = valueOf(root, 'STACKINITIALCHAR') ?? alphabet[0] ?? null
  if (start !== null && !alphabet.includes(start)) alphabet.unshift(start)
  return { alphabet, start, acceptance: 'final' }
}

/** Γ mit Σ ⊆ Γ und dem Blank am Ende – wie es der Store hält. */
function readTape(root: XmlElement, alphabet: string[]): TapeSettings {
  const tape = items(root, 'TAPEALPHABET')
  const blank = valueOf(root, 'TAPEINITIALCHAR')
  if (blank === undefined || blank === '') return createTapeSettings(alphabet)
  const symbols = [...new Set([...tape, ...alphabet])].filter((s) => s !== blank)
  return { alphabet: [...symbols, blank], blank }
}

function readLabel(
  label: XmlElement,
  type: AutomatonType,
  stack: StackSettings | undefined
): TransitionLabel {
  const read = normalizeSymbol(attribute(label, 'read'))
  if (stack) {
    const write = normalizeSymbol(attribute(label, 'write'))
    return {
      read,
      pop: normalizeSymbol(attribute(label, 'topofstack')),
      push: write === EPSILON ? [] : tokenizeWord(write, stack.alphabet)
    }
  }
  if (type === 'TM') {
    const direction = attribute(label, 'direction')
    const move = MOVES[direction.toUpperCase()]
    if (!move) throw new Error(`Richtung „${direction}“ unbekannt`)
    return { read, write: normalizeSymbol(attribute(label, 'write')), move }
  }
  return { read }
}

/** Liest eine AutoEdit-Datei. Wirft mit deutscher Meldung, wenn sie nicht passt. */
export function importAutoEdit(text: string): AutomatonDocument {
  let root: XmlElement
  try {
    root = parseXml(text)
  } catch (err) {
    throw new Error(`Die Datei enthält kein gültiges XML (${(err as Error).message}).`)
  }
  if (root.name !== 'AUTOMATON') throw new Error('Das ist keine AutoEdit-Datei.')

  const typeName = valueOf(root, 'TYPE')
  const type = typeName === undefined ? undefined : TYPES[typeName.toUpperCase()]
  if (!type) throw new Error(`AutoEdit-Typ „${typeName ?? ''}“ wird nicht unterstützt.`)

  const alphabet = items(root, 'ALPHABET')
  const document = createEmptyDocument(type, alphabet)
  const stack = document.stack && readStack(root)
  const tape = document.tape && readTape(root, alphabet)

  const stateElements = childrenNamed(root, 'STATE')
  const names = stateElements.map((s) => attribute(s, 'name'))
  const duplicate = names.find((n, i) => names.indexOf(n) !== i)
  if (duplicate !== undefined) throw new Error(`Zustand „${duplicate}“ doppelt`)
  const initial = valueOf(root, 'INITIALSTATE')
  if (initial !== undefined && !names.includes(initial)) {
    throw new Error(`Startzustand „${initial}“ fehlt`)
  }

  const layout = positions(root)
  const labels = plainNames(names)
  const ids = new Map(names.map((n) => [n, createId('s')]))
  const states: StateNode[] = stateElements.map((element, i) => ({
    id: ids.get(names[i]) as string,
    label: labels[i],
    ...(layout.get(names[i]) ?? { x: 0, y: 0 }),
    isStart: names[i] === initial,
    isFinal: element.attributes.finalstate === 'true'
  }))

  // Ein Übergang pro Zustandspaar – AutoEdit kann dasselbe Ziel mehrfach nennen
  const transitions = new Map<string, TransitionEdge>()
  stateElements.forEach((element, i) => {
    for (const transition of childrenNamed(element, 'TRANSITION')) {
      const target = attribute(transition, 'target')
      const to = ids.get(target)
      if (!to) throw new Error(`Übergang zu unbekanntem Zustand „${target}“`)
      const from = ids.get(names[i]) as string
      const key = `${from} ${to}`
      const edge = transitions.get(key) ?? { id: createId('t'), from, to, labels: [] }
      for (const rule of childrenNamed(transition, 'LABEL')) {
        const label = readLabel(rule, type, stack)
        const text = JSON.stringify(label)
        if (!edge.labels.some((l) => JSON.stringify(l) === text)) edge.labels.push(label)
      }
      if (edge.labels.length > 0) transitions.set(key, edge)
    }
  })

  const graph = { states, transitions: [...transitions.values()] }
  return {
    ...document,
    ...(stack && { stack }),
    ...(tape && { tape }),
    // Ohne vollständiges Layout ordnet Automat selbst an
    graph: names.every((n) => layout.has(n)) ? graph : layoutByDepth(graph)
  }
}
