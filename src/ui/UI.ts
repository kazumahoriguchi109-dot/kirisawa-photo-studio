import { TEXT_SPEED_CPS, type GameSettings, type SettingsStore } from '../core/Settings'
import type { GameState } from '../state/GameState'
import { CREDITS, DOCUMENTS, HOW_TO_PLAY, UI_TEXT, type EndingText } from '../content/chapter01/text'
import { ITEMS } from '../content/chapter01/items'
import type { Inspector } from '../systems/Inspector'
import { VERB_LABEL, type HoverInfo } from '../systems/Interaction'
import { SLOT_COUNT, type SaveMeta } from '../core/Save'

/** What choosing a slot means: begin there, resume it, or write into it. */
export type SlotMode = 'new' | 'load' | 'save'

const formatPlaytime = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return h > 0 ? `${h}時間${m}分` : `${m}分`
}

const formatSavedAt = (at: number): string => {
  if (!at) return ''
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * The whole DOM overlay.
 *
 * Kept in one place because every panel shares the same surface language and
 * the same open/close discipline: exactly one modal layer at a time, Escape
 * always closes the topmost thing, and the 3D input is suspended while a panel
 * is up so a stray click never reaches the room behind it.
 */

export interface UICallbacks {
  onTurn(direction: 'left' | 'right'): void
  /**
   * A click landed on an edge turn zone. Returns true if there was a world
   * hotspot under that point and it was activated instead of turning.
   */
  onEdgeClick(clientX: number, clientY: number): boolean
  onCloseupBack(): void
  onNewGame(): void
  onContinue(): void
  onSelectItem(id: string | null): void
  onCombine(a: string, b: string): void
  onTakeHint(puzzleId: string): void
  onSettingChanged<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void
  onResetProgress(): void
  onRestartChapter(): void
  onSave(): void
  /** Metadata for all three save slots, newest state each time it is asked. */
  slotMetas(): SaveMeta[]
  /** Start a new run in this slot, load it, or write the current run into it. */
  onSlotChosen(mode: SlotMode, slot: number): void
  onPanelOpen(): void
  onPanelClose(): void
  onEndingDismiss(): void
  onFullscreen(): void
  activeHints(): Array<{ id: string; no: number; place: string; title: string; steps: string[]; taken: number }>
}

/**
 * Narration dwell. A finished line stays up for HOLD_BASE plus HOLD_PER_CHAR
 * for every character in it, capped at HOLD_MAX. Tuned against Japanese
 * reading speed at roughly 14 characters a second, with headroom - the player
 * is reading a room at the same time.
 */
const HOLD_BASE_MS = 1600
const HOLD_PER_CHAR_MS = 78
const HOLD_MAX_MS = 7000

type PanelId = 'inventory' | 'clues' | 'hints' | 'settings' | 'document' | 'credits' | 'howto' | 'slots' | null

export class GameUI {
  private root: HTMLElement
  private verbChip!: HTMLElement
  private noticeRing!: HTMLElement
  private narration!: HTMLElement
  private narrationLine!: HTMLElement
  private toastRail!: HTMLElement
  private hudBar!: HTMLElement
  private scrim!: HTMLElement
  private panel!: HTMLElement
  private panelTitle!: HTMLElement
  private panelSub!: HTMLElement
  private panelBody!: HTMLElement
  private panelFoot!: HTMLElement
  private doc!: HTMLElement
  private titleScreen!: HTMLElement
  private shutter!: HTMLElement
  private chapterCard!: HTMLElement
  private endingEl!: HTMLElement
  private turnLeft!: HTMLElement
  private turnRight!: HTMLElement
  private closeupBar!: HTMLElement
  private closeupTitle!: HTMLElement

  private openPanel: PanelId = null
  private narrationQueue: string[] = []
  private narrationTimer = 0
  private narrationResolve: (() => void) | null = null
  private selectedForCombine: string | null = null
  /** Which hint rows are expanded. Survives the re-render after taking one. */
  private hintOpen = new Set<string>()
  private detailHost: HTMLElement | null = null
  private lastHoverId = ''

  constructor(
    private readonly state: GameState,
    private readonly settings: SettingsStore,
    private readonly inspector: Inspector,
    private readonly cb: UICallbacks,
  ) {
    this.root = document.getElementById('ui') as HTMLElement
    this.build()
    this.applyScale()
    this.settings.events.on('changed', () => this.applyScale())
    this.state.events.on('inventory:added', () => this.refreshBadges())
    this.state.events.on('inventory:updated', () => this.refreshBadges())
    this.state.events.on('clue:added', () => this.refreshBadges())
  }

  // ------------------------------------------------------------------ build

  private el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    html?: string,
  ): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (html !== undefined) e.innerHTML = html
    return e
  }

  private build(): void {
    this.root.innerHTML = ''

    const grade = this.el('div')
    grade.id = 'grade'
    this.root.appendChild(grade)

    this.noticeRing = this.el('div')
    this.noticeRing.id = 'notice-ring'
    this.root.appendChild(this.noticeRing)

    this.verbChip = this.el('div')
    this.verbChip.id = 'verb-chip'
    this.root.appendChild(this.verbChip)

    this.narration = this.el('div')
    this.narration.id = 'narration'
    this.narration.setAttribute('aria-live', 'polite')
    this.narration.setAttribute('role', 'status')
    this.narrationLine = this.el('div', 'line jp')
    this.narration.appendChild(this.narrationLine)
    this.root.appendChild(this.narration)

    this.toastRail = this.el('div')
    this.toastRail.id = 'toast-rail'
    this.toastRail.setAttribute('aria-live', 'polite')
    this.root.appendChild(this.toastRail)

    // --- edge turn zones
    for (const side of ['left', 'right'] as const) {
      const z = this.el('div', `turn-zone ${side}`)
      z.dataset.live = '0'
      z.setAttribute('role', 'button')
      z.setAttribute('aria-label', side === 'left' ? '左を向く' : '右を向く')
      z.tabIndex = 0
      const arrow = this.el('button', 'chev clickable')
      arrow.setAttribute('aria-hidden', 'true')
      arrow.tabIndex = -1
      const zlabel = this.el('span', 'zone-label')
      z.append(arrow, zlabel)
      // The arrow always turns. Everything else in the zone asks the world
      // first and only turns if there is nothing there.
      //
      // Both halves of that are needed. Letting the whole zone win swallowed
      // clicks on anything the composition put near an edge; letting the world
      // always win made the turn itself impossible wherever a hotspot happened
      // to lie under the edge - in the entrance view the coat rack covered the
      // right-hand arrow, so the arrow lit up on hover and then did nothing,
      // which reads as a broken build rather than as a busy pixel.
      arrow.addEventListener('click', (e) => {
        e.stopPropagation()
        if (z.dataset.live === '1') this.cb.onTurn(side)
      })
      z.addEventListener('click', (e) => {
        if (z.dataset.live !== '1') return
        if (this.cb.onEdgeClick(e.clientX, e.clientY)) return
        this.cb.onTurn(side)
      })
      z.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && z.dataset.live === '1') {
          e.preventDefault()
          this.cb.onTurn(side)
        }
      })
      this.root.appendChild(z)
      if (side === 'left') this.turnLeft = z
      else this.turnRight = z
    }

    // --- close-up exit, always visible while a close-up is open
    this.closeupBar = this.el('div')
    this.closeupBar.id = 'closeup-bar'
    this.closeupTitle = this.el('span', 'cu-title')
    const back = this.el('button', 'clickable')
    back.id = 'closeup-back'
    back.innerHTML = `<span class="x">\u00d7</span>${UI_TEXT.back}`
    back.setAttribute('aria-label', `${UI_TEXT.back}（Esc）`)
    back.addEventListener('click', () => this.cb.onCloseupBack())
    this.closeupBar.append(this.closeupTitle, back)
    this.root.appendChild(this.closeupBar)

    // --- HUD
    this.hudBar = this.el('div')
    this.hudBar.id = 'hud-bar'
    const buttons: Array<[PanelId, string, string]> = [
      ['inventory', UI_TEXT.inventory, 'I'],
      ['clues', UI_TEXT.clues, 'J'],
      ['hints', UI_TEXT.hints, 'H'],
      ['settings', UI_TEXT.settings, 'Esc'],
    ]
    for (const [id, label, key] of buttons) {
      const b = this.el('button', 'hud-btn clickable')
      b.innerHTML = `${label}<kbd>${key}</kbd>`
      b.dataset.panel = id ?? ''
      b.addEventListener('click', () => this.toggle(id))
      this.hudBar.appendChild(b)
    }
    this.root.appendChild(this.hudBar)
    this.hudBar.style.display = 'none'

    // --- modal scaffolding
    this.scrim = this.el('div', 'scrim')
    this.scrim.style.display = 'none'
    this.scrim.addEventListener('click', () => this.closeTop())
    this.root.appendChild(this.scrim)

    this.panel = this.el('div', 'panel')
    this.panel.style.display = 'none'
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-modal', 'true')
    this.panel.setAttribute('aria-labelledby', 'panel-title')
    const head = this.el('div', 'panel-head')
    this.panelTitle = this.el('h2', 'panel-title')
    this.panelTitle.id = 'panel-title'
    this.panelSub = this.el('span', 'panel-sub')
    // Every close-up gets a prominent × 戻る; the modal panels had nothing at
    // all. The only way out was clicking the scrim, which is invisible, or Esc,
    // which the HUD advertises but which a player has no reason to trust after
    // finding no button.
    // One way out of a panel, and it is the labelled one.
    //
    // The header used to carry 「× 戻る」 while the footer carried 「閉じる」:
    // two controls, one job, two different words, and a player had to stop and
    // work out whether 戻る meant "leave" or "go back a step". Reducing the
    // header to a bare × left two controls that merely looked different. Every
    // panel ends in 閉じる, Escape closes the topmost layer, and the how-to
    // screen says so - so the header now carries only the title.
    head.append(this.panelTitle, this.panelSub)
    this.panelBody = this.el('div', 'panel-body')
    this.panelFoot = this.el('div', 'panel-foot')
    this.panel.append(head, this.panelBody, this.panelFoot)
    this.root.appendChild(this.panel)

    this.doc = this.el('div', 'doc')
    this.doc.style.display = 'none'
    this.doc.setAttribute('role', 'dialog')
    this.doc.setAttribute('aria-modal', 'true')
    this.doc.tabIndex = -1
    this.root.appendChild(this.doc)

    // --- shutter + chapter card
    this.shutter = this.el('div')
    this.shutter.id = 'shutter'
    this.shutter.innerHTML = '<div class="shutter-leaf leaf-top"></div><div class="shutter-leaf leaf-bottom"></div>'
    this.root.appendChild(this.shutter)

    this.chapterCard = this.el('div')
    this.chapterCard.id = 'chapter-card'
    this.root.appendChild(this.chapterCard)

    // --- ending
    this.endingEl = this.el('div')
    this.endingEl.id = 'ending'
    this.root.appendChild(this.endingEl)

    // --- title
    this.buildTitle()

    document.addEventListener('keydown', (e) => this.onKey(e))
  }

  private buildTitle(): void {
    this.titleScreen = this.el('div')
    this.titleScreen.id = 'title'
    const gradeEl = this.el('div', 't-grade')
    const lockup = this.el('div')
    lockup.id = 'title-lockup'
    const main = this.el('h1', 't-main')
    main.innerHTML = UI_TEXT.title
      .split('')
      .map((ch, i) => `<span style="animation-delay:${i * 0.07}s">${ch}</span>`)
      .join('')
    // Title only. The subtitle used to be set below the rule here; the lockup
    // reads better as the name alone, and the phrase is already on the ending.
    const rule = this.el('span', 't-rule')
    lockup.append(main, rule)

    const menu = this.el('div')
    menu.id = 'title-menu'
    this.titleScreen.append(gradeEl, lockup, menu)

    // The version, and nothing else. The volume line belongs in 設定, which is
    // one item up in the menu the player is already looking at.
    const foot = this.el('div', '', `v${__APP_VERSION__}`)
    foot.id = 'title-foot'
    this.titleScreen.appendChild(foot)
    this.root.appendChild(this.titleScreen)
    this.titleMenuHost = menu
  }

  private titleMenuHost!: HTMLElement

  /** Rebuilt whenever the save state changes so 「つづきから」 is accurate. */
  refreshTitleMenu(opts: { hasSave: boolean; saveLabel?: string }): void {
    const menu = this.titleMenuHost
    menu.innerHTML = ''
    const add = (label: string, meta: string | null, fn: () => void) => {
      const b = this.el('button', 'menu-item clickable')
      b.innerHTML = meta ? `${label}<span class="menu-meta">${meta}</span>` : label
      b.addEventListener('click', fn)
      menu.appendChild(b)
    }
    // Both entries go through the slot list, so which of the three records is
    // about to be started or resumed is always a shown choice rather than a
    // guess the game makes on the player's behalf.
    add(UI_TEXT.menuNew, null, () => this.openSlots('new'))
    if (opts.hasSave) add(UI_TEXT.menuContinue, opts.saveLabel ?? null, () => this.openSlots('load'))
    add(UI_TEXT.menuSettings, null, () => this.open('settings'))
    add(UI_TEXT.menuHowTo, null, () => this.open('howto'))
    // Credits are not a title-screen menu item: they belong at the end of a
    // playthrough, so they are reached from the ending screen instead.
  }

  /** Show or hide the two edge arrows, with the destination named on hover. */
  setTurnZones(left: string | null, right: string | null): void {
    const apply = (el: HTMLElement, label: string | null) => {
      el.dataset.live = label ? '1' : '0'
      const lab = el.querySelector('.zone-label') as HTMLElement | null
      if (lab) lab.textContent = label ?? ''
    }
    apply(this.turnLeft, left)
    apply(this.turnRight, right)
  }

  /** The close-up exit is never conditional: if we are in close, it is up. */
  setCloseup(active: boolean, title = ''): void {
    this.closeupBar.dataset.show = active ? '1' : ''
    this.closeupTitle.textContent = title
  }

  private applyScale(): void {
    const s = this.settings.get()
    this.root.style.setProperty('--ui-scale', String(s.uiScale))
    document.body.dataset.reducedMotion = s.reducedMotion ? '1' : '0'
  }

  // ------------------------------------------------------------ title/shutter

  get titleVisible(): boolean {
    return this.titleScreen.dataset.hide !== '1'
  }

  hideTitle(): void {
    this.titleScreen.dataset.hide = '1'
    window.setTimeout(() => {
      this.titleScreen.style.display = 'none'
    }, 620)
  }

  showTitle(): void {
    this.titleScreen.style.display = ''
    requestAnimationFrame(() => {
      this.titleScreen.dataset.hide = '0'
    })
  }

  setHudVisible(v: boolean): void {
    this.hudBar.style.display = v ? '' : 'none'
    if (!v) {
      this.setTurnZones(null, null)
      this.setCloseup(false)
    }
  }

  async closeShutter(): Promise<void> {
    if (this.settings.get().reducedMotion) {
      this.shutter.dataset.state = 'closed'
      await wait(90)
      return
    }
    this.shutter.dataset.state = 'closing'
    await wait(280)
    this.shutter.dataset.state = 'closed'
  }

  async openShutter(): Promise<void> {
    if (this.settings.get().reducedMotion) {
      this.shutter.dataset.state = ''
      await wait(60)
      return
    }
    this.shutter.dataset.state = 'opening'
    await wait(400)
    this.shutter.dataset.state = ''
  }

  async showChapterCard(text: string, ms = 2400): Promise<void> {
    this.chapterCard.textContent = text
    this.chapterCard.dataset.show = '1'
    await wait(ms)
    this.chapterCard.dataset.show = '0'
  }

  // -------------------------------------------------------------- narration

  /** Type out lines one at a time. Resolves when the last line finishes. */
  narrate(lines: string[] | string, opts: { hold?: number } = {}): Promise<void> {
    const arr = Array.isArray(lines) ? lines : [lines]
    this.narrationQueue = arr.slice()
    this.holdBase = opts.hold ?? HOLD_BASE_MS
    window.clearTimeout(this.narrationTimer)
    this.narrationResolve?.()
    return new Promise<void>((resolve) => {
      this.narrationResolve = resolve
      this.playNextLine()
    })
  }

  /**
   * How long a finished line stays up before the next one replaces it.
   *
   * It used to be a flat 1500 ms for every line, so 「壁。」 and a
   * forty-character sentence about what is written on the back of a photograph
   * were given exactly the same time to be read, and the long ones were gone
   * before a player got to the end of them. Scaled by length now, with a floor
   * that keeps short lines from flickering and a ceiling that stops a long one
   * from feeling stuck. A click always skips ahead.
   */
  private holdFor(line: string): number {
    return Math.min(HOLD_MAX_MS, this.holdBase + line.length * HOLD_PER_CHAR_MS)
  }

  /** Instantly finish the line being typed, or move to the next one. */
  advanceNarration(): boolean {
    if (!this.narration.dataset.show) return false
    if (this.typing) {
      // Completing the line is not the same as asking for the next one: the
      // player wanted to stop waiting for the typewriter, not to skip the text.
      this.typing = false
      this.narrationLine.textContent = this.currentFull
      window.clearTimeout(this.narrationTimer)
      this.narrationTimer = window.setTimeout(() => this.playNextLine(), this.holdFor(this.currentFull))
      return true
    }
    window.clearTimeout(this.narrationTimer)
    this.playNextLine()
    return true
  }

  private typing = false
  private currentFull = ''
  private holdBase = HOLD_BASE_MS

  private playNextLine(): void {
    const next = this.narrationQueue.shift()
    if (next === undefined) {
      this.narration.dataset.show = ''
      this.typing = false
      const r = this.narrationResolve
      this.narrationResolve = null
      r?.()
      return
    }
    this.currentFull = next
    this.narration.dataset.show = '1'
    const hold = this.holdFor(next)
    const cps = TEXT_SPEED_CPS[this.settings.get().textSpeed]
    if (!Number.isFinite(cps)) {
      this.narrationLine.textContent = next
      this.typing = false
      this.narrationTimer = window.setTimeout(() => this.playNextLine(), hold)
      return
    }
    this.typing = true
    let i = 0
    const step = () => {
      if (!this.typing) return
      i++
      this.narrationLine.textContent = next.slice(0, i)
      if (i >= next.length) {
        this.typing = false
        this.narrationTimer = window.setTimeout(() => this.playNextLine(), hold)
        return
      }
      this.narrationTimer = window.setTimeout(step, 1000 / cps)
    }
    step()
  }

  clearNarration(): void {
    window.clearTimeout(this.narrationTimer)
    this.narrationQueue = []
    this.typing = false
    this.narration.dataset.show = ''
    const r = this.narrationResolve
    this.narrationResolve = null
    r?.()
  }

  toast(text: string, key?: string): void {
    const t = this.el('div', 'toast')
    t.innerHTML = key ? `<span class="k">${key}</span>　${text}` : text
    this.toastRail.appendChild(t)
    window.setTimeout(() => t.remove(), 3800)
  }

  // ----------------------------------------------------------- hover / chip

  setHover(info: HoverInfo | null, ctxSelected: string | null): void {
    if (!info) {
      this.verbChip.dataset.show = ''
      this.noticeRing.dataset.show = ''
      this.lastHoverId = ''
      return
    }
    const def = info.hotspot
    const verb = def.verbFor ? def.verbFor({ selectedItem: ctxSelected }) : def.verb
    const label = def.labelFor ? def.labelFor({ selectedItem: ctxSelected }) : def.label
    this.verbChip.innerHTML = `${label}<span class="verb">${VERB_LABEL[verb]}</span>`
    // Kept inside the viewport. The chip is centred on the object it names, so
    // anything the composition puts near an edge had half its name cut off by
    // the side of the screen - 「外套掛け」 arrived as 「外套掛」 and then nothing.
    // The ring below stays on the object itself; only the words are nudged.
    this.verbChip.style.top = `${info.screen.y}%`
    this.verbChip.dataset.show = '1'
    const vw = this.root.clientWidth
    const vh = this.root.clientHeight
    const half = this.verbChip.offsetWidth / 2
    const pad = 10
    const wanted = (info.screen.x / 100) * vw
    const clamped = Math.max(half + pad, Math.min(vw - half - pad, wanted))
    this.verbChip.style.left = `${clamped}px`
    // Only the x axis was bounded. The chip is drawn entirely ABOVE the thing
    // it names, so anything in the top of the picture pushed it off the top of
    // the window, where the page's overflow:hidden cut it - a ceiling lamp or
    // the wall writing had a name the player could never read. Below a certain
    // height it flips and hangs under its anchor instead.
    const needed = this.verbChip.offsetHeight + 24
    const anchorY = (info.screen.y / 100) * vh
    this.verbChip.dataset.below = anchorY < needed ? '1' : ''
    this.noticeRing.style.left = `${info.screen.x}%`
    this.noticeRing.style.top = `${info.screen.y}%`
    this.noticeRing.dataset.show = '1'
    this.lastHoverId = def.id
  }

  get hoveredId(): string {
    return this.lastHoverId
  }

  surveyPulse(points: Array<{ screen: { x: number; y: number } }>): void {
    for (const p of points) {
      const m = this.el('div', 'survey-mark')
      m.style.left = `${p.screen.x}%`
      m.style.top = `${p.screen.y}%`
      this.root.appendChild(m)
      window.setTimeout(() => m.remove(), 1600)
    }
  }

  // ------------------------------------------------------------ panel plumbing

  private toggle(id: PanelId): void {
    if (this.openPanel === id) this.closeTop()
    else this.open(id)
  }

  open(id: PanelId): void {
    if (!id) return
    if (this.openPanel) this.closePanelDom()
    this.openPanel = id
    // The title screen stacks above the panel layer, so without this its menu
    // stayed clickable *through* an open overlay: reading あそびかた and then
    // clicking 閉じる started a new game through the card, with the opening
    // narration playing behind it.
    this.root.dataset.panel = '1'
    this.cb.onPanelOpen()
    this.scrim.style.display = ''
    requestAnimationFrame(() => (this.scrim.dataset.open = '1'))
    if (id === 'document' || id === 'credits' || id === 'howto') {
      // these use the paper surface
    }
    switch (id) {
      case 'inventory':
        this.renderInventory()
        break
      case 'clues':
        this.renderClues()
        break
      case 'hints':
        this.renderHints(true)
        break
      case 'settings':
        this.renderSettings()
        break
      case 'slots':
        this.renderSlots()
        break
      case 'credits':
        this.renderPaper('制作について', CREDITS)
        break
      case 'howto':
        this.renderPaper('あそびかた', HOW_TO_PLAY)
        break
      default:
        break
    }
  }

  openDocument(docId: string): void {
    const d = DOCUMENTS[docId]
    if (!d) return
    if (this.openPanel) this.closePanelDom()
    this.openPanel = 'document'
    this.cb.onPanelOpen()
    this.scrim.style.display = ''
    requestAnimationFrame(() => (this.scrim.dataset.open = '1'))
    this.renderPaper(d.title, d.body)
  }

  private renderPaper(title: string, body: string): void {
    this.doc.innerHTML = ''
    const close = this.el('button', 'doc-close clickable', UI_TEXT.close)
    close.addEventListener('click', () => this.closeTop())
    const pre = this.el('pre', 'jp')
    pre.textContent = body
    const h = this.el('div', 'sr-only', title)
    this.doc.append(close, h, pre)
    this.doc.style.display = ''
    requestAnimationFrame(() => {
      this.doc.dataset.open = '1'
      // focus the paper so the keyboard can scroll a document that may be
      // taller than the screen - both in-game documents are puzzle-critical
      this.doc.focus()
    })
  }

  private showPanel(title: string, sub = ''): void {
    // Every renderer calls this first, and several of them redraw in place -
    // the hint ladder redraws after each reveal, the inventory after each
    // selection. Appending to a body nobody emptied stacked a fresh copy each
    // time, so the player ended up with three identical hint blocks and three
    // side-by-side 閉じる buttons.
    this.panelBody.innerHTML = ''
    this.panelFoot.innerHTML = ''
    this.panelFoot.classList.remove('has-actions')
    this.panelTitle.textContent = title
    this.panelSub.textContent = sub
    this.panel.style.display = ''
    requestAnimationFrame(() => (this.panel.dataset.open = '1'))
  }

  private closePanelDom(): void {
    this.root.dataset.panel = ''
    this.panel.dataset.open = ''
    this.doc.dataset.open = ''
    this.scrim.dataset.open = ''
    this.inspector.stop()
    window.setTimeout(() => {
      if (this.openPanel === null) {
        this.panel.style.display = 'none'
        this.doc.style.display = 'none'
        this.scrim.style.display = 'none'
      }
    }, 260)
    this.panelBody.innerHTML = ''
    this.panelFoot.innerHTML = ''
  }

  closeTop(): boolean {
    if (!this.openPanel) return false
    this.openPanel = null
    this.closePanelDom()
    this.cb.onPanelClose()
    return true
  }

  get isPanelOpen(): boolean {
    return this.openPanel !== null
  }

  // ------------------------------------------------------------- inventory

  private renderInventory(): void {
    this.showPanel(UI_TEXT.inventory, `${kanjiNum(this.state.inventory.length)} 点`)
    const layout = this.el('div')
    layout.id = 'inv-layout'
    const grid = this.el('div')
    grid.id = 'inv-grid'
    const detail = this.el('div')
    detail.id = 'inv-detail'
    layout.append(grid, detail)
    this.panelBody.appendChild(layout)
    this.detailHost = detail

    if (this.state.inventory.length === 0) {
      grid.innerHTML = `<div class="inv-empty">${UI_TEXT.inventoryEmpty}</div>`
      detail.innerHTML = ''
      return
    }

    for (const entry of this.state.inventory) {
      const def = ITEMS[entry.id]
      if (!def) continue
      const cell = this.el('button', 'inv-cell clickable')
      cell.dataset.state = entry.state
      cell.dataset.selected = this.state.selectedItemId === entry.id ? '1' : ''
      cell.innerHTML = `<span class="nm">${def.name}</span>`
      cell.addEventListener('click', () => {
        if (this.selectedForCombine && this.selectedForCombine !== entry.id) {
          const a = this.selectedForCombine
          this.selectedForCombine = null
          this.cb.onCombine(a, entry.id)
          this.renderInventory()
          return
        }
        this.showItemDetail(entry.id)
      })
      grid.appendChild(cell)
    }

    // Open on what the player most likely came to look at: whatever is selected,
    // else the newest unexamined item, else the first.
    //
    // It used to open on inventory[0] unconditionally and mark it examined, so
    // opening the panel stripped the 「新」 mark off an item the player had never
    // looked at and decremented the HUD badge - while the item that badge was
    // counting sat further down the grid, still unread.
    const newest = [...this.state.inventory].reverse().find((e) => e.state === 'new')
    const first = this.state.selectedItemId ?? newest?.id ?? this.state.inventory[0].id
    this.showItemDetail(first)
  }

  private showItemDetail(id: string): void {
    const def = ITEMS[id]
    const entry = this.state.getItem(id)
    if (!def || !entry || !this.detailHost) return
    this.state.markExamined(id)

    this.detailHost.innerHTML = ''
    const stage = this.el('div')
    stage.id = 'inspect-stage'
    stage.appendChild(this.inspector.canvas)
    const hint = this.el('div', 'hint', 'ドラッグで回す　／　ホイールで寄る　／　F で裏返す')
    stage.appendChild(hint)
    this.detailHost.appendChild(stage)

    const name = this.el('h3', 'detail-name', def.name)
    // The item's condition, in words.
    //
    // UI_TEXT.itemStateNew / Examined / Transformed / Spent existed and were
    // rendered nowhere, so a key that had already been used showed exactly the
    // same panel as a fresh one - same description, same live 「選ぶ」 - and the
    // only signal was a dimmed thumbnail back in the grid.
    const STATE_LABEL: Record<string, string> = {
      new: UI_TEXT.itemStateNew,
      examined: UI_TEXT.itemStateExamined,
      transformed: UI_TEXT.itemStateTransformed,
      spent: UI_TEXT.itemStateSpent,
    }
    const stateWord = STATE_LABEL[entry.state]
    if (stateWord && entry.state !== 'examined') {
      const tag = this.el('span', `detail-state s-${entry.state}`, stateWord)
      name.appendChild(tag)
    }
    const desc = this.el('p', 'detail-desc jp', def.desc)
    this.detailHost.append(name, desc)

    const foundBox = this.el('div')
    foundBox.id = 'inv-found'
    for (const d of def.details ?? []) {
      if (!entry.found.includes(d.id)) continue
      const p = this.el('p', 'detail-found jp', `${d.title}　—　${d.text}`)
      foundBox.appendChild(p)
    }
    this.detailHost.appendChild(foundBox)

    const actions = this.el('div', 'detail-actions')
    const selBtn = this.el('button', 'btn clickable')
    const isSel = this.state.selectedItemId === id
    selBtn.textContent = isSel ? UI_TEXT.deselect : UI_TEXT.select
    // An item whose job is done cannot be armed. It stays in the bag as a
    // memento - the keys, the developer, the placed photographs all do - but
    // offering a live 「選ぶ」 on it invites the player to carry a used key
    // around every lock in the building.
    if (entry.state === 'spent' && !isSel) selBtn.disabled = true
    selBtn.addEventListener('click', () => {
      this.cb.onSelectItem(isSel ? null : id)
      this.renderInventory()
    })

    const comBtn = this.el('button', 'btn ghost clickable')
    comBtn.textContent = this.selectedForCombine === id ? UI_TEXT.cancel : UI_TEXT.combine
    comBtn.addEventListener('click', () => {
      this.selectedForCombine = this.selectedForCombine === id ? null : id
      this.renderInventory()
      if (this.selectedForCombine) this.toast('組み合わせる相手を選ぶ')
    })

    // Appended secondary-first, so the row reads 読む / 組み合わせる / 選ぶ and the
    // primary verb - the one carrying the highlight - is the rightmost button.
    if (def.document) {
      const readBtn = this.el('button', 'btn ghost clickable')
      readBtn.textContent = UI_TEXT.read
      readBtn.addEventListener('click', () => this.openDocument(def.document as string))
      actions.appendChild(readBtn)
    }
    actions.appendChild(comBtn)
    actions.appendChild(selBtn)

    this.inspector.setHeldItems(this.state.inventory.map((e) => e.id))
    this.inspector.show(def, entry.found)
    this.bindInspectorInput(stage)

    // 選ぶ and 組み合わせる live in the footer, not at the bottom of the detail
    // column. The column scrolls, and on a short window the turntable and the
    // description filled it, so the two buttons that are the entire point of
    // opening an item sat below the fold with nothing on screen to say so - a
    // player holding the right item had no way to select it and no way to know
    // one existed. The footer is laid out separately and cannot be pushed off.
    //
    // 閉じる sits at the left and the item's own verbs at the right: the verbs
    // are what the player came here to press, and every other footer in the game
    // puts its affirmative action on the right.
    this.panelFoot.innerHTML = ''
    this.panelFoot.classList.add('has-actions')
    const close = this.el('button', 'btn clickable', UI_TEXT.close)
    close.addEventListener('click', () => this.closeTop())
    this.panelFoot.appendChild(close)
    this.panelFoot.appendChild(actions)
  }

  private bindInspectorInput(stage: HTMLElement): void {
    let dragging = false
    let lx = 0
    let ly = 0
    stage.addEventListener('pointerdown', (e) => {
      dragging = true
      lx = e.clientX
      ly = e.clientY
      stage.setPointerCapture(e.pointerId)
    })
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return
      this.inspector.rotate(e.clientX - lx, e.clientY - ly)
      lx = e.clientX
      ly = e.clientY
    })
    const end = (e: PointerEvent) => {
      dragging = false
      try {
        stage.releasePointerCapture(e.pointerId)
      } catch {
        /* pointer already released */
      }
    }
    stage.addEventListener('pointerup', end)
    stage.addEventListener('pointercancel', end)
    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.inspector.zoomBy(-e.deltaY * 0.0012)
      },
      { passive: false },
    )
  }

  /** Called by the app when the inspector reports a new discovery. */
  onDetailFound(title: string, text: string): void {
    if (!this.detailHost) return
    const box = document.getElementById('inv-found')
    if (!box) return
    const p = this.el('p', 'detail-found jp', `${title}　—　${text}`)
    box.appendChild(p)
  }

  // ----------------------------------------------------------------- clues

  private renderClues(): void {
    this.showPanel(UI_TEXT.clues, `${kanjiNum(this.state.clues.length)} 件`)
    if (this.state.clues.length === 0) {
      this.panelBody.innerHTML = `<div class="inv-empty">${UI_TEXT.cluesEmpty}</div>`
    } else {
      // Open notes first, finished ones after, so the top of the panel is
      // always what is still outstanding.
      const done = (c: (typeof this.state.clues)[number]): boolean =>
        (c.solvedBy !== undefined && this.state.isSolved(c.solvedBy)) ||
        (c.solvedFlag !== undefined && this.state.flag(c.solvedFlag))
      const ordered = [...this.state.clues].sort((a, b) => Number(done(a)) - Number(done(b)))
      for (const c of ordered) {
        const box = this.el('div', 'clue')
        if (done(c)) box.dataset.done = '1'
        box.innerHTML =
          `<h4>${c.title}${done(c) ? '<span class="clue-done">解決済み</span>' : ''}</h4>` +
          `<p class="jp">${c.body}</p><span class="src">${c.source}</span>`
        this.panelBody.appendChild(box)
      }
    }
    const close = this.el('button', 'btn clickable', UI_TEXT.close)
    close.addEventListener('click', () => this.closeTop())
    this.panelFoot.appendChild(close)
  }

  // ----------------------------------------------------------------- hints

  /**
   * One row per stuck thing, each opening downward onto its own steps.
   *
   * Every hint used to be expanded at once, so the panel opened as a wall of
   * text with the 「ヒントを見る」 buttons scattered down it and no way to tell
   * which one belonged to what. Worse, taking a hint printed the new line
   * *above* the button that revealed it, so the thing the player had just asked
   * for appeared somewhere they were not looking.
   */
  private renderHints(opening = false): void {
    const active = this.cb.activeHints()
    this.showPanel(UI_TEXT.hints, active.length ? `${kanjiNum(active.length)} 件　${UI_TEXT.hintPanelNote}` : '')
    if (active.length === 0) {
      this.panelBody.innerHTML = `<div class="inv-empty">${UI_TEXT.hintNothingActive}</div>`
    }
    // Never open onto a list of shut doors: if nothing the player opened is
    // still active, expand the first one for them.
    //
    // Only when the panel is being opened, though. Applying it on every render
    // meant that with a single hint active, collapsing it re-expanded it on the
    // spot - the row simply could not be shut.
    if (opening && active.length > 0 && !active.some((h) => this.hintOpen.has(h.id))) {
      this.hintOpen.add(active[0].id)
    }

    for (const h of active) {
      const open = this.hintOpen.has(h.id)
      const item = this.el('div', 'hint-item')
      item.dataset.open = open ? '1' : '0'

      const head = this.el('button', 'hint-head clickable')
      head.setAttribute('aria-expanded', open ? 'true' : 'false')
      // Number, name, room - then the counter and the control, hard right.
      const label = this.el('span', 'hint-label')
      label.append(
        this.el('span', 'hint-no', `${UI_TEXT.puzzleNo}${kanjiNum(h.no)}`),
        this.el('span', 'hint-title jp', h.title),
        this.el('span', 'hint-place jp', h.place),
      )
      head.append(
        label,
        this.el('span', 'hint-meta', `${kanjiNum(h.taken)}／${kanjiNum(h.steps.length)}`),
        this.el('span', 'hint-chev'),
      )
      head.addEventListener('click', () => {
        if (!this.hintOpen.delete(h.id)) this.hintOpen.add(h.id)
        this.renderHints()
      })
      item.appendChild(head)

      const body = this.el('div', 'hint-body')
      for (let i = 0; i < h.taken; i++) {
        const step = this.el('p', 'hint-step jp')
        step.append(
          this.el('span', 'hint-step-no', UI_TEXT.hintTierLabels[i]),
          this.el('span', 'hint-step-text', h.steps[i]),
        )
        body.appendChild(step)
      }
      // Nothing is appended once all three are out. A row reading
      // 「これ以上に言えることはない」 under every exhausted puzzle is a line of
      // furniture that says nothing and repeats down the whole panel; the
      // counter in the header already reads 三／三.
      if (h.taken < h.steps.length) {
        const row = this.el('div', 'hint-locked')
        // Tier and status as two separate marks, so neither can be mistaken
        // for the hint's text.
        row.appendChild(this.el('span', 'hint-tier jp', UI_TEXT.hintTierLabels[h.taken]))
        row.appendChild(this.el('span', 'hint-locked-note jp', UI_TEXT.hintLockedNote))
        const b = this.el('button', 'btn ghost clickable', UI_TEXT.hintReveal)
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          this.cb.onTakeHint(h.id)
          this.hintOpen.add(h.id)
          this.renderHints()
        })
        row.appendChild(b)
        body.appendChild(row)
      }
      item.appendChild(body)
      this.panelBody.appendChild(item)
    }

    const close = this.el('button', 'btn clickable', UI_TEXT.close)
    close.addEventListener('click', () => this.closeTop())
    this.panelFoot.appendChild(close)
  }

  // -------------------------------------------------------------- settings

  private renderSettings(): void {
    this.showPanel(UI_TEXT.settings)
    const s = this.settings.get()

    const slider = (
      label: string,
      help: string,
      value: number,
      min: number,
      max: number,
      step: number,
      fmt: (v: number) => string,
      onInput: (v: number) => void,
    ) => {
      const row = this.el('div', 'set-row')
      row.innerHTML = `<div><div class="set-label">${label}</div><span class="set-help">${help}</span></div>`
      const input = this.el('input')
      input.setAttribute('aria-label', label)
      input.type = 'range'
      input.min = String(min)
      input.max = String(max)
      input.step = String(step)
      input.value = String(value)
      input.className = 'clickable'
      const out = this.el('div', 'set-value', fmt(value))
      input.addEventListener('input', () => {
        const v = Number(input.value)
        out.textContent = fmt(v)
        onInput(v)
      })
      row.append(input, out)
      this.panelBody.appendChild(row)
    }

    const seg = <T extends string>(
      label: string,
      help: string,
      options: Array<[T, string]>,
      current: T,
      onPick: (v: T) => void,
    ) => {
      const row = this.el('div', 'set-row')
      row.innerHTML = `<div><div class="set-label">${label}</div><span class="set-help">${help}</span></div>`
      const box = this.el('div', 'seg clickable')
      for (const [v, text] of options) {
        const b = this.el('button', '', text)
        b.setAttribute('aria-pressed', v === current ? 'true' : 'false')
        b.addEventListener('click', () => {
          onPick(v)
          this.renderSettings()
        })
        box.appendChild(b)
      }
      const spacer = this.el('div', 'set-value', '')
      row.append(box, spacer)
      this.panelBody.appendChild(row)
    }

    const pct = (v: number) => `${Math.round(v * 100)}％`

    slider('全体の音量', 'すべての音量', s.masterVolume, 0, 1, 0.01, pct, (v) =>
      this.cb.onSettingChanged('masterVolume', v),
    )
    slider('環境音', '雨、室内の低い音、建物のきしみ', s.ambienceVolume, 0, 1, 0.01, pct, (v) =>
      this.cb.onSettingChanged('ambienceVolume', v),
    )
    slider('効果音', '操作音と仕掛けの音', s.sfxVolume, 0, 1, 0.01, pct, (v) =>
      this.cb.onSettingChanged('sfxVolume', v),
    )
    seg('消音', '音をすべて止める', [
      ['off', '鳴らす'],
      ['on', '止める'],
    ] as Array<['off' | 'on', string]>, s.muted ? 'on' : 'off', (v) =>
      this.cb.onSettingChanged('muted', v === 'on'),
    )
    seg(
      '文字の速さ',
      'メッセージの表示速度',
      [
        ['slow', 'ゆっくり'],
        ['normal', '標準'],
        ['fast', 'はやい'],
        ['instant', '一度に'],
      ] as Array<[GameSettings['textSpeed'], string]>,
      s.textSpeed,
      (v) => this.cb.onSettingChanged('textSpeed', v),
    )
    // No look sensitivity or invert-look here on purpose: the camera is fixed,
    // so both would be dials that turn and do nothing.
    seg(
      '画質',
      // Says what it actually does. Texture resolution is baked when the world
      // is built, so that part of the profile only takes effect on a reload -
      // claiming otherwise would be a setting that lies about itself.
      '重いときは下げる。影・解像度・後処理はすぐに変わり、質感は次回起動時から変わる。',
      [
        ['low', '軽量'],
        ['medium', '標準'],
        ['high', '高画質'],
      ] as Array<[GameSettings['quality'], string]>,
      s.quality,
      (v) => this.cb.onSettingChanged('quality', v),
    )
    seg('動きの軽減', 'カメラの揺れと演出の時間を抑える', [
      ['off', 'そのまま'],
      ['on', '抑える'],
    ] as Array<['off' | 'on', string]>, s.reducedMotion ? 'on' : 'off', (v) =>
      this.cb.onSettingChanged('reducedMotion', v === 'on'),
    )
    // Two states, not three. There are no standing markers to show "always"
    // versus "when near" - the only thing this setting still governs is whether
    // the 見渡す key lights the room's hotspots for a moment.
    seg(
      '見渡す（Ｑ）',
      '調べられる場所を一度だけ光らせる',
      [
        ['proximity', '使う'],
        ['off', '使わない'],
      ] as Array<[GameSettings['markerMode'], string]>,
      s.markerMode === 'off' ? 'off' : 'proximity',
      (v) => this.cb.onSettingChanged('markerMode', v),
    )
    slider('画面の文字の大きさ', '持ち物や地の文の大きさ', s.uiScale, 0.85, 1.3, 0.05, (v) => `${Math.round(v * 100)}％`, (v) =>
      this.cb.onSettingChanged('uiScale', v),
    )

    // actions
    const actions = this.el('div', 'set-row')
    actions.innerHTML = `<div><div class="set-label">画面と記録</div><span class="set-help">全画面表示、いま記録する、やり直す</span></div>`
    const box = this.el('div', 'detail-actions')
    const fs = this.el('button', 'btn ghost clickable', '全画面')
    fs.addEventListener('click', () => this.cb.onFullscreen())
    // Choose the slot. 「記録する」 used to write the single autosave silently,
    // which gave a player no way to keep one run while trying another ending.
    const save = this.el('button', 'btn ghost clickable', '記録する')
    save.addEventListener('click', () => this.openSlots('save'))
    const restart = this.el('button', 'btn ghost clickable', 'この章をやり直す')
    restart.addEventListener('click', () => {
      this.confirm('章をはじめからやり直す', 'この章の進行を、開始時点まで戻す。', () =>
        this.cb.onRestartChapter(),
      )
    })
    const wipe = this.el('button', 'btn danger clickable', 'すべての進行を消去')
    wipe.addEventListener('click', () => {
      this.confirm('進行データを消す', 'セーブデータと覚え書きをすべて消去する。見届けたエンディングの記録は残る。', () =>
        this.cb.onResetProgress(),
      )
    })
    box.append(fs, save, restart, wipe)
    const spacer = this.el('div', 'set-value', '')
    actions.append(box, spacer)
    this.panelBody.appendChild(actions)

    const close = this.el('button', 'btn clickable', UI_TEXT.close)
    close.addEventListener('click', () => this.closeTop())
    this.panelFoot.appendChild(close)
  }

  private slotMode: SlotMode = 'load'

  /** Open the slot list in one of its three meanings. */
  openSlots(mode: SlotMode): void {
    this.slotMode = mode
    this.open('slots')
  }

  /**
   * The three save slots.
   *
   * One list serves starting, resuming and writing, because the thing the player
   * needs to see is the same in all three cases: what is in each slot, and which
   * one they are about to affect.
   */
  private renderSlots(): void {
    const mode = this.slotMode
    // showPanel, not the fields directly: it is what actually puts the panel on
    // screen. Setting the title alone left the scrim up over an invisible panel.
    this.showPanel(
      mode === 'new' ? '新しく始める' : mode === 'load' ? 'つづきから' : '現在の進行を記録',
      '記録枠は三つまで',
    )

    const metas = this.cb.slotMetas()
    const list = this.el('div', 'slot-list')
    for (let i = 0; i < SLOT_COUNT; i++) {
      const m = metas[i] ?? null
      const row = this.el('button', 'slot-row clickable')
      // Loading an empty slot is the one combination with nothing to do.
      const dead = mode === 'load' && !m?.exists
      if (dead) {
        row.disabled = true
        row.classList.add('slot-empty')
      }
      const name = this.el('div', 'slot-name', `記録枠 ${['一', '二', '三'][i]}`)
      const body = this.el('div', 'slot-body')
      if (m?.exists) {
        body.textContent = `${m.areaLabel}　謎 ${m.solvedCount}　${formatPlaytime(m.playtimeMs)}`
        const when = this.el('div', 'slot-when', formatSavedAt(m.savedAt))
        body.appendChild(when)
        if (m.endingId) name.appendChild(this.el('span', 'slot-tag', '見届けた'))
      } else {
        body.textContent = '空'
      }
      // Say plainly when a choice destroys something.
      if (m?.exists && mode !== 'load') {
        row.appendChild(this.el('span', 'slot-warn', '上書き'))
      }
      row.append(name, body)
      row.addEventListener('click', () => {
        if (m?.exists && mode !== 'load') {
          this.confirmSlot(mode, i)
          return
        }
        this.cb.onSlotChosen(mode, i)
        this.closeTop()
      })
      list.appendChild(row)
    }
    this.panelBody.appendChild(list)

    const close = this.el('button', 'btn clickable', UI_TEXT.cancel)
    close.addEventListener('click', () => this.closeTop())
    this.panelFoot.appendChild(close)
  }

  private confirmSlot(mode: SlotMode, slot: number): void {
    const which = `記録枠 ${['一', '二', '三'][slot]}`
    this.confirm(
      `${which}に上書きする`,
      mode === 'new'
        ? `${which}の記録を上書きする。元の記録は戻せない。`
        : `${which}を現在の進行で上書きする。`,
      () => this.cb.onSlotChosen(mode, slot),
      () => this.renderSlots(),
    )
  }

  private confirm(title: string, body: string, onYes: () => void, onNo?: () => void): void {
    this.showPanel(title)
    const p = this.el('p', 'detail-desc jp', body)
    this.panelBody.appendChild(p)
    const no = this.el('button', 'btn ghost clickable', UI_TEXT.cancel)
    no.addEventListener('click', () => (onNo ? onNo() : this.renderSettingsFresh()))
    const yes = this.el('button', 'btn danger clickable', UI_TEXT.confirm)
    yes.addEventListener('click', () => {
      onYes()
      this.closeTop()
    })
    this.panelFoot.append(no, yes)
  }

  private renderSettingsFresh(): void {
    this.panelBody.innerHTML = ''
    this.panelFoot.innerHTML = ''
    this.renderSettings()
  }

  // ---------------------------------------------------------------- ending

  async showEnding(ending: EndingText, seenCount: number, total: number): Promise<void> {
    this.setHudVisible(false)
    this.clearNarration()
    this.endingEl.innerHTML = ''
    const title = this.el('h1', 'e-title e-line', ending.title)
    title.style.animationDelay = '0.4s'
    const body = this.el('div', 'e-body e-line jp')
    body.textContent = ending.body
    body.style.animationDelay = '1.2s'
    const card = this.el('div', 'e-card e-line', ending.card)
    card.style.animationDelay = '2.4s'
    const foot = this.el('div', 'detail-actions e-line')
    foot.style.animationDelay = '3.2s'
    const again = this.el('button', 'btn clickable', 'タイトルへ戻る')
    again.addEventListener('click', () => this.cb.onEndingDismiss())
    const credits = this.el('button', 'btn ghost clickable', '制作について')
    credits.addEventListener('click', () => this.open('credits'))
    foot.append(again, credits)
    const tally = this.el('div', 'panel-sub e-line', `見届けた結末　${kanjiNum(seenCount)} ／ ${kanjiNum(total)}`)
    tally.style.animationDelay = '3.0s'
    this.endingEl.append(title, body, card, tally, foot)
    // Which ending this is, so the screen can carry its own colour: the plain
    // one cold, the true one warm, the hidden one lit like the safelight.
    this.endingEl.dataset.ending = ending.id
    this.endingEl.dataset.open = '1'
    await wait(400)
  }

  hideEnding(): void {
    this.endingEl.dataset.open = ''
    window.setTimeout(() => (this.endingEl.innerHTML = ''), 1200)
  }

  // -------------------------------------------------------------- shortcuts

  private refreshBadges(): void {
    const inv = this.hudBar.querySelector('[data-panel="inventory"]') as HTMLElement | null
    const newCount = this.state.inventory.filter((e) => e.state === 'new').length
    if (inv) {
      if (newCount > 0) inv.dataset.badge = String(newCount)
      else delete inv.dataset.badge
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.titleVisible && this.openPanel === null) return
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    switch (e.code) {
      case 'Escape':
        // Close-up first. あそびかた promises 「右クリック か Esc」 to leave a
        // close-up, and Escape did not know close-ups existed - it opened the
        // settings panel instead, which is the opposite of what the game's own
        // instruction screen teaches.
        if (this.openPanel) {
          e.preventDefault()
          this.closeTop()
        } else if (this.closeupBar.dataset.show === '1') {
          e.preventDefault()
          this.cb.onCloseupBack()
        } else if (!this.titleVisible) {
          e.preventDefault()
          this.open('settings')
        }
        break
      case 'KeyI':
        if (!this.titleVisible) this.toggle('inventory')
        break
      case 'KeyJ':
        if (!this.titleVisible) this.toggle('clues')
        break
      case 'KeyH':
        if (!this.titleVisible) this.toggle('hints')
        break
      case 'KeyF':
        if (this.openPanel === 'inventory') this.inspector.flip()
        break
      default:
        break
    }
  }
}

/** Kanji numerals, so counts built in code match the prose everywhere else. */
function kanjiNum(n: number): string {
  const d = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (n < 0) return String(n)
  if (n < 10) return d[n]
  if (n < 20) return n === 10 ? '十' : `十${d[n % 10]}`
  if (n < 100) return `${d[Math.floor(n / 10)]}十${n % 10 ? d[n % 10] : ''}`
  return String(n)
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}
