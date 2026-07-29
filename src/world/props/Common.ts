import * as THREE from 'three'
import { boxAt, extrude, lathe, mesh, roundedBox, texturedBox } from '../Geo'
import type { MaterialLibrary } from '../Materials'
import { ctx2d, makeCanvas } from '../Textures'
import { mulberry32 } from '../Noise'

/**
 * Reusable set dressing. Everything here is built from primitives, lathes and
 * extrusions so it can be re-skinned per room without new assets.
 */

/** A glazed picture frame holding a canvas-drawn photograph. */
export function framedPhoto(
  mats: MaterialLibrary,
  photo: THREE.Texture,
  width: number,
  height: number,
  opts: { frame?: number; depth?: number; glass?: boolean; mount?: number } = {},
): THREE.Group {
  const g = new THREE.Group()
  const fw = opts.frame ?? 0.035
  const depth = opts.depth ?? 0.032

  // moulding: four mitred bars
  const barH = texturedBox(width + fw * 2, fw, depth, 2.2)
  const barV = texturedBox(fw, height, depth, 2.2)
  for (const y of [height / 2 + fw / 2, -height / 2 - fw / 2]) {
    const m = mesh(barH.clone(), mats.woodDark, { cast: true })
    m.position.set(0, y, 0)
    g.add(m)
  }
  for (const x of [-width / 2 - fw / 2, width / 2 + fw / 2]) {
    const m = mesh(barV.clone(), mats.woodDark, { cast: true })
    m.position.set(x, 0, 0)
    g.add(m)
  }

  // mount board
  const mount = mesh(new THREE.PlaneGeometry(width, height), mats.paper, {
    cast: false,
    receive: true,
  })
  mount.position.z = depth / 2 - 0.006
  g.add(mount)

  // the print itself, inset within the mount
  const inset = opts.mount ?? 0.03
  const print = mesh(
    new THREE.PlaneGeometry(width - inset * 2, height - inset * 2),
    // Matte, and knocked back a little. These prints are read at close range
    // under a light held right up against them, and at the old semi-gloss
    // roughness the top half of the observation photograph clipped to flat
    // white - which is exactly where the differences the player is hunting for
    // happen to be.
    new THREE.MeshStandardMaterial({
      map: photo,
      color: 0xece6da,
      roughness: 0.88,
      metalness: 0,
    }),
    { cast: false, receive: true },
  )
  print.position.z = depth / 2 - 0.004
  g.add(print)

  if (opts.glass !== false) {
    const glass = mesh(
      new THREE.PlaneGeometry(width, height),
      // Slightly diffuse rather than mirror-smooth. At roughness 0.03 a single
      // lamp put a small hard hot spot on the glass, and bloom then grew it
      // into a blob sitting over the middle of the picture - on the one
      // photograph the player has to read closely to solve anything.
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.34,
        metalness: 0,
        transmission: 0,
        transparent: true,
        opacity: 0.1,
        side: THREE.FrontSide,
      }),
      { cast: false, receive: false },
    )
    glass.position.z = depth / 2 + 0.001
    g.add(glass)
  }

  // backing board
  const back = mesh(texturedBox(width + fw, height + fw, 0.008, 1.4), mats.woodTrim, { cast: false })
  back.position.z = -depth / 2 + 0.004
  g.add(back)

  return g
}

/** A bare print pegged on a line, or lying loose. */
export function loosePrint(map: THREE.Texture, w: number, h: number): THREE.Mesh {
  const m = mesh(
    new THREE.PlaneGeometry(w, h, 4, 4),
    new THREE.MeshStandardMaterial({ map, roughness: 0.62, side: THREE.DoubleSide }),
    { cast: true, receive: true },
  )
  // a very slight curl so it never looks like a decal
  const pos = m.geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    pos.setZ(i, Math.cos((x / w) * Math.PI) * 0.004)
  }
  pos.needsUpdate = true
  m.geometry.computeVertexNormals()
  return m
}

/** Chest of drawers / cabinet carcass with pull-out drawers. */
export interface DrawerUnit {
  group: THREE.Group
  drawers: THREE.Group[]
}

