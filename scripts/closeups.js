/**
 * Close-up composition audit.
 *
 * A close-up exists so the player can read one object. Two ways that fails, and
 * both are much easier to catch as a number than by eye across seventeen
 * compositions:
 *
 *  - the camera sits so close that the subject overflows the frame, so what
 *    fills the screen is an enormous featureless surface;
 *  - the light the close-up adds blows that surface to white.
 *
 * For each close-up this enters it the way a click would, measures how much of
 * the frame the subject actually occupies, and measures the rendered pixels.
 */
window.__closeupAudit = async function closeupAudit(entries) {
  const d = window.__kirisawa.debug
  const T = d.three
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const settle = async () => {
    for (let i = 0; i < 300 && d.chapter.isBusy; i++) {
      d.pump(0.1)
      await sleep(4)
    }
  }

  const out = []
  for (const e of entries) {
    try {
      if (e.setup) await e.setup(d)
      await settle()
      await d.go(e.node)
      await settle()
      await d.act(e.open)
      await settle()
      d.pump(0.6)
      d.syncCamera()
      d.scene.updateMatrixWorld(true)

      // How much of the frame does the thing the player came to look at fill?
      const hs = d.chapterHotspot(e.subject)
      let cover = null
      let offscreen = null
      if (hs) {
        const tg = (Array.isArray(hs.target) ? hs.target : [hs.target]).filter((o) => o && o.visible)
        const box = new T.Box3()
        for (const o of tg) box.expandByObject(o)
        if (!box.isEmpty()) {
          // project the eight corners; the spread tells us the on-screen size
          let x0 = Infinity
          let x1 = -Infinity
          let y0 = Infinity
          let y1 = -Infinity
          for (let i = 0; i < 8; i++) {
            const p = new T.Vector3(
              i & 1 ? box.max.x : box.min.x,
              i & 2 ? box.max.y : box.min.y,
              i & 4 ? box.max.z : box.min.z,
            ).project(d.camera)
            x0 = Math.min(x0, p.x)
            x1 = Math.max(x1, p.x)
            y0 = Math.min(y0, p.y)
            y1 = Math.max(y1, p.y)
          }
          // fraction of the frame's width and height the subject spans, clipped
          // to what is actually on screen
          const vw = (Math.min(1, x1) - Math.max(-1, x0)) / 2
          const vh = (Math.min(1, y1) - Math.max(-1, y0)) / 2
          cover = [+Math.max(0, vw).toFixed(2), +Math.max(0, vh).toFixed(2)]
          offscreen = x0 < -1 || x1 > 1 || y0 < -1 || y1 > 1
        }
      }

      out.push({
        id: e.id,
        scope: d.scope(),
        cover,
        offscreen,
        pixels: d.frameStats(),
      })
      await d.chapter.exitCloseup()
      await settle()
    } catch (err) {
      out.push({ id: e.id, error: String((err && err.message) || err) })
    }
  }
  return out
}
