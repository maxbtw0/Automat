import { useDialogStore } from '@/store/dialogStore'

export function openHelp(): void {
  useDialogStore.getState().setHelpOpen(true)
}
