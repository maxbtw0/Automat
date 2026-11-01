import type { AutomatonDocument, AutomatonType } from '@/model/graph'
import { DFA } from './dfa'
import { NFA } from './nfa'
import { PushdownAutomaton } from './pda'
import { TuringMachine } from './tm'
import { Transducer } from './transducer'
import type { Automaton, AutomatonDefinition } from './types'

/**
 * Alle verfügbaren Automatentypen.
 * Neuer Typ: in `AUTOMATON_TYPES` (model/graph.ts) ergänzen – TypeScript
 * verlangt dann hier automatisch einen Eintrag.
 */
const definitions: Record<AutomatonType, AutomatonDefinition> = {
  DFA: {
    type: 'DFA',
    name: 'DEA',
    description: 'Deterministischer endlicher Automat (Akzeptor)',
    create: (document) => new DFA(document),
    epsilon: false,
    regex: true,
    singlePath: true
  },
  NFA: {
    type: 'NFA',
    name: 'NEA',
    description: 'Nichtdeterministischer endlicher Automat (mit ε-Übergängen)',
    create: (document) => new NFA(document),
    epsilon: true,
    regex: true,
    singlePath: false
  },
  DPDA: {
    type: 'DPDA',
    name: 'DKA',
    description: 'Deterministischer Kellerautomat',
    create: (document) => new PushdownAutomaton(document, true),
    epsilon: true,
    regex: false,
    singlePath: true
  },
  NPDA: {
    type: 'NPDA',
    name: 'NKA',
    description: 'Nichtdeterministischer Kellerautomat',
    create: (document) => new PushdownAutomaton(document, false),
    epsilon: true,
    regex: false,
    singlePath: true
  },
  TM: {
    type: 'TM',
    name: 'TM',
    description: 'Deterministische Turingmaschine',
    create: (document) => new TuringMachine(document),
    epsilon: false,
    regex: false,
    singlePath: true
  },
  MEALY: {
    type: 'MEALY',
    name: 'Mealy',
    description: 'Mealy-Automat (Ausgabe am Übergang)',
    create: (document) => new Transducer(document),
    epsilon: false,
    regex: false,
    singlePath: true
  },
  MOORE: {
    type: 'MOORE',
    name: 'Moore',
    description: 'Moore-Automat (Ausgabe am Zustand)',
    create: (document) => new Transducer(document),
    epsilon: false,
    regex: false,
    singlePath: true
  }
}

export const automatonDefinitions: AutomatonDefinition[] = Object.values(definitions)

export function getAutomatonDefinition(type: AutomatonType): AutomatonDefinition {
  return definitions[type]
}

export function createAutomaton(document: AutomatonDocument): Automaton {
  return definitions[document.type].create(document)
}
