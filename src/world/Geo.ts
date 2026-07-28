import * as THREE from 'three'

/**
 * Geometry helpers.
 *
 * Texture tiling is baked into geometry UVs (not into material.map.repeat) so a
 * single shared material can clad surfaces of very different sizes at a
 * constant real-world texel density. That one decision is most of what stops a
 * procedural interior from looking like stretched wallpaper.
 */

const UV_PER_METRE = 0.55

export function uvScale(geo: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined
  if (!uv) return geo
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  }
  uv.needsUpdate = true
  return geo
}

/**
 * Box whose UVs tile at a constant density on every face.
 * BoxGeometry lays out each face 0..1, so we scale per-face using the vertex
 * groups three already provides (+X, -X, +Y, -Y, +Z, -Z, two triangles each).
 */
export function texturedBox(
  w: number,
  h: number,
  d: number,
  density = UV_PER_METRE,
  segments = 1,
): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d, segments, segments, segments)
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const perFace: Array<[number, number]> = [
    [d * density, h * density], // +X
    [d * density, h * density], // -X
    [w * density, d * density], // +Y
    [w * density, d * density], // -Y
    [w * density, h * density], // +Z
    [w * density, h * density], // -Z
  ]
  const vertsPerFace = uv.count / 6
  for (let f = 0; f < 6; f++) {
    const [su, sv] = perFace[f]
    for (let i = 0; i < vertsPerFace; i++) {
      const idx = f * vertsPerFace + i
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv)
    }
  }
  uv.needsUpdate = true
  return geo
}

/**
 * Shift every UV by a fixed amount. Used to keep a texture continuous across a
 * wall that had to be split into several boxes around a doorway - without it,
 * every wall piece restarts the pattern and the seams read as tile edges.
 */
export function uvOffset(geo: THREE.BufferGeometry, du: number, dv: number): THREE.BufferGeometry {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined
  if (!uv) return geo
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv)
  }
  uv.needsUpdate = true
  return geo
}

export function texturedPlane(w: number, h: number, density = UV_PER_METRE, seg = 1): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, h, seg, seg)
  uvScale(geo, w * density, h * density)
  return geo
}

export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  opts: { cast?: boolean; receive?: boolean; name?: string } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = opts.cast ?? true
  m.receiveShadow = opts.receive ?? true
  if (opts.name) m.name = opts.name
  return m
}

/** Convenience: a solid box placed by its centre. */
export function boxAt(
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  opts: { cast?: boolean; receive?: boolean; name?: string; density?: number } = {},
): THREE.Mesh {
  const m = mesh(texturedBox(w, h, d, opts.density ?? UV_PER_METRE), mat, opts)
  m.position.set(x, y, z)
  return m
}

/**
 * A box with softened edges. Real objects have a highlight along every corner;
 * hard 90-degree edges are the single loudest "this is a cube" tell.
 */
export function roundedBox(
  w: number,
  h: number,
  d: number,
  radius = 0.012,
  steps = 2,
  density = UV_PER_METRE,
): THREE.BufferGeometry {
  const r = Math.min(radius, w / 2.05, h / 2.05, d / 2.05)
  const shape = new THREE.Shape()
  const hw = w / 2 - r
  const hh = h / 2 - r
  shape.moveTo(-hw, -h / 2)
  shape.lineTo(hw, -h / 2)
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh)
  shape.lineTo(w / 2, hh)
  shape.quadraticCurveTo(w / 2, h / 2, hw, h / 2)
  shape.lineTo(-hw, h / 2)
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh)
  shape.lineTo(-w / 2, -hh)
  shape.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2)

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - r * 2,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: steps,
    curveSegments: steps + 1,
  })
  geo.center()
  geo.computeVertexNormals()
  applyBoxUV(geo, density)
  return geo
}

/** Triplanar-ish UV assignment for extruded/lathed geometry. */
export function applyBoxUV(geo: THREE.BufferGeometry, density = UV_PER_METRE): void {
  geo.computeBoundingBox()
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nor = geo.attributes.normal as THREE.BufferAttribute
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const nx = Math.abs(nor.getX(i))
    const ny = Math.abs(nor.getY(i))
    const nz = Math.abs(nor.getZ(i))
    let u: number
    let v: number
    if (nx >= ny && nx >= nz) {
      u = z
      v = y
    } else if (ny >= nx && ny >= nz) {
      u = x
      v = z
    } else {
      u = x
      v = y
    }
    uv[i * 2] = u * density
    uv[i * 2 + 1] = v * density
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** Lathe from a 2D profile given as [radius, height] pairs. */
export function lathe(profile: Array<[number, number]>, segments = 32, density = UV_PER_METRE): THREE.LatheGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y))
  const geo = new THREE.LatheGeometry(pts, segments)
  geo.computeVertexNormals()
  const uv = geo.attributes.uv as THREE.BufferAttribute
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  const height = Math.max(0.001, bb.max.y - bb.min.y)
  const circ = Math.max(...profile.map((p) => p[0])) * Math.PI * 2
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * circ * density, uv.getY(i) * height * density)
  }
  uv.needsUpdate = true
  return geo
}

