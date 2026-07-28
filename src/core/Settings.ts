import { EventBus } from './EventBus'

export type QualityLevel = 'low' | 'medium' | 'high'
export type TextSpeed = 'slow' | 'normal' | 'fast' | 'instant'
export type MarkerMode = 'always' | 'proximity' | 'off'

export interface GameSettings {
  masterVolume: number // 0..1
  ambienceVolume: number // 0..1
  sfxVolume: number // 0..1
  muted: boolean
  textSpeed: TextSpeed
  lookSensitivity: number // 0.4..2.0
  invertLook: boolean
  quality: QualityLevel
  reducedMotion: boolean
  markerMode: MarkerMode
  uiScale: number // 0.85..1.3
}

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  ambienceVolume: 0.7,
  sfxVolume: 0.85,
  muted: false,
  textSpeed: 'normal',
  lookSensitivity: 1.0,
  invertLook: false,
  quality: 'high',
  reducedMotion: false,
  markerMode: 'proximity',
  uiScale: 1,
}

export const TEXT_SPEED_CPS: Record<TextSpeed, number> = {
  slow: 22,
  normal: 42,
  fast: 78,
  instant: Number.POSITIVE_INFINITY,
}

const STORAGE_KEY = 'kirisawa.settings.v1'

type SettingsEvents = {
  changed: { settings: GameSettings; key: keyof GameSettings }
}

export class SettingsStore {
  readonly events = new EventBus<SettingsEvents>()
  private data: GameSettings

  constructor() {
    this.data = { ...DEFAULT_SETTINGS, ...this.read() }
    // Respect the OS-level accessibility preference on first run.
    if (this.read().reducedMotion === undefined && typeof matchMedia === 'function') {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.data.reducedMotion = true
    }
    this.data = this.sanitize(this.data)
  }

  get(): Readonly<GameSettings> {
    return this.data
  }

  set<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    if (this.data[key] === value) return
    this.data = this.sanitize({ ...this.data, [key]: value })
    this.persist()
    this.events.emit('changed', { settings: this.data, key })
  }

  reset(): void {
    this.data = { ...DEFAULT_SETTINGS }
    this.persist()
    this.events.emit('changed', { settings: this.data, key: 'masterVolume' })
  }

  /** Effective gain for a bus, folding in master + mute. */
  gain(bus: 'ambience' | 'sfx'): number {
    if (this.data.muted) return 0
    const busVol = bus === 'ambience' ? this.data.ambienceVolume : this.data.sfxVolume
    return this.data.masterVolume * busVol
  }

  private sanitize(s: GameSettings): GameSettings {
    const clamp01 = (v: unknown, d: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d
    return {
      masterVolume: clamp01(s.masterVolume, DEFAULT_SETTINGS.masterVolume),
      ambienceVolume: clamp01(s.ambienceVolume, DEFAULT_SETTINGS.ambienceVolume),
      sfxVolume: clamp01(s.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      muted: !!s.muted,
      textSpeed: (['slow', 'normal', 'fast', 'instant'] as const).includes(s.textSpeed)
        ? s.textSpeed
        : 'normal',
      lookSensitivity:
        typeof s.lookSensitivity === 'number' && Number.isFinite(s.lookSensitivity)
          ? Math.max(0.4, Math.min(2, s.lookSensitivity))
          : 1,
      invertLook: !!s.invertLook,
      quality: (['low', 'medium', 'high'] as const).includes(s.quality) ? s.quality : 'high',
      reducedMotion: !!s.reducedMotion,
      markerMode: (['always', 'proximity', 'off'] as const).includes(s.markerMode)
        ? s.markerMode
        : 'proximity',
      uiScale:
        typeof s.uiScale === 'number' && Number.isFinite(s.uiScale)
          ? Math.max(0.85, Math.min(1.3, s.uiScale))
          : 1,
    }
  }

  private read(): Partial<GameSettings> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && parsed ? parsed : {}
    } catch {
      return {}
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data))
    } catch {
      /* private browsing / quota - settings simply do not persist */
    }
  }
}
