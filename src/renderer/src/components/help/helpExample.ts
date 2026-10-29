/**
 * Beispieldatei für die Hilfe: DEA über X = {a, b}, der Wörter mit gerader Anzahl a akzeptiert.
 * Der Test öffnet sie wie eine echte Datei – so bleibt die Hilfe zum Dateiformat richtig.
 */
export const EXAMPLE_FILE = `{
  "format": "automat",
  "version": 2,
  "document": {
    "type": "DFA",
    "alphabet": ["a", "b"],
    "graph": {
      "states": [
        { "id": "s0", "label": "z0", "x": 200, "y": 200, "isStart": true, "isFinal": true },
        { "id": "s1", "label": "z1", "x": 400, "y": 200, "isStart": false, "isFinal": false }
      ],
      "transitions": [
        { "id": "t0", "from": "s0", "to": "s1", "labels": [{ "read": "a" }] },
        { "id": "t1", "from": "s1", "to": "s0", "labels": [{ "read": "a" }] },
        { "id": "t2", "from": "s0", "to": "s0", "labels": [{ "read": "b" }] },
        { "id": "t3", "from": "s1", "to": "s1", "labels": [{ "read": "b" }] }
      ]
    }
  }
}`
