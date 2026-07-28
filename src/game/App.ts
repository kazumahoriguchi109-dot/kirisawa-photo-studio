import * as THREE from 'three'
import { Timeline, damp } from '../core/Tween'
import { createRenderStack, type RenderStack } from '../core/Renderer'
import { InputManager } from '../core/Input'
import { SettingsStore, type GameSettings } from '../core/Settings'
import { SaveManager } from '../core/Save'
import { AudioEngine } from '../core/Audio'
import { GameState } from '../state/GameState'
import { CameraRig } from '../systems/CameraRig'
import { InteractionSystem } from '../systems/Interaction'
import { Inspector } from '../systems/Inspector'
import { GameUI } from '../ui/UI'
import { buildMaterials } from '../world/Materials'
import { setTextureResolutionScale } from '../world/Textures'
import { buildBuilding, updateRain } from '../world/Building'
import { LightingRig } from '../world/Lighting'
import { buildHall } from '../world/props/Hall'
import { buildStudio } from '../world/props/Studio'
import { buildDarkroom } from '../world/props/Darkroom'
import { buildOffice } from '../world/props/Office'
import { updateDust } from '../world/props/Common'
import { Chapter01 } from './Chapter01'
import { NODE_MAP, NODES, areaLabelForNode, nodeToSpec } from '../content/chapter01/nodes'
import { ENDINGS, OPENING_NARRATION, UI_TEXT } from '../content/chapter01/text'
import { QUALITY_PROFILES } from '../core/Renderer'

/**
 * Application shell: builds the world once, owns the frame loop, and routes
 * input either to the camera, to a puzzle that has captured the drag, or to the
 * UI. Chapter logic lives in Chapter01; nothing game-specific belongs here.
 */

const START_NODE = 'hall_s'
const TOTAL_ENDINGS = 3

/**
 * How much the close-up light lifts things, per lighting state. It is brightest
 * with the house in blackout, where the room itself contributes almost nothing;
 * under the safelight it stays low, because washing a darkroom in white light
 * would undo the one rule the darkroom scenes are built on.
 */
const INSPECTION_LIGHT: Record<string, number> = {
  blackout: 3.4,
  // Low once the house lights are on. The room already carries the exposure,
  // and the extra was enough to blow the highlights off the 1985 photograph -
  // which is the one image the observation puzzle asks the player to read.
  tungsten: 0.75,
  safelight: 0.8,
  dawn: 0.7,
}

/**
 * The title screen looks back at the shopfront from inside the dark hall: the
 * only light in the frame is the street coming through frosted glass, which is
 * exactly the image the game opens on.
 */
const TITLE_VIEW = {
  position: new THREE.Vector3(-1.15, 1.52, 3.95),
  yaw: Math.PI - 0.14,
  pitch: -0.02,
  fov: 44,
}

export class App {
  private settings = new SettingsStore()
  private state = new GameState('chapter01', START_NODE)
  private save = new SaveManager(this.state)
  private audio = new AudioEngine(this.settings)
  private timeline = new Timeline()
  private scene = new THREE.Scene()
  private rig: CameraRig
  private stack!: RenderStack
  private input: InputManager
  private interaction: InteractionSystem
  private inspector: Inspector
  private ui: GameUI
  private chapter!: Chapter01
  private canvas: HTMLCanvasElement

  private running = false
  private inGame = false
  private lastFrame = 0
  private exposure = 1.1
  private redShift = 0
  private elapsed = 0
  private pointerNdc = { x: 0, y: 0 }
  private dust: THREE.Points | null = null
  private rain: THREE.Points | null = null
  private endingShown = false

