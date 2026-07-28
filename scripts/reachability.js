/**
 * Reachability sweep.
 *
 * For every viewpoint (and every close-up the chapter can enter), turn the
 * camera through a full circle and cast rays across the frame, recording which
 * hotspots the player could actually hit. A hotspot that is registered but
 * never hit from anywhere is unfindable - that is a softlock waiting to happen,
 * not a difficulty setting.
 */
window.__reachability = async function reachability() {
  const app = window.__kirisawa
  const d = app.debug
  const THREE = d.three
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const reached = new Set()
  const perNode = {}

  const nodes = d.nodeIds()
  for (const nodeId of nodes) {
    await d.go(nodeId)
    await sleep(30)
    const hits = new Set()
    // Sweep the full yaw circle and the whole permitted pitch range, with a
    // ray grid across the frame - i.e. everything a player could point at.
    for (let a = 0; a < 48; a++) {
      for (let p = -6; p <= 4; p++) {
        d.setLook((a / 48) * Math.PI * 2, p * 0.16)
        d.syncCamera()
        for (let gx = -3; gx <= 3; gx++) {
          for (let gy = -3; gy <= 3; gy++) {
            const info = d.pick(gx * 0.3, gy * 0.3)
            if (info) {
              hits.add(info.hotspot.id)
              reached.add(info.hotspot.id)
            }
          }
        }
      }
    }
    perNode[nodeId] = Array.from(hits).sort()
    void THREE
  }

  const all = d.allHotspotIds()
  const nodeScoped = all.filter((id) => !id.startsWith('cu:'))
  const missing = nodeScoped.filter((id) => !reached.has(id))
  return { perNode, reachedCount: reached.size, total: nodeScoped.length, missing }
}
