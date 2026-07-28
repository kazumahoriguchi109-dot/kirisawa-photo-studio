import * as THREE from 'three'
import { boxAt, extrude, lathe, mesh, roundedBox, texturedBox } from '../Geo'
import type { MaterialLibrary } from '../Materials'
import { EXTERIOR_THICKNESS, OPENINGS, ROOM, WALL_THICKNESS } from '../Layout'
import {
  bottle,
  drawerUnit,
  framedPhoto,
  labelPlate,
  pendantShade,
  phosphorMark,
  shelfUnit,
} from './Common'
import { photoTexture, portraitCanvas, studioRecordCanvas } from '../Photographs'
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
  drawerContents: THREE.Group
  /** The 1985 record photograph in its frame. */
  recordPhoto: THREE.Group
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
  const counter = new THREE.Group()
  {
    const w = 1.5
    const d = 0.58
    const h = 1.02
    const cx = -0.24
    const cz = 3.28
    // plinth + body
    counter.add(boxAt(mats.woodDark, w, h - 0.06, d, 0, (h - 0.06) / 2, 0))
    // moulded top with a slight overhang
    const top = mesh(roundedBox(w + 0.06, 0.045, d + 0.05, 0.008, 2, 1.6), mats.woodMid)
    top.position.y = h - 0.02
    counter.add(top)
    // beaded front panel
    const bead = mesh(texturedBox(w - 0.14, h - 0.28, 0.014, 1.6), mats.woodTrim, { cast: false })
    bead.position.set(0, (h - 0.06) / 2, d / 2 + 0.006)
    counter.add(bead)
    counter.position.set(cx, 0, cz)
    group.add(counter)
  }

  // drawer set built into the counter's right-hand return
  const drawers = drawerUnit(mats, 0.44, 0.62, 0.5, 2)
  drawers.group.position.set(0.52, 0.02, 3.34)
  group.add(drawers.group)
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
    // cut cord, hanging
    const cord = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.26, 6), mats.rubber, { cast: false })
    cord.position.set(-0.11, -0.05, -0.06)
    cord.rotation.z = 0.4
    telephone.add(cord)
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

  // a small engraved plate under it
  const plate = labelPlate('撮影室　昭和六十年', 0.2, 0.038, {
    bg: '#c9b98f',
    fg: '#2a2116',
    font: '500 30px "Hiragino Mincho ProN", "Yu Mincho", serif',
  })
  plate.position.set(-0.36, 1.44, 2.884)
  group.add(plate)

  // two smaller portraits flanking it, to make the wall a wall of work
  for (const [i, x] of [0.28, -1.0].entries()) {
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
    const carcass = mesh(texturedBox(bw, bh, bd, 2), mats.steelDark)
    carcass.position.z = -bd / 2
    fuseBox.add(carcass)
    // interior back board
    const board = mesh(texturedBox(bw - 0.03, bh - 0.03, 0.012, 2.4), mats.bakelite)
    board.position.z = -bd + 0.02
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
      const pivot = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 12), mats.brassDull)
      pivot.rotation.z = Math.PI / 2
      pivot.position.set(0, -0.1, -bd + 0.05)
      fuseBox.add(pivot)
      const arm = mesh(roundedBox(0.028, 0.13, 0.02, 0.008, 2, 3), mats.bakelite)
      arm.position.set(0, -0.065, 0)
      breakerLever.add(arm)
      const knob = mesh(new THREE.SphereGeometry(0.019, 14, 10), mats.bakelite)
      knob.position.set(0, -0.128, 0)
      breakerLever.add(knob)
      breakerLever.position.set(0, -0.1, -bd + 0.05)
      breakerLever.rotation.x = -0.34
      fuseBox.add(breakerLever)
      const gate = mesh(texturedBox(0.06, 0.16, 0.01, 3), mats.steelDark, { cast: false })
      gate.position.set(0, -0.16, -bd + 0.032)
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

    fuseBox.position.set(H.x0 + 0.09, 1.52, 4.1)
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
    // a small brass plate under the rings
    const engraved = labelPlate('工程順', 0.09, 0.022, {
      bg: '#8d7238',
      fg: '#f2e6c4',
      font: '500 26px "Hiragino Mincho ProN", serif',
    })
    engraved.position.set(0, -0.058, 0.016)
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
    // the boarding-over
    const boards = new THREE.Group()
    for (let i = 0; i < 4; i++) {
      const b = mesh(texturedBox(1.05, 0.2, 0.024, 1.4), mats.woodMid)
      b.position.set(0, 1.36 + i * 0.21, -1.2)
      b.rotation.z = (i % 2 ? 1 : -1) * 0.006
      boards.add(b)
    }
    stairs.add(boards)
    // handrail, worn
    const rail = mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.5, 10), mats.woodDark)
    rail.position.set(0.46, 0.86, -0.6)
    rail.rotation.set(0.62, 0, 0)
    stairs.add(rail)
    for (const [y, z] of [[0.42, 0.02], [0.86, -0.62], [1.24, -1.16]]) {
      const post = mesh(new THREE.CylinderGeometry(0.019, 0.021, y * 2, 8), mats.woodDark)
      post.position.set(0.46, y, z)
      stairs.add(post)
    }
    stairs.position.set(H.x1 - 0.62, 0, 5.02)
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
    group.add(archThreshold)
  }

  // ------------------------------------------------- phosphorescent mark
  const phosphor = phosphorMark('灯', 0.3)
  phosphor.position.set(-2.0, 1.72, 2.885)
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
    drawerContents,
    recordPhoto,
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
