import * as THREE from 'three'
import { boxAt, extrude, lathe, mesh, roundedBox, texturedBox } from '../Geo'
import type { MaterialLibrary } from '../Materials'
import { EXTERIOR_THICKNESS, OPENINGS, ROOM, WALL_THICKNESS } from '../Layout'
import {
  bottle,
  drawerUnit,
  framedPhoto,
  labelPlate,
  loosePrint,
  pendantShade,
  phosphorMark,
  shelfUnit,
} from './Common'
import {
  photoTexture,
  portraitCanvas,
  studioRecordCanvas,
  unexposedPrintCanvas,
} from '../Photographs'
import { ctx2d, makeCanvas } from '../Textures'

/**
 * 玄関ホール - reception, the fuse box, and the way out.
 * This is the tutorial room: everything here teaches a verb.
 */

export interface HallProps {
  group: THREE.Group
  /** Fuse box door, hinged on its left edge. */
  fuseBoxDoor: THREE.Group
  /** The three fuse holders; index 1 is the dead one. */
  fuseSockets: THREE.Group[]
  fuseSpare: THREE.Mesh
  breakerLever: THREE.Group
  /** Reception drawer that holds the spare fuse. */
  receptionDrawer: THREE.Group
  /** The pedestal the drawer slides in, so the hotspot has a findable target. */
  drawerUnit: THREE.Group
  drawerContents: THREE.Group
  /** The 1985 record photograph in its frame. */
  recordPhoto: THREE.Group
  /** The print behind its mount, visible once the board is lifted. */
  mountPrint: THREE.Mesh
  /** Four rotating rings on the exit door. */
  lockRings: THREE.Group[]
  lockPlate: THREE.Group
  phosphor: THREE.Mesh
  bell: THREE.Mesh
  telephone: THREE.Group
  calendar: THREE.Group
  coatRack: THREE.Group
  umbrella: THREE.Group
  stairs: THREE.Group
  pendant: THREE.Group
  heightMarks: THREE.Group
  /** The threshold board in the archway - the clickable way through. */
  archThreshold: THREE.Group
}

const H = ROOM.hall