export function drawerUnit(
  mats: MaterialLibrary,
  width: number,
  height: number,
  depth: number,
  count: number,
): DrawerUnit {
  const group = new THREE.Group()
  const t = 0.022
  // carcass
  group.add(boxAt(mats.woodMid, width, t, depth, 0, height - t / 2, 0))
  group.add(boxAt(mats.woodMid, width, t, depth, 0, t / 2, 0))
  group.add(boxAt(mats.woodMid, t, height, depth, -width / 2 + t / 2, height / 2, 0))
  group.add(boxAt(mats.woodMid, t, height, depth, width / 2 - t / 2, height / 2, 0))
  group.add(boxAt(mats.woodDark, width, height, t, 0, height / 2, -depth / 2 + t / 2))

  const drawers: THREE.Group[] = []
  const gap = 0.012
  const dh = (height - t * 2 - gap * (count + 1)) / count
  for (let i = 0; i < count; i++) {
    const d = new THREE.Group()
    const face = mesh(roundedBox(width - t * 2 - 0.006, dh, 0.02, 0.004, 2, 1.6), mats.woodDark)
    face.position.set(0, 0, depth / 2 - 0.01)
    d.add(face)
    // box behind the face so an open drawer has an interior
    const inner = new THREE.Group()
    const iw = width - t * 2 - 0.03
    const id = depth - 0.06
    // The sides and back stand ON the floor board rather than floating above it.
    // Centred on y = 0 they began 0.0325 above their own bottom and stopped
    // short of the top of the drawer face - a box whose walls touched nothing.
    const floorY = -dh / 2 + 0.02
    const wallH = dh * 0.78
    const wallY = floorY + wallH / 2
    inner.add(boxAt(mats.woodMid, iw, 0.01, id, 0, floorY, -0.02))
    inner.add(boxAt(mats.woodMid, iw, wallH, 0.01, 0, wallY, -0.02 - id / 2))
    inner.add(boxAt(mats.woodMid, 0.01, wallH, id, -iw / 2, wallY, -0.02))
    inner.add(boxAt(mats.woodMid, 0.01, wallH, id, iw / 2, wallY, -0.02))
    d.add(inner)
    // brass cup pull
    const pull = mesh(lathe(
      [
        [0.0, 0],
        [0.024, 0],
        [0.024, 0.008],
        [0.016, 0.012],
        [0, 0.012],
      ],
      14,
    ), mats.brass)
    pull.rotation.x = Math.PI / 2
    pull.position.set(0, 0, depth / 2 + 0.002)
    d.add(pull)

    d.position.set(0, t + gap + i * (dh + gap) + dh / 2, 0)
    d.userData.closedZ = 0
    d.userData.openZ = depth * 0.62
    group.add(d)
    drawers.push(d)
  }
  return { group, drawers }
}

/** Open shelving with optional back panel. */
export function shelfUnit(
  mats: MaterialLibrary,
  width: number,
  height: number,
  depth: number,
  shelves: number,
  withBack = true,
): THREE.Group {
  const g = new THREE.Group()
  const t = 0.024
  g.add(boxAt(mats.woodMid, t, height, depth, -width / 2 + t / 2, height / 2, 0))
  g.add(boxAt(mats.woodMid, t, height, depth, width / 2 - t / 2, height / 2, 0))
  if (withBack) g.add(boxAt(mats.woodDark, width, height, 0.012, 0, height / 2, -depth / 2 + 0.006))
  for (let i = 0; i <= shelves; i++) {
    const y = (height / shelves) * i
    g.add(boxAt(mats.woodMid, width - t * 2, t, depth - 0.01, 0, Math.min(y, height - t / 2), 0.004))
  }
  return g
}

