/**
 * Reachability sweep for fixed compositions.
 *
 * The camera can no longer be steered, so a hotspot is reachable only if it
 * falls inside the one frame its viewpoint is locked to. This casts a dense ray
 * grid across each node's actual frame and records what a player could hit.
 * Anything registered but never hit is unfindable - a softlock, not difficulty.
 *
 * Both checks pump game time rather than sleeping: a backgrounded tab throttles
 * requestAnimationFrame to about a frame a second, so a wall-clock wait would
 * expire before the camera had finished moving.
 */
window.__reachability = async function reachability() {
  const app = window.__kirisawa
  const d = app.debug

  const reached = new Set()
  const perNode = {}

  // Sweep at the narrowest aspect the game supports. The vertical field of view
  // is fixed, so a 4:3 window is the tightest horizontal frame a player can
  // have; anything that only fits on a widescreen monitor is not reliably
  // reachable and must be recomposed rather than left to luck.
  const restoreAspect = d.camera.aspect
  d.camera.aspect = 4 / 3
  d.camera.updateProjectionMatrix()

  for (const nodeId of d.nodeIds()) {
    // No pumping between the jump and the pick. `go` snaps the viewpoint
    // synchronously, and advancing game time here would let any sequence still
    // in flight (the opening move, a narration beat) take the camera back.
    await d.go(nodeId)
    d.syncCamera()
    // World matrices are normally refreshed by the renderer. A throttled tab
    // renders about once a second, so without this the raycaster tests against
    // whatever transforms were current several seconds ago.
    d.scene.updateMatrixWorld(true)
    const hits = new Set()
    // 121 x 121 rays across the whole frame. The counter bell is 9 cm across,
    // which a coarser grid steps straight over - a sampling miss then reads as
    // an unreachable hotspot and sends you chasing a bug that is not there.
    const N = 60
    for (let gx = -N; gx <= N; gx++) {
      for (let gy = -N; gy <= N; gy++) {
        const info = d.pick(gx / (N + 0.5), gy / (N + 0.5))
        if (info) {
          hits.add(info.hotspot.id)
          reached.add(info.hotspot.id)
        }
      }
    }
    perNode[nodeId] = Array.from(hits).sort()
  }

  d.camera.aspect = restoreAspect
  d.camera.updateProjectionMatrix()

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
    d.pump(0.2)
    const seen = [d.scope()]
    for (let i = 0; i < 4; i++) {
      d.chapter.turn('right')
      for (let w = 0; w < 200 && d.chapter.isBusy; w++) {
        d.pump(0.05)
        await sleep(0)
      }
      seen.push(d.scope())
    }
    out.push({ start, seen, closes: seen[0] === seen[4], unique: new Set(seen).size })
  }
  return out
}
