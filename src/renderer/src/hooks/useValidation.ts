import { useMemo } from 'react'
import { describeError, isNotImplemented } from '@/core/automaton/errors'
import { createAutomaton } from '@/core/automaton/registry'
import type { ValidationIssue } from '@/core/automaton/types'
import { useEditorStore } from '@/store/editorStore'

export type ValidationState =
  | { kind: 'ok'; issues: ValidationIssue[] }
  | { kind: 'notImplemented' | 'error'; message: string }

/** Prüft das aktuelle Dokument – neu bei jeder Änderung. */
export function useValidation(): ValidationState {
  const doc = useEditorStore((s) => s.document)
  return useMemo<ValidationState>(() => {
    try {
      return { kind: 'ok', issues: createAutomaton(doc).validate() }
    } catch (err) {
      return { kind: isNotImplemented(err) ? 'notImplemented' : 'error', message: describeError(err) }
    }
  }, [doc])
}

/** Wählt den ersten betroffenen Zustand bzw. Übergang aus. Gibt zurück, ob es einen gab. */
export function focusIssue(issue: ValidationIssue): boolean {
  const { select } = useEditorStore.getState()
  const stateId = issue.stateIds?.[0]
  const transitionId = issue.transitionIds?.[0]
  if (stateId) select({ kind: 'state', id: stateId })
  else if (transitionId) select({ kind: 'transition', id: transitionId })
  else return false
  return true
}
