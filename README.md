# Automat

Desktop-Programm zum Zeichnen, Prüfen, Simulieren, Umwandeln und Exportieren von Automaten
im Stil von AutoEdit/JFLAP, als installierbare Windows-App.

**Electron · React · TypeScript**

## Automatentypen

| Typ | Umfang |
| --- | ------ |
| DEA, NEA (mit ε) | Prüfung, Simulation, NEA → DEA, Minimierung, Vervollständigen, reguläre Ausdrücke |
| Kellerautomat (DKA, NKA) | Stackalphabet Γ, Startsymbol, Akzeptanz über Endzustand oder leeren Stack |
| Turingmaschine (deterministisch) | Bandalphabet Γ ⊇ Σ mit Blank, Matrix-Übergangstabelle, Bandsimulation |
| Transduktor (Mealy, Moore) | Ausgabealphabet Δ, Umwandlung Mealy ↔ Moore, Ein- und Ausgabe in der Simulation |

## Funktionen

- **Grapheneditor:** Zustände und Übergänge zeichnen, Start-/Endzustände, Beschriftung direkt
  am Übergang, Zoom und Verschieben, Touch-Bedienung
- **Alphabet:** Σ (beim Kellerautomaten zusätzlich Γ, bei der Turingmaschine Γ mit Blank,
  beim Transduktor Δ), Voreinstellungen, Sortieren
- **Übergangstabelle:** eine Zeile pro Regel bzw. Matrix Zustand × Bandsymbol bei der TM
- **Simulation:** Schritt für Schritt vor und zurück, Abspielen mit einstellbarer
  Geschwindigkeit, Tabelle der Konfigurationen, Stack, Band bzw. Ausgabe neben dem Graphen
- **Reguläre Ausdrücke:** Ausdruck aus dem Automaten, Automat aus dem Ausdruck, Vergleich mit
  Gegenbeispiel
- **Prüfung:** Probleme in der Statusleiste, Klick springt zum betroffenen Element
- **Typwechsel:** Regeln werden beim Wechsel angepasst, NEA → DEA wahlweise mit Umwandlung
- **Export:** Graph, Alphabet, Übergangstabelle und Simulation als PDF, PNG, JPG oder CSV,
  helles oder dunkles Farbschema
- **Einstellungen:** Tastenkürzel, Alphabet-Voreinstellungen, Vorgaben für neue Automaten,
  Simulationsgrenzen
- **Hilfe** (F1): Theorie zu jedem Automatentyp, Dateiformat, Tastenkürzel

Beispiele zum Öffnen liegen in [beispiele/](beispiele/).

## Bedienung

| Aktion | Standard |
| ------ | -------- |
| Werkzeuge Auswählen / Zustand / Übergang / Löschen | **V** / **S** / **A** / **D** |
| Auswahl löschen | **Entf** |
| Rückgängig / Wiederholen | **Strg+Z** / **Strg+Y** |
| Neu / Öffnen / Speichern / Speichern unter | **Strg+N** / **Strg+O** / **Strg+S** / **Strg+Umschalt+S** |
| Exportieren | **Strg+E** |
| Ansicht zurücksetzen | **Strg+0** |
| Simulation: Schritt / zurück / Abspielen / Anfang / Ende | **→** / **←** / **Leertaste** / **Pos1** / **Ende** |
| Einstellungen / Hilfe | **Strg+,** / **F1** |

Alle Kürzel lassen sich in den Einstellungen ändern.

## Entwicklung

Voraussetzung: Node.js. Das Projekt nicht auf Google Drive/OneDrive legen, `node_modules`
lässt sich dort nicht zuverlässig installieren.

```bash
npm install
npm run dev
```

| Script | Zweck |
| ------ | ----- |
| `npm run dev` | Electron mit Hot Reload (Renderer zusätzlich unter http://localhost:5173) |
| `npm run typecheck` | TypeScript-Prüfung für main/preload und renderer |
| `npm test` | Unit-Tests (vitest) |
| `npm run build` | Typecheck + Produktions-Build nach `out/` |
| `npm run dist` | Windows-Installer (NSIS) für x64 und arm64 nach `dist/` |
| `npm run icons` | App-Icon aus `build/icon.svg` neu erzeugen |

## Aufbau

```
src/
├─ main/              Electron-Hauptprozess: Fenster, Menü, Datei-Dialoge, PDF-Druck
├─ preload/           window.api für den Renderer
├─ shared/            IPC-Typen, Tastenkürzel, Einstellungen (main + renderer)
└─ renderer/src/
   ├─ model/            Datenmodell (Zustände, Übergänge, Σ) und Dateiformat
   ├─ core/automaton/   Semantik je Typ: DEA, NEA, Kellerautomat, TM, Simulatoren, Prüfung
   ├─ core/algorithms/  Potenzmengenkonstruktion, Minimierung, Vervollständigen, Layout
   ├─ core/regex/       Reguläre Ausdrücke: Parser, Zustandselimination, Sprachvergleich
   ├─ export/           SVG-Aufbereitung, Tabellen, PNG/JPG/PDF
   ├─ store/            zustand-Stores: Dokument, Undo/Redo, Screens, Dialoge
   ├─ services/         Abläufe mit Dialogen: Datei, Export, Typwechsel
   ├─ screens/          Alphabet, Übergangstabelle, Simulation, Reguläre Ausdrücke
   └─ components/       Canvas, Simulation, Export, Panels, Toolbar, Einstellungen, Hilfe
```

Die fachliche Logik (Automaten, Algorithmen, Regex, Export) besteht aus reinen Funktionen ohne
React und ist direkt mit vitest getestet.
