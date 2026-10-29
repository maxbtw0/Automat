import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon, type IconName } from '@/components/common/Icon'
import { automatonDefinitions, getAutomatonDefinition } from '@/core/automaton/registry'
import type { AutomatonType } from '@/model/graph'
import { openExportDialog } from '@/services/exportActions'
import { newFile, openFile, saveFile } from '@/services/fileActions'
import { changeAutomatonType } from '@/services/typeActions'
import { useShortcutTitle } from '@/hooks/useShortcutTitle'
import { useEditorStore } from '@/store/editorStore'
import {
  openAlphabetEditor,
  openGraphEditor,
  openRegularExpressionsEditor,
  openSimulationEditor,
  openTransitionTableEditor
} from '@/services/screenActions'
import { classNames } from '@/utils/dom'

/**
 * Stufen, wenn der Platz knapp wird: erst Datei-Knöpfe nur als Symbol, dann kurze Namen für die
 * Screens, zuletzt alle nur als Symbol (Name im Tooltip). Innerhalb jeder Stufe wird die Leiste
 * bis auf `minScale` verkleinert, bevor die nächste greift – lange Namen nur wenig.
 */
const STAGES = [
  { className: '', minScale: 0.9 },
  { className: 'is-compact-file', minScale: 0.9 },
  { className: 'is-compact-file is-short', minScale: 0.8 },
  { className: 'is-compact', minScale: 0.8 }
]

interface ToolbarFit {
  stage: number
  scale: number
}

/**
 * Sucht die erste Stufe, in der die Leiste – notfalls verkleinert – in eine Zeile passt. So
 * bleibt sie beim Schmalerziehen gefüllt, statt plötzlich viel Platz frei zu lassen. Reicht auch
 * die letzte Stufe nicht, bricht die Leiste in normaler Größe in eine zweite Zeile um.
 * `content` ändert sich, wenn sich der Inhalt der Leiste ändert → neu messen.
 */
