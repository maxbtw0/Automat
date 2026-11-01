import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import {
  findState,
  findTransition,
  acceptsByEmptyStack,
  stackSettings,
  usesStack,
  usesTape,
  type StateId,
  type StateNode,
  type TransitionEdge
} from '@/model/graph'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  groupSelection,
  isSelected,
  selectedIds,
  toggleSelected,
  useEditorStore
} from '@/store/editorStore'
import { useSettingsStore } from '@/store/settingsStore'
import { classNames, isEditableTarget } from '@/utils/dom'
import {
  clamp,
  boxCorners,
  elementsInPolygon,
  findStateAt,
  previewEdgePath,
  screenToWorld,
  transitionGeometry,
  worldToScreen,
  type EdgeGeometry,
  type Point
} from '@/utils/geometry'
import { isPanKey, panModifierHeld } from '@shared/navigationSettings'
import { ContextMenu, type ContextMenuEntry } from '@/components/common/ContextMenu'
import { formatLabelsInline, parseLabels } from '@/core/automaton/labels'
import { InlineEditor } from './InlineEditor'
import { StateNodeView } from './StateNodeView'
import { TransitionView } from './TransitionView'

const GRID_SIZE = 20
/** Ab dieser Mausbewegung (px) gilt ein Klick als Ziehen */
const DRAG_THRESHOLD = 3
/** Abstand (px) zwischen zwei Punkten des Lassos */
const LASSO_STEP = 4

type ContextMenuState =
  | { x: number; y: number; kind: 'state'; id: StateId }
  | { x: number; y: number; kind: 'transition'; id: string }
  | { x: number; y: number; kind: 'background'; world: Point }
  | { x: number; y: number; kind: 'group' }

interface CanvasProps {
  /** Nur ansehen: verschieben und zoomen ja, bearbeiten nein (z. B. in der Simulation) */
  readOnly?: boolean
}

