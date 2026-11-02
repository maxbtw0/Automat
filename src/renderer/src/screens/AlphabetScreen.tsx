import { useCallback, useRef, useState } from 'react'
import type { AlphabetPreset } from '@shared/alphabetPresets'
import { overlapProblem } from '@shared/alphabetRules'
import { CommitInput } from '@/components/common/CommitInput'
import { ContextMenu, type ContextMenuEntry } from '@/components/common/ContextMenu'
import { ToolPalette } from '@/components/toolbar/ToolPalette'
import { ALPHABET_TOOLS, type AlphabetTool } from '@/editor/alphabetTools'
import {
  labelSymbols,
  outputSettings,
  outputsOnStates,
  stackSettings,
  stateOutput,
  tapeSettings,
  usesOutput,
  usesStack,
  usesTape,
  validateSymbol,
  type AlphabetKind,
  type AutomatonDocument,
  type StackAcceptance
} from '@/model/graph'
import { askChoice } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'
import { useSettingsStore } from '@/store/settingsStore'
import { classNames } from '@/utils/dom'

/** Gleiche Symbole, Reihenfolge egal – für das Häkchen beim aktiven Preset. */
const sameSymbolSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((s) => b.includes(s))

const SYMBOL_NAMES: Record<AlphabetKind, string> = {
  input: 'Symbol',
  stack: 'Stacksymbol',
  tape: 'Bandsymbol',
  output: 'Ausgabesymbol'
}

/** Moore: Ausgaben hängen an Zuständen – gezählt werden dann Zustände statt Übergänge */
const countsStates = (document: AutomatonDocument, kind: AlphabetKind): boolean =>
  kind === 'output' && outputsOnStates(document.type)

/** Anzahl der Übergänge, deren Regeln das Symbol benutzen (Moore-Ausgabe: der Zustände) */
const usageCount = (document: AutomatonDocument, symbol: string, kind: AlphabetKind): number =>
  countsStates(document, kind)
    ? document.graph.states.filter((s) => stateOutput(s).includes(symbol)).length
    : document.graph.transitions.filter((t) =>
        t.labels.some((l) => labelSymbols(l, kind).includes(symbol))
      ).length

const TITLES: Record<AlphabetKind, string> = {
  input: 'Eingabealphabet Σ',
  stack: 'Stackalphabet Γ',
  tape: 'Bandalphabet Γ',
  output: 'Ausgabealphabet Δ'
}

/**
 * Alphabet-Screen. Endliche Automaten: nur Σ mit der Werkzeugleiste links. Kellerautomaten:
 * Σ und Γ nebeneinander, jedes mit eigener Werkzeugleiste, dazu Stack-Startsymbol und Akzeptanz.
 * Turingmaschine: Σ und Bandalphabet Γ ⊇ Σ nebeneinander, dazu das Blank. Transduktoren: Σ und
 * Ausgabealphabet Δ nebeneinander.
 */
