import { TEXT_SPEED_CPS, type GameSettings, type SettingsStore } from '../core/Settings'
import type { GameState } from '../state/GameState'
import { CREDITS, DOCUMENTS, HOW_TO_PLAY, UI_TEXT, type EndingText } from '../content/chapter01/text'
import { ITEMS } from '../content/chapter01/items'
import type { Inspector } from '../systems/Inspector'
import { VERB_LABEL, type HoverInfo } from '../systems/Interaction'

/**
 * The whole DOM overlay.
 *
 * Kept in one place because every panel shares the same surface language and
 * the same open/close discipline: exactly one modal layer at a time, Escape
 * always closes the topmost thing, and the 3D input is suspended while a panel
 * is up so a stray click never reaches the room behind it.
 */

export interface UICallbacks {
  onNewGame(): void
  onContinue(): void
  onSelectItem(id: string | null): void
  onCombine(a: string, b: string): void
  onTakeHint(puzzleId: string): void
  onSettingChanged<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void
  onResetProgress(): void
  onRestartChapter(): void
  onSave(): void
  onPanelOpen(): void
  onPanelClose(): void
  onEndingDismiss(): void
  onFullscreen(): void
  activeHints(): Array<{ id: string; title: string; steps: string[]; taken: number }>
}

type PanelId = 'inventory' | 'clues' | 'hints' | 'settings' | 'document' | 'credits' | 'howto' | null

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

  private openPanel: PanelId = null
  private narrationQueue: string[] = []
  private narrationTimer = 0
  private narrationResolve: (() => void) | null = null
  private selectedForCombine: string | null = null
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
    const rule = this.el('span', 't-rule')
    const sub = this.el('p', 't-sub', UI_TEXT.subtitle)
    lockup.append(main, rule, sub)

    const menu = this.el('div')
    menu.id = 'title-menu'
    this.titleScreen.append(gradeEl, lockup, menu)

    const foot = this.el('div', '', `v1.0　／　${UI_TEXT.foot}`)
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
    add(UI_TEXT.menuNew, null, () => this.cb.onNewGame())
    if (opts.hasSave) add(UI_TEXT.menuContinue, opts.saveLabel ?? null, () => this.cb.onContinue())
    add(UI_TEXT.menuSettings, null, () => this.open('settings'))
    add(UI_TEXT.menuHowTo, null, () => this.open('howto'))
    // Credits are not a title-screen menu item: they belong at the end of a
    // playthrough, so they are reached from the ending screen instead.
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
    window.clearTimeout(this.narrationTimer)
    this.narrationResolve?.()
    return new Promise<void>((resolve) => {
      this.narrationResolve = resolve
      this.playNextLine(opts.hold ?? 1500)
    })
  }

  /** Instantly finish the line being typed, or move to the next one. */
  advanceNarration(): boolean {
    if (!this.narration.dataset.show) return false
    if (this.typing) {
      this.typing = false
      this.narrationLine.textContent = this.currentFull
      window.clearTimeout(this.narrationTimer)
      this.narrationTimer = window.setTimeout(() => this.playNextLine(1500), 900)
      return true
    }
    window.clearTimeout(this.narrationTimer)
    this.playNextLine(1500)
    return true
  }

  private typing = false
  private currentFull = ''

  private playNextLine(hold: number): void {
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
    const cps = TEXT_SPEED_CPS[this.settings.get().textSpeed]
    if (!Number.isFinite(cps)) {
      this.narrationLine.textContent = next
      this.typing = false
      this.narrationTimer = window.setTimeout(() => this.playNextLine(hold), hold)
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
        this.narrationTimer = window.setTimeout(() => this.playNextLine(hold), hold)
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
    this.verbChip.style.left = `${info.screen.x}%`
    this.verbChip.style.top = `${info.screen.y}%`
    this.verbChip.dataset.show = '1'
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
        this.renderHints()
        break
      case 'settings':
        this.renderSettings()
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
    this.panelTitle.textContent = title
    this.panelSub.textContent = sub
    this.panel.style.display = ''
    requestAnimationFrame(() => (this.panel.dataset.open = '1'))
  }

  private closePanelDom(): void {
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
    this.showPanel(UI_TEXT.inventory, `${this.state.inventory.length} 点`)
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

    const first = this.state.selectedItemId ?? this.state.inventory[0].id
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
    selBtn.addEventListener('click', () => {
      this.cb.onSelectItem(isSel ? null : id)
      this.renderInventory()
    })
    actions.appendChild(selBtn)

    const comBtn = this.el('button', 'btn ghost clickable')
    comBtn.textContent = this.selectedForCombine === id ? UI_TEXT.cancel : UI_TEXT.combine
    comBtn.addEventListener('click', () => {
      this.selectedForCombine = this.selectedForCombine === id ? null : id
      this.renderInventory()
      if (this.selectedForCombine) this.toast('合わせる相手を選ぶ')
    })
    actions.appendChild(comBtn)

    if (def.document) {
      const readBtn = this.el('button', 'btn ghost clickable')
      readBtn.textContent = UI_TEXT.read
      readBtn.addEventListener('click', () => this.openDocument(def.document as string))
      actions.appendChild(readBtn)
    }
    this.detailHost.appendChild(actions)

    this.inspector.setHeldItems(this.state.inventory.map((e) => e.id))
    this.inspector.show(def, entry.found)
    this.bindInspectorInput(stage)

    this.panelFoot.innerHTML = ''
    const close = this.el('button', 'btn clickable', UI_TEXT.close)
    close.addEventListener('click', () => this.closeTop())
    this.panelFoot.appendChild(close)
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
    this.showPanel(UI_TEXT.clues, `${this.state.clues.length} 件`)
    if (this.state.clues.length === 0) {
      this.panelBody.innerHTML = `<div class="inv-empty">${UI_TEXT.cluesEmpty}</div>`
    } else {
      for (const c of this.state.clues) {
        const box = this.el('div', 'clue')
        box.innerHTML = `<h4>${c.title}</h4><p class="jp">${c.body}</p><span class="src">${c.source}</span>`
        this.panelBody.appendChild(box)
      }
    }
    const close = this.el('button', 'btn clickable', UI_TEXT.close)
    close.addEventListener('click', () => this.closeTop())
    this.panelFoot.appendChild(close)
  }

  // ----------------------------------------------------------------- hints

  private renderHints(): void {
    const active = this.cb.activeHints()
    this.showPanel(UI_TEXT.hints, active.length ? '' : UI_TEXT.hintNothingActive)
    if (active.length === 0) {
      this.panelBody.innerHTML = `<div class="inv-empty">${UI_TEXT.hintNothingActive}</div>`
    }
    for (const h of active) {
      const block = this.el('div', 'hint-block')
      block.innerHTML = `<h4>${h.title}</h4>`
      h.steps.forEach((s, i) => {
        if (i < h.taken) {
          const p = this.el('p', 'hint-step jp', s)
          block.appendChild(p)
        } else if (i === h.taken) {
          const row = this.el('div', 'hint-locked')
          row.innerHTML = `<span>${UI_TEXT.hintTierLabels[i]}　—　${UI_TEXT.hintLockedNote}</span>`
          const b = this.el('button', 'btn ghost clickable', UI_TEXT.hintReveal)
          b.addEventListener('click', () => {
            this.cb.onTakeHint(h.id)
            this.renderHints()
          })
          row.appendChild(b)
          block.appendChild(row)
        }
      })
      if (h.taken >= h.steps.length) {
        const p = this.el('p', 'hint-step jp', UI_TEXT.hintAllTaken)
        block.appendChild(p)
      }
      this.panelBody.appendChild(block)
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

    slider('全体の音量', '館の音すべてに掛かる', s.masterVolume, 0, 1, 0.01, pct, (v) =>
      this.cb.onSettingChanged('masterVolume', v),
    )
    slider('環境音', '雨、室内の低い音、建物のきしみ', s.ambienceVolume, 0, 1, 0.01, pct, (v) =>
      this.cb.onSettingChanged('ambienceVolume', v),
    )
    slider('効果音', '触れたもの、動いたものの音', s.sfxVolume, 0, 1, 0.01, pct, (v) =>
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
      '地の文が出る速さ',
      [
        ['slow', 'ゆっくり'],
        ['normal', 'ふつう'],
        ['fast', 'はやい'],
        ['instant', '一度に'],
      ] as Array<[GameSettings['textSpeed'], string]>,
      s.textSpeed,
      (v) => this.cb.onSettingChanged('textSpeed', v),
    )
    slider('視点の感度', 'ドラッグで首を振る速さ', s.lookSensitivity, 0.4, 2, 0.05, (v) => `${v.toFixed(2)}倍`, (v) =>
      this.cb.onSettingChanged('lookSensitivity', v),
    )
    seg('視点の上下', '上下の向きを入れ替える', [
      ['off', 'そのまま'],
      ['on', '反転'],
    ] as Array<['off' | 'on', string]>, s.invertLook ? 'on' : 'off', (v) =>
      this.cb.onSettingChanged('invertLook', v === 'on'),
    )
    seg(
      '画質',
      '重いときは下げる。影と後処理が変わる',
      [
        ['low', '軽い'],
        ['medium', 'ふつう'],
        ['high', '綺麗'],
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
    seg(
      '調べられる場所の印',
      '常に出す／近づいたときだけ／出さない',
      [
        ['always', '常に'],
        ['proximity', '近くで'],
        ['off', '出さない'],
      ] as Array<[GameSettings['markerMode'], string]>,
      s.markerMode,
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
    const save = this.el('button', 'btn ghost clickable', '記録する')
    save.addEventListener('click', () => {
      this.cb.onSave()
      this.toast(UI_TEXT.saved)
    })
    const restart = this.el('button', 'btn ghost clickable', '章のやり直し')
    restart.addEventListener('click', () => {
      this.confirm('章をはじめからやり直す', 'いま館で起きたことは、すべて無かったことになる。', () =>
        this.cb.onRestartChapter(),
      )
    })
    const wipe = this.el('button', 'btn danger clickable', '進行データの消去')
    wipe.addEventListener('click', () => {
      this.confirm('進行データを消す', '記録も、控えも、すべて消える。見たエンディングの記録だけが残る。', () =>
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

  private confirm(title: string, body: string, onYes: () => void): void {
    this.panelBody.innerHTML = ''
    this.panelFoot.innerHTML = ''
    this.panelTitle.textContent = title
    this.panelSub.textContent = ''
    const p = this.el('p', 'detail-desc jp', body)
    this.panelBody.appendChild(p)
    const no = this.el('button', 'btn ghost clickable', UI_TEXT.cancel)
    no.addEventListener('click', () => this.renderSettingsFresh())
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
    const tally = this.el('div', 'panel-sub e-line', `見届けた結末　${seenCount} ／ ${total}`)
    tally.style.animationDelay = '3.0s'
    this.endingEl.append(title, body, card, tally, foot)
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
        if (this.openPanel) {
          e.preventDefault()
          this.closeTop()
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

function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}
