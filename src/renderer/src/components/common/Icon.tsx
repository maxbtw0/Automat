const PATHS = {
  new: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M14 3v6h6 M12 12v6 M9 15h6',
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  save: 'M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M7 3v5h8V3 M7 21v-7h10v7',
  export: 'M12 15V3 M7 8l5-5 5 5 M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4',
  undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  select: 'M5 3l14 7-6 2-2 6z',
  lasso: 'M4 7V4h3 M10.5 4h3 M17 4h3v3 M20 10.5v3 M20 17v3h-3 M13.5 20h-3 M7 20H4v-3 M4 13.5v-3',
  state: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z',
  transition: 'M5 19L19 5 M9 5h10v10',
  delete: 'M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14',
  plus: 'M12 5v14 M5 12h14',
  preset: 'M8 20V4h5a4 4 0 0 1 0 8H8',
  sort: 'M3 16l4 4 4-4 M7 20V4 M21 8l-4-4-4 4 M17 4v16',
  play: 'M7 4l13 8-13 8z',
  step: 'M5 4l10 8-10 8z M19 4v16',
  stepBack: 'M19 4L9 12l10 8z M5 4v16',
  pause: 'M8 5v14 M16 5v14',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  runAll: 'M3 5l8 7-8 7z M13 5l8 7-8 7z',
  reset: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5',
  check: 'M4 12l5 5L20 6',
  focus: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  alphabeteditor: 'M7 10v5 M7 12.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0 M10 6v9 M10 12.5a2.5 2.5 0 1 1 5 0a2.5 2.5 0 1 1-5 0 M21.8 10.7a2.5 2.5 0 1 0 0 3.6',
  grapheditor: 'M7.5 6a2.5 2.5 0 1 0-5 0a2.5 2.5 0 1 0 5 0 M21.5 6a2.5 2.5 0 1 0-5 0a2.5 2.5 0 1 0 5 0 M14.5 18a2.5 2.5 0 1 0-5 0a2.5 2.5 0 1 0 5 0 M7.5 6h9 M6.3 8.2l4.4 7.6 M17.7 8.2l-4.4 7.6',
  transitiontableeditor: 'M7 9.5v5 M7 12a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0 M9.5 12h5 M12.5 10l2 2-2 2 M17 6.5v8 M17 12a2.5 2.5 0 1 1 5 0a2.5 2.5 0 1 1-5 0',
  close: 'M6 6l12 12 M18 6L6 18',
  moveUp: 'M6 15l6-6 6 6',
  moveDown: 'M6 9l6 6 6-6',
  regularexpressionseditor: 'M5 17h2v2H5z M17 3v10 M12.7 5.5l8.6 5 M21.3 5.5l-8.6 5',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