export function AlphabetScreen() {
  const document = useEditorStore((s) => s.document)
  const hasStack = usesStack(document.type)
  const hasTape = usesTape(document.type)
  /** Zweites Alphabet neben Σ – `null` bei endlichen Akzeptoren */
  const second: AlphabetKind | null = hasStack
    ? 'stack'
    : hasTape
      ? 'tape'
      : usesOutput(document.type)
        ? 'output'
        : null
  const stack = stackSettings(document)
  const tape = tapeSettings(document)
  const { addSymbol, renameSymbol, deleteSymbol, sortAlphabet, applyAlphabetPreset } =
    useEditorStore.getState()

  const screenRef = useRef<HTMLDivElement>(null)

  const alphabetOf = (k: AlphabetKind, doc = document): string[] =>
    k === 'input'
      ? doc.alphabet
      : k === 'tape'
        ? tapeSettings(doc).alphabet
        : k === 'output'
          ? outputSettings(doc).alphabet
          : stackSettings(doc).alphabet

  /** Zuletzt angelegtes Symbol – dessen Eingabefeld bekommt sofort den Fokus. */
  const [justAdded, setJustAdded] = useState<string | null>(null)
  /** Ausgewähltes Symbol – darauf wirkt „Löschen“. */
  const [selected, setSelected] = useState<{
    kind: AlphabetKind
    symbol: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Preset-Menü: Position relativ zum Screen und Alphabet – `null` = geschlossen */
  const [presetMenu, setPresetMenu] = useState<{
    x: number
    y: number
    kind: AlphabetKind
  } | null>(null)
  const closePresetMenu = useCallback(() => setPresetMenu(null), [])

  const select = (k: AlphabetKind, symbol: string | null): void =>
    setSelected(symbol === null ? null : { kind: k, symbol })

  const handleDelete = async (kind: AlphabetKind): Promise<void> => {
    const alphabet = alphabetOf(kind)
    const index = selected?.kind === kind ? alphabet.indexOf(selected.symbol) : -1
    if (index === -1) {
      setError('Erst ein Symbol in der Tabelle auswählen.')
      return
    }
    const symbol = alphabet[index]
    if (kind === 'tape' && symbol === tape.blank) {
      setError('Blank kann nicht gelöscht werden')
      return
    }
    if (kind === 'tape' && document.alphabet.includes(symbol)) {
      setError(`„${symbol}“ ist in Σ`)
      return
    }
    const count = usageCount(document, symbol, kind)
    if (count > 0) {
      const [one, many] = countsStates(document, kind)
        ? ['einem Zustand', 'Zuständen']
        : ['einem Übergang', 'Übergängen']
      const where = count === 1 ? one : `${count} ${many}`
      const choice = await askChoice({
        title: `„${symbol}“ löschen?`,
        detail: `Wird in ${where} benutzt und dort ebenfalls entfernt.`,
        buttons: ['Löschen', 'Abbrechen'],
        danger: 0
      })
      if (choice !== 0) return
    }
    deleteSymbol(index, kind)
    // Auswahl auf den Nachbarn setzen, damit man mehrfach hintereinander löschen kann.
    const rest = alphabetOf(kind, useEditorStore.getState().document)
    select(kind, rest[Math.min(index, rest.length - 1)] ?? null)
  }

  const applyPreset = (preset: AlphabetPreset, kind: AlphabetKind): void => {
    const problem = applyAlphabetPreset(preset.symbols, kind)
    setError(problem)
    if (!problem) setSelected(null)
  }

  const presetEntries = (kind: AlphabetKind): ContextMenuEntry[] =>
    useSettingsStore.getState().settings.alphabetPresets.map((preset) => ({
      label: preset.name,
      checked: sameSymbolSet(preset.symbols, alphabetOf(kind)),
      onSelect: () => applyPreset(preset, kind)
    }))

  /** Öffnet das Preset-Menü rechts neben dem Button. */
  const openPresetMenu = (button: HTMLButtonElement, kind: AlphabetKind): void => {
    const screen = screenRef.current?.getBoundingClientRect()
    const rect = button.getBoundingClientRect()
    if (!screen) return
    setPresetMenu({
      x: rect.right - screen.left + 4,
      y: rect.top - screen.top,
      kind
    })
  }

  /** Werkzeug einer Leiste – jede Leiste gehört fest zu einem Alphabet. */
  const handleTool = (kind: AlphabetKind, tool: AlphabetTool, button: HTMLButtonElement): void => {
    setError(null)
    switch (tool) {
      case 'add': {
        const symbol = addSymbol(kind)
        setJustAdded(symbol)
        select(kind, symbol)
        break
      }
      case 'delete':
        void handleDelete(kind)
        break
      case 'sort':
        sortAlphabet(kind)
        break
      case 'preset':
        openPresetMenu(button, kind)
        break
    }
  }

  /** Liefert `false`, wenn das neue Symbol ungültig ist – CommitInput setzt das Feld dann zurück. */
  const handleRename = (k: AlphabetKind, oldSymbol: string, input: string): boolean => {
    const newSymbol = input.trim()
    let problem = validateSymbol(alphabetOf(k), newSymbol, oldSymbol)
    // → und / trennen in Stack-, Band- und Mealy-Regeln die Seiten
    const separates = k !== 'input' || usesOutput(document.type)
    if (!problem && separates && /[→/]/.test(newSymbol)) problem = '→ und / nicht erlaubt'
    // „_“ steht in Bandregeln für das Blank
    if (!problem && hasTape && newSymbol === '_') problem = '„_“ steht für das Blank'
    // Turingmaschine: Σ ⊆ Γ – ein Σ-Symbol darf kein anderes Bandsymbol treffen und umgekehrt
    if (!problem && hasTape && newSymbol !== oldSymbol) {
      const other = k === 'input' ? tape.alphabet : document.alphabet
      if (other.includes(newSymbol)) problem = `„${newSymbol}“ doppelt`
      else problem = overlapProblem(other.filter((s) => s !== oldSymbol), newSymbol)
    }
    setError(problem)
    if (problem) return false
    renameSymbol(oldSymbol, newSymbol, k)
    if (selected?.kind === k && selected.symbol === oldSymbol) select(k, newSymbol)
    return true
  }

  /** Radio-Spalte des zweiten Alphabets: Stack-Startsymbol bzw. Blank */
  const marker =
    second === 'stack'
      ? {
          title: 'Bodensymbol',
          name: 'stack-start',
          checked: (symbol: string) => stack.start === symbol,
          select: (symbol: string) => useEditorStore.getState().setStackSettings({ start: symbol })
        }
      : {
          title: 'Blank',
          name: 'tape-blank',
          checked: (symbol: string) => tape.blank === symbol,
          select: (symbol: string) => useEditorStore.getState().setTapeSettings({ blank: symbol })
        }

  const EMPTY: Record<AlphabetKind, string> = {
    input: 'noch kein Alphabet festgelegt',
    stack: 'noch kein Stackalphabet festgelegt',
    tape: 'noch kein Bandalphabet festgelegt',
    output: 'noch kein Ausgabealphabet festgelegt'
  }

  const table = (k: AlphabetKind) => {
    const alphabet = alphabetOf(k)
    const hasMarker = k === 'stack' || k === 'tape'
    const columns = hasMarker ? 4 : 3
    return (
      <table className="data-table">
        <thead>
          <tr>
            <th className="is-index">#</th>
            <th>Symbol</th>
            {hasMarker && <th className="is-check">{marker.title}</th>}
            <th className="is-number">
              {countsStates(document, k) ? 'Zustände' : 'Übergänge'}
            </th>
          </tr>
        </thead>
        <tbody>
          {alphabet.length === 0 && (
            <tr>
              <td colSpan={columns} className="muted">
                {EMPTY[k]}
              </td>
            </tr>
          )}
          {alphabet.map((symbol, index) => (
            // Symbole sind eindeutig, daher als key geeignet.
            <tr
              key={symbol}
              className={classNames(
                selected?.kind === k && symbol === selected.symbol && 'is-selected'
              )}
              onClick={() => select(k, symbol)}
            >
              <td className="is-index">{index + 1}</td>
              <td>
                <CommitInput
                  className="is-mono"
                  value={symbol}
                  aria-label={`${SYMBOL_NAMES[k]} ${index + 1}`}
                  autoFocus={symbol === justAdded && selected?.kind === k}
                  onFocus={(e) => {
                    select(k, symbol)
                    e.currentTarget.select()
                  }}
                  onCommit={(value) => handleRename(k, symbol, value)}
                />
              </td>
              {hasMarker && (
                <td className="is-check">
                  <input
                    type="radio"
                    name={marker.name}
                    aria-label={`${marker.title} ${symbol}`}
                    checked={marker.checked(symbol)}
                    onChange={() => marker.select(symbol)}
                  />
                </td>
              )}
              <td className="is-number">{usageCount(document, symbol, k)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  /** Aktionen statt Modi: kein aktives Werkzeug. */
  const tools = (k: AlphabetKind) => (
    <ToolPalette
      tools={ALPHABET_TOOLS}
      active={null}
      onSelect={(tool, button) => handleTool(k, tool, button)}
    />
  )

  return (
    <div className={classNames('table-screen', second && 'is-split')} ref={screenRef}>
      {!second && <nav className="area-tools">{tools('input')}</nav>}
      <div className="table-screen-content">
        {second ? (
          <div className="alphabet-columns">
            {(['input', second] as const).map((k) => (
              <section key={k} className="alphabet-section">
                <h1>{TITLES[k]}</h1>
                <div className="alphabet-body">
                  <nav className="alphabet-tools" aria-label={`Werkzeuge ${TITLES[k]}`}>
                    {tools(k)}
                  </nav>
                  <div className="alphabet-table">
                    {table(k)}
                    {k === 'stack' && (
                      <label className="alphabet-setting">
                        <span className="field-label">Akzeptanz</span>
                        <select
                          className="select"
                          value={stack.acceptance}
                          onChange={(e) =>
                            useEditorStore.getState().setStackSettings({
                              acceptance: e.target.value as StackAcceptance
                            })
                          }
                        >
                          <option value="final">Endzustand</option>
                          <option value="empty">Leerer Stack</option>
                        </select>
                      </label>
                    )}
                  </div>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <>
            <h1>Alphabet</h1>
            {table('input')}
          </>
        )}
        {error && <p className="table-error">{error}</p>}
      </div>
      {presetMenu && (
        <ContextMenu
          x={presetMenu.x}
          y={presetMenu.y}
          entries={presetEntries(presetMenu.kind)}
          onClose={closePresetMenu}
        />
      )}
    </div>
  )
}
