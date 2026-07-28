/**
 * Props-inside-walls audit.
 *
 * The fuse box was mounted 10 cm inside a 16 cm wall and the drawer pedestal
 * had half its width in another. Both looked like ordinary props from one angle
 * and like impossible architecture from the next, and both hid something the
 * player needed. Neither was findable by reading the source, because the
 * position and the wall come from different files.
 *
 * This intersects every prop's world bounds against every wall's and reports
 * anything that is more than a hair inside. Trim, reveals and mounting plates
 * are meant to touch, so a small overlap is not interesting; a prop half-buried
 * in masonry is.
 */
window.__clippingAudit = function clippingAudit(tolerance) {
  const d = window.__kirisawa.debug
  const T = d.three
  const tol = tolerance === undefined ? 0.035 : tolerance

  d.scene.updateMatrixWorld(true)

  // Walls are the building's own box meshes; props live under props-* groups.
  const walls = []
  const props = []
  d.scene.traverse((o) => {
    const holder = (() => {
      let p = o
      while (p) {
        if (p.name && (p.name === 'building' || p.name.startsWith('props-'))) return p.name
        p = p.parent
      }
      return null
    })()
    if (!o.isMesh || !o.visible || !holder) return
    const b = new T.Box3().setFromObject(o)
    if (b.isEmpty()) return
    const entry = { name: o.name || o.geometry.type, box: b, holder }
    // Only the big architectural slabs count as walls; door leaves and trim
    // are things props are supposed to sit against.
    const size = new T.Vector3()
    b.getSize(size)
    const wallish =
      holder === 'building' && Math.max(size.x, size.z) > 1.6 && size.y > 1.8
    if (wallish) walls.push(entry)
    else if (holder.startsWith('props-')) props.push(entry)
  })

  const hits = []
  for (const p of props) {
    for (const w of walls) {
      const ov = new T.Box3().copy(p.box).intersect(w.box)
      if (ov.isEmpty()) continue
      const s = new T.Vector3()
      ov.getSize(s)
      // depth of penetration along the wall's thin axis
      const wsz = new T.Vector3()
      w.box.getSize(wsz)
      const thin = wsz.x < wsz.z ? 'x' : 'z'
      const depth = s[thin]
      if (depth <= tol) continue
      const psz = new T.Vector3()
      p.box.getSize(psz)
      hits.push({
        prop: p.holder + '/' + p.name,
        wall: w.name || 'wall',
        buriedM: +depth.toFixed(3),
        fractionOfProp: +(depth / Math.max(0.001, psz[thin])).toFixed(2),
      })
    }
  }
  hits.sort((a, b) => b.buriedM - a.buriedM)
  return { walls: walls.length, props: props.length, worst: hits.slice(0, 25), total: hits.length }
}