/** Chemical bottle: lathed body, shoulder, neck, cap, plus a paper label. */
export function bottle(
  mats: MaterialLibrary,
  height: number,
  radius: number,
  labelText?: string,
  tint = 0x4a2c14,
): THREE.Group {
  const g = new THREE.Group()
  const profile: Array<[number, number]> = [
    [0, 0],
    [radius, 0],
    [radius, height * 0.62],
    [radius * 0.78, height * 0.74],
    [radius * 0.34, height * 0.84],
    [radius * 0.32, height * 0.95],
    [radius * 0.38, height * 0.96],
    [radius * 0.38, height],
    [0, height],
  ]
  const glass = mesh(lathe(profile, 22), new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.24,
    metalness: 0,
    transmission: 0,
    ior: 1.5,
    transparent: true,
    opacity: 0.77,
  }))
  g.add(glass)
  const cap = mesh(new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, height * 0.09, 18), mats.bakelite)
  cap.position.y = height + height * 0.03
  g.add(cap)

  if (labelText) {
    const c = makeCanvas(180, 120)
    const x = ctx2d(c)
    x.fillStyle = '#ddd0ac'
    x.fillRect(0, 0, 180, 120)
    x.strokeStyle = 'rgba(60,48,30,0.5)'
    x.lineWidth = 2
    x.strokeRect(7, 7, 166, 106)
    x.fillStyle = '#241d13'
    x.font = '600 30px "Hiragino Mincho ProN", "Yu Mincho", serif'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText(labelText, 90, 56)
    x.font = '400 15px "Hiragino Sans", sans-serif'
    x.fillStyle = 'rgba(36,29,19,0.6)'
    x.fillText('霧沢写真館', 90, 90)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    const label = mesh(
      new THREE.CylinderGeometry(radius * 1.005, radius * 1.005, height * 0.4, 20, 1, true, -0.9, 1.8),
      new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }),
      { cast: false },
    )
    label.position.y = height * 0.33
    g.add(label)
  }
  return g
}

/** A stack of books / ledgers standing on a shelf. */
export function ledgerRow(mats: MaterialLibrary, count: number, height = 0.28): THREE.Group {
  const g = new THREE.Group()
  const rnd = mulberry32(count * 31 + 7)
  let x = 0
  for (let i = 0; i < count; i++) {
    const w = 0.028 + rnd() * 0.022
    const h = height * (0.9 + rnd() * 0.16)
    const b = mesh(texturedBox(w, h, 0.2, 2.4), i % 3 === 0 ? mats.woodDark : mats.leather)
    b.position.set(x + w / 2, h / 2, 0)
    b.rotation.z = (rnd() - 0.5) * 0.03
    g.add(b)
    // a paper label on the spine
    const lab = mesh(new THREE.PlaneGeometry(w * 0.7, h * 0.22), mats.paper, { cast: false })
    lab.position.set(x + w / 2, h * 0.74, 0.101)
    g.add(lab)
    x += w + 0.004
  }
  g.position.x = -x / 2
  return g
}

/** Enamel pendant shade with a bulb socket. */
export function pendantShade(mats: MaterialLibrary, radius = 0.16): THREE.Group {
  const g = new THREE.Group()
  const shade = mesh(
    lathe(
      [
        [0.018, 0.16],
        [0.022, 0.13],
        [radius * 0.35, 0.075],
        [radius, 0.005],
        [radius, 0],
        [radius * 0.94, 0],
        [radius * 0.94, 0.008],
        [radius * 0.3, 0.078],
        [0.016, 0.132],
      ],
      26,
    ),
    new THREE.MeshStandardMaterial({ color: 0x2f3833, roughness: 0.42, metalness: 0.15, side: THREE.DoubleSide }),
  )
  g.add(shade)
  const socket = mesh(new THREE.CylinderGeometry(0.019, 0.023, 0.05, 14), mats.bakelite)
  socket.position.y = 0.115
  g.add(socket)
  const flex = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.9, 8), mats.rubber, { cast: false })
  flex.position.y = 0.55
  g.add(flex)
  return g
}

/** Wall switch plate with a toggle. */
export function wallSwitch(mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group()
  const plate = mesh(roundedBox(0.075, 0.115, 0.014, 0.006, 2, 3), mats.bakelite)
  g.add(plate)
  const toggle = mesh(roundedBox(0.02, 0.036, 0.02, 0.006, 2, 4), new THREE.MeshStandardMaterial({
    color: 0xd8cfb8,
    roughness: 0.4,
  }))
  toggle.position.z = 0.014
  toggle.name = 'toggle'
  g.add(toggle)
  return g
}

