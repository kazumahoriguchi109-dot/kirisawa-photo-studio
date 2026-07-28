import * as THREE from 'three'
import type { CloseupSpec } from './CameraRig'

/**
 * Hotspot registry and picking.
 *
 * Hotspots are attached to real geometry, never to invisible planes floating in
 * space, so what the player clicks is what they see. Discoverability comes from
 * hover response plus the 「見渡す」 assist rather than permanent markers.
 */

export type Verb =
  | 'examine'
  | 'take'
  | 'open'
  | 'turn'
  | 'pull'
  | 'push'
  | 'read'
  | 'advance'
  | 'use'
  | 'back'

export const VERB_LABEL: Record<Verb, string> = {
  examine: '調べる',
  take: '手に取る',
  open: '開ける',
  turn: '回す',
  pull: '引く',
  push: '押す',
  read: '読む',
  advance: '進む',
  use: '使う',
  back: '戻る',
}

export interface HotspotContext {
  /** Item currently selected in the inventory, if any. */
  selectedItem: string | null
}

export interface HotspotDef {
  id: string
  /** Object(s) that can be picked. Children are included. */
  target: THREE.Object3D | THREE.Object3D[]
  /** Japanese noun shown in the verb chip. */
  label: string
  verb: Verb
  /** Which viewpoint or close-up this hotspot is live in. '*' for anywhere. */
  scope: string | string[]
  /** Only pickable when this returns true. */
  visible?: (ctx: HotspotContext) => boolean
  /** Verb override depending on state (e.g. show 使う when holding a key). */
  verbFor?: (ctx: HotspotContext) => Verb
  labelFor?: (ctx: HotspotContext) => string
  onActivate: (ctx: HotspotContext) => void | Promise<void>
  /** If set, activating moves the camera here first. */
  closeup?: CloseupSpec
  /** Nudge the notice ring / chip anchor. */
  anchorOffset?: THREE.Vector3
  /** Included in the 「見渡す」 sweep. Default true. */
  survey?: boolean
  priority?: number
}

export interface HoverInfo {
  hotspot: HotspotDef
  point: THREE.Vector3
  screen: { x: number; y: number }
}

