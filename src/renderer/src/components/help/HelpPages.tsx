import type { ReactNode } from 'react'
import { KEY_ACTION_IDS, KEY_ACTIONS, formatCombo, type KeyAction } from '@shared/keybindings'
import { PAN_KEY_LABELS } from '@shared/navigationSettings'
import type { AutomatonType } from '@/model/graph'
import { useSettingsStore } from '@/store/settingsStore'
import { EXAMPLE_FILE } from './helpExample'
import type { HelpTab } from './helpTabs'
import { CHANGELOG, PROGRAM } from './programInfo'

export function HelpPage({ tab }: { tab: HelpTab }) {
  switch (tab.kind) {
    case 'type': {
      const { title, Page } = TYPE_PAGES[tab.type]
      return (
        <article className="help-page">
          <h3 className="help-title">{title}</h3>
          <Page />
        </article>
      )
    }
    case 'saving':
      return (
        <article className="help-page">
          <h3 className="help-title">Aufbau der Datei</h3>
          <SavingPage />
        </article>
      )
    case 'tooltips':
      return (
        <article className="help-page">
          <h3 className="help-title">Tooltips</h3>
          <TooltipsPage />
        </article>
      )
    case 'program':
      return (
        <article className="help-page">
          <h3 className="help-title">
            {PROGRAM.name} <span className="help-version">Version {PROGRAM.version}</span>
          </h3>
          <ProgramPage />
        </article>
      )
  }
}

// ---------- Bausteine ----------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="help-section">
      <h4 className="section-label">{title}</h4>
      {children}
    </section>
  )
}

function Formula({ children }: { children: ReactNode }) {
  return <p className="help-formula">{children}</p>
}

