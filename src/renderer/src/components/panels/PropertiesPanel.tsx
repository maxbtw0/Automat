import { ComboInput } from '@/components/common/ComboInput'
import { CommitInput } from '@/components/common/CommitInput'
import { Icon } from '@/components/common/Icon'
import { Panel } from '@/components/common/Panel'
import {
  asPushdown,
  asTuring,
  formatLabelsInline,
  formatStackWord,
  nextPushdownLabel,
  nextTuringLabel,
  parseLabels,
  parseStackWord
} from '@/core/automaton/labels'
import { getAutomatonDefinition } from '@/core/automaton/registry'
import {
  EPSILON,
  edgeSymbols,
  findState,
  findTransition,
  labelKey,
  normalizeSymbol,
  normalizeTapeSymbol,
  stackSettings,
  symbolLabels,
  tapeSettings,
  TAPE_MOVES,
  usesStack,
  usesTape,
  type AutomatonDocument,
  type StateNode,
  type TapeMove,
  type TransitionEdge,
  type TransitionLabel
} from '@/model/graph'
import { useEditorStore } from '@/store/editorStore'
import { classNames } from '@/utils/dom'

/** Eigenschaften des ausgewählten Zustands bzw. Übergangs – ohne Auswahl wird nichts angezeigt. */
export function PropertiesPanel() {
  const doc = useEditorStore((s) => s.document)
  const selection = useEditorStore((s) => s.selection)

  const state = selection?.kind === 'state' ? findState(doc.graph, selection.id) : undefined
  const transition =
    selection?.kind === 'transition' ? findTransition(doc.graph, selection.id) : undefined

  if (state) {
    return (
      <Panel title="Zustand">
        <StateProperties key={state.id} state={state} doc={doc} />
      </Panel>
    )
  }
  if (transition) {
    return (
      <Panel title="Übergang">
        <TransitionProperties key={transition.id} transition={transition} doc={doc} />
      </Panel>
    )
  }
  return null
}

