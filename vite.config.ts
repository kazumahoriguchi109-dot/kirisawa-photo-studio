import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// The version shown on the title screen comes from the manifest, so the two
// cannot drift. It used to be the string 'v1.0' typed into the UI.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  base: './',
  server: {
    port: 5178,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
})
