import { AppShell } from '@/components/layout/AppShell'
import { getAutomatonDefinition } from '@/core/automaton/registry'
import { AlphabetScreen } from '@/screens/AlphabetScreen'
import { RegularExpressionScreen } from '@/screens/RegularExpressionScreen'
import { SimulationScreen } from '@/screens/SimulationScreen'
import { TransitionTableScreen } from '@/screens/TransitionTableScreen'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'

export function ScreenRouter() {
  const screen = useScreenStore((s) => s.screen)
  // Reguläre Ausdrücke gibt es nur für endliche Automaten – sonst Grapheneditor
  const hasRegex = useEditorStore((s) => getAutomatonDefinition(s.document.type).regex)
  switch (screen) {
  case 'simulation':
    return <SimulationScreen />
  case 'alphabet':
    return <AlphabetScreen />
  case 'transitionTable':
    return <TransitionTableScreen />
  case 'regex':
    return hasRegex ? <RegularExpressionScreen /> : <AppShell />
  default:
    return <AppShell />
}
}