/** A run of surface-mounted conduit with saddle clips. */
export function conduit(
  mats: MaterialLibrary,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius = 0.009,
): THREE.Group {
  const g = new THREE.Group()
  const dir = new THREE.Vector3().subVectors(to, from)
  const len = dir.length()
  const pipe = mesh(new THREE.CylinderGeometry(radius, radius, len, 8), mats.steelDark, { cast: false })
  pipe.position.copy(from).addScaledVector(dir, 0.5)
  pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  g.add(pipe)
  const clips = Math.max(2, Math.floor(len / 0.55))
  for (let i = 0; i <= clips; i++) {
    const c = mesh(new THREE.TorusGeometry(radius * 1.7, 0.0025, 6, 12), mats.brassDull, { cast: false })
    c.position.copy(from).addScaledVector(dir, i / clips)
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize())
    g.add(c)
  }
  return g
}

/** Rolled paper / cloth cylinder, e.g. the backdrop roll. */
export function roll(mats: MaterialLibrary, length: number, radius: number, mat = mats.woodDark): THREE.Mesh {
  const m = mesh(new THREE.CylinderGeometry(radius, radius, length, 20), mat)
  m.rotation.z = Math.PI / 2
  return m
}

/** Simple four-legged wooden chair, optionally upholstered. */
export function chair(mats: MaterialLibrary, seatH = 0.44): THREE.Group {
  const g = new THREE.Group()
  const w = 0.42
  const d = 0.4
  for (const [x, z] of [
    [-w / 2 + 0.03, -d / 2 + 0.03],
    [w / 2 - 0.03, -d / 2 + 0.03],
    [-w / 2 + 0.03, d / 2 - 0.03],
    [w / 2 - 0.03, d / 2 - 0.03],
  ]) {
    const leg = mesh(
      lathe(
        [
          [0.016, 0],
          [0.02, 0.03],
          [0.014, 0.12],
          [0.017, seatH * 0.7],
          [0.019, seatH],
          [0, seatH],
        ],
        10,
      ),
      mats.woodDark,
    )
    leg.position.set(x, 0, z)
    g.add(leg)
  }
  const seat = mesh(roundedBox(w, 0.04, d, 0.01, 2, 1.6), mats.woodDark)
  seat.position.y = seatH
  g.add(seat)
  const cushion = mesh(roundedBox(w - 0.04, 0.045, d - 0.04, 0.018, 3, 1.4), mats.velvetRed)
  cushion.position.y = seatH + 0.04
  cushion.name = 'cushion'
  g.add(cushion)
  // back
  const backH = 0.46
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
    const post = mesh(new THREE.CylinderGeometry(0.016, 0.018, backH, 10), mats.woodDark)
    post.position.set(x, seatH + backH / 2, -d / 2 + 0.03)
    g.add(post)
  }
  const rail = mesh(roundedBox(w - 0.02, 0.08, 0.028, 0.01, 2, 2), mats.woodDark)
  rail.position.set(0, seatH + backH - 0.06, -d / 2 + 0.03)
  g.add(rail)
  return g
}

/** A tapered enamel developing tray. */
export function tray(mats: MaterialLibrary, w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group()
  const outline: Array<[number, number]> = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ]
  const base = mesh(extrude(outline, 0.008, { density: 2.2 }), mats.enamelTray)
  base.rotation.x = -Math.PI / 2
  g.add(base)
  // walls, splayed outward
  const wallH = h
  const specs: Array<[number, number, number, number]> = [
    [0, -d / 2, w, 0],
    [0, d / 2, w, Math.PI],
    [-w / 2, 0, d, -Math.PI / 2],
    [w / 2, 0, d, Math.PI / 2],
  ]
  for (const [x, z, len, rot] of specs) {
    const wall = mesh(texturedBox(len, wallH, 0.008, 2.4), mats.enamelTray)
    wall.position.set(x, wallH / 2, z)
    wall.rotation.y = rot
    wall.rotation.x = 0.14
    g.add(wall)
  }
  return g
}

/** Liquid surface inside a tray. */
export function liquid(w: number, d: number, color: number, opacity = 0.86): THREE.Mesh {
  const m = mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity,
      transmission: 0,
      side: THREE.DoubleSide,
    }),
    { cast: false, receive: false },
  )
  m.rotation.x = -Math.PI / 2
  return m
}