export function buildHall(mats: MaterialLibrary): HallProps {
  const group = new THREE.Group()
  group.name = 'props-hall'

  // ---------------------------------------------------------------- counter
  // Filled in while the counter is built, and consumed by the drawer unit
  // below: the drawers belong in the counter's right-hand bay, so they have to
  // be sized and placed from the joinery rather than guessed at.
  let drawerBay = { x: 0, y0: 0, y1: 1, w: 0.6, zFront: 3.5 }
  const counter = new THREE.Group()
  {
    const w = 1.5
    const d = 0.58
    const h = 1.02
    const cx = -0.24
    const cz = 3.28
    // Carcase, set back so the joinery in front of it reads as applied work.
    counter.add(boxAt(mats.woodDark, w, h - 0.06, d - 0.04, 0, (h - 0.06) / 2, 0))
    // moulded top with a slight overhang
    const top = mesh(roundedBox(w + 0.06, 0.045, d + 0.05, 0.008, 2, 1.6), mats.woodMid)
    top.position.y = h - 0.02
    counter.add(top)

    // Frame-and-panel front. A counter this size is not one flat board: two
    // stiles at the ends, a muntin down the middle, rails top and bottom, and
    // the panels recessed behind them. Modelled rather than painted on, because
    // the whole point of this frame is that a raking lamp finds the reveals.
    const zf = d / 2 - 0.02
    const stileW = 0.09
    const railH = 0.085
    const plinthH = 0.11
    const frameTop = h - 0.06
    const openH = frameTop - plinthH
    const addFront = (
      mw: number,
      mh: number,
      x: number,
      y: number,
      z = zf,
      m = mats.woodMid,
    ): void => {
      const p = mesh(texturedBox(mw, mh, 0.022, 1.6), m, { cast: false })
      p.position.set(x, y, z)
      counter.add(p)
    }
    // plinth, kicked back under the frame
    addFront(w, plinthH, 0, plinthH / 2, zf - 0.018, mats.woodTrim)
    // stiles and centre muntin
    addFront(stileW, openH, -(w / 2 - stileW / 2), plinthH + openH / 2)
    addFront(stileW, openH, w / 2 - stileW / 2, plinthH + openH / 2)
    addFront(stileW * 0.8, openH, 0, plinthH + openH / 2)
    // rails between them
    const railSpan = (w - stileW * 2 - stileW * 0.8) / 2
    // Only the left bay is panelled. The right one is the drawer bay, and it is
    // left open here so the drawers below can fill it: a fielded panel in front
    // of them would hide the one thing in this room the player has to open.
    {
      const px = -(stileW / 2 + stileW * 0.4 / 2 + railSpan / 2)
      addFront(railSpan, railH, px, plinthH + openH - railH / 2)
      addFront(railSpan, railH, px, plinthH + railH / 2)
      // the fielded panel itself, recessed behind the frame
      const panel = mesh(
        texturedBox(railSpan, openH - railH * 2, 0.012, 1.4),
        mats.woodTrim,
        { cast: false },
      )
      panel.position.set(px, plinthH + openH / 2, zf - 0.014)
      counter.add(panel)
    }
    drawerBay = {
      x: cx + (stileW / 2 + stileW * 0.4 / 2 + railSpan / 2),
      y0: plinthH,
      y1: frameTop,
      w: railSpan,
      // Outer face of the stiles, so the drawer fronts land flush with the
      // joinery instead of co-planar with the carcase behind it.
      zFront: cz + zf + 0.012,
    }
    counter.position.set(cx, 0, cz)
    group.add(counter)
  }

  // Drawers set into the counter's right-hand bay. Standing on the floor beside
  // the counter they ended up inside its carcase - a 0.44 x 0.62 pedestal at
  // x 0.06..0.50, z 3.09..3.59 sat wholly within the counter's own footprint -
  // so from the reception view there was no drawer front on screen at all, and a
  // player told by the hints to open the reception drawer had nothing to open.
  // Sized and placed from the bay so the fronts fill the opening in the joinery.
  const drawerH = drawerBay.y1 - drawerBay.y0
  const drawerD = 0.5
  const drawers = drawerUnit(mats, drawerBay.w - 0.024, drawerH, drawerD, 2)
  drawers.group.position.set(drawerBay.x, drawerBay.y0, drawerBay.zFront - drawerD / 2 + 0.01)
  group.add(drawers.group)
  // The upper of the two: a drawer you reach into standing at the counter.
  const receptionDrawer = drawers.drawers[1]

  // what is inside the top drawer: a fuse in its paper sleeve, a pencil stub
  const drawerContents = new THREE.Group()
  {
    const fuse = makeFuse(mats)
    fuse.position.set(-0.06, -0.02, 0.06)
    fuse.rotation.z = Math.PI / 2
    fuse.rotation.y = 0.3
    drawerContents.add(fuse)
    const pencil = mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.085, 6), mats.woodMid)
    pencil.rotation.set(Math.PI / 2, 0, 0.5)
    pencil.position.set(0.08, -0.025, 0.02)
    drawerContents.add(pencil)
    const card = mesh(new THREE.PlaneGeometry(0.09, 0.055), mats.paper, { cast: false })
    card.rotation.x = -Math.PI / 2
    card.rotation.z = 0.2
    card.position.set(0.02, -0.03, -0.05)
    drawerContents.add(card)
    receptionDrawer.add(drawerContents)
  }
  const fuseSpare = drawerContents.children[0] as unknown as THREE.Mesh

  // desk furniture: bell, telephone, a pen tray, a stack of receipt books
  const bellGroup = new THREE.Group()
  {
    const dome = mesh(new THREE.SphereGeometry(0.045, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.chrome)
    dome.position.y = 0.012
    bellGroup.add(dome)
    const base = mesh(lathe([[0.052, 0], [0.052, 0.008], [0.03, 0.012], [0, 0.012]], 18), mats.brassDull)
    bellGroup.add(base)
    const plunger = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.016, 10), mats.brass)
    plunger.position.y = 0.062
    bellGroup.add(plunger)
    bellGroup.position.set(-0.72, 1.02, 3.16)
    group.add(bellGroup)
  }

  const telephone = new THREE.Group()
  {
    const body = mesh(roundedBox(0.19, 0.085, 0.17, 0.02, 3, 2.2), mats.bakelite)
    body.position.y = 0.043
    telephone.add(body)
    const dial = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 24), mats.bakelite)
    dial.rotation.x = Math.PI / 2 - 0.35
    dial.position.set(0, 0.052, 0.055)
    telephone.add(dial)
    const dialFace = mesh(new THREE.CircleGeometry(0.05, 24), mats.paperBright, { cast: false })
    dialFace.rotation.x = Math.PI / 2 - 0.35
    dialFace.position.set(0, 0.06, 0.062)
    telephone.add(dialFace)
    // cradle + handset
    for (const x of [-0.062, 0.062]) {
      const hook = mesh(roundedBox(0.03, 0.03, 0.05, 0.008, 2, 3), mats.bakelite)
      hook.position.set(x, 0.098, -0.02)
      telephone.add(hook)
    }
    const handset = mesh(roundedBox(0.2, 0.035, 0.045, 0.016, 3, 2.6), mats.bakelite)
    handset.position.set(0, 0.126, -0.02)
    telephone.add(handset)
    for (const x of [-0.082, 0.082]) {
      const cup = mesh(lathe([[0.032, 0], [0.032, 0.012], [0.026, 0.02], [0, 0.02]], 16), mats.bakelite)
      cup.position.set(x, 0.128, -0.02)
      cup.rotation.z = Math.PI
      telephone.add(cup)
    }
    // Cut cord, hanging.
    //
    // It was a straight 0.26 cylinder leaning at 0.4 radians - a rigid rod, not
    // a cord. Rubber that has hung off a counter for forty years falls in a
    // catenary and curls where it was cut, so it is a tube on a curve now, with
    // a strain relief at the set and a dead end at the bottom.
    const cordPts = [
      new THREE.Vector3(-0.088, -0.008, -0.055),
      new THREE.Vector3(-0.104, -0.072, -0.07),
      new THREE.Vector3(-0.098, -0.148, -0.058),
      new THREE.Vector3(-0.126, -0.206, -0.03),
      new THREE.Vector3(-0.104, -0.236, 0.004),
    ]
    const cord = mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPts), 26, 0.0042, 6, false),
      mats.rubber,
      { cast: false },
    )
    telephone.add(cord)
    // the moulded grommet where it leaves the set
    const grommet = mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.022, 10), mats.bakelite, { cast: false })
    grommet.position.set(-0.086, 0.004, -0.055)
    grommet.rotation.z = 0.22
    telephone.add(grommet)
    // the cut: bare copper, showing why the line is dead
    const copper = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.018, 6), mats.brass, { cast: false })
    copper.position.set(-0.1, -0.246, 0.012)
    copper.rotation.set(0.5, 0, 0.35)
    telephone.add(copper)
    telephone.position.set(0.12, 1.02, 3.22)
    telephone.rotation.y = -0.35
    group.add(telephone)
  }

  {
    const ledgers = shelfUnit(mats, 0.5, 0.34, 0.24, 1, true)
    ledgers.position.set(-0.62, 1.04, 3.44)
    ledgers.rotation.y = 0.06
    group.add(ledgers)
    const stack = mesh(texturedBox(0.2, 0.05, 0.15, 2.4), mats.paper)
    stack.position.set(-0.62, 1.07, 3.44)
    group.add(stack)
  }

  // ------------------------------------------------------- the 1985 record
  const recordPhoto = framedPhoto(
    mats,
    photoTexture('record-1985', () => studioRecordCanvas({ past: true, width: 620, height: 440 })),
    0.44,
    0.32,
    { frame: 0.03, depth: 0.03 },
  )
  recordPhoto.position.set(-0.36, 1.66, 2.885)
  recordPhoto.name = 'record-photo'
  group.add(recordPhoto)

  // The print that was hidden behind the mount, shown once the backing board
  // has been lifted and before it is taken. Every other photograph in the game
  // is a thing you can see before you pick it up; this one used to appear in
  // the inventory straight out of a flat frame.
  const mountPrint = loosePrint(
    photoTexture('mount-print-back', () => unexposedPrintCanvas({ width: 200, height: 260 })),
    0.12,
    0.155,
  )
  mountPrint.position.set(-0.36, 1.6, 2.9)
  mountPrint.rotation.z = -0.06
  mountPrint.visible = false
  group.add(mountPrint)

  // a small engraved plate under it
  const plate = labelPlate('撮影室　昭和六十年', 0.2, 0.038, {
    bg: '#c9b98f',
    fg: '#2a2116',
    font: '500 30px "Hiragino Mincho ProN", "Yu Mincho", serif',
  })
  plate.position.set(-0.36, 1.44, 2.884)
  group.add(plate)

  // Two smaller portraits flanking it, to make the wall a wall of work. Both
  // sit on solid wall: at x = -1.0 the left one was centred on the archway's
  // own jamb, so 10 cm of frame hung out over the opening and the way through
  // to the studio read as a gap between pictures rather than as a doorway.
  for (const [i, x] of [0.28, -0.8].entries()) {
    const p = framedPhoto(mats, photoTexture(`hall-portrait-${i}`, () => portraitCanvas(i + 4, { width: 210, height: 280 })), 0.2, 0.26, {
      frame: 0.022,
      depth: 0.026,
    })
    p.position.set(x, 1.62 + (i === 0 ? -0.06 : 0.04), 2.885)
    p.rotation.z = i === 0 ? 0.008 : -0.012
    group.add(p)
  }

  // ------------------------------------------------------------- fuse box
  const fuseBox = new THREE.Group()
  const fuseSockets: THREE.Group[] = []
  const fuseBoxDoor = new THREE.Group()
  const breakerLever = new THREE.Group()
  {
    const bw = 0.34
    const bh = 0.44
    const bd = 0.11
    // The carcass is five plates around an opening, not a solid block. It used
    // to be one filled box with the fuse holders buried inside it, which meant
    // the cabinet had no opening at all: opening the door revealed the front
    // face of the steel, the holders and the lever were sealed behind 5 cm of
    // it, and from across the room the whole thing read as a black rectangle
    // stuck on the wall. The first puzzle was behind a wall of its own cabinet.
    const wallT = 0.012
    const plate = (w: number, h: number, dpt: number, x: number, y: number, z: number): void => {
      const m = mesh(texturedBox(w, h, dpt, 2), mats.steelDark)
      m.position.set(x, y, z)
      fuseBox.add(m)
    }
    // back
    plate(bw, bh, wallT, 0, 0, -bd + wallT / 2)
    // top and bottom
    plate(bw, wallT, bd, 0, bh / 2 - wallT / 2, -bd / 2)
    plate(bw, wallT, bd, 0, -bh / 2 + wallT / 2, -bd / 2)
    // sides
    plate(wallT, bh - wallT * 2, bd, -bw / 2 + wallT / 2, 0, -bd / 2)
    plate(wallT, bh - wallT * 2, bd, bw / 2 - wallT / 2, 0, -bd / 2)
    // interior back board the holders are screwed to
    const board = mesh(texturedBox(bw - 0.05, bh - 0.05, 0.012, 2.4), mats.bakelite)
    board.position.z = -bd + wallT + 0.008
    fuseBox.add(board)

    // ceramic fuse holders
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Group()
      const base = mesh(
        lathe(
          [
            [0.035, 0],
            [0.035, 0.012],
            [0.028, 0.016],
            [0.028, 0.03],
            [0, 0.03],
          ],
          16,
        ),
        new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.42, metalness: 0.02 }),
      )
      base.rotation.x = -Math.PI / 2
      s.add(base)
      const contact = mesh(new THREE.TorusGeometry(0.024, 0.004, 6, 16), mats.brass)
      s.add(contact)
      // An invisible disc across the mouth of the holder. Empty, a holder is a
      // ring with a hole in the middle - and the middle is exactly where a
      // player aims. The ray went through the gap, found the back board, and
      // the game answered "a wall", three times running, to someone holding the
      // right fuse and pointing at the right socket.
      const catcher = new THREE.Mesh(
        new THREE.CircleGeometry(0.032, 16),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      catcher.position.z = 0.012
      catcher.name = 'socket-catcher'
      s.add(catcher)
      s.position.set(-0.09 + i * 0.09, 0.06, -bd + 0.045)
      s.name = `fuse-socket-${i}`
      fuseBox.add(s)
      fuseSockets.push(s)
      // two of the three already carry a fuse
      if (i !== 1) {
        const f = makeFuse(mats, i === 0 ? 0xb9563a : 0x3f6f4c)
        f.position.set(0, 0, 0.026)
        s.add(f)
      }
    }
    // scorch mark behind the dead holder
    {
      const c = makeCanvas(128, 128)
      const g = ctx2d(c)
      const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62)
      grad.addColorStop(0, 'rgba(20,14,10,0.85)')
      grad.addColorStop(0.5, 'rgba(46,32,20,0.4)')
      grad.addColorStop(1, 'rgba(46,32,20,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, 128, 128)
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      const scorch = mesh(
        new THREE.PlaneGeometry(0.13, 0.13),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }),
        { cast: false, receive: false },
      )
      scorch.position.set(0, 0.055, -bd + 0.028)
      fuseBox.add(scorch)
    }

    // main lever, thrown down when the power is dead
    {
      // Sized so the whole swing stays inside the carcass. The arm reached
      // 0.147 below a pivot at y = -0.1, putting the knob at -0.247 while the
      // bottom plate is at -0.214: at rest the handle hung through the floor of
      // its own cabinet, and through the bottom of the gate plate behind it.
      const pivotY = -0.06
      const armLen = 0.1
      const knobR = 0.016
      const pivot = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 12), mats.brassDull)
      pivot.rotation.z = Math.PI / 2
      pivot.position.set(0, pivotY, -bd + 0.05)
      fuseBox.add(pivot)
      const arm = mesh(roundedBox(0.028, armLen, 0.02, 0.008, 2, 3), mats.bakelite)
      arm.position.set(0, -armLen / 2, 0)
      breakerLever.add(arm)
      const knob = mesh(new THREE.SphereGeometry(knobR, 14, 10), mats.bakelite)
      knob.position.set(0, -armLen - knobR * 0.3, 0)
      breakerLever.add(knob)
      breakerLever.position.set(0, pivotY, -bd + 0.05)
      breakerLever.rotation.x = -0.34
      fuseBox.add(breakerLever)
      // The slot the handle travels in, spanning the swing and no further.
      const gate = mesh(texturedBox(0.05, 0.15, 0.01, 3), mats.steelDark, { cast: false })
      gate.position.set(0, pivotY - 0.062, -bd + 0.032)
      fuseBox.add(gate)
      const onOff = labelPlate('入　切', 0.055, 0.02, {
        bg: '#7a746a',
        fg: '#e6e0d0',
        font: '500 26px "Hiragino Sans", sans-serif',
      })
      onOff.position.set(0, -0.235, -bd + 0.028)
      fuseBox.add(onOff)
    }

    // hinged cover
    {
      const leaf = mesh(texturedBox(bw, bh, 0.016, 2), mats.steelDark)
      leaf.position.set(bw / 2, 0, 0)
      fuseBoxDoor.add(leaf)
      const handle = mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 14), mats.brassDull)
      handle.position.set(bw - 0.05, 0, 0.012)
      fuseBoxDoor.add(handle)
      const sign = labelPlate('配電盤', 0.13, 0.04, {
        bg: '#5c574f',
        fg: '#e8e2d2',
        font: '500 32px "Hiragino Mincho ProN", serif',
      })
      sign.position.set(bw / 2, 0.15, 0.01)
      fuseBoxDoor.add(sign)
      fuseBoxDoor.position.set(-bw / 2, 0, 0.006)
      fuseBox.add(fuseBoxDoor)
    }

    // Surface-mounted, with the back plate against the plaster. At the old
    // depth the cabinet sat 10 cm inside a solid 16 cm wall whose inner face is
    // at x = -3.12: nine tenths of it was buried, the room showed a 1 cm lip of
    // steel, and the close-up flew to a point where the only thing between the
    // lens and the fuses was the wall. The first puzzle was inside the masonry.
    fuseBox.position.set(H.x0 + WALL_THICKNESS / 2 + bd, 1.52, 4.1)
    fuseBox.rotation.y = Math.PI / 2
    group.add(fuseBox)
  }

  // ------------------------------------------------------- exit door lock
  const lockPlate = new THREE.Group()
  const lockRings: THREE.Group[] = []
  {
    const backing = mesh(roundedBox(0.42, 0.15, 0.026, 0.008, 2, 2.4), mats.brassDull)
    lockPlate.add(backing)
    const inner = mesh(texturedBox(0.38, 0.11, 0.01, 3), mats.steelDark, { cast: false })
    inner.position.z = 0.014
    lockPlate.add(inner)
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Group()
      const disc = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.022, 28), mats.brass)
      disc.rotation.x = Math.PI / 2
      ring.add(disc)
      // knurling
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2
        const notch = mesh(new THREE.BoxGeometry(0.004, 0.0035, 0.022), mats.brassDull, { cast: false })
        notch.position.set(Math.cos(a) * 0.0415, Math.sin(a) * 0.0415, 0)
        notch.rotation.z = a
        ring.add(notch)
      }
      // the icon face, replaced by the puzzle system when the ring turns
      const face = makeProcessIconMesh(i)
      face.position.z = 0.0125
      face.name = 'ring-face'
      ring.add(face)
      ring.position.set(-0.144 + i * 0.096, 0, 0.02)
      ring.name = `lock-ring-${i}`
      lockPlate.add(ring)
      lockRings.push(ring)
    }
    // The brass plate under the rings. Bigger than it was: this is the one line
    // that tells the player what the four symbols are for, and at the old size
    // it rendered about six pixels tall on a desktop screen - a smudge.
    const engraved = labelPlate('工程の順に', 0.17, 0.036, {
      bg: '#8d7238',
      fg: '#f8efd6',
      font: '600 40px "Hiragino Mincho ProN", serif',
    })
    engraved.position.set(0, -0.066, 0.016)
    lockPlate.add(engraved)

    // On the lower panel, below the lock rail, on the face of the leaf.
    lockPlate.position.set(
      (OPENINGS.exitDoor.x0 + OPENINGS.exitDoor.x1) / 2,
      0.86,
      OPENINGS.exitDoor.z - EXTERIOR_THICKNESS / 2 - 0.005,
    )
    lockPlate.rotation.y = Math.PI
    group.add(lockPlate)
  }

  // ------------------------------------------------------------ coat rack
  const coatRack = new THREE.Group()
  {
    const board = mesh(texturedBox(0.7, 0.14, 0.026, 2), mats.woodDark)
    coatRack.add(board)
    for (let i = 0; i < 4; i++) {
      const hook = mesh(
        lathe(
          [
            [0.008, 0],
            [0.008, 0.05],
            [0.016, 0.062],
            [0.01, 0.07],
            [0, 0.07],
          ],
          10,
        ),
        mats.brassDull,
      )
      hook.rotation.x = Math.PI / 2
      hook.position.set(-0.26 + i * 0.17, -0.01, 0.02)
      coatRack.add(hook)
    }
    // a lower hook added later, at a child's height
    // A second hook added later, at a child's height, on its own little batten
    // screwed to the wall. It reads as an afterthought because it was one.
    const smallPlate = mesh(texturedBox(0.11, 0.07, 0.018, 2.4), mats.woodMid, { cast: false })
    smallPlate.position.set(0.3, -0.52, 0.006)
    coatRack.add(smallPlate)
    const small = mesh(
      lathe([[0.006, 0], [0.006, 0.032], [0.012, 0.042], [0, 0.045]], 10),
      mats.brassDull,
    )
    small.rotation.x = Math.PI / 2
    small.position.set(0.3, -0.53, 0.016)
    coatRack.add(small)
    for (const sx of [-0.035, 0.035]) {
      const screw = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 8), mats.brassDull, {
        cast: false,
      })
      screw.rotation.x = Math.PI / 2
      screw.position.set(0.3 + sx, -0.492, 0.016)
      coatRack.add(screw)
    }

    // The one remaining overcoat. Built from a shoulder yoke, a tapering body
    // and a collar rather than a lathe: a solid of revolution reads as a sack,
    // and a hanging coat is the most human object in the hall.
    {
      const cloth = new THREE.MeshStandardMaterial({ color: 0x3a352d, roughness: 0.95 })
      const coat = new THREE.Group()
      // shoulders: a shallow wedge, wider than it is deep
      const shoulder = mesh(roundedBox(0.34, 0.1, 0.14, 0.04, 3, 2.4), cloth)
      shoulder.position.set(0, -0.09, 0)
      coat.add(shoulder)
      // body: three tapering blocks so the drape narrows toward the hem
      const seg: Array<[number, number, number, number]> = [
        [0.33, 0.3, 0.13, -0.27],
        [0.3, 0.3, 0.115, -0.55],
        [0.26, 0.24, 0.1, -0.82],
      ]
      for (const [w, h, dz, y] of seg) {
        const b = mesh(roundedBox(w, h, dz, 0.03, 2, 2), cloth)
        b.position.set(0, y, 0)
        coat.add(b)
      }
      // sleeves, hanging slightly away from the body
      for (const sx of [-1, 1]) {
        const sleeve = mesh(roundedBox(0.085, 0.46, 0.1, 0.035, 2, 2.4), cloth)
        sleeve.position.set(sx * 0.185, -0.36, 0.005)
        sleeve.rotation.z = sx * 0.05
        coat.add(sleeve)
      }
      // collar
      const collar = mesh(roundedBox(0.2, 0.07, 0.13, 0.03, 2, 3), cloth)
      collar.position.set(0, -0.03, 0.012)
      coat.add(collar)
      // the hanger hook it is on
      const hookWire = mesh(new THREE.TorusGeometry(0.018, 0.0028, 6, 14, Math.PI), mats.brassDull, {
        cast: false,
      })
      hookWire.position.set(0, 0.005, 0.014)
      coat.add(hookWire)

      coat.position.set(-0.09, -0.02, 0.075)
      coatRack.add(coat)
    }

    coatRack.position.set(H.x0 + 0.1, 1.7, 5.55)
    coatRack.rotation.y = Math.PI / 2
    group.add(coatRack)
  }

  // ------------------------------------------------------ umbrella stand
  const umbrella = new THREE.Group()
  {
    const stand = mesh(
      lathe(
        [
          [0.11, 0],
          [0.115, 0.02],
          [0.1, 0.05],
          [0.1, 0.42],
          [0.108, 0.44],
          [0.098, 0.44],
          [0.09, 0.42],
          [0.09, 0.03],
          [0, 0.02],
        ],
        20,
      ),
      new THREE.MeshStandardMaterial({ color: 0x4a5b52, roughness: 0.55, metalness: 0.25 }),
    )
    umbrella.add(stand)
    // a broken child's umbrella, red, ribs tied with thread
    const shaft = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 8), mats.woodMid)
    shaft.position.set(0.02, 0.34, 0.01)
    shaft.rotation.z = 0.07
    umbrella.add(shaft)
    const canopy = mesh(
      lathe([[0.0, 0], [0.055, -0.03], [0.075, -0.11], [0.05, -0.16], [0, -0.17]], 14),
      new THREE.MeshStandardMaterial({ color: 0x8e2f26, roughness: 0.86 }),
    )
    canopy.position.set(0.04, 0.62, 0.01)
    umbrella.add(canopy)
    for (let i = 0; i < 3; i++) {
      const rib = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.17, 5), mats.steelDark, { cast: false })
      rib.position.set(0.05 + i * 0.008, 0.5, 0.015)
      rib.rotation.z = 0.3 + i * 0.1
      umbrella.add(rib)
    }
    umbrella.position.set(H.x0 + 0.28, 0, 6.02)
    group.add(umbrella)
  }

  // -------------------------------------------------------------- calendar
  const calendar = new THREE.Group()
  {
    const c = makeCanvas(340, 460)
    const g = ctx2d(c)
    g.fillStyle = '#e0d5b6'
    g.fillRect(0, 0, 340, 460)
    g.fillStyle = '#2a2117'
    g.font = '500 44px "Hiragino Mincho ProN", "Yu Mincho", serif'
    g.textAlign = 'center'
    g.fillText('昭和六十年', 170, 62)
    g.font = '500 76px "Hiragino Mincho ProN", "Yu Mincho", serif'
    g.fillText('十一月', 170, 146)
    g.strokeStyle = 'rgba(42,33,23,0.35)'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(28, 170)
    g.lineTo(312, 170)
    g.stroke()
    g.font = '400 26px "Hiragino Sans", sans-serif'
    const days = ['日', '月', '火', '水', '木', '金', '土']
    for (let i = 0; i < 7; i++) {
      g.fillStyle = i === 0 ? '#8e2f26' : '#3a2f21'
      g.fillText(days[i], 40 + i * 44, 202)
    }
    g.font = '400 24px "Hiragino Sans", sans-serif'
    let day = 1
    for (let row = 0; row < 5 && day <= 30; row++) {
      for (let col = 0; col < 7 && day <= 30; col++) {
        if (row === 0 && col < 5) continue
        g.fillStyle = col === 0 ? '#8e2f26' : '#3a2f21'
        g.fillText(String(day), 40 + col * 44, 244 + row * 42)
        if (day === 23) {
          g.strokeStyle = '#8e2f26'
          g.lineWidth = 2.2
          g.beginPath()
          g.arc(40 + col * 44, 236 + row * 42, 17, 0, Math.PI * 2)
          g.stroke()
        }
        day++
      }
    }
    g.fillStyle = 'rgba(42,33,23,0.5)'
    g.font = '400 20px "Hiragino Mincho ProN", serif'
    g.fillText('霧沢写真館', 170, 436)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    const sheet = mesh(new THREE.PlaneGeometry(0.28, 0.38), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), {
      cast: false,
    })
    calendar.add(sheet)
    const bar = mesh(texturedBox(0.3, 0.02, 0.012, 3), mats.steelDark, { cast: false })
    bar.position.y = 0.2
    calendar.add(bar)
    calendar.position.set(H.x0 + 0.085, 1.58, 4.94)
    calendar.rotation.y = Math.PI / 2
    calendar.rotation.z = -0.012
    group.add(calendar)
  }

  // ------------------------------------------- stairs that go nowhere
  const stairs = new THREE.Group()
  {
    for (let i = 0; i < 5; i++) {
      const step = mesh(texturedBox(1.0, 0.045, 0.27, 1.6), mats.woodMid)
      step.position.set(0, 0.19 + i * 0.19, -i * 0.27)
      stairs.add(step)
      const riser = mesh(texturedBox(1.0, 0.15, 0.02, 1.6), mats.woodDark, { cast: false })
      riser.position.set(0, 0.095 + i * 0.19, -i * 0.27 + 0.135)
      stairs.add(riser)
    }
    // The boarding-over. It starts level with the top tread: any gap and the
    // player can see that there is nothing behind it.
    const boards = new THREE.Group()
    // Behind the boards, a void. Without it the gaps between the planks show
    // lit plaster, the whole thing reads as a panelled wall, and the player is
    // left thinking the stairs merely stop rather than that someone closed them
    // off - which is the difference between "this game is unfinished" and "this
    // way is shut".
    const voidPanel = mesh(
      texturedBox(1.02, 1.16, 0.02, 1),
      new THREE.MeshBasicMaterial({ color: 0x0a0806 }),
      { cast: false, receive: false },
    )
    voidPanel.position.set(0, 1.58, -1.2)
    boards.add(voidPanel)
    for (let i = 0; i < 5; i++) {
      // Dark stock, stood off the plaster far enough to throw a shadow line,
      // and narrower than their spacing so the dark shows between them.
      const b = mesh(texturedBox(1.08, 0.155, 0.034, 1.4), mats.woodDark)
      b.position.set(0, 1.06 + i * 0.225, -1.12)
      b.rotation.z = (i % 2 ? 1 : -1) * 0.008
      boards.add(b)
      // hand-driven nails, two a side, not quite in line
      for (const nx of [-0.44, 0.44]) {
        const nail = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.008, 8), mats.steelDark, {
          cast: false,
        })
        nail.rotation.x = Math.PI / 2
        nail.position.set(nx + (i % 2 ? 0.015 : -0.01), 1.06 + i * 0.225 + (i % 3 ? 0.012 : -0.02), -1.1)
        boards.add(nail)
      }
    }
    stairs.add(boards)

    // Handrail and balusters.
    //
    // The flight rises 0.19 per 0.27 of going, i.e. 35.1 degrees, climbing as z
    // decreases. A cylinder points along its own +Y, so to lay it on that slope
    // it has to be tipped by the angle from vertical, negative so the high end
    // is the one over the top tread. Getting either the size or the sign of
    // that wrong is what had the rail running downhill against the steps.
    const RISE = 0.19
    const GOING = 0.27
    const slope = RISE / GOING
    const railAt = (z: number) => 0.2125 + slope * -z + 0.85
    const treadAt = (z: number) => (z > 0 ? 0 : 0.2125 + slope * -z)
    const railLen = 1.4 / Math.cos(Math.atan(slope))
    const rail = mesh(new THREE.CylinderGeometry(0.024, 0.024, railLen, 10), mats.woodDark)
    rail.position.set(0.46, railAt(-0.55), -0.55)
    rail.rotation.set(-(Math.PI / 2 - Math.atan(slope)), 0, 0)
    stairs.add(rail)
    // The newel carries the bottom of the rail; the balusters each run from the
    // tread they stand on up to the underside of the rail, not through it.
    const newel = mesh(texturedBox(0.075, 1.06, 0.075, 3), mats.woodDark)
    newel.position.set(0.46, 0.53, 0.16)
    stairs.add(newel)
    for (const z of [-0.19, -0.62, -1.05]) {
      const y0 = treadAt(z)
      const y1 = railAt(z) - 0.024
      const post = mesh(new THREE.CylinderGeometry(0.019, 0.021, y1 - y0, 8), mats.woodDark)
      post.position.set(0.46, (y0 + y1) / 2, z)
      stairs.add(post)
    }
    // Local -z is uphill, and the group is turned a quarter turn, so the flight
    // climbs toward +x. Started from H.x1 - 0.62 it ran a clear half metre out
    // through the exterior wall; this puts the top tread and the boarding just
    // inside it.
    stairs.position.set(H.x1 - 1.22, 0, 5.02)
    stairs.rotation.y = -Math.PI / 2
    group.add(stairs)
  }

  // ---------------------------------------------------------- pendant lamp
  const pendant = pendantShade(mats, 0.17)
  pendant.position.set(-1.3, H.ceiling - 0.6, 4.5)
  group.add(pendant)
  {
    const rose = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.02, 16), mats.bakelite, { cast: false })
    rose.position.set(-1.3, H.ceiling - 0.012, 4.5)
    group.add(rose)
  }

  // ------------------------------------------------------- height marks
  const heightMarks = new THREE.Group()
  {
    const c = makeCanvas(128, 512)
    const g = ctx2d(c)
    g.clearRect(0, 0, 128, 512)
    g.strokeStyle = 'rgba(58,44,30,0.72)'
    g.lineWidth = 2.5
    g.font = '400 17px "Hiragino Sans", sans-serif'
    g.fillStyle = 'rgba(58,44,30,0.72)'
    const marks: Array<[number, string]> = [
      [430, '五五・七・二'],
      [352, '五七・七・三'],
      [286, '五九・七・一'],
      [244, '六〇・七・二'],
    ]
    for (const [y, label] of marks) {
      g.beginPath()
      g.moveTo(18, y)
      g.lineTo(96, y)
      g.stroke()
      g.fillText(label, 20, y - 8)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    const m = mesh(
      new THREE.PlaneGeometry(0.09, 0.36),
      new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.95 }),
      { cast: false },
    )
    heightMarks.add(m)
    heightMarks.position.set(OPENINGS.hallArch.x1 + 0.028, 0.86, 2.86)
    group.add(heightMarks)
  }

  // --------------------------------------------- the way through the arch
  // A worn threshold board and its two jamb faces. This is what the player
  // clicks to walk between the hall and the studio, so it has to be a real,
  // obviously-a-doorway piece of joinery rather than a marker on the floor.
  const archThreshold = new THREE.Group()
  {
    const a = OPENINGS.hallArch
    const w = a.x1 - a.x0
    const sill = mesh(texturedBox(w, 0.022, WALL_THICKNESS + 0.06, 2.2), mats.woodTrim, { cast: false })
    sill.position.set((a.x0 + a.x1) / 2, 0.011, a.z)
    archThreshold.add(sill)
    // the reveal faces inside the opening, so the arch has thickness
    for (const x of [a.x0 + 0.012, a.x1 - 0.012]) {
      const reveal = mesh(texturedBox(0.02, a.top - 0.04, WALL_THICKNESS, 1.6), mats.plasterWall, {
        cast: false,
      })
      reveal.position.set(x, (a.top - 0.04) / 2, a.z)
      archThreshold.add(reveal)
    }
    const soffit = mesh(texturedBox(w - 0.02, 0.02, WALL_THICKNESS, 1.6), mats.plasterWall, { cast: false })
    soffit.position.set((a.x0 + a.x1) / 2, a.top - 0.03, a.z)
    archThreshold.add(soffit)

    // An invisible pad filling the opening itself, so the doorway is clickable
    // where a player actually aims: at the gap they intend to walk through.
    // Until this existed the exit hotspot was the sill, the reveals and the
    // soffit - the frame - and clicking anywhere in the opening hit nothing and
    // answered "there is nothing here", on the one route out of the first room.
    // Double-sided, because the same opening is walked through from both rooms.
    // A plane faces +z, and a raycast ignores a back face, so the pad answered
    // clicks from the hall and not one from the studio: you could walk in and
    // then had no doorway to click to walk out, with both other studio doors
    // locked until you find keys that are not in the studio.
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.04, a.top - 0.04),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    )
    pad.position.set((a.x0 + a.x1) / 2, (a.top - 0.04) / 2, a.z)
    pad.name = 'arch-opening'
    archThreshold.add(pad)
    group.add(archThreshold)
  }

  // ------------------------------------------------- phosphorescent mark
  const phosphor = phosphorMark('灯', 0.3)
  // On the west wall, between the fuse box and the calendar.
  //
  // It used to sit at x = -2.0 on the north wall plane - and the archway to the
  // studio spans x = -2.6 to -1.0, so the mark was floating in the middle of the
  // opening with no wall behind it: red writing painted across a passage. It is
  // also now in the centre of the 配電盤の壁 composition rather than off the
  // edge of the reception one.
  phosphor.position.set(H.x0 + 0.085, 1.72, 4.55)
  phosphor.rotation.y = Math.PI / 2
  group.add(phosphor)

  // ------------------------------------------------------- floor dressing
  {
    const mat = mesh(
      extrude(
        [
          [-0.5, -0.34],
          [0.5, -0.34],
          [0.5, 0.34],
          [-0.5, 0.34],
        ],
        0.014,
        { density: 3 },
      ),
      new THREE.MeshStandardMaterial({ color: 0x30352f, roughness: 0.96 }),
      { cast: false },
    )
    mat.rotation.x = -Math.PI / 2
    mat.position.set(-1.82, 0.002, 5.72)
    group.add(mat)

    // shoe cabinet
    const geta = shelfUnit(mats, 0.72, 0.82, 0.32, 3, true)
    geta.position.set(-2.72, 0, 3.5)
    geta.rotation.y = Math.PI / 2
    group.add(geta)
    const gtop = mesh(roundedBox(0.78, 0.03, 0.36, 0.006, 2, 1.6), mats.woodDark)
    gtop.position.set(-2.72, 0.83, 3.5)
    gtop.rotation.y = Math.PI / 2
    group.add(gtop)
    // a dead pot plant on top of it
    const pot = mesh(lathe([[0.07, 0], [0.075, 0.02], [0.085, 0.12], [0.075, 0.125], [0, 0.12]], 16), new THREE.MeshStandardMaterial({ color: 0x6b4b36, roughness: 0.9 }))
    pot.position.set(-2.72, 0.845, 3.5)
    group.add(pot)
    for (let i = 0; i < 5; i++) {
      const stem = mesh(new THREE.CylinderGeometry(0.0022, 0.003, 0.2 + i * 0.03, 5), new THREE.MeshStandardMaterial({ color: 0x5e5233, roughness: 0.95 }), { cast: false })
      stem.position.set(-2.72 + (i - 2) * 0.016, 1.06 + i * 0.015, 3.5 + (i % 2 ? 0.02 : -0.02))
      stem.rotation.z = (i - 2) * 0.12
      group.add(stem)
    }

    // a couple of chemical bottles left on the counter, waiting to be boxed
    const b1 = bottle(mats, 0.18, 0.038, '定着')
    b1.position.set(-0.9, 1.04, 3.32)
    group.add(b1)
    const b2 = bottle(mats, 0.15, 0.034, '停止', 0x2c3a24)
    b2.position.set(-0.98, 1.04, 3.44)
    group.add(b2)
  }

  return {
    group,
    fuseBoxDoor,
    fuseSockets,
    fuseSpare,
    breakerLever,
    receptionDrawer,
    drawerUnit: drawers.group,
    drawerContents,
    recordPhoto,
    mountPrint,
    lockRings,
    lockPlate,
    phosphor,
    bell: bellGroup.children[0] as THREE.Mesh,
    telephone,
    calendar,
    coatRack,
    umbrella,
    stairs,
    pendant,
    heightMarks,
    archThreshold,
  }
}

