import { SAVE_VERSION, type GameState, type SaveData } from '../state/GameState'

const SLOT_KEY = 'kirisawa.save.v1'
const META_KEY = 'kirisawa.meta.v1'

export interface SaveMeta {
  exists: boolean
  savedAt: number
  playtimeMs: number
  areaLabel: string
  solvedCount: number
  endingsSeen: string[]
}

/**
 * Single-slot autosave with a persistent "endings seen" record that survives
 * a progress wipe, so the ending gallery is not punished by restarting.
 */
export class SaveManager {
  private lastWrite = 0

  constructor(private readonly state: GameState) {}

  hasSave(): boolean {
    return this.readRaw() !== null
  }

  meta(areaLabelFor: (nodeId: string) => string): SaveMeta {
    const raw = this.readRaw()
    const endings = this.readEndings()
    if (!raw) {
      return {
        exists: false,
        savedAt: 0,
        playtimeMs: 0,
        areaLabel: '',
        solvedCount: 0,
        endingsSeen: endings,
      }
    }
    return {
      exists: true,
      savedAt: raw.savedAt,
      playtimeMs: raw.playtimeMs,
      areaLabel: areaLabelFor(raw.nodeId),
      solvedCount: Object.values(raw.puzzles).filter((p) => p.solved).length,
      endingsSeen: endings,
    }
  }

  /** Write immediately. Called on meaningful beats (puzzle solved, item taken, area change). */
  save(): boolean {
    try {
      this.state.stampSaveTime()
      const data = this.state.snapshot()
      localStorage.setItem(SLOT_KEY, JSON.stringify(data))
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

  load(): boolean {
    const raw = this.readRaw()
    if (!raw) return false
    this.state.hydrate(raw)
    return true
  }

  /** Wipe the run but keep the ending gallery. */
  clearProgress(): void {
    try {
      localStorage.removeItem(SLOT_KEY)
    } catch {
      /* ignore */
    }
    this.state.resetProgress(true)
  }

  /** Wipe absolutely everything this game stored. */
  clearAll(): void {
    try {
      localStorage.removeItem(SLOT_KEY)
      localStorage.removeItem(META_KEY)
    } catch {
      /* ignore */
    }
    this.state.resetProgress(false)
  }

  seenEndings(): string[] {
    return this.readEndings()
  }

  private readRaw(): SaveData | null {
    try {
      const raw = localStorage.getItem(SLOT_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as SaveData
      if (!parsed || typeof parsed !== 'object') return null
      if (parsed.version !== SAVE_VERSION) {
        // Forward compatibility is not worth faking: drop stale saves cleanly
        // rather than resuming into a broken world.
        localStorage.removeItem(SLOT_KEY)
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
