import * as THREE from 'three'
import { Ease, type Timeline } from '../core/Tween'
import type { AudioEngine } from '../core/Audio'
import type { GameState } from '../state/GameState'
import type { CameraRig } from '../systems/CameraRig'
import { InteractionSystem, type HotspotDef } from '../systems/Interaction'
import type { GameUI } from '../ui/UI'
import type { SaveManager } from '../core/Save'
import { AMBIENT_TEXT, FEEDBACK } from '../content/chapter01/text'
import { CHRONICLE_PRINT_IDS, ITEMS, findRecipe } from '../content/chapter01/items'
import { HINTS } from '../content/chapter01/hints'
import { EXITS, NODE_MAP, nodeToSpec } from '../content/chapter01/nodes'
import type { BuildingRefs } from '../world/Building'
import type { HallProps } from '../world/props/Hall'
import type { StudioProps } from '../world/props/Studio'
import type { DarkroomProps } from '../world/props/Darkroom'
import type { OfficeProps } from '../world/props/Office'
import { processIconCanvas } from '../world/props/Hall'
import type { LightingRig } from '../world/Lighting'
import type { MaterialLibrary } from '../world/Materials'
import { lastFrameCanvas, photoTexture, portraitCanvas, studioRecordCanvas } from '../world/Photographs'
import { mesh } from '../world/Geo'
import { OPENINGS } from '../world/Layout'

/**
 * Chapter one: the whole game logic of 霧沢写真館.
 *
 * Everything the player can do lives here as a hotspot bound to real geometry.
 * State changes go through GameState so the save file, the UI and the world all
 * agree; nothing is stored in a closure that a reload would lose.
 */

export interface ChapterDeps {
  scene: THREE.Scene
  state: GameState
  rig: CameraRig
  interaction: InteractionSystem
  ui: GameUI
  audio: AudioEngine
  timeline: Timeline
  lighting: LightingRig
  save: SaveManager
  mats: MaterialLibrary
  building: BuildingRefs
  hall: HallProps
  studio: StudioProps
  darkroom: DarkroomProps
  office: OfficeProps
  onEnding(id: string): void
}

/** Shown beside the 戻る button so the player always knows what they are in. */
const CLOSEUP_TITLES: Record<string, string> = {
  cu_drawer: '受付の抽斗',
  cu_fusebox: '配電盤',
  cu_record: '昭和六十年の写真',
  cu_lock: '玄関の錠',
  cu_clock: '時計の跡',
  cu_chair: '写場の椅子',
  cu_socket: '巻き上げ軸',
  cu_chronicle: '年代記の壁',
  cu_camera: '大判カメラ',
  cu_glass: 'ピントグラス',
  cu_lamp: '撮影灯の台座',
  cu_trays: '作業台のバット',
  cu_shelf: '薬品棚',
  cu_enlarger: '引き伸ばし機',
  cu_line: '乾燥ロープ',
  cu_keys: '鍵板',
  cu_safe: '金庫',
}

/** The correct order of the four process rings, left to right. */
const LOCK_SOLUTION = [0, 1, 2, 3]
const SAFE_TARGET = 27
/** Portrait variants used by the four chronicle prints; must match items.ts. */
const CHRONICLE_VARIANTS = [3, 8, 13, 2]

type DragHandler = ((dx: number, dy: number) => void) | null

export class Chapter01 {
  private d: ChapterDeps
  private closeup: string | null = null
  private projector: THREE.SpotLight | null = null
  private projectionMesh: THREE.Mesh | null = null
  private dialAngle = 0
  private dragHandler: DragHandler = null
  private busy = false
  private phosphorMeshes: THREE.Mesh[] = []
  private ringIcons: THREE.Texture[] = []
  private backdropHeight = 0
  private groundGlassTex: THREE.CanvasTexture | null = null
  private projectionOffTimer = 0
  private secondHand: THREE.Object3D | null = null
  private readonly scratch = new THREE.Vector3()

  constructor(deps: ChapterDeps) {
    this.d = deps
    this.prepare()
  }

  // ------------------------------------------------------------------ setup

  private prepare(): void {
    const { studio, darkroom, office, hall } = this.d

    for (let i = 0; i < 4; i++) {
      const t = new THREE.CanvasTexture(processIconCanvas(i))
      t.colorSpace = THREE.SRGBColorSpace
      this.ringIcons.push(t)
    }

    this.phosphorMeshes = [hall.phosphor, studio.phosphor, office.phosphor, darkroom.phosphor]

    // Everything that only exists after a puzzle is hidden up front.
    studio.chronicleWall.visible = false
    studio.darkroomKey.visible = false
    studio.crankFitted.visible = false
    studio.lensInDrawer.visible = false
    hall.drawerContents.visible = false
    office.safeContents.visible = false
    darkroom.developedPrint.visible = false
    this.d.building.darkroomDoorLeaf.userData.closedYaw = this.d.building.darkroomDoorLeaf.rotation.y
    this.d.building.officeDoorLeaf.userData.closedYaw = this.d.building.officeDoorLeaf.rotation.y

    this.registerHotspots()
    this.syncWorldToState()
  }

  /** Rebuild every visual from flags. Called on load and after a reset. */
  syncWorldToState(): void {
    const s = this.d.state
    const { studio, hall, office, darkroom, building } = this.d

    studio.chronicleWall.visible = s.flag('chronicle_open')
    this.backdropHeight = s.flag('chronicle_open') ? 1 : 0
    this.applyBackdrop(this.backdropHeight)
    studio.crankFitted.visible = s.flag('crank_fitted')
    studio.crankOnNail.visible = !s.hasItem('crank') && !s.flag('crank_taken')
    studio.darkroomKey.visible = s.flag('key_revealed') && !s.hasItem('key_darkroom')
    studio.lensInDrawer.visible = !s.hasItem('lens') && !s.hasItem('loupe')
    hall.drawerContents.visible = s.flag('drawer_open')
    ;(hall.fuseSpare as unknown as THREE.Object3D).visible = !s.hasItem('spare_fuse')
    hall.receptionDrawer.position.z = s.flag('drawer_open') ? 0.28 : 0
    hall.fuseBoxDoor.rotation.y = s.flag('fusebox_open') ? -2.1 : 0
    hall.breakerLever.rotation.x = s.flag('power_on') ? 0.34 : -0.34
    office.safeContents.visible = s.flag('safe_open')
    office.safeDoor.rotation.y = s.flag('safe_open') ? -1.9 : 0
    darkroom.developerLiquid.visible = s.flag('developer_poured')
    darkroom.developedPrint.visible = s.flag('last_developed')
    if (s.flag('last_developed')) {
      const pm = darkroom.developedPrint.material as THREE.MeshStandardMaterial
      pm.map = photoTexture('last-frame-final', () => lastFrameCanvas({ width: 460, height: 340 }))
      pm.needsUpdate = true
    }
    // Things the player is carrying must not also still be sitting in the room.
    darkroom.powderTin.visible = !s.hasItem('powder') && !s.hasItem('developer')
    darkroom.waterBottle.visible = !s.hasItem('distilled_water') && !s.hasItem('developer')
    darkroom.negativeSleeve.visible = !s.hasItem('negative_old')
    const officeKeyMesh = darkroom.officeKey.getObjectByName('office-key')
    if (officeKeyMesh) officeKeyMesh.visible = !s.hasItem('key_office') && !s.flag('office_open')
    studio.tripodDrawer.position.z = s.flag('tripod_drawer_open') ? 0.19 : 0.05
    if (s.flag('mirror_read')) this.applyGroundGlassTexture()
    // An ending already reached must not leave the exit permanently "used": the
    // player continues from the same save to find the other endings.
    if (s.endingId) s.setFlag('exit_open', false)
    building.darkroomDoorLeaf.rotation.y =
      (building.darkroomDoorLeaf.userData.closedYaw as number) + (s.flag('darkroom_open') ? -1.6 : 0)
    building.officeDoorLeaf.rotation.y =
      (building.officeDoorLeaf.userData.closedYaw as number) + (s.flag('office_open') ? 1.6 : 0)

    // the seated fuse
    const seated = s.flag('fuse_seated')
    const socket = hall.fuseSockets[1]
    const existing = socket.getObjectByName('seated-fuse')
    if (seated && !existing) {
      const f = (hall.fuseSpare as unknown as THREE.Object3D).clone()
      // clone() copies userData, which would drag the reception drawer's
      // hotspot ids onto a fuse sitting inside the fuse box.
      f.traverse((c) => {
        c.userData = {}
      })
      f.name = 'seated-fuse'
      f.visible = true
      f.position.set(0, 0, 0.026)
      f.rotation.set(0, 0, 0)
      f.scale.setScalar(1)
      socket.add(f)
    } else if (!seated && existing) {
      socket.remove(existing)
    }

    // restored chronicle prints
    CHRONICLE_PRINT_IDS.forEach((id, i) => {
      const slot = studio.chronicleSlots[i]
      const placed = slot.getObjectByName('restored')
      if (s.flag(`restored_${id}`) && !placed) {
        const variant = CHRONICLE_VARIANTS[i]
        const m = mesh(
          new THREE.PlaneGeometry(0.33, 0.42),
          new THREE.MeshStandardMaterial({
            map: photoTexture(`item-${id}`, () => portraitCanvas(variant, { width: 230, height: 300, age: 0.24 })),
            roughness: 0.6,
          }),
          { cast: false },
        )
        m.name = 'restored'
        m.position.z = 0.006
        slot.add(m)
      }
    })

    // ring positions
    const rings = (s.puzzle('p9_lock').work.rings as number[] | undefined) ?? [2, 0, 3, 1]
    rings.forEach((v, i) => this.setRingIcon(i, v))

    this.dialAngle = (s.puzzle('p8_safe').work.angle as number | undefined) ?? 0
    this.applyDial()

    if (s.flag('enlarger_on') && s.flag('neg_loaded')) this.startProjection(true)

    this.updatePhosphor(true)
    this.d.lighting.snapTo(s.lighting)
  }

  // ------------------------------------------------------------- helpers

  private flag(k: string): boolean {
    return this.d.state.flag(k)
  }

  private say(text: string): void {
    void this.d.ui.narrate([text], { hold: 2200 })
  }

  private grant(itemId: string, message?: string): void {
    const def = ITEMS[itemId]
    if (!def) return
    if (this.d.state.addItem(itemId)) {
      this.d.audio.play('acquire')
      this.d.ui.toast(def.name, '手に取った')
      if (message) this.say(message)
      this.d.save.save()
    }
  }