export class InteractionSystem {
  private hotspots = new Map<string, HotspotDef>()
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private scope = ''
  private hovered: HotspotDef | null = null
  private enabled = true
  private lastHover: HoverInfo | null = null

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.raycaster.near = 0.01
    this.raycaster.far = 30
  }

  /**
   * A mesh can belong to several hotspots at once - the drawer front is part of
   * "the reception counter" from across the room and part of "pull the drawer"
   * once you are in close on it. So each object carries a LIST of ids and the
   * picker chooses the first one that is live in the current scope. Storing a
   * single id here meant every close-up silently stole its parent's geometry
   * and made the parent unclickable.
   */
  register(def: HotspotDef): void {
    this.hotspots.set(def.id, def)
    for (const o of Array.isArray(def.target) ? def.target : [def.target]) {
      o.traverse((c) => {
        const ids = (c.userData.hotspotIds as string[] | undefined) ?? []
        if (!ids.includes(def.id)) ids.push(def.id)
        c.userData.hotspotIds = ids
      })
    }
  }

  unregister(id: string): void {
    this.hotspots.delete(id)
  }

  get(id: string): HotspotDef | undefined {
    return this.hotspots.get(id)
  }

  allIds(): string[] {
    return Array.from(this.hotspots.keys())
  }

  setScope(scope: string): void {
    if (this.scope === scope) return
    this.scope = scope
    this.hovered = null
    this.lastHover = null
  }

  get currentScope(): string {
    return this.scope
  }

  setEnabled(v: boolean): void {
    this.enabled = v
    if (!v) {
      this.hovered = null
      this.lastHover = null
    }
  }

  private inScope(def: HotspotDef): boolean {
    if (def.scope === '*') return true
    if (Array.isArray(def.scope)) return def.scope.includes(this.scope) || def.scope.includes('*')
    return def.scope === this.scope
  }

  private active(ctx: HotspotContext): HotspotDef[] {
    const out: HotspotDef[] = []
    for (const def of this.hotspots.values()) {
      if (!this.inScope(def)) continue
      if (def.visible && !def.visible(ctx)) continue
      out.push(def)
    }
    return out
  }

  /** Everything currently pickable, for the survey assist. */
  surveyPoints(ctx: HotspotContext): Array<{ id: string; screen: { x: number; y: number } }> {
    const out: Array<{ id: string; screen: { x: number; y: number } }> = []
    const v = new THREE.Vector3()
    for (const def of this.active(ctx)) {
      if (def.survey === false) continue
      const target = Array.isArray(def.target) ? def.target[0] : def.target
      target.getWorldPosition(v)
      if (def.anchorOffset) v.add(def.anchorOffset)
      const inFront = v.clone().sub(this.camera.position).dot(this.camera.getWorldDirection(new THREE.Vector3()))
      if (inFront <= 0) continue
      const p = v.clone().project(this.camera)
      if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue
      out.push({ id: def.id, screen: { x: (p.x * 0.5 + 0.5) * 100, y: (-p.y * 0.5 + 0.5) * 100 } })
    }
    return out
  }

  /** Pick at normalised device coordinates. Returns the hovered hotspot. */
  pick(ndcX: number, ndcY: number, ctx: HotspotContext): HoverInfo | null {
    if (!this.enabled) return null
    this.pointer.set(ndcX, ndcY)
    this.raycaster.setFromCamera(this.pointer, this.camera)

    const candidates = this.active(ctx)
    if (candidates.length === 0) {
      this.hovered = null
      this.lastHover = null
      return null
    }

    const objects: THREE.Object3D[] = []
    for (const def of candidates) {
      for (const o of Array.isArray(def.target) ? def.target : [def.target]) objects.push(o)
    }
    const hits = this.raycaster.intersectObjects(objects, true)
    for (const hit of hits) {
      if (!isVisibleInWorld(hit.object)) continue
      // Walk up collecting every hotspot this surface belongs to, nearest
      // owner first, and take the first that is actually live right now.
      let node: THREE.Object3D | null = hit.object
      let def: HotspotDef | undefined
      while (node && !def) {
        const ids = node.userData.hotspotIds as string[] | undefined
        if (ids) {
          let best: HotspotDef | undefined
          for (const id of ids) {
            const cand = this.hotspots.get(id)
            if (!cand || !this.inScope(cand)) continue
            if (cand.visible && !cand.visible(ctx)) continue
            // >= so the later, more specific registration wins a tie: a close-up
            // sub-hotspot must beat the broad one it was layered on top of.
            if (!best || (cand.priority ?? 0) >= (best.priority ?? 0)) best = cand
          }
          def = best
        }
        node = node.parent
      }
      if (!def) continue
      const p = hit.point.clone()
      if (def.anchorOffset) p.add(def.anchorOffset)
      const proj = p.clone().project(this.camera)
      this.hovered = def
      this.lastHover = {
        hotspot: def,
        point: hit.point.clone(),
        screen: { x: (proj.x * 0.5 + 0.5) * 100, y: (-proj.y * 0.5 + 0.5) * 100 },
      }
      return this.lastHover
    }
    this.hovered = null
    this.lastHover = null
    return null
  }

  get currentHover(): HoverInfo | null {
    return this.lastHover
  }

  activateHovered(ctx: HotspotContext): HotspotDef | null {
    if (!this.enabled || !this.hovered) return null
    const def = this.hovered
    void def.onActivate(ctx)
    return def
  }

  /** Re-project the current hover anchor, e.g. while the camera drifts. */
  refreshAnchor(): void {
    if (!this.lastHover) return
    const p = this.lastHover.point.clone()
    const def = this.lastHover.hotspot
    if (def.anchorOffset) p.add(def.anchorOffset)
    const proj = p.project(this.camera)
    this.lastHover.screen = { x: (proj.x * 0.5 + 0.5) * 100, y: (-proj.y * 0.5 + 0.5) * 100 }
  }

  clear(): void {
    this.hotspots.clear()
    this.hovered = null
    this.lastHover = null
  }
}

/** three does not stop raycasting at an invisible ancestor; we must. */
function isVisibleInWorld(o: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = o
  while (node) {
    if (!node.visible) return false
    node = node.parent
  }
  return true
}