/** Extrude a closed 2D outline (given in metres) along Z. */
export function extrude(
  points: Array<[number, number]>,
  depth: number,
  opts: { bevel?: number; steps?: number; density?: number } = {},
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
  shape.closePath()
  const bevel = opts.bevel ?? 0
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
    steps: opts.steps ?? 1,
  })
  geo.computeVertexNormals()
  applyBoxUV(geo, opts.density ?? UV_PER_METRE)
  return geo
}

export interface Opening {
  /** Distance along the wall from its start, to the left edge of the hole. */
  from: number
  to: number
  /** Sill height above the floor. */
  bottom: number
  top: number
}

/**
 * A wall running from (x1,z1) to (x2,z2) with rectangular openings punched in it.
 * Built from solid segments rather than a shape-with-holes so the UVs stay sane
 * and each piece can cast a proper shadow.
 */
export function buildWall(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  height: number,
  thickness: number,
  mat: THREE.Material,
  openings: Opening[] = [],
  opts: { name?: string; density?: number } = {},
): THREE.Group {
  const group = new THREE.Group()
  group.name = opts.name ?? 'wall'
  const dx = x2 - x1
  const dz = z2 - z1
  const length = Math.hypot(dx, dz)
  // Rotation that maps local +X onto the wall direction (dx, dz). Getting this
  // wrong mirrors the run, which silently puts every doorway on the wrong side.
  const angle = Math.atan2(-dz, dx)
  const density = opts.density ?? UV_PER_METRE

  const sorted = [...openings].sort((a, b) => a.from - b.from)
  const pieces: Array<{ u0: number; u1: number; y0: number; y1: number }> = []

  let cursor = 0
  for (const o of sorted) {
    const from = Math.max(0, Math.min(length, o.from))
    const to = Math.max(0, Math.min(length, o.to))
    if (from > cursor) pieces.push({ u0: cursor, u1: from, y0: 0, y1: height })
    if (o.bottom > 0) pieces.push({ u0: from, u1: to, y0: 0, y1: o.bottom })
    if (o.top < height) pieces.push({ u0: from, u1: to, y0: o.top, y1: height })
    cursor = Math.max(cursor, to)
  }
  if (cursor < length) pieces.push({ u0: cursor, u1: length, y0: 0, y1: height })
  if (pieces.length === 0) pieces.push({ u0: 0, u1: length, y0: 0, y1: height })

  for (const p of pieces) {
    const w = p.u1 - p.u0
    const h = p.y1 - p.y0
    if (w <= 0.0005 || h <= 0.0005) continue
    const geo = texturedBox(w, h, thickness, density)
    // Keep the pattern continuous along the whole wall run.
    uvOffset(geo, p.u0 * density, p.y0 * density)
    const m = mesh(geo, mat, { cast: true, receive: true })
    // local X runs along the wall, local Z is the thickness
    m.position.set(p.u0 + w / 2 - length / 2, p.y0 + h / 2, 0)
    group.add(m)
  }

  group.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2)
  group.rotation.y = angle
  return group
}

/** Floor slab lying in the XZ plane. */
export function floorSlab(
  mat: THREE.Material,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y = 0,
  density = UV_PER_METRE,
): THREE.Mesh {
  const w = Math.abs(x1 - x0)
  const d = Math.abs(z1 - z0)
  const geo = new THREE.PlaneGeometry(w, d, 1, 1)
  uvScale(geo, w * density, d * density)
  const m = new THREE.Mesh(geo, mat)
  m.rotation.x = -Math.PI / 2
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
  m.receiveShadow = true
  m.castShadow = false
  return m
}

export function ceilingSlab(
  mat: THREE.Material,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  density = UV_PER_METRE,
): THREE.Mesh {
  const m = floorSlab(mat, x0, z0, x1, z1, y, density)
  m.rotation.x = Math.PI / 2
  m.receiveShadow = true
  return m
}

/** Skirting board / picture rail run along a wall line. */
export function trimRun(
  mat: THREE.Material,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y: number,
  height: number,
  depth: number,
): THREE.Mesh {
  const length = Math.hypot(x2 - x1, z2 - z1)
  const m = mesh(texturedBox(length, height, depth, 1.1), mat, { cast: false, receive: true })
  m.position.set((x1 + x2) / 2, y + height / 2, (z1 + z2) / 2)
  m.rotation.y = Math.atan2(-(z2 - z1), x2 - x1)
  return m
}

/** Simple flat quad facing +Z, used for photographs, labels and paper. */
export function quad(w: number, h: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.castShadow = false
  m.receiveShadow = true
  return m
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
  })
}