  private clue(id: string, title: string, body: string, source: string): void {
    if (this.d.state.addClue({ id, title, body, source })) {
      this.d.audio.play('discovery')
      this.d.ui.toast(title, '控え')
    }
  }

  private solve(id: string): boolean {
    const first = this.d.state.solvePuzzle(id)
    if (first) {
      this.d.audio.play('correct')
      this.d.save.save()
    }
    return first
  }

  private wrong(message: string): void {
    this.d.audio.play('wrong')
    this.say(message)
  }

  // --------------------------------------------------------- camera plumbing

  get currentScope(): string {
    return this.closeup ?? this.d.state.nodeId
  }

  get isBusy(): boolean {
    return this.busy || this.d.rig.isBusy
  }

  get activeDragHandler(): DragHandler {
    return this.dragHandler
  }

  /** Step to another room through a doorway. */
  async goToNode(id: string, instant = false): Promise<void> {
    const node = NODE_MAP.get(id)
    if (!node) return
    this.closeup = null
    this.dragHandler = null
    this.d.ui.setCloseup(false)
    const spec = nodeToSpec(node)
    if (instant) this.d.rig.applyViewpoint(spec)
    else {
      this.busy = true
      this.d.audio.play('step')
      await this.d.rig.moveTo(spec, 1.0)
      this.busy = false
    }
    this.d.state.setNode(id)
    this.d.interaction.setScope(id)
    this.refreshTurnZones()
    this.d.save.saveThrottled(6000)
  }

  /** Turn to the next composition in this room's ring. */
  async turn(direction: 'left' | 'right'): Promise<void> {
    if (this.busy || this.closeup) return
    const here = NODE_MAP.get(this.d.state.nodeId)
    if (!here) return
    const nextId = direction === 'left' ? here.left : here.right
    const next = NODE_MAP.get(nextId)
    if (!next) return
    this.busy = true
    this.d.audio.play('step', { gain: 0.5 })
    await this.d.rig.turnTo(nodeToSpec(next), 0.52)
    this.busy = false
    this.d.state.setNode(nextId)
    this.d.interaction.setScope(nextId)
    this.refreshTurnZones()
    this.d.save.saveThrottled(8000)
  }

  /** Keep the two edge arrows labelled with where they actually lead. */
  refreshTurnZones(): void {
    if (this.closeup) {
      this.d.ui.setTurnZones(null, null)
      return
    }
    const here = NODE_MAP.get(this.d.state.nodeId)
    if (!here) {
      this.d.ui.setTurnZones(null, null)
      return
    }
    this.d.ui.setTurnZones(
      NODE_MAP.get(here.left)?.label ?? null,
      NODE_MAP.get(here.right)?.label ?? null,
    )
  }

  private async enterCloseup(
    id: string,
    position: [number, number, number],
    target: [number, number, number],
    opts: { fov?: number; label?: string } = {},
  ): Promise<void> {
    if (this.busy) return
    const label = opts.label ?? CLOSEUP_TITLES[id] ?? ''
    this.busy = true
    this.d.audio.play('closeupIn')
    await this.d.rig.enterCloseup({
      position: new THREE.Vector3(...position),
      target: new THREE.Vector3(...target),
      fov: opts.fov ?? 38,
    })
    this.closeup = id
    this.d.interaction.setScope(id)
    this.d.ui.setCloseup(true, label)
    this.refreshTurnZones()
    this.busy = false
  }

  async exitCloseup(): Promise<void> {
    if (!this.closeup || this.busy) return
    this.busy = true
    this.dragHandler = null
    this.stopProjection()
    this.d.ui.setCloseup(false)
    this.d.audio.play('closeupOut')
    await this.d.rig.exitCloseup()
    this.closeup = null
    this.d.interaction.setScope(this.d.state.nodeId)
    this.refreshTurnZones()
    this.busy = false
  }

  // ------------------------------------------------------------- animations

  private applyBackdrop(t: number): void {
    const cloth = this.d.studio.backdropCloth
    // t = 0 fully down, 1 fully raised
    const scale = Math.max(0.02, 1 - t)
    cloth.scale.y = scale
    cloth.visible = scale > 0.04
  }

  private setRingIcon(index: number, iconIndex: number): void {
    const ring = this.d.hall.lockRings[index]
    const face = ring.getObjectByName('ring-face') as THREE.Mesh | undefined
    if (!face) return
    const mat = face.material as THREE.MeshStandardMaterial
    mat.map = this.ringIcons[iconIndex]
    mat.needsUpdate = true
    ring.rotation.z = -iconIndex * (Math.PI / 2)
  }

  private applyDial(): void {
    this.d.office.safeDial.rotation.z = -this.dialAngle
  }

  private dialNumber(): number {
    const turns = this.dialAngle / (Math.PI * 2)
    const n = Math.round(((turns % 1) + 1) % 1 * 50)
    return n % 50
  }

  private updatePhosphor(instant = false): void {
    const glowing = this.d.state.lighting === 'safelight'
    for (const m of this.phosphorMeshes) {
      const mat = m.material as THREE.MeshBasicMaterial
      const target = glowing ? 0.5 : 0
      if (instant) mat.opacity = target
      else {
        this.d.timeline.to(
          1.1,
          (t) => {
            mat.opacity = mat.opacity + (target - mat.opacity) * t
          },
          { ease: Ease.inOutSine, tag: 'phosphor' },
        )
      }
    }
  }

  // ----------------------------------------------------------- registration

  private hs(def: HotspotDef): void {
    this.d.interaction.register(def)
  }

  private ambient(
    id: string,
    target: THREE.Object3D | THREE.Object3D[],
    label: string,
    scope: string | string[],
    textKey: string,
  ): void {
    this.hs({
      id,
      target,
      label,
      verb: 'examine',
      scope,
      onActivate: () => {
        this.say(AMBIENT_TEXT[textKey] ?? FEEDBACK.nothingHere)
        this.d.audio.play('select')
      },
    })
  }

  private registerHotspots(): void {
    this.registerExits()
    this.registerHall()
    this.registerStudio()
    this.registerDarkroom()
    this.registerOffice()
  }

  // --- doorways -----------------------------------------------------------

  /**
   * The way between rooms is the doorway itself. There are no floor markers:
   * the player clicks the opening they are walking through, which is both
   * clearer and stops the room being littered with glowing discs.
   */
  private registerExits(): void {
    const doorTarget: Record<string, THREE.Object3D> = {
      hall_n: this.d.hall.archThreshold,
      studio_s: this.d.hall.archThreshold,
      studio_w: this.d.building.darkroomDoorLeaf,
      darkroom_e: this.d.building.darkroomDoorLeaf,
      studio_e: this.d.building.officeDoorLeaf,
      office_w: this.d.building.officeDoorLeaf,
    }
    for (const [from, exit] of Object.entries(EXITS)) {
      const target = doorTarget[from]
      if (!target) continue
      this.hs({
        id: `exit:${from}`,
        target,
        label: exit.label,
        verb: 'advance',
        scope: from,
        priority: -2,
        onActivate: () => {
          if (exit.requires && !this.flag(exit.requires)) {
            this.wrong(exit.blockedMessage ?? FEEDBACK.nothingHere)
            return
          }
          void this.goToNode(exit.to)
        },
      })
    }
  }

  // --- hall ---------------------------------------------------------------