/** A ceramic-bodied cartridge fuse. */
export function makeFuse(mats: MaterialLibrary, capColor = 0x9a4f33): THREE.Group {
  const g = new THREE.Group()
  const body = mesh(
    lathe(
      [
        [0.0, -0.021],
        [0.011, -0.021],
        [0.011, -0.014],
        [0.0125, -0.012],
        [0.0125, 0.012],
        [0.011, 0.014],
        [0.011, 0.021],
        [0, 0.021],
      ],
      16,
    ),
    new THREE.MeshStandardMaterial({ color: 0xded6c4, roughness: 0.38, metalness: 0.02 }),
  )
  body.rotation.x = Math.PI / 2
  g.add(body)
  for (const z of [-0.021, 0.021]) {
    const cap = mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.006, 14), new THREE.MeshStandardMaterial({
      color: capColor,
      roughness: 0.42,
      metalness: 0.3,
    }))
    cap.rotation.x = Math.PI / 2
    cap.position.z = z
    g.add(cap)
  }
  const band = mesh(new THREE.TorusGeometry(0.0126, 0.0018, 6, 16), mats.brass, { cast: false })
  g.add(band)
  return g
}

/** The four photographic process icons, drawn as flat brass-etched discs. */
export function makeProcessIconMesh(index: number): THREE.Mesh {
  const t = new THREE.CanvasTexture(processIconCanvas(index))
  t.colorSpace = THREE.SRGBColorSpace
  const m = mesh(
    new THREE.CircleGeometry(0.036, 28),
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0.6 }),
    { cast: false },
  )
  return m
}