/** Painted or printed label plate, drawn on canvas. */
export function labelPlate(
  text: string,
  width: number,
  height: number,
  opts: {
    bg?: string
    fg?: string
    font?: string
    px?: number
    sub?: string
    mirrored?: boolean
    align?: 'center' | 'left'
  } = {},
): THREE.Mesh {
  const px = 512
  const py = Math.max(48, Math.round((px * height) / width))
  const c = makeCanvas(px, py)
  const g = ctx2d(c)
  g.fillStyle = opts.bg ?? '#ded2b2'
  g.fillRect(0, 0, px, py)
  g.save()
  if (opts.mirrored) {
    g.translate(px, 0)
    g.scale(-1, 1)
  }
  g.fillStyle = opts.fg ?? '#241d13'
  g.font = opts.font ?? `500 ${Math.round(py * 0.5)}px "Hiragino Mincho ProN", "Yu Mincho", serif`
  g.textBaseline = 'middle'
  if (opts.align === 'left') {
    g.textAlign = 'left'
    g.fillText(text, px * 0.06, opts.sub ? py * 0.38 : py * 0.52)
  } else {
    g.textAlign = 'center'
    g.fillText(text, px / 2, opts.sub ? py * 0.38 : py * 0.52)
  }
  if (opts.sub) {
    g.font = `400 ${Math.round(py * 0.22)}px "Hiragino Sans", sans-serif`
    g.fillStyle = 'rgba(36,29,19,0.62)'
    g.fillText(opts.sub, opts.align === 'left' ? px * 0.06 : px / 2, py * 0.74)
  }
  g.restore()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }),
    { cast: false },
  )
}

/**
 * A phosphorescent mark: invisible under white light, glowing under the
 * safelight. The material is swapped by the lighting system.
 */
export function phosphorMark(text: string, size: number, aspect = 1): THREE.Mesh {
  const pw = 512
  const ph = Math.max(64, Math.round(pw / aspect))
  const c = makeCanvas(pw, ph)
  const g = ctx2d(c)
  g.clearRect(0, 0, pw, ph)
  // Hand-brushed rather than typeset: it was painted on with a finger-width
  // brush by someone who did not expect it to be read for forty years.
  const fit = Math.min(ph * 0.78, (pw * 0.86) / Math.max(1, text.length))
  // Brighter and heavier than it was. A thin 400-weight stroke in #86e0a8 at
  // half opacity read as a green smear under the safelight; the three marks
  // spell a sentence the player is asked to piece together across three rooms,
  // so they have to survive being looked at from across a dim room.
  g.fillStyle = '#b6f7cd'
  g.font = `500 ${Math.round(fit)}px "Hiragino Mincho ProN", "Yu Mincho", serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = 'rgba(150,255,205,0.7)'
  g.shadowBlur = fit * 0.26
  g.fillText(text, pw / 2, ph / 2 + ph * 0.03)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const m = mesh(
    new THREE.PlaneGeometry(size * aspect, size),
    new THREE.MeshBasicMaterial({
      map: t,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    { cast: false, receive: false },
  )
  m.name = 'phosphor'
  return m
}

/** Dust motes drifting in a light shaft. */
export function dustMotes(count: number, box: THREE.Vector3, seed = 7): THREE.Points {
  const pos = new Float32Array(count * 3)
  const phase = new Float32Array(count)
  const rnd = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * box.x
    pos[i * 3 + 1] = rnd() * box.y
    pos[i * 3 + 2] = (rnd() - 0.5) * box.z
    phase[i] = rnd() * Math.PI * 2
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
  const p = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xffe0b4,
      size: 0.0034,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  )
  p.name = 'dust'
  p.frustumCulled = false
  return p
}

export function updateDust(points: THREE.Points, t: number): void {
  const pos = points.geometry.attributes.position as THREE.BufferAttribute
  const ph = points.geometry.attributes.aPhase as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const p = ph.getX(i)
    pos.setX(i, pos.getX(i) + Math.sin(t * 0.22 + p) * 0.00008)
    pos.setY(i, pos.getY(i) + Math.cos(t * 0.17 + p * 1.7) * 0.00006)
  }
  pos.needsUpdate = true
}