/** Zweispaltige Liste: links Zeichen/Feld, rechts Erklärung. */
function Parts({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="help-parts">
      {rows.map(([term, text], i) => (
        <div key={i} className="help-part">
          <dt>{term}</dt>
          <dd>{text}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Aktuelle Belegung einer Aktion – „nicht belegt“, wenn es keine gibt. */
function Keys({ action }: { action: KeyAction }) {
  const combos = useSettingsStore((s) => s.settings.keybindings[action])
  if (combos.length === 0) return <span className="help-dim">nicht belegt</span>
  return (
    <>
      {combos.map((combo, i) => (
        <span key={combo}>
          {i > 0 && ' / '}
          <kbd>{formatCombo(combo)}</kbd>
        </span>
      ))}
    </>
  )
}

// ---------- Schreibweise ----------

const ZE = (
  <>
    Z<sub>E</sub>
  </>
)
const Z0 = (
  <>
    z<sub>0</sub>
  </>
)

/** X, Z, z₀, Z_E – bei allen Typen gleich, nur δ und die Zusätze unterscheiden sich. */
function commonParts(): [ReactNode, ReactNode][] {
  return [
    ['X', 'Eingabealphabet'],
    ['Z', 'endliche Menge aller Zustände'],
    [<>{Z0} ∈ Z</>, 'Anfangszustand'],
    [<>{ZE} ⊆ Z</>, 'Menge der Endzustände']
  ]
}

function AcceptorSection() {
  return (
    <Section title="Akzeptor">
      <p>
        Ein Akzeptor ist ein Automat ohne Ausgabe. Er liest ein Eingabewort w ∈ X* Zeichen für
        Zeichen und entscheidet am Ende nur: akzeptiert oder verworfen. Die Menge aller
        akzeptierten Wörter ist die Sprache L(A) ⊆ X* des Akzeptors.
      </p>
    </Section>
  )
}

// ---------- Automatentypen ----------

const TYPE_PAGES: Record<AutomatonType, { title: string; Page: () => ReactNode }> = {
  DFA: { title: 'Deterministischer endlicher Akzeptor (DEA)', Page: DfaPage },
  NFA: { title: 'Nichtdeterministischer endlicher Akzeptor (NEA)', Page: NfaPage },
  DPDA: { title: 'Deterministischer Kellerautomat (DKA)', Page: DpdaPage },
  NPDA: { title: 'Nichtdeterministischer Kellerautomat (NKA)', Page: NpdaPage },
  TM: { title: 'Turingmaschine (TM)', Page: TuringPage }
}

function DfaPage() {
  return (
    <>
      <AcceptorSection />
      <Section title="Definition">
        <Formula>
          A = (X, Z, {Z0}, {ZE}, δ)
        </Formula>
        <Parts rows={[...commonParts(), ['δ: Z × X → Z', 'Übergangsfunktion']]} />
      </Section>
      <Section title="Deterministisch">
        <p>
          Zu jedem Zustand z ∈ Z und jedem Zeichen x ∈ X gibt es genau einen Übergang δ(z, x):
        </p>
        <ul>
          <li>
            <strong>mindestens einen</strong> – der Automat bleibt nie stecken (vollständig)
          </li>
          <li>
            <strong>höchstens einen</strong> – der nächste Zustand steht immer eindeutig fest
          </li>
        </ul>
        <p>
          Fehlt ein Übergang, ergänzt man einen Fangzustand: Er hat für jedes Zeichen eine
          Schleife auf sich selbst und ist kein Endzustand.
        </p>
      </Section>
      <Section title="Arbeitsweise">
        <p>
          Der DEA startet in {Z0} und liest das Wort w = x<sub>1</sub>x<sub>2</sub>…x
          <sub>n</sub> von links nach rechts. Bei jedem Zeichen wechselt er vom aktuellen Zustand
          z nach δ(z, x<sub>i</sub>). Steht er nach dem letzten Zeichen in einem Endzustand, ist w
          akzeptiert, sonst verworfen.
        </p>
      </Section>
      <Section title="Sprache">
        <Formula>
          L(A) = {'{'} w ∈ X* | δ*({Z0}, w) ∈ {ZE} {'}'}
        </Formula>
        <p>
          δ* ist die erweiterte Übergangsfunktion: Sie wendet δ nacheinander auf alle Zeichen von
          w an. DEAs akzeptieren genau die regulären Sprachen.
        </p>
      </Section>
    </>
  )
}

function NfaPage() {
  return (
    <>
      <AcceptorSection />
      <Section title="Definition">
        <Formula>
          A = (X, Z, {Z0}, {ZE}, δ)
        </Formula>
        <Parts
          rows={[
            ...commonParts(),
            [
              <>δ: Z × (X ∪ {'{'}ε{'}'}) → 𝒫(Z)</>,
              'Übergangsfunktion'
            ]
          ]}
        />
      </Section>
      <Section title="Nichtdeterministisch">
        <p>Anders als beim DEA darf es zu einem Zustand und einem Zeichen</p>
        <ul>
          <li>keinen Übergang geben – dieser Weg endet dort,</li>
          <li>einen Übergang geben,</li>
          <li>mehrere Übergänge geben – der Automat hat die Wahl.</li>
        </ul>
        <p>Dazu kommen ε-Übergänge: Sie wechseln den Zustand, ohne ein Zeichen zu lesen.</p>
      </Section>
      <Section title="Arbeitsweise">
        <p>
          Der NEA startet in {Z0} und liest das Wort von links nach rechts. Wo er die Wahl hat,
          verfolgt man alle Möglichkeiten gleichzeitig: Der NEA ist also in einer Menge von
          Zuständen. Das Wort ist akzeptiert, wenn <em>mindestens ein</em> Weg nach dem letzten
          Zeichen in einem Endzustand endet.
        </p>
      </Section>
      <Section title="Sprache">
        <Formula>
          L(A) = {'{'} w ∈ X* | δ*({Z0}, w) ∩ {ZE} ≠ ∅ {'}'}
        </Formula>
        <p>
          Zu jedem NEA gibt es einen DEA mit derselben Sprache (Potenzmengenkonstruktion). NEAs
          sind also nicht mächtiger, aber oft viel kleiner und leichter zu entwerfen. Auch sie
          akzeptieren genau die regulären Sprachen.
        </p>
      </Section>
    </>
  )
}

function PushdownBasics() {
  return (
    <>
      <Section title="Kellerautomat">
        <p>
          Ein Kellerautomat ist ein Akzeptor mit einem zusätzlichen Speicher, dem Stack. Auf den
          Stack kann er Zeichen legen, sehen und entfernen kann er immer nur das oberste (Top of
          Stack). Damit kann er zählen – etwa für a<sup>n</sup>b<sup>n</sup>, das kein endlicher
          Akzeptor erkennt.
        </p>
      </Section>
      <Section title="Definition">
        <Formula>
          K = (X, Z, {Z0}, {ZE}, δ, Γ, #)
        </Formula>
        <Parts
          rows={[
            ...commonParts(),
            [
              <>δ: Z × (X ∪ {'{'}ε{'}'}) × Γ → 𝒫(Z × Γ*)</>,
              'Übergangsfunktion'
            ],
            ['Γ', 'Stackalphabet'],
            ['# ∈ Γ', 'Bodensymbol']
          ]}
        />
      </Section>
      <Section title="Übergänge">
        <p>
          Ein Übergang (z′, B<sub>1</sub>…B<sub>k</sub>) ∈ δ(z, x, A) heißt: Im Zustand z wird x
          gelesen (bei ε nichts), A oben vom Stack genommen und B<sub>1</sub>…B<sub>k</sub>{' '}
          daraufgelegt – B<sub>1</sub> liegt danach oben. Der Automat wechselt nach z′. Im
          Zustandsdiagramm steht dafür <code>x, A → B₁…Bₖ</code>.
        </p>
        <Parts
          rows={[
            [<code key="a">a, # → A#</code>, 'a lesen, A auf den Boden legen'],
            [<code key="b">b, A → ε</code>, 'b lesen, A entfernen'],
            [<code key="e">ε, # → #</code>, 'nichts lesen, Stack unverändert, nur Zustand wechseln']
          ]}
        />
      </Section>
      <Section title="Akzeptanz">
        <p>Das Wort muss ganz gelesen sein, dazu gibt es zwei Varianten:</p>
        <ul>
          <li>
            <strong>Endzustand</strong> – der Automat steht in einem Zustand aus {ZE}
          </li>
          <li>
            <strong>Leerer Stack</strong> – der Stack ist leer, {ZE} wird nicht gebraucht
          </li>
        </ul>
      </Section>
    </>
  )
}

function DpdaPage() {
  return (
    <>
      <PushdownBasics />
      <Section title="Deterministisch">
        <p>In jeder Situation ist höchstens ein Übergang möglich. Für jedes z ∈ Z und A ∈ Γ gilt:</p>
        <ul>
          <li>zu jedem x ∈ X höchstens ein Übergang δ(z, x, A),</li>
          <li>gibt es einen ε-Übergang δ(z, ε, A), dann keinen Übergang δ(z, x, A) mit x ∈ X.</li>
        </ul>
        <p>
          DKAs akzeptieren die deterministisch kontextfreien Sprachen – z. B. a<sup>n</sup>b
          <sup>n</sup> oder korrekt geklammerte Ausdrücke, aber nicht alle Palindrome.
        </p>
      </Section>
    </>
  )
}

function NpdaPage() {
  return (
    <>
      <PushdownBasics />
      <Section title="Nichtdeterministisch">
        <p>
          In einer Situation dürfen mehrere Übergänge möglich sein. Das Wort ist akzeptiert, wenn{' '}
          <em>mindestens ein</em> Lauf akzeptiert.
        </p>
        <p>
          NKAs akzeptieren genau die kontextfreien Sprachen. Anders als bei den endlichen
          Akzeptoren ist der NKA mächtiger als der DKA: Für Palindrome ww<sup>R</sup> muss er die
          Mitte des Worts „raten“ – das kann kein DKA.
        </p>
      </Section>
    </>
  )
}

function TuringPage() {
  return (
    <>
      <Section title="Turingmaschine">
        <p>
          Eine Turingmaschine hat statt eines Stacks ein beidseitig unendliches Band aus Feldern.
          Ein Schreib-Lese-Kopf steht auf einem Feld; die Maschine kann dort lesen, schreiben und
          den Kopf nach links oder rechts bewegen. Sie ist das mächtigste Automatenmodell: Alles,
          was sich überhaupt berechnen lässt, kann eine Turingmaschine berechnen.
        </p>
      </Section>
      <Section title="Definition">
        <Formula>
          T = (X, Z, {Z0}, {ZE}, δ, Γ, #)
        </Formula>
        <Parts
          rows={[
            ...commonParts(),
            [
              <>δ: Z × Γ → Z × Γ × {'{'}L, R, N{'}'}</>,
              'Übergangsfunktion'
            ],
            ['Γ ⊇ X', 'Bandalphabet'],
            ['# ∈ Γ \\ X', 'Blank']
          ]}
        />
      </Section>
      <Section title="Übergänge">
        <p>
          δ(z, a) = (z′, b, R) heißt: Im Zustand z steht a unter dem Kopf. Die Maschine schreibt
          b an diese Stelle, bewegt den Kopf nach rechts und wechselt nach z′. Im Zustandsdiagramm
          steht dafür <code>a → b, R</code>.
        </p>
        <Parts
          rows={[
            ['L', 'Kopf ein Feld nach links'],
            ['R', 'Kopf ein Feld nach rechts'],
            ['N', 'Kopf bleibt stehen (neutral)']
          ]}
        />
      </Section>
      <Section title="Arbeitsweise">
        <p>
          Zu Beginn steht das Eingabewort auf dem Band, auf allen anderen Feldern #. Der Kopf steht
          auf dem ersten Zeichen, die Maschine in {Z0}. Sie hält, sobald es für den aktuellen
          Zustand und das Zeichen unter dem Kopf keinen Übergang gibt.
        </p>
        <ul>
          <li>hält sie in einem Endzustand, ist das Wort akzeptiert,</li>
          <li>hält sie in einem anderen Zustand, ist es verworfen,</li>
          <li>sie kann auch nie halten (Endlosschleife) – dann ist es nicht akzeptiert.</li>
        </ul>
        <p>
          Deterministisch heißt hier: Zu jedem Zustand und Bandzeichen gibt es höchstens einen
          Übergang. Statt nur zu akzeptieren, kann eine Turingmaschine auch rechnen – das Ergebnis
          steht nach dem Halten auf dem Band.
        </p>
      </Section>
    </>
  )
}

// ---------- Speichern ----------

function SavingPage() {
  return (
    <>
      <p>
        Speichern legt den Automaten als JSON-Datei ab; der Dateiname ist der Name des Automaten.
        Die Datei lässt sich mit jedem Texteditor bearbeiten oder ganz von Hand schreiben.
      </p>
      <Section title="Rahmen">
        <pre className="help-code">{`{
  "format": "automat",
  "version": 2,
  "document": { … }
}`}</pre>
        <p>
          <code>format</code> ist immer <code>"automat"</code>, <code>version</code> ist{' '}
          <code>2</code>.
        </p>
      </Section>
      <Section title="document">
        <Parts
          rows={[
            [
              <code key="t">type</code>,
              <>
                <code>"DFA"</code> (DEA), <code>"NFA"</code> (NEA), <code>"DPDA"</code> (DKA),{' '}
                <code>"NPDA"</code> (NKA) oder <code>"TM"</code>
              </>
            ],
            [
              <code key="a">alphabet</code>,
              <>
                Eingabealphabet X, z. B. <code>["a", "b"]</code>
              </>
            ],
            [<code key="g">graph</code>, 'Zustände und Übergänge'],
            [<code key="s">stack</code>, 'nur beim Kellerautomaten'],
            [<code key="p">tape</code>, 'nur bei der Turingmaschine']
          ]}
        />
      </Section>
      <Section title="graph.states – Zustände">
        <Parts
          rows={[
            [
              <code key="i">id</code>,
              'eindeutige Kennung, frei wählbar (z. B. "s0") – Übergänge verweisen darauf'
            ],
            [
              <code key="l">label</code>,
              <>
                angezeigter Name, z. B. <code>"z0"</code>
              </>
            ],
            [<code key="x">x, y</code>, 'Position des Kreismittelpunkts in Pixeln'],
            [
              <code key="s">isStart</code>,
              <>
                Anfangszustand – genau einer hat <code>true</code>
              </>
            ],
            [<code key="f">isFinal</code>, 'Endzustand']
          ]}
        />
      </Section>
      <Section title="graph.transitions – Übergänge">
        <Parts
          rows={[
            [<code key="i">id</code>, 'eindeutige Kennung, frei wählbar'],
            [
              <code key="f">from, to</code>,
              <>
                <code>id</code> des Start- und Zielzustands, gleich bei einer Schleife
              </>
            ],
            [<code key="l">labels</code>, 'Liste der Regeln, mit denen der Übergang schaltet']
          ]}
        />
        <p>
          Pro Richtung zwischen zwei Zuständen gibt es nur einen Übergang – mehrere Zeichen sind
          mehrere Regeln in <code>labels</code>.
        </p>
      </Section>
      <Section title="Regeln je Typ">
        <Parts
          rows={[
            [
              'DEA, NEA',
              <>
                <code>{'{ "read": "a" }'}</code> – ε als <code>"ε"</code> (nur NEA)
              </>
            ],
            [
              'Kellerautomat',
              <>
                <code>{'{ "read": "a", "pop": "#", "push": ["A", "#"] }'}</code> –{' '}
                <code>pop</code> = Top of Stack, <code>push[0]</code> liegt danach oben,{' '}
                <code>[]</code> = ε
              </>
            ],
            [
              'Turingmaschine',
              <>
                <code>{'{ "read": "a", "write": "X", "move": "R" }'}</code> – <code>move</code>{' '}
                ist <code>"L"</code>, <code>"R"</code> oder <code>"N"</code>
              </>
            ]
          ]}
        />
      </Section>
      <Section title="stack und tape">
        <pre className="help-code">{`"stack": { "alphabet": ["A", "#"], "start": "#", "acceptance": "final" }
"tape":  { "alphabet": ["a", "b", "X", "#"], "blank": "#" }`}</pre>
        <p>
          <code>stack.alphabet</code> ist Γ, <code>start</code> das Bodensymbol,{' '}
          <code>acceptance</code> <code>"final"</code> (Endzustand) oder <code>"empty"</code>{' '}
          (leerer Stack). <code>tape.alphabet</code> ist Γ und muss X und das Blank enthalten.
        </p>
      </Section>
      <Section title="Beispiel: DEA für eine gerade Anzahl a">
        <pre className="help-code">{EXAMPLE_FILE}</pre>
      </Section>
    </>
  )
}

// ---------- Tooltips ----------

/** Gruppen in der Reihenfolge von `KEY_ACTION_IDS`. */
function keyGroups(): { group: string; actions: KeyAction[] }[] {
  const groups: { group: string; actions: KeyAction[] }[] = []
  for (const id of KEY_ACTION_IDS) {
    const group = KEY_ACTIONS[id].group
    const entry = groups.find((g) => g.group === group)
    if (entry) entry.actions.push(id)
    else groups.push({ group, actions: [id] })
  }
  return groups
}

function TooltipsPage() {
  const { panKey, panMiddleMouse } = useSettingsStore((s) => s.settings.navigation)
  const panRows: [ReactNode, ReactNode][] = []
  if (panKey !== 'none') {
    panRows.push([
      <kbd key="p">{PAN_KEY_LABELS[panKey]}</kbd>,
      'gedrückt halten und ziehen: Ansicht verschieben'
    ])
  }
  if (panMiddleMouse) panRows.push(['Mittlere Maustaste ziehen', 'Ansicht verschieben'])
  return (
    <>
      {keyGroups().map(({ group, actions }) => (
        <Section key={group} title={group}>
          <Parts
            rows={actions.map((id) => [KEY_ACTIONS[id].label, <Keys key={id} action={id} />])}
          />
        </Section>
      ))}
      <Section title="Maus im Grapheneditor">
        <Parts
          rows={[
            ['Mausrad', 'zoomen'],
            ['Ziehen auf freier Fläche', 'Rechteck aufziehen: mehrere Elemente auswählen'],
            ...panRows,
            ['Doppelklick auf freie Fläche', 'neuer Zustand'],
            ['Doppelklick auf Zustand', 'umbenennen'],
            ['Doppelklick auf Übergang', 'Beschriftung bearbeiten'],
            ['Lasso: frei umfahren', 'mehrere Zustände samt Übergängen auswählen'],
            [<kbd key="u">Umschalt</kbd>, '+ Klick, Rechteck oder Lasso: zur Auswahl hinzufügen'],
            ['Ausgewählte Gruppe ziehen', 'alle zusammen verschieben'],
            ['Rechtsklick', 'Kontextmenü (Startzustand, Endzustand, Löschen …)']
          ]}
        />
      </Section>
      <Section title="Beschriftung eintippen">
        <Parts
          rows={[
            [
              'DEA, NEA',
              <>
                <code>a, b</code> – beim NEA ε auch als <code>eps</code>
              </>
            ],
            [
              'Kellerautomat',
              <>
                <code>a, # → A#</code> oder kurz <code>a # A#</code>, mehrere Regeln mit{' '}
                <code>;</code>
              </>
            ],
            [
              'Turingmaschine',
              <>
                <code>a → X, R</code> oder kurz <code>a X R</code>, <code>_</code> = Blank
              </>
            ],
            [
              'Pfeil',
              <>
                <code>-&gt;</code> oder <code>/</code> statt →
              </>
            ]
          ]}
        />
      </Section>
      <Section title="Feld der Turing-Tabelle">
        <Parts
          rows={[
            [
              <span key="m">
                <kbd>L</kbd> <kbd>N</kbd> <kbd>R</kbd>
              </span>,
              'Bewegung wählen'
            ],
            [<kbd key="e">Enter</kbd>, 'übernehmen'],
            [<kbd key="x">Esc</kbd>, 'abbrechen']
          ]}
        />
      </Section>
    </>
  )
}

// ---------- Programm ----------

function ProgramPage() {
  return (
    <>
      <p>
        Desktop-Programm zum Zeichnen, Prüfen, Simulieren, Umwandeln und Exportieren von Automaten:
        endliche Akzeptoren (DEA, NEA), Kellerautomaten (DKA, NKA) und Turingmaschinen.
      </p>
      <Parts
        rows={[
          ['Autor', PROGRAM.author],
          ['Lizenz', PROGRAM.license],
          ['Technik', 'Electron, React, TypeScript'],
          [
            'Quellcode',
            <a key="gh" href={PROGRAM.repository} target="_blank" rel="noreferrer">
              {PROGRAM.repository.replace('https://', '')}
            </a>
          ]
        ]}
      />
      <Section title="Changelog">
        {CHANGELOG.map((entry) => (
          <div key={entry.version} className="help-release">
            <h5 className="help-release-title">{entry.version}</h5>
            <ul>
              {entry.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </div>
        ))}
      </Section>
    </>
  )
}
