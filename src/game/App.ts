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
      /** Fire a hotspot by id, exactly as a click would. */
      act: (id: string, selected?: string | null) => {
        const hs = this.interaction.get(id)
        if (!hs) throw new Error(`no hotspot ${id}`)
        if (selected !== undefined) this.state.selectItem(selected)
        return hs.onActivate({ selectedItem: this.state.selectedItemId })
      },
      /** Hotspot ids currently pickable from where the player stands. */
      visible: () => {
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
    }
  }

  // ------------------------------------------------------------------ input

  private bindInput(): void {
    this.input.events.on('hover', (s) => {
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
    const hovered = this.interaction.currentHover
    if (!hovered) {
      this.ui.advanceNarration()
      return
    }
    this.interaction.activateHovered({ selectedItem: this.state.selectedItemId })
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
    this.rig.applyViewpoint(nodeToSpec(node))
    this.interaction.setScope(node.id)
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
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
      this.lastFrame = now
      this.frame(dt)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  private frame(dt: number): void {
    this.elapsed += dt
    this.timeline.update(dt)

    this.rig.update(dt)
    this.lighting.update(dt)
    this.chapter?.update(dt)
    if (this.rain) updateRain(this.rain, dt)
    if (this.dust) updateDust(this.dust, this.elapsed)

    if (this.inGame) {
      this.state.addPlaytime(dt * 1000)
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