export function Canvas({ readOnly = false }: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const doc = useEditorStore((s) => s.document)
  const stackAlphabet = doc.stack?.alphabet
  const tool = useEditorStore((s) => s.tool)
  const viewport = useEditorStore((s) => s.viewport)
  const selection = useEditorStore((s) => s.selection)
  const highlight = useEditorStore((s) => s.highlight)
  const inlineEdit = useEditorStore((s) => s.inlineEdit)

  const { panKey, panMiddleMouse } = useSettingsStore((s) => s.settings.navigation)
  /** Verschiebe-Taste gedrückt (aus keydown/keyup – die Leertaste steht in keinem Mausereignis) */
  const [panKeyDown, setPanKeyDown] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [connectPreview, setConnectPreview] = useState<{ fromId: StateId; pointer: Point } | null>(
    null
  )
  /** Auswahlrechteck bzw. Lasso als Vieleck in Canvas-Koordinaten (Pixel) */
  const [area, setArea] = useState<Point[] | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const { states, transitions } = doc.graph

  const geometries = useMemo(() => {
    const map = new Map<string, EdgeGeometry>()
    for (const t of doc.graph.transitions) {
      const g = transitionGeometry(t, doc.graph)
      if (g) map.set(t.id, g)
    }
    return map
  }, [doc.graph])

  const activeStates = useMemo(() => new Set(highlight?.activeStateIds), [highlight])
  const activeTransitions = useMemo(() => new Set(highlight?.usedTransitionIds), [highlight])
  const pulse = highlight?.pulse
  /**
   * Abdimmen per CSS-Animation: Ein neuer `key` hängt das Element neu ein, dadurch startet
   * die Animation bei jedem Schritt von vorn – auch wenn das Element dreimal hintereinander pulst.
   */
  const pulseOf = (id: string, ids: string[] | undefined) =>
    pulse && ids?.includes(id)
      ? { key: `${id}:${pulse.token}`, pulseMs: pulse.durationMs }
      : { key: id, pulseMs: undefined }

  // ---------- Koordinaten ----------

  const containerPoint = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect()
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
  }

  const clientToWorld = (clientX: number, clientY: number): Point =>
    screenToWorld(useEditorStore.getState().viewport, containerPoint(clientX, clientY))

  // ---------- Zoom (Mausrad) ----------

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const { viewport: vp, setViewport } = useEditorStore.getState()
      const rect = svg.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const zoom = clamp(vp.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM)
      const k = zoom / vp.zoom
      setViewport({ zoom, x: px - (px - vp.x) * k, y: py - (py - vp.y) * k })
    }
    // passive: false, damit preventDefault das Scrollen/Seitenzoom verhindert
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  // ---------- Zwei Finger = zoomen und verschieben ----------

  /** Bricht die laufende Zieh-Interaktion ab (Zustand ziehen, verbinden, verschieben) */
  const abortInteraction = useRef<(() => void) | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const touches = new Map<number, Point>()
    let pinch: { distance: number; world: Point; zoom: number } | null = null

    const containerMid = (): Point => {
      const [a, b] = [...touches.values()]
      const rect = svg.getBoundingClientRect()
      return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }
    }
    const distance = (): number => {
      const [a, b] = [...touches.values()]
      return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
    }

    const onDown = (e: globalThis.PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size < 2) return
      // Weitere Finger lösen keine Werkzeug-Aktion aus
      e.stopPropagation()
      if (pinch || touches.size > 2) return
      abortInteraction.current?.()
      const vp = useEditorStore.getState().viewport
      const mid = containerMid()
      pinch = {
        distance: distance(),
        world: screenToWorld(vp, mid),
        zoom: vp.zoom
      }
    }
    const onMove = (e: globalThis.PointerEvent): void => {
      if (!touches.has(e.pointerId)) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!pinch || touches.size !== 2) return
      const zoom = clamp((pinch.zoom * distance()) / pinch.distance, MIN_ZOOM, MAX_ZOOM)
      const mid = containerMid()
      useEditorStore.getState().setViewport({
        zoom,
        x: mid.x - pinch.world.x * zoom,
        y: mid.y - pinch.world.y * zoom
      })
    }
    const onUp = (e: globalThis.PointerEvent): void => {
      if (!touches.delete(e.pointerId)) return
      if (touches.size < 2) pinch = null
    }

    // Capture-Phase: läuft vor den React-Handlern, damit der zweite Finger nichts auswählt
    svg.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      svg.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // ---------- Verschiebe-Taste (Einstellungen, Standard Strg) ----------

  useEffect(() => {
    // Im Nur-Lesen-Modus verschiebt schon das normale Ziehen – die Taste bleibt frei.
    if (readOnly) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isPanKey(panKey, e) || isEditableTarget(e.target)) return
      // Leertaste scrollt sonst, Alt öffnet das Menü
      if (panKey !== 'Ctrl') e.preventDefault()
      setPanKeyDown(true)
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (!isPanKey(panKey, e)) return
      if (panKey === 'Alt') e.preventDefault()
      setPanKeyDown(false)
    }
    // Fensterwechsel mit gedrückter Taste: das keyup kommt nie an
    const onBlur = (): void => setPanKeyDown(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      setPanKeyDown(false)
    }
  }, [readOnly, panKey])

  const panHeld = (e: { ctrlKey: boolean; altKey: boolean; metaKey: boolean }): boolean =>
    panKeyDown || panModifierHeld(panKey, e)

  // ---------- Zieh-Interaktionen (auf window, damit sie auch außerhalb des Canvas weiterlaufen) ----------

  /**
   * Verfolgt genau einen Zeiger (Maus, Stift oder Finger). Abbruch – durch `pointercancel` oder
   * eine Zwei-Finger-Geste – ruft `onAbort` statt `onUp`.
   */
  const trackPointer = (
    e: PointerEvent,
    onMove: (e: globalThis.PointerEvent) => void,
    onUp?: (e: globalThis.PointerEvent) => void,
    onAbort?: () => void
  ): void => {
    const { pointerId } = e
    const move = (ev: globalThis.PointerEvent): void => {
      if (ev.pointerId === pointerId) onMove(ev)
    }
    const stop = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      abortInteraction.current = null
    }
    const up = (ev: globalThis.PointerEvent): void => {
      if (ev.pointerId !== pointerId) return
      stop()
      onUp?.(ev)
    }
    const cancel = (ev: globalThis.PointerEvent): void => {
      if (ev.pointerId === pointerId) abort()
    }
    const abort = (): void => {
      stop()
      onAbort?.()
    }
    abortInteraction.current?.()
    abortInteraction.current = abort
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const startPan = (e: PointerEvent): void => {
    const origin = useEditorStore.getState().viewport
    const startX = e.clientX
    const startY = e.clientY
    setIsPanning(true)
    trackPointer(
      e,
      (ev) => {
        const store = useEditorStore.getState()
        store.setViewport({
          ...store.viewport,
          x: origin.x + ev.clientX - startX,
          y: origin.y + ev.clientY - startY
        })
      },
      () => setIsPanning(false),
      () => setIsPanning(false)
    )
  }

  /** Verschiebt die Zustände `ids` gemeinsam; `onClick` = losgelassen, ohne zu ziehen. */
  const startDrag = (e: PointerEvent, ids: StateId[], onClick?: () => void): void => {
    const pointer = clientToWorld(e.clientX, e.clientY)
    const origins = useEditorStore
      .getState()
      .document.graph.states.filter((s) => ids.includes(s.id))
    const startX = e.clientX
    const startY = e.clientY
    let moved = false
    trackPointer(
      e,
      (ev) => {
        const store = useEditorStore.getState()
        if (!moved) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return
          moved = true
          store.snapshot()
        }
        const p = clientToWorld(ev.clientX, ev.clientY)
        const dx = p.x - pointer.x
        const dy = p.y - pointer.y
        store.moveStatesLive(new Map(origins.map((s) => [s.id, { x: s.x + dx, y: s.y + dy }])))
      },
      () => {
        if (!moved) onClick?.()
      }
    )
  }

  /**
   * Rechteck (Auswahl-Werkzeug) oder freie Form (Lasso) aufziehen; mit Umschalt kommt der
   * Inhalt zur bisherigen Auswahl dazu.
   */
  const startAreaSelect = (e: PointerEvent, shape: 'box' | 'free'): void => {
    const store = useEditorStore.getState()
    const additive = e.shiftKey
    const base = additive ? selectedIds(store.selection) : { stateIds: [], transitionIds: [] }
    if (!additive) store.select(null)
    const start = containerPoint(e.clientX, e.clientY)
    let points = [start]
    setArea(points)
    trackPointer(
      e,
      (ev) => {
        const p = containerPoint(ev.clientX, ev.clientY)
        if (shape === 'box') {
          points = boxCorners(start, p)
        } else {
          const last = points[points.length - 1]
          if (Math.hypot(p.x - last.x, p.y - last.y) < LASSO_STEP) return
          points = [...points, p]
        }
        setArea(points)
      },
      () => {
        setArea(null)
        const { document, viewport: vp, select } = useEditorStore.getState()
        const found = elementsInPolygon(
          document.graph,
          points.map((p) => screenToWorld(vp, p))
        )
        const union = (x: string[], y: string[]): string[] => [...new Set([...x, ...y])]
        select(
          groupSelection(
            union(base.stateIds, found.stateIds),
            union(base.transitionIds, found.transitionIds)
          )
        )
      },
      () => setArea(null)
    )
  }

  const startConnect = (e: PointerEvent, from: StateNode): void => {
    setConnectPreview({ fromId: from.id, pointer: clientToWorld(e.clientX, e.clientY) })
    trackPointer(
      e,
      (ev) => setConnectPreview({ fromId: from.id, pointer: clientToWorld(ev.clientX, ev.clientY) }),
      (ev) => {
        setConnectPreview(null)
        const store = useEditorStore.getState()
        const target = findStateAt(store.document.graph.states, clientToWorld(ev.clientX, ev.clientY))
        if (!target) return
        const existing = store.document.graph.transitions.find(
          (t) => t.from === from.id && t.to === target.id
        )
        const id = store.addTransition(from.id, target.id)
        store.select({ kind: 'transition', id })
        // Übergang mit Regeln gibt es schon → leeres Feld, die Eingabe kommt als neue Regel dazu
        store.setInlineEdit({ kind: 'transition', id, append: !!existing?.labels.length })
      },
      () => setConnectPreview(null)
    )
  }

  // ---------- Hintergrund ----------

  const handleBackgroundPointerDown = (e: PointerEvent<SVGSVGElement>): void => {
    setContextMenu(null)
    if ((e.button === 1 && panMiddleMouse) || (e.button === 0 && panHeld(e))) {
      e.preventDefault()
      startPan(e)
      return
    }
    if (e.button !== 0) return
    if (readOnly) {
      startPan(e)
      return
    }

    const store = useEditorStore.getState()
    switch (tool) {
      case 'state': {
        // Erst beim Loslassen anlegen: Zwei Finger zum Zoomen sollen keinen Zustand erzeugen
        const p = clientToWorld(e.clientX, e.clientY)
        trackPointer(e, () => {}, () => {
          const id = store.addState(p.x, p.y)
          store.select({ kind: 'state', id })
        })
        break
      }
      case 'select':
        startAreaSelect(e, 'box')
        break
      case 'lasso':
        startAreaSelect(e, 'free')
        break
      default:
        store.select(null)
    }
  }

  const handleBackgroundDoubleClick = (e: MouseEvent<SVGSVGElement>): void => {
    if (readOnly || tool !== 'select') return
    const store = useEditorStore.getState()
    const p = clientToWorld(e.clientX, e.clientY)
    const id = store.addState(p.x, p.y)
    store.select({ kind: 'state', id })
  }

  const handleBackgroundContextMenu = (e: MouseEvent<SVGSVGElement>): void => {
    e.preventDefault()
    if (readOnly) return
    const p = containerPoint(e.clientX, e.clientY)
    setContextMenu({ ...p, kind: 'background', world: clientToWorld(e.clientX, e.clientY) })
  }

  // ---------- Zustände ----------

  const handleStatePointerDown = (e: PointerEvent<SVGGElement>, state: StateNode): void => {
    // Mittelklick/Verschiebe-Taste an den Hintergrund durchreichen → Ansicht verschieben
    if (readOnly || e.button !== 0 || panHeld(e)) return
    e.stopPropagation()
    setContextMenu(null)

    const store = useEditorStore.getState()
    switch (tool) {
      case 'delete':
        store.deleteState(state.id)
        break
      case 'transition':
        startConnect(e, state)
        break
      default: {
        if (e.shiftKey) {
          store.select(toggleSelected(store.selection, 'state', state.id))
          break
        }
        const single = (): void => store.select({ kind: 'state', id: state.id })
        // Teil einer Gruppe → alle zusammen ziehen; nur angeklickt → nur dieser Zustand
        if (store.selection?.kind === 'group' && isSelected(store.selection, 'state', state.id)) {
          startDrag(e, store.selection.stateIds, single)
        } else {
          single()
          startDrag(e, [state.id])
        }
      }
    }
  }

  const handleStateDoubleClick = (e: MouseEvent<SVGGElement>, state: StateNode): void => {
    e.stopPropagation()
    if (readOnly || tool !== 'select') return
    useEditorStore.getState().setInlineEdit({ kind: 'state', id: state.id })
  }

  const handleStateContextMenu = (e: MouseEvent<SVGGElement>, state: StateNode): void => {
    e.preventDefault()
    e.stopPropagation()
    if (readOnly) return
    const store = useEditorStore.getState()
    if (store.selection?.kind === 'group' && isSelected(store.selection, 'state', state.id)) {
      setContextMenu({ ...containerPoint(e.clientX, e.clientY), kind: 'group' })
      return
    }
    store.select({ kind: 'state', id: state.id })
    setContextMenu({ ...containerPoint(e.clientX, e.clientY), kind: 'state', id: state.id })
  }

  // ---------- Übergänge ----------

  const handleTransitionPointerDown = (e: PointerEvent<SVGGElement>, t: TransitionEdge): void => {
    if (readOnly || e.button !== 0 || panHeld(e)) return
    e.stopPropagation()
    setContextMenu(null)
    const store = useEditorStore.getState()
    if (tool === 'delete') store.deleteTransition(t.id)
    else if (e.shiftKey) store.select(toggleSelected(store.selection, 'transition', t.id))
    else store.select({ kind: 'transition', id: t.id })
  }

  const handleTransitionDoubleClick = (e: MouseEvent<SVGGElement>, t: TransitionEdge): void => {
    e.stopPropagation()
    if (readOnly) return
    useEditorStore.getState().setInlineEdit({ kind: 'transition', id: t.id })
  }

  const handleTransitionContextMenu = (e: MouseEvent<SVGGElement>, t: TransitionEdge): void => {
    e.preventDefault()
    e.stopPropagation()
    if (readOnly) return
    const store = useEditorStore.getState()
    if (store.selection?.kind === 'group' && isSelected(store.selection, 'transition', t.id)) {
      setContextMenu({ ...containerPoint(e.clientX, e.clientY), kind: 'group' })
      return
    }
    store.select({ kind: 'transition', id: t.id })
    setContextMenu({ ...containerPoint(e.clientX, e.clientY), kind: 'transition', id: t.id })
  }

  // ---------- Kontextmenü-Einträge ----------

  const contextMenuEntries = (menu: ContextMenuState): ContextMenuEntry[] => {
    const store = useEditorStore.getState()
    switch (menu.kind) {
      case 'state': {
        const state = findState(doc.graph, menu.id)
        if (!state) return []
        return [
          { label: 'Startzustand', checked: state.isStart, onSelect: () => store.setStartState(state.id) },
          { label: 'Endzustand', checked: state.isFinal, onSelect: () => store.toggleFinal(state.id) },
          'separator',
          { label: 'Umbenennen', onSelect: () => store.setInlineEdit({ kind: 'state', id: state.id }) },
          { label: 'Löschen', danger: true, onSelect: () => store.deleteState(state.id) }
        ]
      }
      case 'transition':
        return [
          {
            label: 'Symbole bearbeiten',
            onSelect: () => store.setInlineEdit({ kind: 'transition', id: menu.id })
          },
          { label: 'Löschen', danger: true, onSelect: () => store.deleteTransition(menu.id) }
        ]
      case 'group':
        return [{ label: 'Löschen', danger: true, onSelect: store.deleteSelection }]
      case 'background':
        return [
          {
            label: 'Zustand hier einfügen',
            onSelect: () => {
              const id = store.addState(menu.world.x, menu.world.y)
              store.select({ kind: 'state', id })
            }
          },
          { label: 'Ansicht zurücksetzen', onSelect: store.resetViewport }
        ]
    }
  }

  // ---------- Inline-Editor ----------

  const renderInlineEditor = () => {
    if (!inlineEdit || readOnly) return null
    const store = useEditorStore.getState()
    const close = (): void => store.setInlineEdit(null)

    if (inlineEdit.kind === 'state') {
      const state = findState(doc.graph, inlineEdit.id)
      if (!state) return null
      const pos = worldToScreen(viewport, state)
      return (
        <InlineEditor
          key={state.id}
          x={pos.x}
          y={pos.y}
          initialValue={state.label}
          placeholder="Bezeichnung"
          onCancel={close}
          onCommit={(value) => {
            const label = value.trim()
            if (label && label !== state.label) store.updateState(state.id, { label })
            close()
          }}
        />
      )
    }

    const transition = findTransition(doc.graph, inlineEdit.id)
    const geometry = transition && geometries.get(transition.id)
    if (!transition || !geometry) return null
    const pos = worldToScreen(viewport, geometry.label)
    const { append = false } = inlineEdit
    // Push-Wörter mit Γ formatieren, damit parseLabels dieselben Symbole zurückliest
    const gamma = stackSettings(doc).alphabet
    return (
      <InlineEditor
        key={append ? `${transition.id}:append` : transition.id}
        x={pos.x}
        y={pos.y}
        initialValue={append ? '' : formatLabelsInline(transition.labels, gamma)}
        placeholder={
          usesTape(doc.type)
            ? 'a A R; # # L'
            : usesStack(doc.type)
              ? 'a, # → A#; b, A → ε'
              : 'Symbole, z. B. a, b'
        }
        wide={usesStack(doc.type) || usesTape(doc.type)}
        onCancel={close}
        onCommit={(value) => {
          const result = parseLabels(value, doc)
          if ('error' in result) {
            store.setStatus({ kind: 'error', text: result.error })
          } else {
            store.setStatus(null)
            if (append) {
              store.addTransitionLabels(transition.id, result.labels)
            } else if (
              formatLabelsInline(result.labels, gamma) !==
              formatLabelsInline(transition.labels, gamma)
            ) {
              store.updateTransition(transition.id, { labels: result.labels })
            }
          }
          close()
        }}
      />
    )
  }

  // ---------- Rendering ----------

  const previewFrom = connectPreview && findState(doc.graph, connectPreview.fromId)
  const previewPath = previewFrom && previewEdgePath(previewFrom, connectPreview.pointer)
  const gridStep = GRID_SIZE * viewport.zoom

  return (
    <>
      <svg
        ref={svgRef}
        className={classNames(
          'canvas',
          readOnly ? 'is-read-only' : `tool-${tool}`,
          panKeyDown && 'is-pan-key',
          isPanning && 'is-panning'
        )}
        onPointerDown={handleBackgroundPointerDown}
        onDoubleClick={handleBackgroundDoubleClick}
        onContextMenu={handleBackgroundContextMenu}
      >
        <defs>
          <pattern
            id="grid"
            width={gridStep}
            height={gridStep}
            x={viewport.x}
            y={viewport.y}
            patternUnits="userSpaceOnUse"
          >
            <circle className="grid-dot" cx={1} cy={1} r={1} />
          </pattern>
          {(['arrow', 'arrow-start', 'arrow-selected', 'arrow-active'] as const).map((id) => (
            <marker
              key={id}
              id={id}
              viewBox="0 0 10 10"
              refX={10}
              refY={5}
              markerWidth={11}
              markerHeight={11}
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                className={classNames(
                  'arrow-head',
                  id === 'arrow-start' && 'is-start',
                  id === 'arrow-selected' && 'is-selected',
                  id === 'arrow-active' && 'is-active'
                )}
                d="M 0 0 L 10 5 L 0 10 z"
              />
            </marker>
          ))}
        </defs>

        <rect width="100%" height="100%" fill="url(#grid)" />

        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          {transitions.map((t) => {
            const geometry = geometries.get(t.id)
            if (!geometry) return null
            const { key, pulseMs } = pulseOf(t.id, pulse?.transitionIds)
            return (
              <TransitionView
                key={key}
                pulseMs={pulseMs}
                stackAlphabet={stackAlphabet}
                transition={t}
                geometry={geometry}
                selected={!readOnly && isSelected(selection, 'transition', t.id)}
                active={activeTransitions.has(t.id)}
                onPointerDown={handleTransitionPointerDown}
                onDoubleClick={handleTransitionDoubleClick}
                onContextMenu={handleTransitionContextMenu}
              />
            )
          })}

          {previewPath && (
            <path className="connect-preview" d={previewPath} markerEnd="url(#arrow-selected)" />
          )}

          {states.map((s) => (
            <StateNodeView
              key={pulseOf(s.id, pulse?.stateIds).key}
              pulseMs={pulseOf(s.id, pulse?.stateIds).pulseMs}
              state={s}
              selected={!readOnly && isSelected(selection, 'state', s.id)}
              active={activeStates.has(s.id)}
              outcome={highlight?.outcome}
              acceptAny={acceptsByEmptyStack(doc)}
              onPointerDown={handleStatePointerDown}
              onDoubleClick={handleStateDoubleClick}
              onContextMenu={handleStateContextMenu}
            />
          ))}
        </g>

        {area && (
          <path
            className="selection-area"
            d={`M ${area.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`}
          />
        )}
      </svg>

      {renderInlineEditor()}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entries={contextMenuEntries(contextMenu)}
          onClose={closeContextMenu}
        />
      )}
    </>
  )
}
