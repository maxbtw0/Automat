import { useEffect, useRef, useState } from 'react'
import type { IssueSeverity, ValidationIssue } from '@/core/automaton/types'
import { focusIssue, useValidation } from '@/hooks/useValidation'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import { classNames } from '@/utils/dom'

const SEVERITY_ORDER: IssueSeverity[] = ['error', 'warning', 'info']

export function StatusBar() {
  const status = useEditorStore((s) => s.status)
  const stateCount = useEditorStore((s) => s.document.graph.states.length)
  const transitionCount = useEditorStore((s) => s.document.graph.transitions.length)
  const zoom = useEditorStore((s) => s.viewport.zoom)
  const dirty = useEditorStore((s) => s.dirty)
  const hasCanvas = useScreenStore((s) => s.screen === 'graph' || s.screen === 'simulation')

  // Nur Fehler anzeigen – keine Tipps oder Erfolgsmeldungen.
  const error = status?.kind === 'error' ? status.text : undefined

  return (
    <div className="status-bar">
      <ProblemIndicator />
      <span className="status-bar-message is-error" title={error}>
        {error}
      </span>
      <span className="status-bar-item">Zustände: {stateCount}</span>
      <span className="status-bar-item">Übergänge: {transitionCount}</span>
      {hasCanvas && <span className="status-bar-item">Zoom: {Math.round(zoom * 100)} %</span>}
      <span className="status-bar-item">{dirty ? 'Ungespeichert' : 'Gespeichert'}</span>
    </div>
  )
}

/** Links in der Statusleiste: ob es Probleme gibt; Klick öffnet die Liste. */
function ProblemIndicator() {
  const result = useValidation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const issues = result.kind === 'ok' ? result.issues : []

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Liste schließen, sobald alle Probleme behoben sind
  useEffect(() => {
    if (issues.length === 0) setOpen(false)
  }, [issues.length])

  if (result.kind !== 'ok') {
    return (
      <span
        className={classNames('problem-indicator', result.kind === 'error' && 'is-error')}
        title={result.message}
      >
        {result.message}
      </span>
    )
  }

  if (issues.length === 0) {
    return (
      <span className="problem-indicator is-success">
        <span className="issue-dot is-success" />
        Keine Probleme
      </span>
    )
  }

  const worst = SEVERITY_ORDER.find((s) => issues.some((issue) => issue.severity === s)) ?? 'info'
  const label = issues.length === 1 ? issues[0].message : `${issues.length} Probleme`

  const choose = (issue: ValidationIssue): void => {
    setOpen(false)
    // Auswahl sieht man nur im Grapheneditor
    if (focusIssue(issue)) useScreenStore.getState().setScreen('graph')
  }

  return (
    <div ref={ref} className="problem-indicator-wrap">
      <button
        className={classNames('problem-indicator', `is-${worst}`, open && 'is-open')}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={classNames('issue-dot', `is-${worst}`)} />
        <span className="problem-indicator-label">{label}</span>
      </button>
      {open && (
        <ul className="problem-list issue-list">
          {issues.map((issue, i) => (
            <li key={i}>
              <button className="issue" onClick={() => choose(issue)}>
                <span className={classNames('issue-dot', `is-${issue.severity}`)} />
                {issue.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
