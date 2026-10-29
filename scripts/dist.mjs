// Baut je einen Windows-Installer für x64 und arm64 (Aufruf über npm run dist, nach dem Build).
import { spawnSync } from 'node:child_process'

function electronBuilder(args, env = {}) {
  const result = spawnSync('npx', ['electron-builder', ...args], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env }
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

electronBuilder(['--win', '--x64'])
// 7-Zip packt ARM64-Programme sonst mit seinem ARM64-Filter. Den kennt der Entpacker im
// NSIS-Installer nicht: Automat.exe und die DLLs fehlen dann ohne Fehlermeldung.
electronBuilder(['--win', '--arm64'], { ELECTRON_BUILDER_7Z_FILTER: 'BCJ' })