function useToolbarFit(content: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<ToolbarFit>({ stage: 0, scale: 1 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      // Ohne Umbruch messen, dann den alten Zustand wiederherstellen (den setzt React)
      const previousClass = el.className
      const previousScale = el.style.getPropertyValue('--toolbar-scale')
      const available = el.clientWidth
      const fits = (stage: number, scale: number): boolean => {
        el.className = classNames('toolbar', 'is-measuring', STAGES[stage].className)
        el.style.setProperty('--toolbar-scale', String(scale))
        return el.scrollWidth <= available
      }
      const search = (): ToolbarFit => {
        for (let stage = 0; stage < STAGES.length; stage++) {
          if (fits(stage, 1)) return { stage, scale: 1 }
          // Nur die Gruppen skalieren, Abstände und Rand der Leiste bleiben
          const groups = [...el.querySelectorAll<HTMLElement>('.toolbar-group')]
          const scaled = groups.reduce((sum, g) => sum + g.getBoundingClientRect().width, 0)
          const fixed = el.scrollWidth - scaled
          let scale = Math.floor(((available - fixed) / scaled) * 100) / 100
          const { minScale } = STAGES[stage]
          while (scale >= minScale && !fits(stage, scale)) scale -= 0.01
          if (scale >= minScale) return { stage, scale }
        }
        return { stage: STAGES.length - 1, scale: 1 }
      }
      const next = search()
      el.className = previousClass
      el.style.setProperty('--toolbar-scale', previousScale)
      setFit((fit) => (fit.stage === next.stage && fit.scale === next.scale ? fit : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [content])

  return {
    ref,
    className: classNames('toolbar', STAGES[fit.stage].className),
    style: { '--toolbar-scale': fit.scale } as CSSProperties
  }
}

interface ToolbarButtonProps {
  icon: IconName
  label: string
  /** Kurzer Name für die Stufe `is-short` */
  short?: string
  /** Datei-Knopf: verliert seinen Namen schon in der ersten Stufe */
  file?: boolean
  title: string
  onClick(): void
}

function ToolbarButton({ icon, label, short, file = false, title, onClick }: ToolbarButtonProps) {
  return (
    <button className="btn is-ghost" onClick={onClick} title={title}>
      <Icon name={icon} />
      <span className={classNames('btn-label', file && 'is-file', short && 'is-long')}>{label}</span>
      {short && <span className="btn-label is-short">{short}</span>}
    </button>
  )
}

export function Toolbar() {
  const type = useEditorStore((s) => s.document.type)
  const canUndo = useEditorStore((s) => s.past.length > 0)
  const canRedo = useEditorStore((s) => s.future.length > 0)
  const zoom = useEditorStore((s) => s.viewport.zoom)
  const { undo, redo, resetViewport } = useEditorStore.getState()
  const title = {
    new: useShortcutTitle('Neu', 'file.new'),
    open: useShortcutTitle('Öffnen', 'file.open'),
    save: useShortcutTitle('Speichern', 'file.save'),
    export: useShortcutTitle('Exportieren', 'file.export'),
    undo: useShortcutTitle('Rückgängig', 'edit.undo'),
    redo: useShortcutTitle('Wiederholen', 'edit.redo'),
    alphabet: useShortcutTitle('Alphabeteditor', 'view.alphabet'),
    graph: useShortcutTitle('Grapheneditor', 'view.graph'),
    transitionTable: useShortcutTitle('Übergangstabelle', 'view.transitionTable'),
    regex: useShortcutTitle('Reguläre Ausdrücke', 'view.regex'),
    simulation: useShortcutTitle('Simulation', 'view.simulation'),
    resetViewport: useShortcutTitle('Ansicht zurücksetzen', 'view.resetViewport')
  }
  const hasRegex = getAutomatonDefinition(type).regex
  const { ref, className, style } = useToolbarFit(`${hasRegex}:${Math.round(zoom * 100)}`)

  return (
    <div ref={ref} className={className} style={style}>
      <div className="toolbar-group">
        <ToolbarButton icon="new" label="Neu" file title={title.new} onClick={() => void newFile()} />
        <ToolbarButton icon="open" label="Öffnen" file title={title.open} onClick={() => void openFile()} />
        <ToolbarButton icon="save" label="Speichern" file title={title.save} onClick={() => void saveFile()} />
        <ToolbarButton icon="export" label="Exportieren" file title={title.export} onClick={openExportDialog} />
      </div>

      <div className="toolbar-group">
        <button
          className="btn is-ghost is-icon"
          onClick={undo}
          disabled={!canUndo}
          title={title.undo}
        >
          <Icon name="undo" />
        </button>
        <button
          className="btn is-ghost is-icon"
          onClick={redo}
          disabled={!canRedo}
          title={title.redo}
        >
          <Icon name="redo" />
        </button>
      </div>

      <div className="toolbar-group">
        <label className="field-label" htmlFor="automaton-type">
          Typ
        </label>
        <select
          id="automaton-type"
          className="select"
          title="Automatentyp"
          value={type}
          onChange={(e) => void changeAutomatonType(e.target.value as AutomatonType)}
        >
          {automatonDefinitions.map((def) => (
            <option key={def.type} value={def.type} title={def.description}>
              {def.name}
            </option>
          ))}
        </select>
      </div>
      <div className="toolbar-group">
        <ToolbarButton
          icon="alphabeteditor"
          label="Alphabeteditor"
          short="Alphabet"
          title={title.alphabet}
          onClick={openAlphabetEditor}
        />
        <ToolbarButton
          icon="grapheditor"
          label="Grapheneditor"
          short="Graph"
          title={title.graph}
          onClick={openGraphEditor}
        />
        <ToolbarButton
          icon="transitiontableeditor"
          label="Übergangstabelle"
          short="Tabelle"
          title={title.transitionTable}
          onClick={openTransitionTableEditor}
        />
        {hasRegex && (
          <ToolbarButton
            icon="regularexpressionseditor"
            label="Reguläre Ausdrücke"
            short="Ausdrücke"
            title={title.regex}
            onClick={openRegularExpressionsEditor}
          />
        )}
        <ToolbarButton
          icon="play"
          label="Simulation"
          title={title.simulation}
          onClick={openSimulationEditor}
        />
      </div>
      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button className="btn is-ghost" onClick={resetViewport} title={title.resetViewport}>
          <Icon name="focus" /> {Math.round(zoom * 100)} %
        </button>
      </div>
    </div>
  )
}
