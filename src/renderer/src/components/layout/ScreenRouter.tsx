import { AppShell } from '@/components/layout/AppShell'
import { AlphabetScreen } from '@/screens/AlphabetScreen'
import { RegularExpressionScreen } from '@/screens/RegularExpressionScreen'
import { SimulationScreen } from '@/screens/SimulationScreen'
import { TransitionTableScreen } from '@/screens/TransitionTableScreen'
import { useScreenStore } from '@/store/screenStore'

export function ScreenRouter() {
  // Ein Typ ohne Regex-Ansicht setzt den Screen gleich auf den Grapheneditor (initScreenGuard)
  const screen = useScreenStore((s) => s.screen)
  switch (screen) {
  case 'simulation':
    return <SimulationScreen />
  case 'alphabet':
    return <AlphabetScreen />
  case 'transitionTable':
    return <TransitionTableScreen />
  case 'regex':
    return <RegularExpressionScreen />
  default:
    return <AppShell />
}
}