  private registerHall(): void {
    const { hall, building } = this.d

    // reception drawer
    this.hs({
      id: 'hall:drawer',
      target: hall.receptionDrawer,
      label: '受付の抽斗',
      verb: 'open',
      scope: ['hall_n'],
      onActivate: () => void this.enterCloseup('cu_drawer', [0.52, 1.24, 4.12], [0.52, 0.42, 3.4], { fov: 42 }),
    })
    this.hs({
      id: 'cu:drawer:pull',
      target: hall.receptionDrawer,
      label: '抽斗',
      verb: 'pull',
      scope: 'cu_drawer',
      labelFor: () => (this.flag('drawer_open') ? '抽斗の中' : '抽斗'),
      verbFor: () => (this.flag('drawer_open') ? 'examine' : 'pull'),
      onActivate: () => {
        if (!this.flag('drawer_open')) {
          this.d.state.setFlag('drawer_open')
          this.d.audio.play('drawer')
          hall.drawerContents.visible = true
          this.d.timeline.to(0.55, (t) => {
            hall.receptionDrawer.position.z = 0.28 * t
          }, { ease: Ease.outCubic })
          this.say('紙の袋に、磁器のヒューズが一本。鉛筆の折れたのと、名刺が一枚。')
          this.d.save.save()
          return
        }
        if (!this.d.state.hasItem('spare_fuse')) {
          this.grant('spare_fuse')
          ;(hall.fuseSpare as unknown as THREE.Object3D).visible = false
          return
        }
        this.say(FEEDBACK.emptyDrawer)
      },
    })

    // fuse box
    this.hs({
      id: 'hall:fusebox',
      target: hall.fuseBoxDoor.parent as THREE.Object3D,
      label: '配電盤',
      verb: 'examine',
      // The board is on the west wall: from the reception view it sits a full
      // 68 degrees off axis, i.e. off screen. It belongs to the west frame.
      scope: ['hall_w'],
      onActivate: () => void this.enterCloseup('cu_fusebox', [-2.62, 1.52, 4.1], [-3.12, 1.5, 4.1], { fov: 40 }),
    })
    this.hs({
      id: 'cu:fusebox:door',
      target: hall.fuseBoxDoor,
      label: '配電盤の蓋',
      verb: 'open',
      scope: 'cu_fusebox',
      visible: () => !this.flag('fusebox_open'),
      onActivate: () => {
        this.d.state.setFlag('fusebox_open')
        this.d.audio.play('latch')
        this.d.timeline.to(0.6, (t) => {
          hall.fuseBoxDoor.rotation.y = -2.1 * t
        }, { ease: Ease.outCubic })
        this.say('受け金が三つ。両端には磁器の筒が入っている。真ん中だけが空で、その後ろの板が黒く焦げている。')
        this.d.save.save()
      },
    })
    hall.fuseSockets.forEach((socket, i) => {
      this.hs({
        id: `cu:fusebox:socket${i}`,
        target: socket,
        label: i === 1 ? '空の受け金' : '受け金',
        verb: 'examine',
        scope: 'cu_fusebox',
        visible: () => this.flag('fusebox_open'),
        verbFor: (ctx) => (ctx.selectedItem === 'spare_fuse' ? 'use' : 'examine'),
        onActivate: (ctx) => {
          if (ctx.selectedItem === 'spare_fuse') {
            if (i !== 1) {
              this.wrong('そこは、まだ生きている。')
              return
            }
            if (this.flag('fuse_seated')) {
              this.say(FEEDBACK.alreadyDone)
              return
            }
            this.d.state.setFlag('fuse_seated')
            this.d.state.setItemState('spare_fuse', 'spent')
            this.d.state.selectItem(null)
            this.d.audio.play('fuseSeat')
            this.syncWorldToState()
            this.say('筒を受け金に落とす。かちりと座って、それきり動かなくなる。')
            this.d.save.save()
            return
          }
          if (i === 1) {
            this.say(
              this.flag('fuse_seated')
                ? '新しい筒が座っている。'
                : '空の受け金。奥の板が、丸く焦げている。同じ形のものが、この館のどこかにあるはずだ。',
            )
          } else {
            this.say('磁器の筒。中の線は繋がっている。触る理由がない。')
          }
          this.d.audio.play('select')
        },
      })
    })
    this.hs({
      id: 'cu:fusebox:lever',
      target: hall.breakerLever,
      label: '主レバー',
      verb: 'pull',
      scope: 'cu_fusebox',
      visible: () => this.flag('fusebox_open'),
      onActivate: () => void this.throwBreaker(),
    })

    // the 1985 record photograph
    this.hs({
      id: 'hall:record',
      target: hall.recordPhoto,
      label: '額入りの写真',
      verb: 'examine',
      scope: ['hall_n'],
      onActivate: () => void this.enterCloseup('cu_record', [-0.36, 1.66, 3.32], [-0.36, 1.66, 2.9], { fov: 32 }),
    })
    this.hs({
      id: 'cu:record:look',
      target: hall.recordPhoto,
      label: '昭和六十年の撮影室',
      verb: 'examine',
      scope: 'cu_record',
      onActivate: () => {
        if (!this.flag('saw_1985')) {
          this.d.state.setFlag('saw_1985')
          this.clue(
            'clue_1985',
            '昭和六十年の撮影室',
            '受付に、当時の撮影室を写した額がある。いまの撮影室と見比べれば、変わったところがあるはずだ。',
            '受付の額',
          )
          this.say('撮影室。背景幕の前に椅子が一脚。壁の上のほうに何かが掛かっている。撮られたのは、この館が閉まる年だ。')
          this.d.save.save()
        } else if (this.d.state.isSolved('p2_observe') && !this.d.state.hasItem('print_1')) {
          this.say('額の台紙が、後ろで一度剥がされている。')
        } else {
          this.say('同じ部屋が、まだ生きている顔で写っている。')
        }
        this.d.audio.play('select')
      },
    })
    this.hs({
      id: 'cu:record:back',
      target: hall.recordPhoto,
      label: '額の台紙',
      verb: 'pull',
      scope: 'cu_record',
      priority: 2,
      visible: () => this.d.state.isSolved('p2_observe') && !this.d.state.hasItem('print_1'),
      onActivate: () => {
        this.d.audio.play('paper')
        this.grant('print_1', '台紙と裏板のあいだに、写真がもう一枚挟んであった。子供が一人。抱かれていて、顔は半分だけ写っている。')
        this.d.save.save()
      },
    })

    // the exit door and its lock
    this.hs({
      id: 'hall:exitdoor',
      target: building.exitDoorLeaf,
      label: '玄関の引き戸',
      verb: 'examine',
      scope: 'hall_s',
      onActivate: () =>
        void this.enterCloseup(
          'cu_lock',
          [(OPENINGS.exitDoor.x0 + OPENINGS.exitDoor.x1) / 2, 1.06, OPENINGS.exitDoor.z - 0.52],
          [(OPENINGS.exitDoor.x0 + OPENINGS.exitDoor.x1) / 2, 1.06, OPENINGS.exitDoor.z - 0.06],
          { fov: 34 },
        ),
    })
    this.hs({
      id: 'cu:lock:leave',
      target: this.d.building.exitDoorLeaf,
      label: '引き戸',
      verb: 'open',
      scope: 'cu_lock',
      priority: 3,
      visible: () => this.flag('exit_open'),
      onActivate: () => void this.leaveBuilding(),
    })
    hall.lockRings.forEach((ring, i) => {
      this.hs({
        id: `cu:lock:ring${i}`,
        target: ring,
        label: `${i + 1}つめの環`,
        verb: 'turn',
        scope: 'cu_lock',
        onActivate: () => this.turnRing(i),
      })
    })
    this.hs({
      id: 'cu:lock:plate',
      target: hall.lockPlate,
      label: '錠前',
      verb: 'examine',
      scope: 'cu_lock',
      priority: -1,
      onActivate: () => {
        this.say('環が四つ。それぞれに印が打ってある。絞り、浮かぶ像、横一文字、四角。写真の工程だ。')
        this.d.audio.play('select')
      },
    })

    // ambient dressing
    this.ambient('hall:bell', hall.bell, '呼び鈴', ['hall_n'], 'mem_bell')
    this.ambient('hall:telephone', hall.telephone, '黒電話', ['hall_n'], 'mem_telephone')
    this.ambient('hall:calendar', hall.calendar, '暦', ['hall_w'], 'mem_calendar')
    this.ambient('hall:coat', hall.coatRack, 'コート掛け', ['hall_w', 'hall_s'], 'mem_coat_rack')
    this.ambient('hall:umbrella', hall.umbrella, '傘立て', ['hall_s'], 'mem_umbrella')
    // The staircase is the whole subject of the east frame; it was never in
    // shot from either of the views it used to be scoped to.
    this.ambient('hall:stairs', hall.stairs, '階段', ['hall_e'], 'mem_stairs')
    this.ambient('hall:heights', hall.heightMarks, '柱の線', ['hall_n'], 'mem_height_marks')

    // phosphorescent mark
    this.hs({
      id: 'hall:phosphor',
      target: hall.phosphor,
      label: '壁に浮かぶ字',
      verb: 'examine',
      scope: ['hall_n'],
      visible: () => this.d.state.lighting === 'safelight',
      onActivate: () => this.findMark('hall', '灯'),
    })
  }

  private async throwBreaker(): Promise<void> {
    const { hall } = this.d
    if (!this.flag('fuse_seated')) {
      this.wrong('レバーは動くが、途中で戻る。受け金が一つ空のままだ。')
      return
    }
    if (this.flag('power_on')) {
      this.say(FEEDBACK.alreadyDone)
      return
    }
    this.busy = true
    this.d.state.setFlag('power_on')
    this.d.audio.play('breaker')
    await this.d.timeline.to(0.28, (t) => {
      hall.breakerLever.rotation.x = -0.34 + 0.68 * t
    }, { ease: Ease.outBack }).promise
    this.d.rig.nudgeShake(0.6)
    this.d.state.setLighting('tungsten')
    this.d.lighting.setState('tungsten')
    this.d.audio.setLighting('tungsten')
    this.solve('p1_fuse')
    this.clue(
      'clue_power',
      '通電',
      '配電盤のヒューズを替えて、主レバーを上げた。館じゅうの明かりが戻った。奥の部屋も見えるようになった。',
      '玄関ホール　配電盤',
    )
    await this.d.timeline.wait(1.1)
    this.say('明かりが順に点いていく。撮影室のほうが、いちばん遅れて明るくなる。')
    this.busy = false
    this.d.save.save()
  }

  private turnRing(i: number): void {
    const p = this.d.state.puzzle('p9_lock')
    const rings = ((p.work.rings as number[] | undefined) ?? [2, 0, 3, 1]).slice()
    rings[i] = (rings[i] + 1) % 4
    this.d.state.setPuzzleWork('p9_lock', { rings })
    this.setRingIcon(i, rings[i])
    this.d.audio.play('ringTurn', { detune: i * 40 })
    if (rings.every((v, idx) => v === LOCK_SOLUTION[idx])) {
      void this.openExitDoor()
    }
  }

  private async openExitDoor(): Promise<void> {
    if (this.flag('exit_open')) return
    // The rings can be turned from the first minute of the game. Without this
    // check a player fiddling with the brass in the entrance hall would end
    // their own run before seeing a single room.
    if (!this.flag('read_manual') && !this.flag('read_timer')) {
      this.d.audio.play('wrong')
      this.d.state.registerAttempt('p9_lock', false)
      this.say('環は揃った。歯は動く。ただ、なぜこの順なのかが分からないままだ。手が止まる。')
      return
    }
    this.busy = true
    this.d.state.setFlag('exit_open')
    this.solve('p9_lock')
    this.d.audio.play('finalMech')
    await this.d.timeline.wait(0.7)
    this.say('環が四つとも止まる。錠が外れる音は、落ちたときと同じ音がする。')
    this.d.rig.nudgeShake(0.8)
    this.d.save.save()
    this.busy = false
  }

