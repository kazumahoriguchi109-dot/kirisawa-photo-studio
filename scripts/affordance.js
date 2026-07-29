/**
 * Movement-affordance audit.
 *
 * For every viewpoint, samples the screen and reports which hotspot answers
 * each point. Answers two questions the eye cannot:
 *
 *  - is the way out of this room actually clickable from here, and how much of
 *    the frame does it own;
 *  - does an examinable object sit on top of the exit, so that a player aiming
 *    at the doorway gets told about a coat rack instead.
 *
 * Needs a rendered frame before it is accurate: the hover/pick path reads world
 * matrices that only refresh while the page composites. Take a screenshot, then
 * run this.
 */
window.__affordance = async function affordance(nodes) {
  const d = window.__kirisawa.debug
  const N = 41
  const out = {}
  const list = nodes || d.nodeIds()

  for (const node of list) {
    d.go(node)
    await d.pump(2.2)
    d.frameStats(1)

    const counts = {}
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = -1 + (2 * i) / (N - 1)
        const y = -1 + (2 * j) / (N - 1)
        const p = d.pick(x, y)
        const k = p && p.hotspot ? p.hotspot.id : '-'
        counts[k] = (counts[k] || 0) + 1
      }
    }
    const total = N * N
    const exitId = 'exit:' + node
    const ranked = Object.entries(counts)
      .filter(([k]) => k !== '-')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => [k, +((v / total) * 100).toFixed(1)])

    out[node] = {
      exitPct: +(((counts[exitId] || 0) / total) * 100).toFixed(1),
      emptyPct: +(((counts['-'] || 0) / total) * 100).toFixed(1),
      top: ranked,
    }
  }
  return out
}
