/// <reference types="vite/client" />

/**
 * The package version, substituted at build time by `define` in vite.config.ts.
 * The title screen reads it from here so the number on screen cannot drift away
 * from the manifest the way a hand-typed 'v1.0' did.
 */
declare const __APP_VERSION__: string