function StateProperties({ state, doc }: { state: StateNode; doc: AutomatonDocument }) {
  const { updateState, setStartState, toggleFinal, deleteState, select } = useEditorStore.getState()
  const outgoing = doc.graph.transitions.filter((t) => t.from === state.id)
  const gamma = stackSettings(doc).alphabet
  const labelOf = (id: string): string => findState(doc.graph, id)?.label ?? '?'

  return (
    <>
      <div className="field">
        <span className="field-label">Bezeichnung</span>
        <CommitInput
          className="is-mono"
          value={state.label}
          onCommit={(value) => {
            const label = value.trim()
            if (label) updateState(state.id, { label })
          }}
        />
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={state.isStart}
          onChange={() =>
            state.isStart ? updateState(state.id, { isStart: false }) : setStartState(state.id)
          }
        />
        Startzustand
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={state.isFinal} onChange={() => toggleFinal(state.id)} />
        Endzustand
      </label>

      <div className="field">
        <span className="field-label">Ausgehende Übergänge</span>
        {outgoing.length === 0 ? (
          <span className="muted">keine</span>
        ) : (
          <ul className="transition-list">
            {outgoing.map((t) => (
              <li key={t.id}>
                <button onClick={() => select({ kind: 'transition', id: t.id })}>
                  {state.label} —{formatLabelsInline(t.labels, gamma) || '?'}→ {labelOf(t.to)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className="btn is-danger" onClick={() => deleteState(state.id)}>
        Zustand löschen
      </button>
    </>
  )
}

function TransitionProperties({
  transition,
  doc
}: {
  transition: TransitionEdge
  doc: AutomatonDocument
}) {
  const { updateTransition, deleteTransition } = useEditorStore.getState()
  const labelOf = (id: string): string => findState(doc.graph, id)?.label ?? '?'

  return (
    <>
      {/* Von/Nach sieht man im Graphen – hier nur zur Orientierung */}
      <div className="transition-heading is-mono">
        {labelOf(transition.from)} → {labelOf(transition.to)}
      </div>
      {usesTape(doc.type) ? (
        <TuringRuleList transition={transition} doc={doc} />
      ) : usesStack(doc.type) ? (
        <RuleList transition={transition} doc={doc} />
      ) : (
        <div className="field">
          <span className="field-label">Symbole</span>
          <SymbolToggles transition={transition} doc={doc} />
          <CommitInput
            className="is-mono"
            value={formatLabelsInline(transition.labels)}
            placeholder="z. B. a, b"
            onCommit={(value) => {
              const result = parseLabels(value, doc)
              if ('labels' in result) updateTransition(transition.id, { labels: result.labels })
            }}
          />
        </div>
      )}
      <button className="btn is-danger" onClick={() => deleteTransition(transition.id)}>
        Übergang löschen
      </button>
    </>
  )
}

/**
 * Kellerautomat: eine Zeile pro Regel. Eingabe und Top of Stack tippen oder aus der Liste
 * wählen, Push frei eintippen (mehrere Symbole, z. B. „AA#“). „+ Regel“ legt die nächste freie
 * Kombination an.
 */
function RuleList({ transition, doc }: { transition: TransitionEdge; doc: AutomatonDocument }) {
  const { updateTransition } = useEditorStore.getState()
  const { labels } = transition
  const gamma = stackSettings(doc).alphabet
  const { replace, fail } = ruleActions(transition)

  /** Eingabe bzw. Top of Stack: ein Symbol aus Σ bzw. Γ oder ε (leer = ε) */
  const commitSymbol = (index: number, field: 'read' | 'pop', input: string): boolean => {
    const symbol = normalizeSymbol(input) || EPSILON
    if (field === 'pop' && symbol === EPSILON) return fail('Top of Stack darf nicht ε sein')
    const allowed = field === 'read' ? doc.alphabet : gamma
    if (symbol !== EPSILON && !allowed.includes(symbol)) {
      return fail(`„${symbol}“ nicht im ${field === 'read' ? 'Alphabet' : 'Stackalphabet'}`)
    }
    replace(index, { ...asPushdown(labels[index]), [field]: symbol })
    return true
  }

  /** Push: beliebig viele Symbole aus Γ, links = danach oben */
  const commitPush = (index: number, text: string): boolean => {
    const push = parseStackWord(text, gamma)
    const unknown = push.find((symbol) => !gamma.includes(symbol))
    if (unknown !== undefined) return fail(`„${unknown}“ nicht im Stackalphabet`)
    replace(index, { ...asPushdown(labels[index]), push })
    return true
  }

  const selectAll = (e: { currentTarget: HTMLInputElement }): void => e.currentTarget.select()

  return (
    <div className="field">
      <span className="field-label">Regeln</span>
      <div className="rule-list">
        {labels.length > 0 && (
          <div className="rule-row is-header" aria-hidden="true">
            <span>Eingabe</span>
            <span>Top of Stack</span>
            <span />
            <span>Push</span>
          </div>
        )}
        {labels.map((label, i) => {
          const rule = asPushdown(label)
          return (
            // Position statt Regel als key: Ändert man ein Feld und springt per Tab weiter, bleibt
            // die Zeile bestehen und das nächste Feld behält den Fokus.
            <div className="rule-row" key={i}>
              <ComboInput
                className="is-mono"
                aria-label={`Eingabe Regel ${i + 1}`}
                value={rule.read}
                options={[...doc.alphabet, EPSILON]}
                onFocus={selectAll}
                onCommit={(value) => commitSymbol(i, 'read', value)}
              />
              <ComboInput
                className="is-mono"
                aria-label={`Top of Stack Regel ${i + 1}`}
                value={rule.pop}
                options={gamma}
                onFocus={selectAll}
                onCommit={(value) => commitSymbol(i, 'pop', value)}
              />
              <span className="rule-arrow">→</span>
              <CommitInput
                className="is-mono"
                aria-label={`Push Regel ${i + 1}`}
                value={formatStackWord(rule.push, gamma)}
                onFocus={selectAll}
                onCommit={(value) => commitPush(i, value)}
              />
              <button
                className="btn is-ghost is-icon rule-delete"
                onClick={() => replace(i, null)}
                title="Regel löschen"
                aria-label={`Regel ${i + 1} löschen`}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )
        })}
        {labels.length > 0 && (
          <p className="rule-hint">Push „AB#“: erst #, dann B, dann A – A liegt oben</p>
        )}
        <button
          className="btn is-ghost rule-add"
          onClick={() =>
            updateTransition(transition.id, {
              labels: [...labels, nextPushdownLabel(labels, doc.alphabet, gamma)]
            })
          }
        >
          <Icon name="plus" size={14} /> Regel
        </button>
      </div>
    </div>
  )
}

/** Regeln eines Übergangs ändern – Fehler erscheinen in der Statusleiste. */
function ruleActions(transition: TransitionEdge) {
  const { updateTransition, setStatus } = useEditorStore.getState()
  const { labels } = transition

  /** Ersetzt Regel `index` (`null` = löschen); doppelte Regeln verschmelzen. */
  const replace = (index: number, label: TransitionLabel | null): void => {
    const next = labels.map((l, i) => (i === index ? label : l)).filter((l) => l !== null)
    const unique = next.filter(
      (l, i) => next.findIndex((other) => labelKey(other) === labelKey(l)) === i
    )
    setStatus(null)
    updateTransition(transition.id, { labels: unique })
  }

  const fail = (text: string): false => {
    setStatus({ kind: 'error', text })
    return false
  }

  return { replace, fail }
}

const MOVE_TITLES: Record<TapeMove, string> = {
  L: 'Links',
  R: 'Rechts',
  N: 'Stehen bleiben'
}

/**
 * Turingmaschine: eine Zeile pro Regel „a → b, R“. Lesen und Schreiben tippen oder aus Γ
 * wählen, Bewegung per Knopf. „+ Regel“ nimmt das nächste Bandsymbol, das der Zustand noch
 * nicht liest.
 */
function TuringRuleList({
  transition,
  doc
}: {
  transition: TransitionEdge
  doc: AutomatonDocument
}) {
  const { updateTransition } = useEditorStore.getState()
  const { labels } = transition
  const { alphabet: gamma, blank } = tapeSettings(doc)
  const { replace, fail } = ruleActions(transition)

  /** Lesen bzw. Schreiben: ein Symbol aus Γ (leer oder „_“ = Blank) */
  const commitSymbol = (index: number, field: 'read' | 'write', input: string): boolean => {
    const symbol = normalizeTapeSymbol(input, blank) || blank
    if (!gamma.includes(symbol)) return fail(`„${symbol}“ nicht im Bandalphabet`)
    replace(index, { ...asTuring(labels[index]), [field]: symbol })
    return true
  }

  const addRule = (): void => {
    // Alle Regeln des Zustands zählen – auch die an anderen Übergängen (Determinismus)
    const stateRules = doc.graph.transitions
      .filter((t) => t.from === transition.from)
      .flatMap((t) => t.labels)
    const label = nextTuringLabel(stateRules, gamma)
    if (!label) {
      fail('Alle Bandsymbole belegt')
      return
    }
    updateTransition(transition.id, { labels: [...labels, label] })
  }

  const selectAll = (e: { currentTarget: HTMLInputElement }): void => e.currentTarget.select()

  return (
    <div className="field">
      <span className="field-label">Regeln</span>
      <div className="rule-list">
        {labels.length > 0 && (
          <div className="rule-row is-turing is-header" aria-hidden="true">
            <span>Lesen</span>
            <span />
            <span>Schreiben</span>
            <span>Bewegung</span>
          </div>
        )}
        {labels.map((label, i) => {
          const rule = asTuring(label)
          return (
            // Position als key: Fokus bleibt beim Tab in der Zeile
            <div className="rule-row is-turing" key={i}>
              <ComboInput
                className="is-mono"
                aria-label={`Lesen Regel ${i + 1}`}
                value={rule.read}
                options={gamma}
                onFocus={selectAll}
                onCommit={(value) => commitSymbol(i, 'read', value)}
              />
              <span className="rule-arrow">→</span>
              <ComboInput
                className="is-mono"
                aria-label={`Schreiben Regel ${i + 1}`}
                value={rule.write}
                options={gamma}
                onFocus={selectAll}
                onCommit={(value) => commitSymbol(i, 'write', value)}
              />
              <div
                className="segmented is-compact"
                role="radiogroup"
                aria-label={`Bewegung Regel ${i + 1}`}
              >
                {TAPE_MOVES.map((move) => (
                  <button
                    key={move}
                    role="radio"
                    aria-checked={rule.move === move}
                    title={MOVE_TITLES[move]}
                    className={classNames('segmented-option', rule.move === move && 'is-active')}
                    onClick={() => replace(i, { ...rule, move })}
                  >
                    {move}
                  </button>
                ))}
              </div>
              <button
                className="btn is-ghost is-icon rule-delete"
                onClick={() => replace(i, null)}
                title="Regel löschen"
                aria-label={`Regel ${i + 1} löschen`}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )
        })}
        <button className="btn is-ghost rule-add" onClick={addRule}>
          <Icon name="plus" size={14} /> Regel
        </button>
      </div>
    </div>
  )
}

/** Endlicher Automat: Symbole aus Σ (beim NEA auch ε) zum An- und Abwählen. */
function SymbolToggles({
  transition,
  doc
}: {
  transition: TransitionEdge
  doc: AutomatonDocument
}) {
  const { updateTransition } = useEditorStore.getState()
  const used = edgeSymbols(transition)
  const allowed = [...doc.alphabet, ...(getAutomatonDefinition(doc.type).epsilon ? [EPSILON] : [])]
  // Symbole außerhalb von Σ trotzdem zeigen (rot), damit man sie abwählen kann
  const shown = [...allowed, ...used.filter((s) => !allowed.includes(s))]

  const toggle = (symbol: string): void => {
    const symbols = used.includes(symbol)
      ? used.filter((s) => s !== symbol)
      : shown.filter((s) => s === symbol || used.includes(s))
    updateTransition(transition.id, { labels: symbolLabels(symbols) })
  }

  if (shown.length === 0) return null
  return (
    <div className="symbol-toggles" role="group" aria-label="Symbole">
      {shown.map((symbol) => (
        <button
          key={symbol}
          className={classNames(
            'symbol-toggle',
            used.includes(symbol) && 'is-active',
            !allowed.includes(symbol) && 'is-invalid'
          )}
          aria-pressed={used.includes(symbol)}
          onClick={() => toggle(symbol)}
        >
          {symbol}
        </button>
      ))}
    </div>
  )
}