/**
 * 0 撮影 (a shutter iris) / 1 現像 (a rising image) / 2 停止 (a bar) /
 * 3 定着 (a sealed square). Icons, not text, so the lock reads as hardware -
 * but each one is also captioned in the close-up UI so nothing is a guess.
 */
export function processIconCanvas(index: number): HTMLCanvasElement {
  const px = 192
  const c = makeCanvas(px, px)
  const g = ctx2d(c)
  g.fillStyle = '#b79a58'
  g.beginPath()
  g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#3a2e18'
  g.fillStyle = '#3a2e18'
  g.lineWidth = 7
  g.lineCap = 'round'
  const cx = px / 2
  const cy = px / 2
  const r = px * 0.28
  switch (index) {
    case 0: {
      // shutter iris: six overlapping blades
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        g.beginPath()
        g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        g.lineTo(cx + Math.cos(a + 1.05) * r, cy + Math.sin(a + 1.05) * r)
        g.stroke()
      }
      g.beginPath()
      g.arc(cx, cy, r * 0.3, 0, Math.PI * 2)
      g.fill()
      break
    }
    case 1: {
      // an image emerging: three tonal bars rising out of a tray line
      g.beginPath()
      g.moveTo(cx - r, cy + r * 0.72)
      g.lineTo(cx + r, cy + r * 0.72)
      g.stroke()
      for (let i = 0; i < 3; i++) {
        g.globalAlpha = 0.35 + i * 0.3
        g.fillRect(cx - r * 0.66 + i * r * 0.52, cy + r * 0.5 - (i + 1) * r * 0.34, r * 0.34, (i + 1) * r * 0.34)
      }
      g.globalAlpha = 1
      break
    }
    case 2: {
      // stop: a single heavy bar across a circle
      g.beginPath()
      g.arc(cx, cy, r, 0, Math.PI * 2)
      g.stroke()
      g.lineWidth = 13
      g.beginPath()
      g.moveTo(cx - r * 0.72, cy)
      g.lineTo(cx + r * 0.72, cy)
      g.stroke()
      break
    }
    default: {
      // fix: a square sealed with a cross-hatched corner
      g.strokeRect(cx - r * 0.82, cy - r * 0.82, r * 1.64, r * 1.64)
      g.lineWidth = 5
      for (let i = 0; i < 4; i++) {
        g.beginPath()
        g.moveTo(cx - r * 0.82 + i * r * 0.42, cy + r * 0.82)
        g.lineTo(cx + r * 0.82, cy - r * 0.82 + i * r * 0.42)
        g.stroke()
      }
      break
    }
  }
  return c
}