  constructor() {
    this.canvas = document.getElementById('stage') as HTMLCanvasElement
    const q = QUALITY_PROFILES[this.settings.get().quality]
    setTextureResolutionScale(q.textureScale)

    this.rig = new CameraRig(this.timeline, window.innerWidth / window.innerHeight)
    this.interaction = new InteractionSystem(this.rig.camera)
    this.input = new InputManager(this.canvas)

    const mats = buildMaterials()
    const building = buildBuilding(mats)
    this.scene.add(building.root)
    const hall = buildHall(mats)
    const studio = buildStudio(mats)
    const darkroom = buildDarkroom(mats)
    const office = buildOffice(mats)
    this.scene.add(hall.group, studio.group, darkroom.group, office.group)
    this.dust = studio.dust
    this.rain = building.rain

    const lighting = new LightingRig(this.scene, mats)

    this.inspector = new Inspector(mats, {
      onDetailFound: (item, detail) => {
        this.state.recordDetail(item.id, detail.id)
        this.audio.play('discovery')
        this.ui.onDetailFound(detail.title, detail.text)
        this.ui.toast(detail.title, '気づいた')
        if (detail.clue) {
          this.state.addClue(detail.clue)
        }
        this.save.save()
      },
    })

    this.ui = new GameUI(this.state, this.settings, this.inspector, {
      onTurn: (dir) => void this.chapter.turn(dir),
      onEdgeClick: (clientX, clientY) => {
        if (!this.inGame || this.ui.isPanelOpen || this.chapter.isBusy) return false
        const r = this.canvas.getBoundingClientRect()
        const ndc = {
          x: ((clientX - r.left) / r.width) * 2 - 1,
          y: -((clientY - r.top) / r.height) * 2 + 1,
        }
        this.interaction.setScope(this.chapter.currentScope)
        const hit = this.interaction.pick(ndc.x, ndc.y, { selectedItem: this.state.selectedItemId })
        if (!hit) return false
        this.pointerNdc = ndc
        void this.onClick()
        return true
      },
      onCloseupBack: () => void this.chapter.exitCloseup(),
      onNewGame: () => void this.startNewGame(),
      onContinue: () => void this.continueGame(),
      onSelectItem: (id) => this.state.selectItem(id),
      onCombine: (a, b) => this.chapter.combine(a, b),
      onTakeHint: (id) => this.chapter.takeHint(id),
      onSettingChanged: (k, v) => this.applySetting(k, v),
      onResetProgress: () => this.resetProgress(),
      onRestartChapter: () => void this.restartChapter(),
      onSave: () => this.save.save(),
      onPanelOpen: () => {
        this.interaction.setEnabled(false)
        this.ui.setHover(null, null)
        this.chapter?.clearDrag()
      },
      onPanelClose: () => {
        if (this.inGame) this.interaction.setEnabled(true)
      },
      onEndingDismiss: () => this.returnToTitle(),
      onFullscreen: () => this.toggleFullscreen(),
      activeHints: () => this.chapter.activeHints(),
    })

    this.chapter = new Chapter01({
      scene: this.scene,
      state: this.state,
      rig: this.rig,
      interaction: this.interaction,
      ui: this.ui,
      audio: this.audio,
      timeline: this.timeline,
      lighting,
      save: this.save,
      mats,
      building,
      hall,
      studio,
      darkroom,
      office,
      onEnding: (id) => void this.playEnding(id),
    })
    this.lighting = lighting
    // Rides on the camera, so it has to be in the graph: a PerspectiveCamera is
    // only traversed for lighting if it is itself part of the scene.
    this.scene.add(this.rig.camera)
    this.inspectionLight = lighting.makeInspectionLight(this.rig.camera)

    this.stack = createRenderStack(this.canvas, this.scene, this.rig.camera, this.settings.get().quality)
    this.resize()

    this.bindInput()
    this.applyMotionScale()
    this.rig.applyViewpoint(TITLE_VIEW)
    this.interaction.setEnabled(false)
    this.ui.setHudVisible(false)
    this.refreshTitle()

    window.addEventListener('resize', () => this.resize())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.audio.suspend()
      else if (this.inGame) this.audio.resume()
    })

    this.start()
  }

  private lighting: LightingRig
  private inspectionLight!: THREE.PointLight

  /**
   * Development-only handle used by the automated playthrough check. It drives
   * the same code paths the player does - it does not set flags directly - so a
   * scripted run is a real run.
   */
  get debug() {
    return {
      state: this.state,
      chapter: this.chapter,
      ui: this.ui,
      save: this.save,
      begin: () => this.startNewGame(),
      go: (nodeId: string) => this.chapter.goToNode(nodeId, true),
      /**
       * Fire a hotspot by id, exactly as a click would - including refusing the
       * ones a click could not reach. Without the guards below it is possible
       * to "discover" that the player can walk out of the building without
       * solving the lock, when in fact the hotspot that does it is hidden until
       * the lock is open and no click could ever land on it.
       */
      act: (id: string, selected?: string | null) => {
        const hs = this.interaction.get(id)
        if (!hs) throw new Error(`no hotspot ${id}`)
        const scope = this.chapter.currentScope
        const scopes = Array.isArray(hs.scope) ? hs.scope : [hs.scope]
        if (!scopes.includes(scope)) {
          throw new Error(`hotspot ${id} is out of scope (standing at ${scope})`)
        }
        if (selected !== undefined) this.state.selectItem(selected)
        if (hs.visible && !hs.visible({ selectedItem: this.state.selectedItemId })) {
          throw new Error(`hotspot ${id} is not visible right now`)
        }
        return hs.onActivate({ selectedItem: this.state.selectedItemId })
      },
      /**
       * Hotspot ids currently pickable from where the player stands.
       *
       * Refreshes the transforms first. Survey points are projected through the
       * camera, and world matrices are normally only updated by the renderer -
       * so in a throttled tab this used to test against transforms several
       * seconds stale and return an empty list at viewpoints with plenty on
       * screen, which is a very convincing way to fake a bug.
       */
      visible: () => {
        this.rig.camera.updateMatrixWorld(true)
        this.scene.updateMatrixWorld(true)
        this.interaction.setScope(this.chapter.currentScope)
        return this.interaction
          .surveyPoints({ selectedItem: this.state.selectedItemId })
          .map((p) => p.id)
      },
      chapterHotspot: (id: string) => this.interaction.get(id),
      scope: () => this.chapter.currentScope,
      three: THREE,
      camera: this.rig.camera,
      scene: this.scene,
      nodeIds: () => NODES.map((n) => n.id),
      allHotspotIds: () => this.interaction.allIds(),
      setLook: (yaw: number, pitch: number) => this.rig.setLookForTest(yaw, pitch),
      syncCamera: () => this.rig.camera.updateMatrixWorld(true),
      pick: (ndcX: number, ndcY: number) => {
        this.interaction.setEnabled(true)
        this.interaction.setScope(this.chapter.currentScope)
        return this.interaction.pick(ndcX, ndcY, { selectedItem: this.state.selectedItemId })
      },
      flags: () => this.state.snapshot().flags,
      items: () => this.state.inventory.map((e) => `${e.id}:${e.state}`),
      clues: () => this.state.clues.map((c) => c.id),
      hints: () => this.chapter.activeHints().map((h) => h.id),
      lighting: () => this.state.lighting,
      /**
       * Advance the simulation without waiting for requestAnimationFrame.
       *
       * A headless or backgrounded tab throttles rAF to about one frame a
       * second, and `frame()` clamps dt to 50 ms, so a half-second camera move
       * would take ten real seconds to finish and every scripted wait would
       * expire long before the game had actually done anything. Pumping fixed
       * steps here makes a scripted run depend only on game time.
       */
      pump: (seconds: number, step = 1 / 60) => {
        for (let t = 0; t < seconds; t += step) {
          this.elapsed += step
          this.timeline.update(step)
          this.rig.update(step)
          this.lighting.update(step)
          // The close-up light too, or every measurement taken through `pump`
          // reports a close-up as darker than any player will ever see it.
          this.inspectionLight.intensity = damp(
            this.inspectionLight.intensity,
            this.rig.currentMode === 'closeup' ? INSPECTION_LIGHT[this.state.lighting] : 0,
            7,
            step,
          )
          this.chapter?.update(step)
        }
      },
      /**
       * Render one frame now and hand back the pixels. Needs `?capture=1` so
       * the back buffer survives long enough to be read; without it the canvas
       * reads back blank.
       */
      renderer: () => this.stack.renderer,
      composer: () => this.stack.composer,
      /**
       * Render a frame and measure it. "Looks blown out" and "looks unreadably
       * dark" are the two failure modes close-ups keep falling into, and both
       * are far easier to catch as a number than by eye across seventeen
       * compositions.
       */
      frameStats: (step = 96) => {
        const r = this.stack.renderer
        this.scene.updateMatrixWorld(true)
        this.stack.render(1 / 60)
        const gl = r.getContext()
        const w = gl.drawingBufferWidth
        const h = gl.drawingBufferHeight
        const px = new Uint8Array(w * h * 4)
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
        let n = 0
        let sum = 0
        let blown = 0
        let dark = 0
        for (let y = 0; y < h; y += step) {
          for (let x = 0; x < w; x += step) {
            const i = (y * w + x) * 4
            const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255
            sum += l
            if (l > 0.94) blown++
            if (l < 0.05) dark++
            n++
          }
        }
        return {
          samples: n,
          mean: +(sum / n).toFixed(3),
          blown: +(blown / n).toFixed(3),
          dark: +(dark / n).toFixed(3),
        }
      },
      /** Draw calls and triangles for one freshly rendered frame. */
      renderCost: () => {
        const r = this.stack.renderer
        const prev = r.info.autoReset
        r.info.autoReset = false
        r.info.reset()
        this.scene.updateMatrixWorld(true)
        this.stack.render(1 / 60)
        const out = { calls: r.info.render.calls, triangles: r.info.render.triangles }
        r.info.autoReset = prev
        return out
      },
      snapshot: (quality = 0.72): string => {
        this.scene.updateMatrixWorld(true)
        this.stack.render(1 / 60)
        return this.canvas.toDataURL('image/jpeg', quality)
      },
    }
  }

  // ------------------------------------------------------------------ input

  private bindInput(): void {
    this.input.events.on('hover', (s) => {
      // Drop the label the moment the pointer moves any real distance, and let
      // the next frame put back whatever is actually under it. The frame is the
      // only thing that ever set it, so on a slow frame - or a frame that never
      // comes because the tab is not compositing - the old name stayed on
      // screen across rooms and into close-ups, naming something the cursor was
      // nowhere near. A label that outlives its object is worse than none.
      const moved = Math.abs(s.ndcX - this.pointerNdc.x) + Math.abs(s.ndcY - this.pointerNdc.y)
      if (moved > 0.004) this.ui.setHover(null, null)
      this.pointerNdc = { x: s.ndcX, y: s.ndcY }
    })
    // Dragging never steers the camera. The only thing that consumes a drag is
    // a puzzle that has explicitly captured it, such as the safe dial.
    this.input.events.on('drag', ({ dx, dy, sample }) => {
      this.pointerNdc = { x: sample.ndcX, y: sample.ndcY }
      const captured = this.chapter?.activeDragHandler
      if (captured) {
        captured(dx, dy)
        this.canvas.dataset.cursor = 'dragging'
      }
    })
    this.input.events.on('dragEnd', () => {
      this.canvas.dataset.cursor = ''
    })
    this.input.events.on('click', (s) => {
      this.pointerNdc = { x: s.ndcX, y: s.ndcY }
      void this.onClick()
    })
    this.input.events.on('wheel', () => {
      /* the fixed compositions do not zoom; the inspector handles its own wheel */
    })
    this.input.events.on('keydown', ({ code, event }) => {
      if (!this.inGame) return
      if (code === 'KeyQ') {
        event.preventDefault()
        this.survey()
      }
      if (code === 'Space' || code === 'Enter') {
        if (this.ui.advanceNarration()) event.preventDefault()
      }
      if (code === 'Backspace') {
        event.preventDefault()
        void this.chapter.exitCloseup()
      }
      if (!this.ui.isPanelOpen) {
        if (code === 'ArrowLeft' || code === 'KeyA') {
          event.preventDefault()
          void this.chapter.turn('left')
        }
        if (code === 'ArrowRight' || code === 'KeyD') {
          event.preventDefault()
          void this.chapter.turn('right')
        }
      }
    })
    // right click / two-finger back out of a close-up
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (this.inGame) void this.chapter.exitCloseup()
    })
  }

  private async onClick(): Promise<void> {
    if (!this.inGame) return
    await this.audio.start()
    if (this.ui.isPanelOpen) return
    if (this.chapter.activeDragHandler) {
      this.chapter.clearDrag()
      return
    }
    if (this.chapter.isBusy) {
      this.ui.advanceNarration()
      return
    }
    // Pick fresh at the pointer rather than trusting the cached hover.
    //
    // The cache is only refreshed by a rendered frame, and a click that arrives
    // before the next one - which is every click made straight after a camera
    // move settles - was tested against whatever was under the cursor one frame
    // ago. The player clicked a lever they could plainly see and got told they
    // had clicked a wall. Re-picking here costs one raycast and makes a click
    // mean what the screen says it means.
    this.scene.updateMatrixWorld(true)
    this.interaction.setScope(this.chapter.currentScope)
    const hovered =
      this.interaction.pick(this.pointerNdc.x, this.pointerNdc.y, {
        selectedItem: this.state.selectedItemId,
      }) ?? this.interaction.currentHover
    if (!hovered) {
      // A click that lands on nothing must still answer. Silence is the one
      // response a player cannot read: it is indistinguishable from a missed
      // hitbox, from scenery, and from the game having stopped responding.
      if (!this.ui.advanceNarration()) {
        this.chapter.remarkOnNothing(this.pointerNdc.x, this.pointerNdc.y)
      }
      return
    }
    hovered.hotspot.onActivate({ selectedItem: this.state.selectedItemId })
  }

  private survey(): void {
    if (this.settings.get().markerMode === 'off') return
    const points = this.interaction.surveyPoints({ selectedItem: this.state.selectedItemId })
    this.ui.surveyPulse(points)
    this.audio.play('shimmer', { gain: 0.35 })
  }

  // ---------------------------------------------------------------- session

  private refreshTitle(): void {
    const meta = this.save.meta(areaLabelForNode)
    const label = meta.exists
      ? `${meta.areaLabel}　／　${formatTime(meta.playtimeMs)}`
      : undefined
    this.ui.refreshTitleMenu({ hasSave: meta.exists, saveLabel: label })
  }

  private async startNewGame(): Promise<void> {
    await this.audio.start()
    this.save.clearProgress()
    this.state.resetProgress(true)
    this.chapter.syncWorldToState()
    await this.enterGame(true)
  }

  private async continueGame(): Promise<void> {
    await this.audio.start()
    if (!this.save.load()) {
      await this.startNewGame()
      return
    }
    this.chapter.syncWorldToState()
    await this.enterGame(false)
  }

  private async enterGame(fresh: boolean): Promise<void> {
    this.endingShown = false
    this.ui.hideTitle()
    await this.ui.closeShutter()
    const node = NODE_MAP.get(this.state.nodeId) ?? NODE_MAP.get(START_NODE)!
    // Go through the chapter rather than moving the rig directly. Endings are
    // reached from inside a close-up, and the chapter's own close-up state is
    // not part of the save - so continuing afterwards used to drop the player
    // back inside the entrance-lock close-up with the back control gone and no
    // way out at all, which made every ending after the first unreachable.
    await this.chapter.goToNode(node.id, true)
    this.rig.applyViewpoint(nodeToSpec(node))
    this.lighting.snapTo(this.state.lighting)
    this.audio.setLighting(this.state.lighting, true)
    this.exposure = this.lighting.targetGrade().exposure
    this.redShift = this.lighting.targetGrade().redShift
    this.inGame = true
    this.interaction.setEnabled(true)
    this.ui.setHudVisible(true)
    this.chapter.refreshTurnZones()
    this.audio.play('select')
    await this.ui.openShutter()
    if (fresh) {
      void this.ui.showChapterCard(UI_TEXT.chapterCard)
      await this.ui.narrate(OPENING_NARRATION, { hold: 1700 })
      this.save.save()
    } else {
      void this.ui.showChapterCard(areaLabelForNode(this.state.nodeId), 1800)
    }
  }

  private returnToTitle(): void {
    this.ui.hideEnding()
    this.inGame = false
    this.interaction.setEnabled(false)
    this.ui.setHudVisible(false)
    this.ui.clearNarration()
    this.refreshTitle()
    this.ui.showTitle()
    this.rig.applyViewpoint(TITLE_VIEW)
    this.lighting.snapTo('blackout')
    this.audio.setLighting('blackout', true)
  }

  private resetProgress(): void {
    this.save.clearProgress()
    this.state.resetProgress(true)
    this.chapter.syncWorldToState()
    this.ui.toast('進行データを消した')
    this.returnToTitle()
  }

  private async restartChapter(): Promise<void> {
    this.save.clearProgress()
    this.state.resetProgress(true)
    this.chapter.syncWorldToState()
    await this.enterGame(true)
  }

  private async playEnding(id: string): Promise<void> {
    if (this.endingShown) return
    this.endingShown = true
    const ending = ENDINGS[id] ?? ENDINGS.normal
    this.inGame = false
    this.interaction.setEnabled(false)
    this.ui.setHudVisible(false)
    this.state.reachEnding(ending.id)
    this.save.save()

    // the door swings, dawn floods in, then the camera walks out
    this.state.setLighting('dawn')
    this.lighting.setState('dawn')
    this.audio.setLighting('dawn')
    this.audio.playEscapeSequence()

    const leaf = this.chapter ? null : null
    void leaf
    const door = this.scene.getObjectByName('door-exit')
    if (door) {
      const base = door.rotation.y
      await this.timeline.to(2.2, (t) => {
        door.rotation.y = base - 1.5 * t
      }).promise
    }
    await this.rig.cinematic(
      { position: new THREE.Vector3(-1.82, 1.5, 7.4), target: new THREE.Vector3(-1.82, 1.4, 10.5), fov: 52 },
      4.5,
    )
    await this.ui.showEnding(ending, this.save.seenEndings().length, TOTAL_ENDINGS)
  }

  // --------------------------------------------------------------- settings

  private applySetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    this.settings.set(key, value)
    const s = this.settings.get()
    if (key === 'quality') {
      this.stack.setQuality(s.quality)
    }
    if (key === 'reducedMotion') this.applyMotionScale()
    this.audio.applyVolumes()
  }

  private applyMotionScale(): void {
    const reduced = this.settings.get().reducedMotion
    this.timeline.setMotionScale(reduced ? 0.28 : 1)
    this.rig.setSwayAmount(reduced ? 0 : 1)
  }

  private toggleFullscreen(): void {
    const el = document.documentElement
    if (!document.fullscreenElement) void el.requestFullscreen?.()
    else void document.exitFullscreen?.()
  }

  private resize(): void {
    this.stack.resize(window.innerWidth, window.innerHeight)
  }

  // ------------------------------------------------------------------ frame

  private start(): void {
    if (this.running) return
    this.running = true
    this.lastFrame = performance.now()
    const loop = (now: number) => {
      // Book the next frame before doing any work. Scheduling afterwards means
      // a single thrown error ends the loop for the rest of the session, and
      // the game stops dead with no clue as to why.
      requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
      this.lastFrame = now
      this.frame(dt)
    }
    requestAnimationFrame(loop)
  }

  private frame(dt: number): void {
    this.elapsed += dt
    this.timeline.update(dt)

    this.rig.update(dt)
    this.lighting.update(dt)
    // Shadow maps are not regenerated automatically. Refresh them while
    // something is actually moving - a door swinging, the backdrop rolling up,
    // the lights crossfading - and leave them alone the rest of the time, which
    // in a game of held compositions is nearly always.
    if (this.timeline.busy || this.lighting.settling) this.stack.requestShadowUpdate()
    // Faded rather than switched, so leaning in and out of a close-up does not
    // read as someone flicking a light on.
    this.inspectionLight.intensity = damp(
      this.inspectionLight.intensity,
      this.rig.currentMode === 'closeup' ? INSPECTION_LIGHT[this.state.lighting] : 0,
      7,
      dt,
    )
    this.chapter?.update(dt)
    if (this.rain) updateRain(this.rain, dt)
    if (this.dust) updateDust(this.dust, this.elapsed)

    if (this.inGame) {
      this.state.addPlaytime(dt * 1000)
      // While a panel is up or the camera is moving the pick is meaningless, so
      // the label is cleared rather than left standing. Left up, it survived
      // across rooms and named the last thing hovered while the cursor sat on
      // something else entirely - a label that lies is worse than no label.
      if (this.ui.isPanelOpen || this.chapter.isBusy) this.ui.setHover(null, null)
      if (!this.ui.isPanelOpen && !this.chapter.isBusy) {
        this.interaction.setScope(this.chapter.currentScope)
        const hover = this.interaction.pick(this.pointerNdc.x, this.pointerNdc.y, {
          selectedItem: this.state.selectedItemId,
        })
        if (hover) {
          if (this.ui.hoveredId !== hover.hotspot.id) this.audio.play('hover')
          this.ui.setHover(hover, this.state.selectedItemId)
          this.canvas.dataset.cursor =
            hover.hotspot.verb === 'advance' ? 'walk' : this.state.selectedItemId ? 'use' : 'examine'
        } else {
          this.ui.setHover(null, null)
          this.canvas.dataset.cursor = ''
        }
      } else {
        this.ui.setHover(null, null)
      }
    }

    // grade follows the lighting state
    const grade = this.lighting.targetGrade()
    this.exposure = damp(this.exposure, grade.exposure, 2.6, dt)
    this.redShift = damp(this.redShift, grade.redShift, 2.6, dt)
    this.stack.renderer.toneMappingExposure = this.exposure
    this.stack.grade.uniforms.uRedShift.value = this.redShift
    this.stack.render(dt)
  }
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return h > 0 ? `${h}時間${m}分` : `${m}分`
}
