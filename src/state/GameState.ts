import { EventBus } from '../core/EventBus'

/**
 * Central authoritative game state.
 *
 * Rules of the house:
 *  - Nothing here imports THREE or touches the DOM. It is pure data + events.
 *  - Every meaningful change goes through a method that emits an event, so the
 *    3D world, the UI and the audio engine all react from one source of truth.
 *  - The whole thing serialises to a plain object for localStorage saves.
 */

export const SAVE_VERSION = 3

/** Visual/lighting state of the whole building. Puzzles flip these. */
export type WorldLighting = 'blackout' | 'tungsten' | 'safelight' | 'dawn'

/** Lifecycle of an inventory item, surfaced distinctly in the UI. */
export type ItemState =
  | 'new' // acquired, not yet opened in the inspector
  | 'examined' // the player has looked at it
  | 'transformed' // it changed (e.g. it was combined into something / filled)
  | 'spent' // it did its job and is kept as a memento, greyed out

export interface InventoryEntry {
  id: string
  state: ItemState
  /** ids of hidden details the player has actually discovered by rotating it */
  found: string[]
}

export interface PuzzleProgress {
  solved: boolean
  attempts: number
  wrongAttempts: number
  hintLevel: number // 0 = none taken, 1..3
  /** puzzle-specific serialisable working state (dial positions, tray order, ...) */
  work: Record<string, unknown>
}

export interface ClueEntry {
  id: string
  title: string
  body: string
  source: string
  at: number
}

export interface SaveData {
  version: number
  chapterId: string
  nodeId: string
  lighting: WorldLighting
  flags: Record<string, boolean>
  counters: Record<string, number>
  inventory: InventoryEntry[]
  selectedItemId: string | null
  puzzles: Record<string, PuzzleProgress>
  clues: ClueEntry[]
  readDocuments: string[]
  endingId: string | null
  endingsSeen: string[]
  playtimeMs: number
  savedAt: number
}

export type GameStateEvents = {
  'flag:changed': { key: string; value: boolean }
  'counter:changed': { key: string; value: number }
  'inventory:added': { id: string }
  'inventory:removed': { id: string }
  'inventory:updated': { id: string }
  'inventory:selected': { id: string | null }
  'puzzle:updated': { id: string; progress: PuzzleProgress }
  'puzzle:solved': { id: string }
  'clue:added': { clue: ClueEntry }
  'lighting:changed': { lighting: WorldLighting; previous: WorldLighting }
  'node:changed': { nodeId: string; previous: string | null }
  'document:read': { id: string }
  'ending:reached': { id: string }
  'state:loaded': { data: SaveData }
  'state:reset': Record<string, never>
}

function emptySave(chapterId: string, startNode: string): SaveData {
  return {
    version: SAVE_VERSION,
    chapterId,
    nodeId: startNode,
    lighting: 'blackout',
    flags: {},
    counters: {},
    inventory: [],
    selectedItemId: null,
    puzzles: {},
    clues: [],
    readDocuments: [],
    endingId: null,
    endingsSeen: [],
    playtimeMs: 0,
    savedAt: 0,
  }
}

export class GameState {
  readonly events = new EventBus<GameStateEvents>()
  private data: SaveData

  constructor(
    private readonly chapterId: string,
    private readonly startNode: string,
  ) {
    this.data = emptySave(chapterId, startNode)
  }

  // ---------------------------------------------------------------- snapshot

  snapshot(): SaveData {
    return structuredClone(this.data)
  }

  /** Endings seen persist across resets so the "all endings" tracker survives. */
  hydrate(data: SaveData): void {
    this.data = data
    this.events.emit('state:loaded', { data: this.snapshot() })
  }

  resetProgress(keepEndings: boolean): void {
    const seen = keepEndings ? [...this.data.endingsSeen] : []
    this.data = emptySave(this.chapterId, this.startNode)
    this.data.endingsSeen = seen
    this.events.emit('state:reset', {})
  }

  addPlaytime(ms: number): void {
    this.data.playtimeMs += ms
  }

  get playtimeMs(): number {
    return this.data.playtimeMs
  }

  // ------------------------------------------------------------------- flags

  flag(key: string): boolean {
    return this.data.flags[key] === true
  }

  setFlag(key: string, value = true): void {
    if (this.data.flags[key] === value) return
    this.data.flags[key] = value
    this.events.emit('flag:changed', { key, value })
  }

  allFlags(...keys: string[]): boolean {
    return keys.every((k) => this.flag(k))
  }

  anyFlag(...keys: string[]): boolean {
    return keys.some((k) => this.flag(k))
  }

  counter(key: string): number {
    return this.data.counters[key] ?? 0
  }

  setCounter(key: string, value: number): void {
    if (this.data.counters[key] === value) return
    this.data.counters[key] = value
    this.events.emit('counter:changed', { key, value })
  }

  bumpCounter(key: string, by = 1): number {
    const v = this.counter(key) + by
    this.setCounter(key, v)
    return v
  }

  // --------------------------------------------------------------- inventory

  get inventory(): readonly InventoryEntry[] {
    return this.data.inventory
  }

  hasItem(id: string): boolean {
    return this.data.inventory.some((e) => e.id === id)
  }

  /** True only if the item is present AND still usable (not spent). */
  hasUsableItem(id: string): boolean {
    const e = this.getItem(id)
    return !!e && e.state !== 'spent'
  }

