import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { describeError } from '@/core/automaton/errors'
import type { ExportTheme } from '@/export/svg'
import {
  CONTENT_LABEL,
  EXPORT_AREAS,
  FORMATS,
  areaContents,
  defaultExportArea,
  planExport,
  runExport,
  type ExportArea,
  type ExportContent,
  type ExportFormat,
  type ExportPlan
} from '@/services/exportActions'
import { useDialogStore } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import { classNames } from '@/utils/dom'

const FORMAT_LABEL: Record<ExportFormat, string> = {
  csv: 'CSV',
  png: 'PNG',
  jpg: 'JPG',
  pdf: 'PDF'
}

const THEMES: { theme: ExportTheme; label: string }[] = [
  { theme: 'light', label: 'Hell' },
  { theme: 'dark', label: 'Dunkel' }
]

/** Auswahl wie ein Schalter mit mehreren Stellungen */
function Segmented<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  disabled?: boolean
  onChange(value: T): void
}) {
  return (
    <div className="export-field">
      <span className="section-label">{label}</span>
      <div
        className={classNames('segmented', disabled && 'is-disabled')}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={o.value === value}
            disabled={disabled}
            className={classNames('segmented-option', o.value === value && 'is-active')}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Export-Fenster: oben Reiter für alles, was sich exportieren lässt (geöffnet wird der Reiter
 * des aktuellen Screens), darunter Inhalt (Simulation), Format, Farben und Vorschau. Nach dem
 * Export bleibt das Fenster offen, damit man gleich noch etwas anderes exportieren kann.
 */
export function ExportDialog() {
  const open = useDialogStore((s) => s.exportOpen)
  const theme = useDialogStore((s) => s.exportTheme)
  const description = useDialogStore((s) => s.exportDescription)
  const screen = useScreenStore((s) => s.screen)
  const simulationWord = useScreenStore((s) => s.simulationWord)
  const document = useEditorStore((s) => s.document)

  const [area, setArea] = useState<ExportArea>('graph')
  const [content, setContent] = useState<ExportContent | null>(null)
  const [format, setFormat] = useState<ExportFormat | null>(null)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const contents = areaContents(area)

  /** Reiter wechseln: erster Inhalt, Format möglichst beibehalten */
  const chooseArea = (next: ExportArea, keepFormat: ExportFormat | null = format): void => {
    const first = areaContents(next)[0]
    setArea(next)
    setContent(first)
    setFormat(keepFormat && FORMATS[first].includes(keepFormat) ? keepFormat : FORMATS[first][0])
    setError(null)
    setDone(false)
  }

  // Beim Öffnen mit dem Reiter des aktuellen Screens beginnen
  useEffect(() => {
    if (!open) return
    chooseArea(defaultExportArea(screen), null)
    setBusy(false)
  }, [open]) // nur beim Öffnen – danach wählt man selbst

  const close = (): void => useDialogStore.getState().setExportOpen(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy])

  /** Genau das, was exportiert würde – oder warum es nicht geht */
  type PlanResult = { ok: true; value: ExportPlan } | { ok: false; error: string } | null
  const plan = useMemo((): PlanResult => {
    if (!open || !content || !format) return null
    try {
      return { ok: true, value: planExport(content, format, theme, { description }) }
    } catch (err) {
      return { ok: false, error: describeError(err) }
    }
  }, [open, content, format, theme, description, document, simulationWord])

  const pages = plan?.ok ? plan.value.pages : []
  useEffect(() => setPage(0), [content, format, description])
  const shown = pages[Math.min(page, pages.length - 1)]

  if (!open || !content || !format) return null

  const chooseContent = (next: ExportContent): void => {
    setContent(next)
    setDone(false)
    if (!FORMATS[next].includes(format)) setFormat(FORMATS[next][0])
  }

  const start = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      // Den Plan der Vorschau weiterverwenden – nicht alles ein zweites Mal berechnen
      const ready = plan?.ok ? plan.value : undefined
      const result = await runExport(content, format, theme, { description }, ready)
      // Fenster bleibt offen – kurze Bestätigung auf dem Knopf
      if (result !== null) {
        setDone(true)
        window.setTimeout(() => setDone(false), 1500)
      }
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
      >
        <h2 id="export-title" className="dialog-title">
          Exportieren
        </h2>

        <div className="export-tabs" role="tablist" aria-label="Was exportieren">
          {EXPORT_AREAS.map((a) => (
            <button
              key={a.area}
              role="tab"
              aria-selected={a.area === area}
              className={classNames('export-tab', a.area === area && 'is-active')}
              onClick={() => chooseArea(a.area)}
            >
              {a.label}
            </button>
          ))}
        </div>

        {contents.length > 1 && (
          <Segmented<ExportContent>
            label="Inhalt"
            options={contents.map((c) => ({ value: c, label: CONTENT_LABEL[c] }))}
            value={content}
            onChange={chooseContent}
          />
        )}
        <div className="export-row">
          <Segmented<ExportFormat>
            label="Format"
            options={FORMATS[content].map((f) => ({ value: f, label: FORMAT_LABEL[f] }))}
            value={format}
            onChange={setFormat}
          />
          <Segmented<ExportTheme>
            label="Farben"
            options={THEMES.map((t) => ({ value: t.theme, label: t.label }))}
            value={theme}
            disabled={format === 'csv'}
            onChange={useDialogStore.getState().setExportTheme}
          />
        </div>
        {content === 'simulationGraph' && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={description}
              onChange={(e) => useDialogStore.getState().setExportDescription(e.target.checked)}
            />
            Beschreibung
          </label>
        )}

        <div className="export-field">
          <span className="section-label">Vorschau</span>
          <div className="export-preview">
            {shown ? (
              <img
                alt="Vorschau"
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(shown.svg)}`}
              />
            ) : (
              plan && !plan.ok && <p className="export-error">{plan.error}</p>
            )}
          </div>
          {pages.length > 1 && (
            <div className="export-pager">
              <button
                className="btn is-ghost is-icon"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                aria-label="Vorherige Seite"
              >
                <Icon name="stepBack" />
              </button>
              <span>
                {page + 1} / {pages.length}
              </span>
              <button
                className="btn is-ghost is-icon"
                disabled={page >= pages.length - 1}
                onClick={() => setPage(page + 1)}
                aria-label="Nächste Seite"
              >
                <Icon name="step" />
              </button>
            </div>
          )}
        </div>

        {error && <p className="export-error">{error}</p>}

        <div className="dialog-buttons">
          <button
            className="btn is-primary"
            autoFocus
            disabled={busy || !plan?.ok}
            onClick={() => void start()}
          >
            {busy ? 'Exportiere …' : done ? 'Exportiert' : 'Exportieren'}
          </button>
          <button className="btn" disabled={busy} onClick={close}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}
