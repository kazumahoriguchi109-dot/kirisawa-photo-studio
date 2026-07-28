/**
 * Reachability sweep for fixed compositions.
 *
 * The camera can no longer be steered, so a hotspot is reachable only if it
 * falls inside the one frame its viewpoint is locked to. This casts a dense ray
 * grid across each node's actual frame and records what a player could hit.
 * Anything registered but never hit is unfindable - a softlock, not difficulty.
 */
window.__reachability = async function reachability() {
  const app = window.__kirisawa
  const d = app.debug
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const reached = new Set()
  const perNode = {}

  for (const nodeId of d.nodeIds()) {
    await d.go(nodeId)
    await sleep(40)
    const hits = new Set()
    // 41 x 41 rays across the whole frame, i.e. everything on screen
    for (let gx = -20; gx <= 20; gx++) {
      for (let gy = -20; gy <= 20; gy++) {
        const info = d.pick(gx / 20.5, gy / 20.5)
        if (info) {
          hits.add(info.hotspot.id)
          reached.add(info.hotspot.id)
        }
      }
    }
    perNode[nodeId] = Array.from(hits).sort()
  }

  const all = d.allHotspotIds()
  const nodeScoped = all.filter((id) => !id.startsWith('cu:'))
  const missing = nodeScoped.filter((id) => !reached.has(id))
  return { perNode, reachedCount: reached.size, total: nodeScoped.length, missing }
}

/** Turn all the way round each room and confirm the ring closes. */
window.__ringCheck = async function ringCheck() {
  const d = window.__kirisawa.debug
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const out = []
  for (const start of ['hall_n', 'studio_n', 'darkroom_n', 'office_n']) {
    await d.go(start)
    await sleep(60)
    const seen = [d.scope()]
    for (let i = 0; i < 4; i++) {
      await d.chapter.turn('right')
      for (let w = 0; w < 60 && d.chapter.isBusy; w++) await sleep(50)
      seen.push(d.scope())
    }
    out.push({ start, seen, closes: seen[0] === seen[4], unique: new Set(seen).size })
  }
  return out
}
