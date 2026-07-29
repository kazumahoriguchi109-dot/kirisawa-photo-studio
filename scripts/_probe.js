/**
 * Automated playthrough check.
 *
 * Pasted into the page by the browser tooling. Drives the real hotspot handlers
 * in the intended order and asserts the world reaches the states it should, so
 * a regression in the chapter graph fails loudly instead of quietly stranding
 * the player.
 *
 * Returns { pass, log[], fail[] }.
 */
window.__probe = async function probe(route) {
  const app = window.__kirisawa
  const d = app.debug
  const log = []
  const fail = []
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const note = (m) => log.push(m)
  const expect = (cond, m) => {
    if (!cond) fail.push(m)
    else log.push('ok  ' + m)
  }

  // Game time, not wall-clock time.
  //
  // A backgrounded or headless tab throttles requestAnimationFrame to roughly
  // one frame a second, so waiting on setTimeout would expire long before the
  // world had animated anything. `pump` advances the simulation in fixed steps
  // regardless of the frame rate; yielding to the microtask queue between
  // slices lets the promise continuations a finished tween unblocks run.
  const advance = async (seconds) => {
    const slice = 0.1
    for (let t = 0; t < seconds; t += slice) {
      d.pump(slice)
      await sleep(0)
    }
  }
  /** Pump until a promise settles, so long scripted sequences cannot hang. */
  const pumpUntil = async (promise, capSeconds = 90) => {
    let done = false
    const p = Promise.resolve(promise).then(
      (v) => {
        done = true
        return v
      },
      (e) => {
        done = true
        throw e
      },
    )
    for (let t = 0; t < capSeconds && !done; t += 0.1) await advance(0.1)
    return p
  }
  // Mirrors what a click can actually reach: a hotspot whose `visible`
  // predicate is false is not clickable, so the harness must not fire it.
  // The real click handler refuses input while the camera is moving, so the
  // harness has to wait the same way or it fires into a transition and the
  // action is (correctly) dropped.
  // Narration deliberately runs on wall-clock timers - reading pace must not
  // follow the frame rate or the reduced-motion scale - so waiting for the
  // chapter to go idle has to let real time pass as well as game time.
  const idle = async (where) => {
    for (let i = 0; i < 900; i++) {
      if (!d.chapter.isBusy) return
      d.pump(0.1)
      await sleep(20)
    }
    fail.push('idle timeout at ' + (where || '?') + ' (busy for 90s of game time / 18s real)')
  }
  const act = async (id, sel, wait = 120) => {
    await idle('before ' + id)
    try {
      if (sel !== undefined) d.state.selectItem(sel)
      const hs = d.chapterHotspot(id)
      if (!hs) throw new Error('missing hotspot')
      if (hs.visible && !hs.visible({ selectedItem: d.state.selectedItemId })) {
        throw new Error('hidden hotspot fired')
      }
      await d.act(id, sel)
    } catch (e) {
      fail.push('act ' + id + ': ' + e.message)
    }
    await advance(wait / 1000)
    await idle('after ' + id)
  }

  route = route || 'hidden'

  // The opening narration is a timed sequence; pump it rather than sleeping.
  await pumpUntil(d.begin(), 120)
  await advance(0.4)
  app.debug.ui.clearNarration()

  // ---------------------------------------------------------------- P1 power
  d.go('hall_n')
  await act('hall:drawer')
  await act('cu:drawer:pull')
  await act('cu:drawer:pull')
  expect(d.items().some((i) => i.startsWith('spare_fuse')), 'ヒューズを手に入れた')

  d.go('hall_w')
  await act('hall:fusebox')
  await act('cu:fusebox:door')
  await act('cu:fusebox:lever', null)
  expect(!d.flags().power_on, '通電にはヒューズが要る（レバー単独では上がらない）')
  await act('cu:fusebox:socket0', 'spare_fuse')
  expect(!d.flags().fuse_seated, '生きている受け金には差せない')
  await act('cu:fusebox:socket1', 'spare_fuse')
  expect(d.flags().fuse_seated, 'ヒューズを差した')
  await act('cu:fusebox:lever', null, 3200)
  expect(d.flags().power_on, '通電した')
  expect(d.lighting() === 'tungsten', '館の明かりが点いた')

  // the archway between hall and studio, in both directions
  d.go('hall_n')
  await act('exit:hall_n', null, 1600)
  expect(d.state.nodeId === 'studio_s', '通路を抜けて撮影室に入れた')
  await act('exit:studio_s', null, 1600)
  expect(d.state.nodeId === 'hall_n', '通路を抜けて玄関ホールに戻れた')

  // ------------------------------------------------------------- P2 observe
  d.go('hall_n')
  await act('hall:record')
  await act('cu:record:look')
  expect(d.flags().saw_1985, '昭和六十年の写真を見た')

  d.go('studio_e')
  await act('studio:clockghost')
  await act('cu:clock:disc')
  expect(d.flags().diff_clock, '違い1：時計の跡')
  await act('cu:clock:crank')
  expect(d.items().some((i) => i.startsWith('crank')), 'クランクを手に入れた')

  d.go('studio_n')
  await act('studio:backdrop')
  expect(d.flags().diff_backdrop, '違い2：背景幕')
  await act('studio:chair')
  await act('cu:chair:seat')
  expect(d.flags().diff_chair, '違い3：椅子の向き')
  expect(d.state.isSolved('p2_observe'), '観察の謎が解けた')
  await act('cu:chair:slit')
  expect(d.items().some((i) => i.startsWith('loupe_frame')), 'ルーペの枠を手に入れた')

  d.go('hall_n')
  await act('hall:record')
  // Two clicks now: lift the backing board, then take what is under it.
  await act('cu:record:back')
  await act('cu:record:back')
  expect(d.items().some((i) => i.startsWith('print_1')), '写真（一歳）を手に入れた')

  // ------------------------------------------------------------ P3 backdrop
  d.go('studio_n')
  await act('studio:socket')
  await act('cu:socket:hole', null)
  expect(!d.flags().crank_fitted, 'クランクを持たずには差せない')
  await act('cu:socket:hole', 'crank')
  expect(d.flags().crank_fitted, 'クランクを軸に差した')
  await act('cu:socket:hole', null, 7000)
  expect(d.flags().chronicle_open, '背景幕が巻き上がった')

  // -------------------------------------------------------- P4 ground glass
  // The plate camera stands east of centre and is framed by the east view, not
  // the backdrop view. Walking to the wrong node here used to pass anyway,
  // because the debug hook did not enforce scope.
  d.go('studio_e')
  await act('studio:camera')
  await act('cu:camera:drawer')
  await act('cu:camera:drawer')
  expect(d.items().some((i) => i.startsWith('lens')), 'レンズを手に入れた')
  await act('cu:camera:glass', null, 2200)
  expect(d.flags().mirror_read, 'ピントグラスで鏡文字を読んだ')

  // --------------------------------------------------------------- P5 loupe
  app.debug.chapter.combine('loupe_frame', 'lens')
  await advance(0.08)
  expect(d.items().some((i) => i.startsWith('loupe')), 'ルーペを組み上げた')

  // ------------------------------------------------------- key and darkroom
  d.go('studio_s')
  await act('studio:lampbase')
  await act('cu:lamp:floor')
  expect(d.flags().key_revealed, '灯の下に鍵を見つけた')
  await act('cu:lamp:key')
  expect(d.items().some((i) => i.startsWith('key_darkroom')), '暗室の鍵を手に入れた')

  d.go('studio_w')
  await act('studio:darkdoor', null)
  expect(!d.flags().darkroom_open, '鍵なしでは暗室は開かない')
  await act('studio:darkdoor', 'key_darkroom', 2400)
  expect(d.flags().darkroom_open, '暗室が開いた')
  // The door leaf carries both this hotspot and the doorway exit, and this one
  // wins the pick - so clicking an unlocked door has to be what walks through
  // it, or the room behind it is unreachable by clicking.
  await act('studio:darkdoor', null, 1400)
  return { pass: fail.length === 0, log, fail, endings: [] }
}
function readDial(app) {
  const a = app.debug.state.puzzle('p8_safe').work.angle || 0
  const turns = a / (Math.PI * 2)
  return Math.round((((turns % 1) + 1) % 1) * 50) % 50
}