  getItem(id: string): InventoryEntry | undefined {
    return this.data.inventory.find((e) => e.id === id)
  }

  addItem(id: string): boolean {
    if (this.hasItem(id)) return false
    this.data.inventory.push({ id, state: 'new', found: [] })
    this.events.emit('inventory:added', { id })
    return true
  }

  removeItem(id: string): void {
    const idx = this.data.inventory.findIndex((e) => e.id === id)
    if (idx < 0) return
    this.data.inventory.splice(idx, 1)
    if (this.data.selectedItemId === id) this.selectItem(null)
    this.events.emit('inventory:removed', { id })
  }

  setItemState(id: string, state: ItemState): void {
    const e = this.getItem(id)
    if (!e || e.state === state) return
    // 'new' never comes back once the player has opened the item.
    e.state = state
    this.events.emit('inventory:updated', { id })
  }

  markExamined(id: string): void {
    const e = this.getItem(id)
    if (!e) return
    if (e.state === 'new') this.setItemState(id, 'examined')
  }

  recordDetail(itemId: string, detailId: string): boolean {
    const e = this.getItem(itemId)
    if (!e || e.found.includes(detailId)) return false
    e.found.push(detailId)
    this.events.emit('inventory:updated', { id: itemId })
    return true
  }

  hasDetail(itemId: string, detailId: string): boolean {
    return this.getItem(itemId)?.found.includes(detailId) ?? false
  }

  get selectedItemId(): string | null {
    return this.data.selectedItemId
  }

  selectItem(id: string | null): void {
    if (this.data.selectedItemId === id) return
    this.data.selectedItemId = id
    this.events.emit('inventory:selected', { id })
  }

  // ----------------------------------------------------------------- puzzles

  puzzle(id: string): PuzzleProgress {
    let p = this.data.puzzles[id]
    if (!p) {
      p = { solved: false, attempts: 0, wrongAttempts: 0, hintLevel: 0, work: {} }
      this.data.puzzles[id] = p
    }
    return p
  }

  isSolved(id: string): boolean {
    return this.data.puzzles[id]?.solved === true
  }

  setPuzzleWork(id: string, work: Record<string, unknown>): void {
    const p = this.puzzle(id)
    p.work = work
    this.events.emit('puzzle:updated', { id, progress: p })
  }

  registerAttempt(id: string, correct: boolean): void {
    const p = this.puzzle(id)
    p.attempts += 1
    if (!correct) p.wrongAttempts += 1
    this.events.emit('puzzle:updated', { id, progress: p })
  }

  solvePuzzle(id: string): boolean {
    const p = this.puzzle(id)
    if (p.solved) return false
    p.solved = true
    this.events.emit('puzzle:updated', { id, progress: p })
    this.events.emit('puzzle:solved', { id })
    return true
  }

  takeHint(id: string): number {
    const p = this.puzzle(id)
    p.hintLevel = Math.min(3, p.hintLevel + 1)
    this.events.emit('puzzle:updated', { id, progress: p })
    return p.hintLevel
  }

  get solvedCount(): number {
    return Object.values(this.data.puzzles).filter((p) => p.solved).length
  }

  get hintsTaken(): number {
    return Object.values(this.data.puzzles).reduce((n, p) => n + p.hintLevel, 0)
  }

  // ------------------------------------------------------------------- clues

  get clues(): readonly ClueEntry[] {
    return this.data.clues
  }

  addClue(clue: Omit<ClueEntry, 'at'>): boolean {
    if (this.data.clues.some((c) => c.id === clue.id)) return false
    const entry: ClueEntry = { ...clue, at: this.data.playtimeMs }
    this.data.clues.push(entry)
    this.events.emit('clue:added', { clue: entry })
    return true
  }

  hasClue(id: string): boolean {
    return this.data.clues.some((c) => c.id === id)
  }

  markDocumentRead(id: string): void {
    if (this.data.readDocuments.includes(id)) return
    this.data.readDocuments.push(id)
    this.events.emit('document:read', { id })
  }

  hasReadDocument(id: string): boolean {
    return this.data.readDocuments.includes(id)
  }

  // --------------------------------------------------------- world / lighting

  get lighting(): WorldLighting {
    return this.data.lighting
  }

  setLighting(lighting: WorldLighting): void {
    if (this.data.lighting === lighting) return
    const previous = this.data.lighting
    this.data.lighting = lighting
    this.events.emit('lighting:changed', { lighting, previous })
  }

  get nodeId(): string {
    return this.data.nodeId
  }

  setNode(nodeId: string): void {
    if (this.data.nodeId === nodeId) return
    const previous = this.data.nodeId
    this.data.nodeId = nodeId
    this.events.emit('node:changed', { nodeId, previous })
  }

  // ----------------------------------------------------------------- endings

  get endingId(): string | null {
    return this.data.endingId
  }

  get endingsSeen(): readonly string[] {
    return this.data.endingsSeen
  }

  reachEnding(id: string): void {
    this.data.endingId = id
    if (!this.data.endingsSeen.includes(id)) this.data.endingsSeen.push(id)
    this.events.emit('ending:reached', { id })
  }

  stampSaveTime(): void {
    this.data.savedAt = Date.now()
  }
}
