/**
 * Screenshot-matrix support.
 *
 * Walks every viewpoint and every close-up and reports, per screen, the things
 * a still image cannot tell you: what is clickable and how much of the frame it
 * owns, whether the named subject of a close-up is actually inside the frame,
 * and the exposure. The pictures are taken separately; this is the measurement
 * that goes beside them.
 *
 * Needs a composited frame to be accurate - the hover/pick path reads world
 * matrices that only refresh while the page is drawing - so every step forces
 * one with frameStats before sampling.
 */
;(() => {
  const d = () => window.__kirisawa.debug
  const T = () => (typeof d().three === 'function' ? d().three() : d().three)
  const cam = () => (typeof d().camera === 'function' ? d().camera() : d().camera)
  const scene = () => (typeof d().scene === 'function' ? d().scene() : d().scene)

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const advance = async (seconds) => {
    for (let t = 0; t < seconds; t += 0.1) {
      d().pump(0.1)
      await sleep(0)
    }
  }

  /** Which hotspot answers each point of a grid, and how much of the frame each owns. */
  const coverage = (n = 33) => {
    const counts = {}
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = -1 + (2 * i) / (n - 1)
        const y = -1 + (2 * j) / (n - 1)
        const p = d().pick(x, y)
        const k = p && p.hotspot ? p.hotspot.id : '-'
        counts[k] = (counts[k] || 0) + 1
      }
    }
    const total = n * n
    return Object.entries(counts)
      .filter(([k]) => k !== '-')
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, +((v / total) * 100).toFixed(1)])
  }

  /** Where a named object lands on screen, and whether the frame holds it. */
  window.__frameCheck = (obj) => {
    const t = T()
    scene().updateMatrixWorld(true)
    const box = new t.Box3().setFromObject(obj)
    if (box.isEmpty()) return null
    const pts = []
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          pts.push(new t.Vector3(x, y, z).project(cam()))
        }
      }
    }
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const zs = pts.map((p) => p.z)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return {
      ndc: [+minX.toFixed(2), +minY.toFixed(2), +maxX.toFixed(2), +maxY.toFixed(2)],
      // fraction of the object's projected box that lies inside the frame
      inFrame: +(
        (Math.max(0, Math.min(1, maxX) - Math.max(-1, minX)) / Math.max(1e-6, maxX - minX)) *
        (Math.max(0, Math.min(1, maxY) - Math.max(-1, minY)) / Math.max(1e-6, maxY - minY))
      ).toFixed(2),
      behind: Math.min(...zs) > 1,
      // how much of the frame it fills, as a rough area fraction
      fills: +(((Math.min(1, maxX) - Math.max(-1, minX)) * (Math.min(1, maxY) - Math.max(-1, minY))) / 4).toFixed(3),
    }
  }

  /** Sweep every viewpoint: coverage, exposure, and the turn destinations. */
  window.__matrixNodes = async function matrixNodes(nodes) {
    const out = {}
    for (const node of nodes || d().nodeIds()) {
      d().go(node)
      await advance(2.2)
      d().frameStats(1)
      out[node] = {
        cover: coverage(),
        exposure: d().frameStats(40),
        lighting: d().lighting(),
      }
    }
    return out
  }

  /** Open a close-up via its opening hotspot and measure what it framed. */
  window.__matrixCloseup = async function matrixCloseup(node, openHotspot) {
    d().go(node)
    await advance(2.2)
    d().frameStats(1)
    try {
      await d().act(openHotspot)
    } catch (e) {
      return { error: String(e.message || e) }
    }
    await advance(3.2)
    d().frameStats(1)
    return {
      scope: d().scope(),
      cover: coverage(),
      exposure: d().frameStats(40),
    }
  }
})()
