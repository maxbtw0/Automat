import { layoutByDepth } from '@/core/algorithms/layout'
import { STATE_RADIUS } from '@/utils/geometry'
import { childNamed, childrenNamed, parseXml, type XmlElement } from '@/utils/xml'
import {
  createEmptyDocument,
  createId,
  EPSILON,
  normalizeSymbol,
  type AutomatonDocument,
  type AutomatonType,
  type StateNode,
  type TransitionEdge
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
 */

const TYPES: Record<string, AutomatonType> = { DEA: 'DFA', NEA: 'NFA' }

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

/** Position aus dem Layout: AutoEdit speichert die linke obere Ecke, Automat den Mittelpunkt. */
function positions(root: XmlElement): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  const layout = childNamed(root, 'LAYOUT')
  for (const state of layout ? childrenNamed(layout, 'STATELAYOUT') : []) {
    const left = Number(valueOf(state, 'LEFT'))
    const top = Number(valueOf(state, 'TOP'))
    if (Number.isFinite(left) && Number.isFinite(top)) {
      result.set(attribute(state, 'name'), { x: left + STATE_RADIUS, y: top + STATE_RADIUS })
    }
  }
  return result
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

  const alphabetElement = childNamed(root, 'ALPHABET')
  const alphabet = [
    ...new Set(
      (alphabetElement ? childrenNamed(alphabetElement, 'ITEM') : [])
        .map((item) => normalizeSymbol(attribute(item, 'value')))
        .filter((s) => s !== '' && s !== EPSILON)
    )
  ]

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
      for (const label of childrenNamed(transition, 'LABEL')) {
        const read = normalizeSymbol(attribute(label, 'read'))
        if (!edge.labels.some((l) => l.read === read)) edge.labels.push({ read })
      }
      if (edge.labels.length > 0) transitions.set(key, edge)
    }
  })

  const graph = { states, transitions: [...transitions.values()] }
  return {
    ...createEmptyDocument(type, alphabet),
    // Ohne vollständiges Layout ordnet Automat selbst an
    graph: names.every((n) => layout.has(n)) ? graph : layoutByDepth(graph)
  }
}