  /**
   * Opening the bolt and walking out are separate acts. Keeping them apart is
   * what lets a player finish the lock, go back for the last negative, and
   * still choose their ending - and it stops a stray click ending the game.
   */
  private async leaveBuilding(): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.d.state.setFlag('left_building')
    await this.d.timeline.wait(0.3)
    this.busy = false
    this.d.onEnding(this.chooseEnding())
  }

  private chooseEnding(): string {
    const s = this.d.state
    const restored = CHRONICLE_PRINT_IDS.every((id) => s.flag(`restored_${id}`))
    const marks = ['hall', 'studio', 'office'].every((k) => s.flag(`mark_${k}`))
    if (s.flag('last_developed') && restored && marks) return 'hidden'
    if (s.flag('last_developed')) return 'true'
    return 'normal'
  }

  private findMark(key: string, glyph: string): void {
    if (this.flag(`mark_${key}`)) {
      this.say('同じ字が、赤の下でだけ浮いている。')
      return
    }
    this.d.state.setFlag(`mark_${key}`)
    this.d.audio.play('shimmer')
    this.say(`塗料で書かれた一字が、赤い明かりの下だけで浮かび上がる。「${glyph}」。`)
    const found = ['hall', 'studio', 'office'].filter((k) => this.flag(`mark_${k}`)).length
    this.clue(
      `clue_mark_${key}`,
      `赤の下の字（${['一', '二', '三'][found - 1]}／三）`,
      `赤い明かりの下で、壁に「${glyph}」が浮かんだ。同じものが、ほかの部屋にもあるかもしれない。`,
      '安全灯の下',
    )
    if (found === 3) {
      this.solve('p7_marks')
      this.clue(
        'clue_marks_all',
        '三つの字',
        '玄関ホールに「灯」、撮影室に「を」、事務室に「かえす」。三つ揃えて、ひと続きの言葉になる。',
        '安全灯の下',
      )
      this.say('三つ揃う。灯を、かえす。')
    }
    this.d.save.save()
  }

  // --- studio -------------------------------------------------------------

  private registerStudio(): void {
    const { studio } = this.d

    // difference 1: the clock that is gone, and the crank on its nail
    this.hs({
      id: 'studio:clockghost',
      target: studio.clockGhost,
      label: '壁の丸い跡',
      verb: 'examine',
      scope: ['studio_e'],
      onActivate: () => void this.enterCloseup('cu_clock', [2.5, 2.2, -0.6], [3.1, 2.34, -0.6], { fov: 34 }),
    })
    this.hs({
      id: 'cu:clock:disc',
      target: studio.clockGhost,
      label: '日に焼けていない丸',
      verb: 'examine',
      scope: 'cu_clock',
      priority: -1,
      onActivate: () => {
        this.markDifference('clock', '壁紙が丸く一段明るい。長いあいだ、ここに丸いものが掛かっていた。釘が一本残っている。')
      },
    })
    this.hs({
      id: 'cu:clock:crank',
      target: studio.crankOnNail,
      label: '釘に掛かった金具',
      verb: 'take',
      scope: 'cu_clock',
      visible: () => studio.crankOnNail.visible,
      onActivate: () => {
        this.d.state.setFlag('crank_taken')
        studio.crankOnNail.visible = false
        this.d.audio.play('latch')
        this.grant('crank', '真鍮のクランク。握りの塗りだけが、手のかたちに剥げている。')
        this.markDifference('clock', '')
      },
    })

    // difference 2: the backdrop, plain where the photograph shows a landscape
    this.hs({
      id: 'studio:backdrop',
      target: studio.backdropCloth,
      label: '背景幕',
      verb: 'examine',
      priority: 3,
      scope: ['studio_n'],
      visible: () => studio.backdropCloth.visible,
      onActivate: () => {
        this.markDifference('backdrop', '無地の天鵞絨。写真では、ここに絵が描いてあった。別の幕が、この裏に巻かれたままなのかもしれない。')
      },
    })

    // difference 3: the chair, turned to the wall
    this.hs({
      id: 'studio:chair',
      target: studio.posingChair,
      label: '写場の椅子',
      verb: 'examine',
      scope: ['studio_n'],
      onActivate: () => void this.enterCloseup('cu_chair', [-0.62, 1.15, -0.78], [-0.62, 0.5, -1.4], { fov: 40 }),
    })
    this.hs({
      id: 'cu:chair:seat',
      target: studio.posingChair,
      label: '座面',
      verb: 'examine',
      scope: 'cu_chair',
      onActivate: () => {
        this.markDifference('chair', '写真では正面を向いていた椅子が、壁を向いている。座面の中央だけ、布の毛が寝ている。')
      },
    })
    this.hs({
      id: 'cu:chair:slit',
      target: studio.chairCushion,
      label: '座布の裂け目',
      verb: 'pull',
      scope: 'cu_chair',
      priority: 2,
      visible: () =>
        this.flag('diff_chair') && !this.d.state.hasItem('loupe_frame') && !this.d.state.hasItem('loupe'),
      onActivate: () => {
        this.d.audio.play('paper')
        this.grant('loupe_frame', '糸のほつれたところに指が入る。中から、玉の抜けたルーペの枠が出てきた。')
      },
    })

    // the roll shaft and the crank
    this.hs({
      id: 'studio:socket',
      // The socket alone is a 7cm boss four metres away; give the whole roll
      // assembly the hotspot so it is a real target from across the room.
      target: [studio.crankSocket, studio.backdropRoll],
      label: '巻き上げ軸',
      verb: 'examine',
      scope: ['studio_n'],
      onActivate: () => void this.enterCloseup('cu_socket', [1.56, 2.35, -1.5], [1.56, 2.62, -2.6], { fov: 38 }),
    })
    this.hs({
      id: 'cu:socket:hole',
      target: [studio.crankSocket, studio.crankFitted],
      label: '六角の穴',
      verb: 'examine',
      scope: 'cu_socket',
      verbFor: (ctx) => (ctx.selectedItem === 'crank' || this.flag('crank_fitted') ? 'turn' : 'examine'),
      labelFor: () => (this.flag('crank_fitted') ? 'クランク' : '六角の穴'),
      onActivate: (ctx) => {
        if (this.flag('chronicle_open')) {
          this.say('軸はもう空回りしている。幕は上がりきっている。')
          return
        }
        if (this.flag('crank_fitted')) {
          void this.raiseBackdrop()
          return
        }
        if (ctx.selectedItem === 'crank') {
          this.d.state.setFlag('crank_fitted')
          studio.crankFitted.visible = true
          this.d.state.selectItem(null)
          this.d.audio.play('latch')
          this.say('六角がぴたりと噛む。少し力を入れれば回りそうだ。')
          this.d.save.save()
          return
        }
        this.say(FEEDBACK.crankMissing)
        this.d.audio.play('select')
      },
    })

    // the chronicle wall behind the velvet
    this.hs({
      id: 'studio:chronicle',
      target: studio.chronicleWall,
      label: '壁一面の写真',
      verb: 'examine',
      scope: ['studio_n'],
      visible: () => this.flag('chronicle_open'),
      onActivate: () => void this.enterCloseup('cu_chronicle', [-0.6, 1.42, -0.95], [-0.6, 1.42, -2.6], { fov: 44 }),
    })
    this.hs({
      id: 'cu:chronicle:panel',
      target: studio.chronicleWall,
      label: '霧沢家の記録',
      verb: 'examine',
      scope: 'cu_chronicle',
      priority: -1,
      onActivate: () => {
        this.say('同じ子供が、少しずつ大きくなりながら並んでいる。途中に四つ、抜き取られた四角がある。画鋲だけが残っている。')
        this.d.audio.play('select')
      },
    })
    this.hs({
      id: 'cu:chronicle:mirror',
      target: studio.mirrorText,
      label: '鉛筆の走り書き',
      verb: 'read',
      scope: 'cu_chronicle',
      onActivate: () => {
        if (this.flag('mirror_read')) {
          this.say('鍵は灯の下に。読めてしまえば、それだけの文だ。')
          return
        }
        this.say('鉛筆の字。読もうとすると、字のほうが天地逆になっている。上下をひっくり返して書いてある。')
        this.d.audio.play('select')
        this.clue(
          'clue_mirror',
          '裏返しの字',
          '年代記の壁に、天地の逆さまな鉛筆書きがある。そのままでは読めない。像をひっくり返して見せる道具が要る。',
          '撮影室　年代記の壁',
        )
      },
    })
    studio.chronicleSlots.forEach((slot, i) => {
      const itemId = CHRONICLE_PRINT_IDS[i]
      this.hs({
        id: `cu:chronicle:slot${i}`,
        target: slot,
        label: ['一歳の枠', '四歳の枠', '七歳の枠', '空欄の枠'][i],
        verb: 'examine',
        scope: 'cu_chronicle',
        verbFor: (ctx) => (ctx.selectedItem ? 'use' : 'examine'),
        onActivate: (ctx) => {
          if (this.flag(`restored_${itemId}`)) {
            this.say('戻っている。四十年ぶんの日焼けの差が、縁のところに出ている。')
            return
          }
          if (!ctx.selectedItem) {
            this.say('画鋲が四つ残っている。ここにあった一枚は、まっすぐに切り取られている。')
            this.d.audio.play('select')
            return
          }
          if (ctx.selectedItem !== itemId) {
            this.wrong(FEEDBACK.photoWrongSlot)
            return
          }
          this.d.state.setFlag(`restored_${itemId}`)
          this.d.state.setItemState(itemId, 'spent')
          this.d.state.selectItem(null)
          this.d.audio.play('paper')
          this.syncWorldToState()
          const n = CHRONICLE_PRINT_IDS.filter((x) => this.flag(`restored_${x}`)).length
          this.say(`枠に収まる。四つのうち、${['一つ', '二つ', '三つ', '四つ'][n - 1]}が埋まった。`)
          if (n === 4) {
            this.solve('hidden_restore')
            this.clue('clue_restored', '壁が揃う', '抜き取られた四枚を、年代記の壁に戻した。四十年ぶりに、この壁は揃っている。', '撮影室　年代記の壁')
          }
          this.d.save.save()
        },
      })
    })

    // the view camera
    this.hs({
      id: 'studio:camera',
      target: studio.viewCamera,
      label: '大判カメラ',
      verb: 'examine',
      // Stands east of centre, so it is 48 degrees off the axis of the backdrop
      // view - never on screen there. The east frame is composed around it.
      scope: ['studio_e'],
      onActivate: () => void this.enterCloseup('cu_camera', [1.18, 1.62, 0.86], [1.18, 1.6, 0.2], { fov: 40 }),
    })
    this.hs({
      id: 'cu:camera:glass',
      target: studio.groundGlass,
      label: 'ピントグラス',
      verb: 'examine',
      scope: 'cu_camera',
      onActivate: () => void this.lookThroughGroundGlass(),
    })
    this.hs({
      id: 'cu:camera:drawer',
      target: studio.tripodDrawer,
      label: '三脚の小抽斗',
      verb: 'pull',
      scope: 'cu_camera',
      onActivate: () => {
        if (!this.flag('tripod_drawer_open')) {
          this.d.state.setFlag('tripod_drawer_open')
          this.d.audio.play('drawer')
          this.d.timeline.to(0.5, (t) => {
            studio.tripodDrawer.position.z = 0.05 + 0.14 * t
          }, { ease: Ease.outCubic })
          this.say('付属品の抽斗。布に包まれた玉が一つ、転がっている。')
          this.d.save.save()
          return
        }
        if (!this.d.state.hasItem('lens') && !this.d.state.hasItem('loupe')) {
          studio.lensInDrawer.visible = false
          this.grant('lens')
          return
        }
        this.say(FEEDBACK.emptyDrawer)
      },
    })

    // the key under the lamp
    this.hs({
      id: 'studio:lampbase',
      // Must hang off real geometry: keyLampBase is only a position marker, and
      // darkroomKey is hidden until it is revealed - together they gave the
      // player nothing to point at.
      target: [studio.lampStands[0], studio.darkroomKey],
      priority: 2,
      label: '撮影灯の台座',
      verb: 'examine',
      // The west stand is at the south end of the room, so it is framed by the
      // south view, not the one that faces the darkroom door.
      scope: ['studio_s'],
      onActivate: () => void this.enterCloseup('cu_lamp', [-2.2, 0.95, 2.15], [-2.16, 0.06, 1.54], { fov: 44 }),
    })
    this.hs({
      id: 'cu:lamp:floor',
      // keyLampBase is only a position marker with no meshes in it; the lamp
      // stand is what the player can actually point at.
      target: [studio.lampStands[0], studio.keyLampBase],
      label: '台座の脇',
      verb: 'examine',
      scope: 'cu_lamp',
      priority: -1,
      onActivate: () => {
        if (!this.flag('mirror_read')) {
          this.say('三本脚の台座。埃が、脚の形に避けて積もっている。')
        } else if (!this.flag('key_revealed')) {
          this.d.state.setFlag('key_revealed')
          this.d.studio.darkroomKey.visible = true
          this.d.audio.play('discovery')
          this.say('灯の下。撮影灯の台座の脇、床すれすれのところに、真鍮の鍵が落ちている。')
          this.d.save.save()
        } else {
          this.say('埃の積もり方が、ここだけ一度崩れている。')
        }
        this.d.audio.play('select')
      },
    })
    this.hs({
      id: 'cu:lamp:key',
      target: studio.darkroomKey,
      label: '真鍮の鍵',
      verb: 'take',
      scope: 'cu_lamp',
      visible: () => studio.darkroomKey.visible,
      onActivate: () => {
        studio.darkroomKey.visible = false
        this.grant('key_darkroom')
      },
    })

    // doors
    this.hs({
      id: 'studio:darkdoor',
      target: this.d.building.darkroomDoorLeaf,
      label: '暗室の扉',
      verb: 'open',
      scope: 'studio_w',
      verbFor: (ctx) =>
        this.flag('darkroom_open') ? 'advance' : ctx.selectedItem === 'key_darkroom' ? 'use' : 'open',
      onActivate: (ctx) => void this.tryUnlock('darkroom', ctx.selectedItem),
    })
    this.hs({
      id: 'studio:officedoor',
      target: this.d.building.officeDoorLeaf,
      label: '事務室の扉',
      verb: 'open',
      scope: 'studio_e',
      verbFor: (ctx) =>
        this.flag('office_open') ? 'advance' : ctx.selectedItem === 'key_office' ? 'use' : 'open',
      onActivate: (ctx) => void this.tryUnlock('office', ctx.selectedItem),
    })

    this.ambient('studio:portraits', studio.portraitWall, '肖像写真の壁', ['studio_e'], 'mem_portrait_wall')
    this.ambient('studio:lamps', studio.lampStands.slice(1), '撮影灯', ['studio_e'], 'mem_studio_lamps')

    this.hs({
      id: 'studio:phosphor',
      target: studio.phosphor,
      label: '壁に浮かぶ字',
      verb: 'examine',
      scope: ['studio_w'],
      visible: () => this.d.state.lighting === 'safelight',
      onActivate: () => this.findMark('studio', 'を'),
    })
  }

  private markDifference(key: 'clock' | 'backdrop' | 'chair', text: string): void {
    const flag = `diff_${key}`
    if (!this.flag(flag)) {
      if (!this.flag('saw_1985')) {
        // Say something that points back at the photograph rather than the
        // reveal line, so a player exploring out of order is not quietly told
        // the answer and then denied the credit for it.
        this.say('何かが違う気がする。見比べるものが要る。')
        this.d.audio.play('select')
        return
      }
      this.d.state.setFlag(flag)
      this.d.audio.play('discovery')
      if (text) this.say(text)
      const n = (['clock', 'backdrop', 'chair'] as const).filter((k) => this.flag(`diff_${k}`)).length
      this.d.ui.toast(`${n}／三`, '写真との違い')
      this.clue(
        `clue_diff_${key}`,
        `写真との違い（${['一', '二', '三'][n - 1]}／三）`,
        { clock: '写真では壁の上のほうに丸い時計が掛かっていた。いまは跡と釘だけが残っている。',
          backdrop: '写真の背景幕には絵が描かれていた。いま下がっているのは無地の天鵞絨だ。',
          chair: '写真では椅子が正面を向いていた。いまは壁を向いている。' }[key],
        '受付の額／撮影室',
      )
      if (n === 3 && this.solve('p2_observe')) {
        this.clue(
          'clue_diffs',
          '三つの違い',
          '写真といまの部屋の違いは三つ。掛かっていた時計、絵の描かれた幕、正面を向いた椅子。三つとも、人がいた側が変えられている。',
          '受付の額／撮影室',
        )
        this.say('三つとも見つけた。変わっているのは、どれも人が座っていたほうの側だ。')
      }
      this.d.save.save()
      return
    }
    if (text) this.say(text)
    this.d.audio.play('select')
  }

  private async raiseBackdrop(): Promise<void> {
    if (this.flag('chronicle_open') || this.busy) return
    this.busy = true
    const { studio } = this.d
    // The velvet is about to stop existing as a clickable surface. If the
    // player has seen the 1985 print, the difference is legitimately observable
    // right now, so bank it here rather than letting the set piece quietly
    // close off the observation puzzle for the rest of the run.
    if (this.flag('saw_1985') && !this.flag('diff_backdrop')) {
      this.markDifference('backdrop', '巻き上がっていくのは無地の天鵞絨だ。写真の幕には、絵が描いてあった。')
    }
    studio.chronicleWall.visible = true
    this.d.audio.play('motorStart')
    let ratchetAt = 0
    await this.d.timeline.to(
      3.4,
      (t) => {
        this.backdropHeight = t
        this.applyBackdrop(t)
        studio.crankFitted.rotation.x = t * Math.PI * 8
        if (t > ratchetAt) {
          ratchetAt = t + 0.055
          this.d.audio.play('ratchet', { detune: Math.random() * 120 - 60, gain: 0.7 })
        }
      },
      { ease: Ease.inOutSine },
    ).promise
    this.d.audio.play('motorStop')
    this.d.state.setFlag('chronicle_open')
    this.solve('p3_backdrop')
    this.d.rig.nudgeShake(0.35)
    this.clue(
      'clue_chronicle',
      '年代記の壁',
      '幕の裏に、写真を貼り並べた壁が一面あった。同じ子供が年ごとに並び、四つだけ抜き取られている。鉛筆の走り書きも見える。',
      '撮影室　背景幕の裏',
    )
    await this.d.timeline.wait(0.6)
    this.say('幕が上がりきる。裏の壁一面に、写真が貼り並べてある。')
    this.busy = false
    this.d.save.save()
  }

  /**
   * The ground glass. A real view camera shows the world inverted; we render
   * the mirror-writing plane into the glass, flipped, so the sentence becomes
   * legible only through the camera.
   */
  private async lookThroughGroundGlass(): Promise<void> {
    if (!this.flag('chronicle_open')) {
      this.say('すりガラスに、天鵞絨の暗い面が天地逆さまに映っている。')
      this.d.audio.play('select')
      return
    }
    this.applyGroundGlassTexture()

    await this.enterCloseup('cu_glass', [1.18, 1.6, 0.42], [1.18, 1.6, 0.11], { fov: 26 })
    if (!this.flag('mirror_read')) {
      this.d.state.setFlag('mirror_read')
      this.d.audio.play('discovery')
      this.solve('p4_groundglass')
      this.clue(
        'clue_key_place',
        '鍵は灯の下に',
        'ピントグラス越しに、天地の逆さまな字が読めた。「この壁だけは残す」「鍵は灯の下に」。灯。この館で灯といえば、撮影灯だ。',
        '撮影室　ピントグラス',
      )
      this.say('像が天地ひっくり返る。逆さまの字が、そのまま読める。——この壁だけは残す。鍵は灯の下に。')
      this.d.save.save()
    } else {
      this.say('同じ字が、同じように読める。鍵は灯の下に。')
    }
  }

  /** The reversed wall text as the view camera shows it: turned through 180. */
  private applyGroundGlassTexture(): void {
    const { studio } = this.d
    if (!this.groundGlassTex) {
      const c = document.createElement('canvas')
      c.width = 512
      c.height = 512
      const g = c.getContext('2d')!
      g.fillStyle = '#3c4038'
      g.fillRect(0, 0, 512, 512)
      // the wall, seen through the lens: upside down and left-right reversed
      g.save()
      g.translate(512, 512)
      g.rotate(Math.PI)
      g.fillStyle = 'rgba(150,140,118,0.5)'
      g.fillRect(40, 150, 432, 240)
      g.fillStyle = 'rgba(28,24,18,0.9)'
      g.font = '400 54px "Hiragino Mincho ProN", "Yu Mincho", serif'
      g.textAlign = 'center'
      g.fillText('この壁だけは残す', 256, 250)
      g.font = '400 66px "Hiragino Mincho ProN", "Yu Mincho", serif'
      g.fillText('鍵は灯の下に', 256, 340)
      g.restore()
      // ground-glass grain and the fresnel rings
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`
        g.fillRect(Math.random() * 512, Math.random() * 512, 1, 1)
      }
      g.strokeStyle = 'rgba(255,255,255,0.05)'
      for (let r = 30; r < 300; r += 14) {
        g.beginPath()
        g.arc(256, 256, r, 0, Math.PI * 2)
        g.stroke()
      }
      this.groundGlassTex = new THREE.CanvasTexture(c)
      this.groundGlassTex.colorSpace = THREE.SRGBColorSpace
    }
    const mat = studio.groundGlass.material as THREE.MeshStandardMaterial
    mat.map = this.groundGlassTex
    mat.emissive = new THREE.Color(0x6a6f60)
    mat.emissiveIntensity = 0.35
    mat.needsUpdate = true
  }

  private async tryUnlock(which: 'darkroom' | 'office', selected: string | null): Promise<void> {
    const openFlag = `${which}_open`
    if (this.flag(openFlag)) {
      // The door leaf carries both this hotspot and the doorway exit, and this
      // one wins the pick. If it only announced that the door was open the
      // player would be locked out of the room it leads to, so once it is
      // unlocked clicking the door is how you walk through it.
      await this.goToNode(EXITS[which === 'darkroom' ? 'studio_w' : 'studio_e'].to)
      return
    }
    const need = which === 'darkroom' ? 'key_darkroom' : 'key_office'
    if (selected !== need) {
      this.wrong(which === 'darkroom' ? FEEDBACK.darkroomLocked : FEEDBACK.officeLocked)
      return
    }
    this.busy = true
    this.d.state.setFlag(openFlag)
    this.d.state.setItemState(need, 'spent')
    this.d.state.selectItem(null)
    this.d.audio.play('keyTurn')
    const leaf = which === 'darkroom' ? this.d.building.darkroomDoorLeaf : this.d.building.officeDoorLeaf
    const base = leaf.userData.closedYaw as number
    const swing = which === 'darkroom' ? -1.6 : 1.6
    await this.d.timeline.to(0.9, (t) => {
      leaf.rotation.y = base + swing * t
    }, { ease: Ease.outCubic }).promise
    this.say(which === 'darkroom' ? '錠が外れる。中は、黒い布の匂いがする。' : '錠が外れる。紙と、埃と、煙草の残り香。')
    this.busy = false
    this.d.save.save()
  }

  // --- darkroom -----------------------------------------------------------

  private registerDarkroom(): void {
    const { darkroom } = this.d

    // the safelight switch: the building-wide state change
    this.hs({
      id: 'dark:switch',
      target: darkroom.safelightSwitch,
      label: '安全灯のレバー',
      verb: 'pull',
      scope: ['darkroom_e'],
      onActivate: () => void this.toggleSafelight(),
    })

    // the four trays
    this.hs({
      id: 'dark:trays',
      target: darkroom.trays,
      label: '作業台のバット',
      verb: 'examine',
      scope: ['darkroom_n'],
      onActivate: () => void this.enterCloseup('cu_trays', [-5.22, 1.42, -1.66], [-5.22, 0.96, -2.34], { fov: 46 }),
    })
    darkroom.trays.forEach((t, i) => {
      this.hs({
        id: `cu:trays:${i}`,
        target: t,
        label: ['一つめのバット', '二つめのバット', '三つめのバット', '四つめのバット'][i],
        verb: 'examine',
        scope: 'cu_trays',
        verbFor: (ctx) => (ctx.selectedItem ? 'use' : 'examine'),
        onActivate: (ctx) => void this.useOnTray(i, ctx.selectedItem),
      })
    })

    // chemicals
    this.hs({
      id: 'dark:shelf',
      target: [darkroom.chemShelf, darkroom.powderTin, darkroom.waterBottle],
      label: '薬品棚',
      verb: 'examine',
      scope: ['darkroom_s'],
      onActivate: () => void this.enterCloseup('cu_shelf', [-4.4, 1.5, -0.32], [-4.4, 1.5, 0.24], { fov: 42 }),
    })
    this.hs({
      id: 'cu:shelf:powder',
      target: darkroom.powderTin,
      label: '現像剤の缶',
      verb: 'take',
      scope: 'cu_shelf',
      visible: () => !this.d.state.hasItem('powder') && !this.d.state.hasItem('developer'),
      onActivate: () => {
        darkroom.powderTin.visible = false
        this.grant('powder')
      },
    })
    this.hs({
      id: 'cu:shelf:water',
      target: darkroom.waterBottle,
      label: '蒸留水',
      verb: 'take',
      scope: 'cu_shelf',
      visible: () => !this.d.state.hasItem('distilled_water') && !this.d.state.hasItem('developer'),
      onActivate: () => {
        darkroom.waterBottle.visible = false
        this.grant('distilled_water')
      },
    })
    this.hs({
      id: 'cu:shelf:row',
      target: darkroom.chemShelf,
      label: '茶色の瓶',
      verb: 'examine',
      scope: 'cu_shelf',
      priority: -1,
      onActivate: () => {
        this.say(AMBIENT_TEXT.mem_chem_shelf)
        this.d.audio.play('select')
      },
    })

    // the enlarger
    this.hs({
      id: 'dark:enlarger',
      target: darkroom.enlarger,
      label: '引き伸ばし機',
      verb: 'examine',
      scope: ['darkroom_w'],
      onActivate: () => void this.enterCloseup('cu_enlarger', [-5.18, 1.32, -1.15], [-5.62, 0.92, -1.15], { fov: 42 }),
    })
    this.hs({
      id: 'cu:enlarger:carrier',
      target: darkroom.negativeCarrier,
      label: 'ネガの枠',
      verb: 'examine',
      scope: 'cu_enlarger',
      verbFor: (ctx) => (ctx.selectedItem === 'negative_old' ? 'use' : 'examine'),
      onActivate: (ctx) => {
        if (this.flag('neg_loaded')) {
          this.say('ネガはもう枠に入っている。')
          return
        }
        if (ctx.selectedItem === 'negative_old') {
          this.d.state.setFlag('neg_loaded')
          this.d.state.selectItem(null)
          this.d.audio.play('paper')
          this.say('枠にネガを落とし込む。膜面を下に。')
          this.d.save.save()
          return
        }
        this.say('空の枠。ここにネガを一枚入れると、下のレンズが壁に像を投げる。')
        this.d.audio.play('select')
      },
    })
    this.hs({
      id: 'cu:enlarger:lamp',
      target: darkroom.enlargerHead,
      label: '灯のつまみ',
      verb: 'turn',
      scope: 'cu_enlarger',
      onActivate: () => void this.toggleEnlarger(),
    })

    // the projected image
    this.hs({
      id: 'dark:projection',
      target: darkroom.projectionScreen,
      label: '壁に映った像',
      verb: 'examine',
      scope: ['darkroom_w', 'cu_enlarger'],
      visible: () => this.flag('enlarger_on'),
      onActivate: () => this.readProjection(),
    })

    // drying line and the old negative
    this.hs({
      id: 'dark:line',
      target: [darkroom.dryingLine, darkroom.negativeSleeve],
      label: '乾燥ロープ',
      verb: 'examine',
      // The sleeve is pegged at the west end of the line, beside the enlarger -
      // from the shelf view it hangs a metre off the left edge of the frame.
      scope: ['darkroom_w'],
      onActivate: () => void this.enterCloseup('cu_line', [-5.7, 1.72, -0.22], [-5.7, 1.84, -0.7], { fov: 40 }),
    })
    this.hs({
      id: 'cu:line:neg',
      target: darkroom.negativeSleeve,
      label: '挟んだままのネガ',
      verb: 'take',
      scope: 'cu_line',
      visible: () => !this.d.state.hasItem('negative_old'),
      onActivate: () => {
        darkroom.negativeSleeve.visible = false
        this.grant('negative_old', 'グラシン紙の袋ごと、一枚だけ挟まったまま残っていた。')
        this.clue(
          'clue_negative',
          '残っていたネガ',
          '乾燥ロープに、ネガが一枚だけ挟まったまま残っていた。透かすと部屋が写っているが、細かいところまでは読めない。',
          '暗室　乾燥ロープ',
        )
      },
    })
    this.hs({
      id: 'cu:line:pegs',
      target: darkroom.dryingLine,
      label: '洗濯挟み',
      verb: 'examine',
      scope: 'cu_line',
      priority: -1,
      onActivate: () => {
        this.say(AMBIENT_TEXT.mem_drying_line)
        this.d.audio.play('select')
      },
    })

    // the fourth removed print, face-down in the under-bench store
    this.hs({
      id: 'dark:understore',
      target: darkroom.underBenchStore,
      label: '作業台の下の棚',
      verb: 'examine',
      scope: ['darkroom_n'],
      survey: true,
      onActivate: () => {
        if (!this.flag('understore_open')) {
          this.d.state.setFlag('understore_open')
          this.d.audio.play('drawer')
          this.say('薬品の空き箱と、丸めた新聞。奥に、写真が一枚だけ伏せて挟んである。')
          this.d.save.save()
          return
        }
        if (!this.d.state.hasItem('print_4')) {
          this.grant('print_4', '四歳。椅子には座らず、脚につかまって立っている。')
          return
        }
        this.say(FEEDBACK.emptyDrawer)
      },
    })

    // the office key
    this.hs({
      id: 'dark:keyboard',
      target: darkroom.officeKey,
      label: '鍵板',
      verb: 'examine',
      scope: ['darkroom_e'],
      onActivate: () => void this.enterCloseup('cu_keys', [-3.62, 1.46, -1.5], [-3.14, 1.46, -1.5], { fov: 36 }),
    })
    this.hs({
      id: 'cu:keys:take',
      target: darkroom.officeKey,
      label: '真鍮の鍵',
      verb: 'take',
      scope: 'cu_keys',
      visible: () => !this.d.state.hasItem('key_office') && !this.flag('office_open'),
      onActivate: () => {
        const key = darkroom.officeKey.getObjectByName('office-key')
        if (key) key.visible = false
        this.grant('key_office', '三つの掛け金のうち、一つだけに鍵が残っている。')
      },
    })

    // timer and clock: the second half of the process-order clue
    this.hs({
      id: 'dark:timer',
      target: darkroom.timer,
      label: '暗室時計',
      verb: 'read',
      scope: ['darkroom_n'],
      onActivate: () => {
        if (!this.flag('read_timer')) {
          this.d.state.setFlag('read_timer')
          this.clue(
            'clue_timer',
            '暗室時計の文字盤',
            '文字盤に、使う順で三つ刻んである。現像 九〇秒、停止 一〇秒、定着 三〇〇秒。撮影はここには無い。撮るのは暗室の外だからだ。',
            '暗室　暗室時計',
          )
        }
        this.say('文字盤に三つ。現像 九〇秒、停止 一〇秒、定着 三〇〇秒。上から使う順に彫ってある。撮影が無いのは、撮るのが暗室の外だからだ。')
        this.d.audio.play('select')
      },
    })
    this.ambient('dark:clock', darkroom.clock, '壁の時計', ['darkroom_n'], 'mem_darkroom_clock')

    this.hs({
      id: 'dark:phosphor',
      target: darkroom.phosphor,
      label: '壁に浮かぶ字',
      verb: 'read',
      scope: ['darkroom_n'],
      visible: () => this.d.state.lighting === 'safelight',
      onActivate: () => {
        if (!this.flag('mark_dark')) {
          this.d.state.setFlag('mark_dark')
          this.d.audio.play('shimmer')
          this.clue(
            'clue_tray_warning',
            '順は台に非ず',
            '暗室の壁に、赤の下でだけ読める字。「順は台に非ず　書に在り」。台のバットの並びは当てにならない、という意味だ。三つ集める一字とは別の書き付けらしい。',
            '安全灯の下　暗室',
          )
          this.d.save.save()
        }
        this.say('赤の下に、館主の字が浮く。——順は台に非ず、書に在り。三つの一字とは、別の書き付けだ。')
      },
    })

    // the developed print on the line
    this.hs({
      id: 'dark:print',
      target: darkroom.developedPrint,
      label: '干した一枚',
      verb: 'examine',
      scope: ['darkroom_s'],
      visible: () => darkroom.developedPrint.visible,
      onActivate: () => {
        this.say('四十年遅れて干された一枚。もう光に当てても消えない。')
        this.d.audio.play('select')
      },
    })
  }

  private async toggleSafelight(): Promise<void> {
    if (!this.flag('power_on')) {
      this.wrong(FEEDBACK.powerOff)
      return
    }
    const on = this.d.state.lighting === 'safelight'
    const next = on ? 'tungsten' : 'safelight'
    this.d.audio.play('relay')
    const lever = this.d.darkroom.safelightSwitch.getObjectByName('lever')
    if (lever) {
      const from = lever.rotation.x
      const to = on ? 0.5 : -0.5
      this.d.timeline.to(0.24, (t) => {
        lever.rotation.x = from + (to - from) * t
      }, { ease: Ease.outCubic })
    }
    this.d.state.setLighting(next)
    this.d.lighting.setState(next)
    this.d.audio.setLighting(next)
    this.updatePhosphor()
    if (!on) {
      this.d.audio.play('shimmer', { gain: 0.5 })
      if (!this.flag('seen_safelight')) {
        this.d.state.setFlag('seen_safelight')
        this.solve('p7_safelight')
        this.say('白い明かりが落ちて、館じゅうが赤くなる。廊下の先にも、同じ赤が点いている。')
        this.clue(
          'clue_safelight',
          '赤い明かり',
          '安全灯は暗室だけのものではなかった。館じゅうに赤い灯が引いてある。赤の下でしか見えないものがあるかもしれない。',
          '暗室　安全灯',
        )
      }
    } else if (this.flag('enlarger_on')) {
      // Clear first: stopProjection now refuses to run while the flag says the
      // lamp is lit, which is what stops an unrelated close-up killing it.
      this.d.state.setFlag('enlarger_on', false)
      this.stopProjection()
    }
    this.d.save.save()
  }

  private async toggleEnlarger(): Promise<void> {
    if (!this.flag('power_on')) {
      this.wrong(FEEDBACK.powerOff)
      return
    }
    if (this.flag('enlarger_on')) {
      this.d.state.setFlag('enlarger_on', false)
      this.stopProjection()
      this.d.audio.play('relay')
      return
    }
    if (!this.flag('neg_loaded')) {
      this.startProjection(false)
      this.wrong(FEEDBACK.enlargerNoNeg)
      this.projectionOffTimer = window.setTimeout(() => this.stopProjection(), 2400)
      return
    }
    if (this.d.state.lighting !== 'safelight') {
      this.wrong('白い明かりの下では、壁の像が見えない。赤にしてからだ。')
      return
    }
    this.d.audio.play('relay')
    this.d.state.setFlag('enlarger_on')
    this.startProjection(true)
    if (!this.flag('saw_projection')) {
      this.d.state.setFlag('saw_projection')
      this.say('壁一面に、部屋がひとつ浮かび上がる。四十年前の撮影室だ。細かいところは、目では追えない。')
    }
    this.d.save.save()
  }

  private startProjection(withImage: boolean): void {
    if (this.projectionOffTimer) {
      window.clearTimeout(this.projectionOffTimer)
      this.projectionOffTimer = 0
    }
    const { darkroom, lighting } = this.d
    if (!this.projector) {
      this.projector = lighting.makeProjector()
    }
    const head = new THREE.Vector3()
    darkroom.enlargerHead.getWorldPosition(head)
    this.projector.position.copy(head)
    this.projector.target.position.set(-6.5, 1.42, -1.15)
    this.projector.intensity = 0
    this.d.timeline.to(0.5, (t) => {
      if (this.projector) this.projector.intensity = 26 * t
    })
    const glow = darkroom.enlargerLampGlow.material as THREE.MeshStandardMaterial
    this.d.timeline.to(0.5, (t) => {
      glow.emissiveIntensity = 2.4 * t
    })

    if (withImage) {
      if (!this.projectionMesh) {
        const m = mesh(
          new THREE.PlaneGeometry(1.34, 0.96),
          new THREE.MeshBasicMaterial({
            map: this.buildProjectionTexture(),
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
          { cast: false, receive: false },
        )
        m.position.set(-6.5, 1.42, -1.15)
        m.rotation.y = Math.PI / 2
        this.d.scene.add(m)
        this.projectionMesh = m
      }
      const pm = this.projectionMesh.material as THREE.MeshBasicMaterial
      this.projectionMesh.visible = true
      this.d.timeline.to(0.6, (t) => {
        pm.opacity = 0.92 * t
      })
    }
  }

  private buildProjectionTexture(): THREE.Texture {
    // The old negative, printed positive and blown up: what the enlarger throws.
    const t = photoTexture('projection-positive', () => {
      const c = document.createElement('canvas')
      c.width = 840
      c.height = 600
      const g = c.getContext('2d')!
      g.fillStyle = '#000'
      g.fillRect(0, 0, 840, 600)
      const src = studioRecordForProjection()
      g.drawImage(src, 0, 0, 840, 600)
      g.globalCompositeOperation = 'multiply'
      const grad = g.createRadialGradient(420, 300, 60, 420, 300, 520)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(1, '#3a3a3a')
      g.fillStyle = grad
      g.fillRect(0, 0, 840, 600)
      return c
    })
    return t
  }

  private stopProjection(): void {
    // Leaving a close-up used to run this unconditionally without clearing
    // `enlarger_on`. Turn the enlarger on, lean into anything else, come back,
    // and the projection was silently dead while the flag still said it was
    // lit - so the switch then needed two presses to bring it back, and a save
    // written in that state reloaded into the same lie.
    if (this.flag('enlarger_on')) return
    if (this.projector) {
      const p = this.projector
      this.d.timeline.to(0.35, (t) => {
        p.intensity = 26 * (1 - t)
      })
    }
    const glow = this.d.darkroom.enlargerLampGlow.material as THREE.MeshStandardMaterial
    this.d.timeline.to(0.35, (t) => {
      glow.emissiveIntensity = 2.4 * (1 - t)
    })
    if (this.projectionMesh) {
      const pm = this.projectionMesh.material as THREE.MeshBasicMaterial
      const m = this.projectionMesh
      this.d.timeline.to(0.35, (t) => {
        pm.opacity = 0.92 * (1 - t)
      }, {
        onComplete: () => {
          m.visible = false
        },
      })
    }
  }

  /** Both routes to the combination land here so state and clues stay in step. */
  learnSafeNumber(source: 'projection' | 'negative'): void {
    if (this.flag('safe_number_known')) return
    this.d.state.setFlag('safe_number_known')
    this.solve('p6_enlarger')
    this.clue(
      'clue_safe',
      '金庫の環',
      source === 'projection'
        ? '壁に映した像の左下に、事務室の金庫が写り込んでいた。ルーペで見ると、環の指す目盛が読める。二十七。'
        : 'ネガの隅に、事務室の金庫が写り込んでいた。ルーペを当てると、環の指す目盛が読める。二十七。',
      source === 'projection' ? '暗室　引き伸ばし機／ルーペ' : '古いネガ／ルーペ',
    )
    this.d.save.save()
  }

  private readProjection(): void {
    if (!this.d.state.hasUsableItem('loupe')) {
      this.say('壁の像は大きいが、隅のものは粒に溶けている。もっと拡げて見る道具が要る。')
      this.d.audio.play('select')
      return
    }
    if (!this.flag('safe_number_known')) {
      this.d.audio.play('discovery')
      this.learnSafeNumber('projection')
      this.say('ルーペを当てる。像の右下、事務室の金庫が写り込んでいる。環の目盛は——二十七。')
      return
    }
    this.say('環は二十七を指したままだ。')
  }

  private async useOnTray(index: number, selected: string | null): Promise<void> {
    const { darkroom } = this.d
    if (!selected) {
      const labels = ['現像', '定着', '水洗', '停止']
      this.say(
        `琺瑯のバット。縁のラベルには「${labels[index]}」。台の上の並びは、誰かが動かしたあとに見える。`,
      )
      this.d.audio.play('select')
      return
    }
    if (selected === 'developer' && index === 0) {
      if (this.flag('developer_poured')) {
        this.say(FEEDBACK.alreadyDone)
        return
      }
      this.d.state.setFlag('developer_poured')
      this.d.state.setItemState('developer', 'spent')
      this.d.state.selectItem(null)
      this.d.audio.play('pour')
      darkroom.developerLiquid.visible = true
      const mat = darkroom.developerLiquid.material as THREE.MeshPhysicalMaterial
      mat.opacity = 0
      this.d.timeline.to(1.4, (t) => {
        mat.opacity = 0.9 * t
      })
      this.solve('p5_developer')
      this.say('琥珀色がバットの底に広がる。液面が落ち着くまで、少し待つ。')
      this.d.save.save()
      return
    }
    if (selected === 'developer') {
      this.wrong('現像液を入れるバットは、ラベルで決まっている。ここではない。')
      return
    }
    if (selected === 'negative_last') {
      await this.developLastNegative(index)
      return
    }
    this.wrong(FEEDBACK.wrongItem)
  }

  private async developLastNegative(index: number): Promise<void> {
    if (index !== 0) {
      this.wrong('液の入っていないバットに浸しても、何も出ない。')
      return
    }
    if (!this.flag('developer_poured')) {
      this.wrong(FEEDBACK.needDeveloper)
      return
    }
    if (this.d.state.lighting !== 'safelight') {
      this.wrong(FEEDBACK.needSafelight)
      return
    }
    if (this.flag('last_developed')) {
      this.say(FEEDBACK.alreadyDone)
      return
    }
    this.busy = true
    this.d.state.setFlag('last_developed')
    this.d.state.setItemState('negative_last', 'spent')
    this.d.state.selectItem(null)
    this.d.audio.play('slosh')
    await this.d.ui.narrate(
      [
        '液に沈める。しばらく、何も起きない。',
        '縁のほうから、灰色が滲みはじめる。',
        '床。木目。倒れた茶色の瓶。広がっていく液の縁。',
        '人は写っていない。',
      ],
      { hold: 1600 },
    )
    this.d.audio.play('reveal')
    // hang it on the line
    const print = this.d.darkroom.developedPrint
    const mat = print.material as THREE.MeshStandardMaterial
    mat.map = photoTexture('last-frame-final', () => lastFrameCanvas({ width: 460, height: 340 }))
    mat.needsUpdate = true
    print.visible = true
    this.grant('print_last')
    this.solve('true_develop')
    this.clue(
      'clue_truth',
      '最後の一枚',
      '最後のネガを現像した。写っていたのは倒れた薬品の瓶と、床に広がっていく液。人は写っていない。火は、この家の主人自身の手落ちから出ている。',
      '暗室',
    )
    this.busy = false
    this.d.save.save()
  }

  // --- office -------------------------------------------------------------

  private registerOffice(): void {
    const { office } = this.d

    this.hs({
      id: 'office:safe',
      target: office.safe,
      label: '金庫',
      verb: 'examine',
      scope: ['office_n', 'office_e'],
      onActivate: () => void this.enterCloseup('cu_safe', [5.16, 0.62, -1.3], [5.66, 0.52, -1.3], { fov: 40 }),
    })
    this.hs({
      id: 'cu:safe:dial',
      target: office.safeDial,
      label: '環',
      verb: 'turn',
      scope: 'cu_safe',
      onActivate: () => this.beginDial(),
    })
    this.hs({
      id: 'cu:safe:handle',
      target: office.safeDoor,
      label: '把手',
      verb: 'pull',
      scope: 'cu_safe',
      priority: -1,
      onActivate: () => void this.trySafe(),
    })
    this.hs({
      id: 'cu:safe:contents',
      target: office.safeContents,
      label: '金庫の中',
      verb: 'examine',
      scope: 'cu_safe',
      visible: () => this.flag('safe_open'),
      onActivate: () => this.takeSafeContents(),
    })

    this.hs({
      id: 'office:manual',
      target: office.manual,
      label: '暗室作業手順',
      verb: 'read',
      scope: ['office_s'],
      onActivate: () => {
        this.d.state.markDocumentRead('doc_manual')
        this.d.ui.openDocument('doc_manual')
        this.d.audio.play('paper')
        if (!this.flag('read_manual')) {
          this.d.state.setFlag('read_manual')
          this.clue(
            'clue_order',
            '工程の順',
            '暗室作業手順。一、撮影。二、現像。三、停止。四、定着。末尾に「バットは左からこの順に並べておくこと」「ラベルだけを信じないこと」。',
            '事務室　壁の貼り紙',
          )
          this.d.save.save()
        }
      },
    })

    this.hs({
      id: 'office:ledger',
      target: [office.ledgerOpen, office.ledgerBlock],
      priority: 2,
      label: '予約控',
      verb: 'read',
      scope: ['office_n'],
      onActivate: () => {
        this.d.state.markDocumentRead('doc_ledger')
        this.d.ui.openDocument('doc_ledger')
        this.d.audio.play('paper')
        if (!this.flag('read_ledger')) {
          this.d.state.setFlag('read_ledger')
          this.clue(
            'clue_ledger',
            '二十三日の予約',
            '昭和六十年十一月の予約控。二十三日十時、灯、七歳、七五三。この一件だけ姓がなく、済の印もない。二十四日から先は白紙。',
            '事務室　予約控',
          )
          this.d.save.save()
        }
      },
    })

    this.hs({
      id: 'office:desk',
      target: office.desk,
      label: '事務机の抽斗',
      verb: 'open',
      scope: ['office_n'],
      onActivate: () => {
        if (!this.flag('desk_open')) {
          this.d.state.setFlag('desk_open')
          this.d.audio.play('drawer')
          this.say('文具と、使いかけの帳簿。いちばん下に、写真が一枚だけ伏せてある。')
          this.d.save.save()
          return
        }
        if (!this.d.state.hasItem('print_7')) {
          this.grant('print_7', '伏せてあった一枚。七歳。背景幕は絵のほうだ。')
          return
        }
        this.say(FEEDBACK.emptyDrawer)
      },
    })

    this.ambient('office:shelves', office.deskLamp, '卓上の灯', ['office_n'], 'mem_kettle')

    this.hs({
      id: 'office:phosphor',
      target: office.phosphor,
      label: '壁に浮かぶ字',
      verb: 'examine',
      scope: ['office_n', 'office_e'],
      visible: () => this.d.state.lighting === 'safelight',
      onActivate: () => this.findMark('office', 'かえす'),
    })
  }

  private beginDial(): void {
    if (this.flag('safe_open')) {
      this.say('環は空回りする。もう開いている。')
      return
    }
    if (this.dragHandler) {
      this.dragHandler = null
      this.say('手を離す。')
      return
    }
    this.say(`環に手を掛ける。左右に引けば回る。いまは ${this.dialNumber()}。`)
    this.d.audio.play('select')
    this.dragHandler = (dx) => {
      const before = this.dialNumber()
      this.dialAngle += dx * 0.012
      this.applyDial()
      const now = this.dialNumber()
      if (now !== before) {
        this.d.audio.play('detent', { gain: 0.6 })
        this.d.ui.toast(kansuji(now), '環')
        this.d.state.setPuzzleWork('p8_safe', { angle: this.dialAngle })
      }
    }
  }

  private async trySafe(): Promise<void> {
    if (this.flag('safe_open')) {
      this.takeSafeContents()
      return
    }
    this.dragHandler = null
    const n = this.dialNumber()
    this.d.state.registerAttempt('p8_safe', n === SAFE_TARGET)
    if (n !== SAFE_TARGET) {
      this.wrong(FEEDBACK.safeWrong)
      return
    }
    this.busy = true
    this.d.state.setFlag('safe_open')
    this.solve('p8_safe')
    this.d.audio.play('bolt')
    const { office } = this.d
    office.safeContents.visible = true
    await this.d.timeline.to(1.1, (t) => {
      office.safeDoor.rotation.y = -1.9 * t
    }, { ease: Ease.outCubic }).promise
    this.say('環が最後まで落ちる。扉は、思ったよりも軽い。')
    this.busy = false
    this.d.save.save()
  }

  private takeSafeContents(): void {
    const s = this.d.state
    let took = false
    for (const id of ['note_kyoichi', 'letter_akari', 'negative_last', 'print_last_slot']) {
      if (!s.hasItem(id)) {
        this.grant(id)
        took = true
      }
    }
    if (took) {
      this.clue(
        'clue_safe_contents',
        '金庫の中身',
        '手記が一通。宛名だけの手紙が一通。まだ現像されていないネガが一枚。それに、写真がもう一枚。',
        '事務室　金庫',
      )
      this.say('紙が三つと、まだ像の出ていない一枚。')
    } else {
      this.say('あとは、鉄の底が見えているだけだ。埃も入っていない。')
    }
  }

  // ------------------------------------------------------------- item usage

  combine(a: string, b: string): void {
    const recipe = findRecipe(a, b)
    if (!recipe) {
      this.d.audio.play('wrong')
      this.d.ui.toast('この二つは合わない')
      return
    }
    for (const id of recipe.consume) this.d.state.removeItem(id)
    this.d.state.addItem(recipe.result)
    this.d.state.setItemState(recipe.result, 'transformed')
    this.d.audio.play('combine')
    this.say(recipe.message)
    if (recipe.result === 'loupe') this.solve('p5_loupe')
    this.d.save.save()
  }

  // -------------------------------------------------------------- hint feed

  activeHints(): Array<{ id: string; title: string; steps: string[]; taken: number }> {
    const s = this.d.state
    const out: Array<{ id: string; title: string; steps: string[]; taken: number }> = []
    const add = (id: string) => {
      const h = HINTS[id]
      if (!h) return
      out.push({ id: h.id, title: h.title, steps: h.steps, taken: s.puzzle(id).hintLevel })
    }
    if (!s.flag('power_on')) {
      add('p1_fuse')
      return out
    }
    if (!s.isSolved('p2_observe')) add('p2_observe')
    if (!s.flag('chronicle_open')) add('p3_backdrop')
    else if (!s.flag('mirror_read')) add('p4_groundglass')
    // The key-under-the-lamp step used to have no hint at all, which left the
    // hardest junction in the game silent.
    if (s.flag('mirror_read') && !s.flag('darkroom_open')) add('p4b_key')
    if (s.flag('diff_chair') && !s.hasItem('loupe')) add('p5_loupe')
    if (s.flag('darkroom_open')) {
      if (!s.flag('developer_poured')) add('p5_developer')
      if (!s.flag('seen_safelight')) add('p7_safelight')
      else if (!s.isSolved('p7_marks')) add('p7_marks')
      if (s.hasItem('loupe') && !s.flag('safe_number_known') && !s.flag('safe_open')) add('p6_enlarger')
    }
    if (s.flag('office_open') && !s.flag('safe_open') && s.flag('safe_number_known')) add('p8_safe')
    if (s.flag('safe_open') && !s.flag('last_developed')) add('true_develop')
    if ((s.flag('read_manual') || s.flag('read_timer')) && !s.flag('exit_open')) add('p9_lock')
    if (s.flag('safe_open') && !s.isSolved('hidden_restore')) add('hidden_restore')
    return out
  }

  takeHint(id: string): void {
    this.d.state.takeHint(id)
    this.d.audio.play('paper')
    this.d.save.save()
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    void dt
    if (this.projector && this.projector.intensity > 0.01) {
      this.d.darkroom.enlargerHead.getWorldPosition(this.scratch)
      this.projector.position.copy(this.scratch)
    }
    this.secondHand ??= this.d.darkroom.clock.getObjectByName('second-hand') ?? null
    const second = this.secondHand
    if (second) {
      const t = performance.now() / 1000
      const a = -(t % 60) * (Math.PI / 30)
      second.position.set(Math.sin(a) * 0.035, Math.cos(a) * 0.035, 0.028)
      second.rotation.z = a
    }
  }

  clearDrag(): void {
    this.dragHandler = null
  }
}

/** Numbers are written in kanji everywhere else in the game; the dial follows. */
function kansuji(n: number): string {
  const d = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (n === 0) return '零'
  if (n < 10) return d[n]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return `${tens > 1 ? d[tens] : ''}十${ones ? d[ones] : ''}`
}

/** Cached source canvas for the enlarger projection. */
let projectionSource: HTMLCanvasElement | null = null
function studioRecordForProjection(): HTMLCanvasElement {
  if (!projectionSource) {
    projectionSource = studioRecordCanvas({
      past: true,
      showSafeDial: true,
      dialValue: SAFE_TARGET,
      width: 840,
      height: 600,
      border: 0,
    })
  }
  return projectionSource
}
