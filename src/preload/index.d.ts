import type { AutomatApi } from '../shared/ipc'

declare global {
  interface Window {
    /** Nur in Electron vorhanden – im reinen Browser (Vite-Dev-Server) `undefined`. */
    api?: AutomatApi
  }
}

export {}
