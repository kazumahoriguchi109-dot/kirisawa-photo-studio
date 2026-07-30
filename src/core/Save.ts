import { SAVE_VERSION, type GameState, type SaveData } from '../state/GameState'

const clampSlot = (i: number): number => Math.min(SLOT_COUNT - 1, Math.max(0, Math.trunc(i) || 0))

/** The one-slot key this game shipped with. Migrated into slot 0 on first run. */
const LEGACY_KEY = 'kirisawa.save.v1'
const SLOT_KEY = (i: number) => `kirisawa.save.v1.s${i}`
const ACTIVE_KEY = 'kirisawa.active.v1'
const META_KEY = 'kirisawa.meta.v1'

/** Three slots, so a player can keep a run while hunting a different ending. */
export const SLOT_COUNT = 3

export interface SaveMeta {
  slot: number
  exists: boolean
  savedAt: number
  playtimeMs: number
  areaLabel: string
  solvedCount: number
  endingsSeen: string[]
  endingId: string | null
}

/**
 * Three save slots with a persistent "endings seen" record that survives a
 * progress wipe, so the ending gallery is not punished by restarting.
 *
 * Autosave writes to whichever slot the run was started or loaded in, so a
 * player who continues slot 2 cannot quietly overwrite slot 1.
 */
export class SaveManager {
  private lastWrite = 0
  private active = 0

  constructor(private readonly state: GameState) {
    this.migrateLegacy()
    this.active = this.readActive()
  }

  activeSlot(): number {
    return this.active
  }

  setActiveSlot(i: number): void {
    this.active = clampSlot(i)
    try {
      localStorage.setItem(ACTIVE_KEY, String(this.active))
    } catch {
      /* ignore */
    }
  }

  hasSave(slot = this.active): boolean {
    return this.readRaw(clampSlot(slot)) !== null
  }

  hasAnySave(): boolean {
    for (let i = 0; i < SLOT_COUNT; i++) if (this.hasSave(i)) return true
    return false
  }

  /** The most recently written slot, so 「つづきから」 can offer the obvious one. */
  latestSlot(): number | null {
    let best: number | null = null
    let bestAt = -1
    for (let i = 0; i < SLOT_COUNT; i++) {
      const raw = this.readRaw(i)
      if (raw && raw.savedAt > bestAt) {
        bestAt = raw.savedAt
        best = i
      }
    }
    return best
  }

  meta(areaLabelFor: (nodeId: string) => string, slot = this.active): SaveMeta {
    const i = clampSlot(slot)
    const raw = this.readRaw(i)
    const endings = this.readEndings()
    if (!raw) {
      return {
        slot: i,
        exists: false,
        savedAt: 0,
        playtimeMs: 0,
        areaLabel: '',
        solvedCount: 0,
        endingsSeen: endings,
        endingId: null,
      }
    }
    return {
      slot: i,
      exists: true,
      savedAt: raw.savedAt,
      playtimeMs: raw.playtimeMs,
      areaLabel: areaLabelFor(raw.nodeId),
      solvedCount: Object.values(raw.puzzles).filter((p) => p.solved).length,
      endingsSeen: endings,
      endingId: raw.endingId ?? null,
    }
  }

  metaAll(areaLabelFor: (nodeId: string) => string): SaveMeta[] {
    return Array.from({ length: SLOT_COUNT }, (_, i) => this.meta(areaLabelFor, i))
  }

  /** Write immediately. Called on meaningful beats (puzzle solved, item taken, area change). */
  save(slot = this.active): boolean {
    try {
      const i = clampSlot(slot)
      this.state.stampSaveTime()
      const data = this.state.snapshot()
      localStorage.setItem(SLOT_KEY(i), JSON.stringify(data))
      this.writeEndings(data.endingsSeen)
      this.lastWrite = performance.now()
      return true
    } catch (err) {
      console.warn('[Save] could not persist', err)
      return false
    }
  }

  /** Throttled variant for high-frequency callers (dial turning, look changes). */
  saveThrottled(minIntervalMs = 4000): void {
    if (performance.now() - this.lastWrite < minIntervalMs) return
    this.save()
  }

  /** Load a slot and make it the one autosave writes to from here on. */
  load(slot = this.active): boolean {
    const i = clampSlot(slot)
    const raw = this.readRaw(i)
    if (!raw) return false
    this.state.hydrate(raw)
    this.setActiveSlot(i)
    return true
  }

  /** Wipe one slot's run but keep the ending gallery. */
  clearProgress(slot = this.active): void {
    const i = clampSlot(slot)
    try {
      localStorage.removeItem(SLOT_KEY(i))
    } catch {
      /* ignore */
    }
    this.state.resetProgress(true)
  }

  /** Wipe absolutely everything this game stored. */
  clearAll(): void {
    try {
      for (let i = 0; i < SLOT_COUNT; i++) localStorage.removeItem(SLOT_KEY(i))
      localStorage.removeItem(LEGACY_KEY)
      localStorage.removeItem(ACTIVE_KEY)
      localStorage.removeItem(META_KEY)
    } catch {
      /* ignore */
    }
    this.state.resetProgress(false)
  }

  seenEndings(): string[] {
    return this.readEndings()
  }

  /**
   * A save written before slots existed becomes slot 0, so updating the game
   * does not read as having lost the run.
   */
  private migrateLegacy(): void {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (!legacy) return
      if (!localStorage.getItem(SLOT_KEY(0))) localStorage.setItem(SLOT_KEY(0), legacy)
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      /* ignore */
    }
  }

  private readActive(): number {
    try {
      const raw = localStorage.getItem(ACTIVE_KEY)
      const n = raw === null ? NaN : Number(raw)
      return Number.isFinite(n) ? clampSlot(n) : 0
    } catch {
      return 0
    }
  }

  private readRaw(slot: number): SaveData | null {
    try {
      const key = SLOT_KEY(clampSlot(slot))
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as SaveData
      if (!parsed || typeof parsed !== 'object') return null
      if (parsed.version !== SAVE_VERSION) {
        // Forward compatibility is not worth faking: drop stale saves cleanly
        // rather than resuming into a broken world.
        localStorage.removeItem(key)
        return null
      }
      if (!parsed.nodeId || !Array.isArray(parsed.inventory)) return null
      // Defensive fill-in for fields added late.
      parsed.clues ??= []
      parsed.readDocuments ??= []
      parsed.endingsSeen ??= []
      parsed.counters ??= {}
      parsed.flags ??= {}
      parsed.puzzles ??= {}
      return parsed
    } catch {
      return null
    }
  }

  private readEndings(): string[] {
    try {
      const raw = localStorage.getItem(META_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed?.endingsSeen) ? parsed.endingsSeen : []
    } catch {
      return []
    }
  }

  private writeEndings(fromSave: readonly string[]): void {
    try {
      const merged = Array.from(new Set([...this.readEndings(), ...fromSave]))
      localStorage.setItem(META_KEY, JSON.stringify({ endingsSeen: merged }))
    } catch {
      /* ignore */
    }
  }
}
