import { EventBus } from './EventBus'

/**
 * Pointer + keyboard + touch input, normalised.
 *
 * Look is drag-based rather than pointer-locked: this is a game about examining
 * things closely, and a locked cursor makes the DOM inventory and the close-up
 * panels hostile. Drag-look also maps one-to-one onto touch.
 */

export interface PointerSample {
  /** Normalised device coordinates, -1..1, y up. */
  ndcX: number
  ndcY: number
  clientX: number
  clientY: number
}

export type InputEvents = {
  /** Fires only when the pointer went down and up without becoming a drag. */
  click: PointerSample
  hover: PointerSample
  dragStart: PointerSample
  drag: { dx: number; dy: number; sample: PointerSample }
  dragEnd: PointerSample
  wheel: { delta: number }
  keydown: { code: string; key: string; repeat: boolean; event: KeyboardEvent }
  keyup: { code: string }
  pinch: { scale: number }
  leave: Record<string, never>
}

const DRAG_THRESHOLD_PX = 6

export class InputManager {
  readonly events = new EventBus<InputEvents>()

  private el: HTMLElement
  private pointerDown = false
  private dragging = false
  private downX = 0
  private downY = 0
  private lastX = 0
  private lastY = 0
  private activePointerId: number | null = null
  private keys = new Set<string>()
  private enabled = true
  private pinchStartDist = 0
  private touchPoints = new Map<number, { x: number; y: number }>()

  constructor(el: HTMLElement) {
    this.el = el
    el.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    el.addEventListener('pointerleave', this.onPointerLeave)
    el.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    el.addEventListener('contextmenu', this.onContextMenu)
  }

  setEnabled(v: boolean): void {
    this.enabled = v
    if (!v) {
      this.pointerDown = false
      this.dragging = false
      this.keys.clear()
      this.touchPoints.clear()
    }
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code)
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    this.el.removeEventListener('pointerleave', this.onPointerLeave)
    this.el.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.el.removeEventListener('contextmenu', this.onContextMenu)
    this.events.clear()
  }

  private sample(clientX: number, clientY: number): PointerSample {
    const r = this.el.getBoundingClientRect()
    return {
      clientX,
      clientY,
      ndcX: ((clientX - r.left) / r.width) * 2 - 1,
      ndcY: -(((clientY - r.top) / r.height) * 2 - 1),
    }
  }

  private onContextMenu = (e: Event): void => {
    e.preventDefault()
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled) return
    if (e.pointerType === 'touch') {
      this.touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.touchPoints.size === 2) {
        const [a, b] = Array.from(this.touchPoints.values())
        this.pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y)
        this.dragging = false
        this.pointerDown = false
        return
      }
    }
    if (this.activePointerId !== null) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    this.activePointerId = e.pointerId
    this.pointerDown = true
    this.dragging = false
    this.downX = this.lastX = e.clientX
    this.downY = this.lastY = e.clientY
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.enabled) return
    if (e.pointerType === 'touch' && this.touchPoints.has(e.pointerId)) {
      this.touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.touchPoints.size === 2) {
        const [a, b] = Array.from(this.touchPoints.values())
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (this.pinchStartDist > 0) {
          this.events.emit('pinch', { scale: d / this.pinchStartDist })
          this.pinchStartDist = d
        }
        return
      }
    }

    const s = this.sample(e.clientX, e.clientY)
    if (!this.pointerDown || e.pointerId !== this.activePointerId) {
      this.events.emit('hover', s)
      return
    }

    const dx = e.clientX - this.lastX
    const dy = e.clientY - this.lastY
    if (!this.dragging) {
      const moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY)
      if (moved > DRAG_THRESHOLD_PX) {
        this.dragging = true
        this.events.emit('dragStart', s)
      }
    }
    if (this.dragging && (dx !== 0 || dy !== 0)) {
      this.events.emit('drag', { dx, dy, sample: s })
    }
    this.lastX = e.clientX
    this.lastY = e.clientY
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      this.touchPoints.delete(e.pointerId)
      if (this.touchPoints.size < 2) this.pinchStartDist = 0
    }
    if (e.pointerId !== this.activePointerId) return
    this.activePointerId = null
    if (!this.enabled) {
      this.pointerDown = false
      this.dragging = false
      return
    }
    const s = this.sample(e.clientX, e.clientY)
    if (this.pointerDown && !this.dragging) {
      this.events.emit('click', s)
    } else if (this.dragging) {
      this.events.emit('dragEnd', s)
    }
    this.pointerDown = false
    this.dragging = false
  }

  private onPointerLeave = (): void => {
    this.events.emit('leave', {})
  }

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return
    e.preventDefault()
    // Normalise across deltaMode (pixel / line / page)
    const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
    this.events.emit('wheel', { delta: e.deltaY * factor })
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled) return
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    this.keys.add(e.code)
    this.events.emit('keydown', { code: e.code, key: e.key, repeat: e.repeat, event: e })
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code)
    this.events.emit('keyup', { code: e.code })
  }

  private onBlur = (): void => {
    this.keys.clear()
    this.pointerDown = false
    this.dragging = false
    this.activePointerId = null
    this.touchPoints.clear()
  }
}
