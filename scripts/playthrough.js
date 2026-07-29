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
window.__playthrough = async function playthrough(route) {
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
  expect(d.state.nodeId === 'darkroom_e', '開いた扉を押して暗室に入れた')
  await act('exit:darkroom_e', null, 1400)
  expect(d.state.nodeId === 'studio_w', '同じ扉から撮影室に戻れた')

  // ------------------------------------------------------------- P5 developer
  d.go('darkroom_s')
  await act('dark:shelf')
  await act('cu:shelf:powder')
  await act('cu:shelf:water')
  expect(d.items().some((i) => i.startsWith('powder')), '現像剤を手に入れた')
  expect(d.items().some((i) => i.startsWith('distilled_water')), '蒸留水を手に入れた')
  app.debug.chapter.combine('powder', 'distilled_water')
  await advance(0.08)
  expect(d.items().some((i) => i.startsWith('developer')), '現像液を作った')

  d.go('darkroom_n')
  await act('dark:trays')
  await act('cu:trays:1', 'developer')
  expect(!d.flags().developer_poured, '違うバットには注げない')
  await act('cu:trays:0', 'developer', 2600)
  expect(d.flags().developer_poured, '現像液をバットに移した')

  // ---------------------------------------------------------- negative + key
  d.go('darkroom_w')
  await act('dark:line')
  await act('cu:line:neg')
  expect(d.items().some((i) => i.startsWith('negative_old')), '古いネガを手に入れた')
  d.go('darkroom_e')
  await act('dark:keyboard')
  await act('cu:keys:take')
  expect(d.items().some((i) => i.startsWith('key_office')), '事務室の鍵を手に入れた')

  // ------------------------------------------------------------ P7 safelight
  d.go('darkroom_e')
  await act('dark:switch', null, 1800)
  expect(d.lighting() === 'safelight', '安全灯が点いた')
  expect(d.flags().seen_safelight, '館じゅうが赤くなった')

  // ------------------------------------------------------------ P6 enlarger
  d.go('darkroom_w')
  await act('dark:enlarger')
  await act('cu:enlarger:lamp', null)
  expect(!d.flags().enlarger_on, 'ネガなしでは像が出ない')
  await act('cu:enlarger:carrier', 'negative_old')
  expect(d.flags().neg_loaded, 'ネガを枠に入れた')
  await act('cu:enlarger:lamp', null, 1800)
  expect(d.flags().enlarger_on, '引き伸ばし機を点けた')
  await act('dark:projection', null, 400)
  expect(d.flags().safe_number_known, 'ルーペで金庫の番号を読んだ')

  // --------------------------------------------------------------- P8 safe
  d.go('studio_e')
  await act('studio:officedoor', 'key_office', 2400)
  expect(d.flags().office_open, '事務室が開いた')
  await act('studio:officedoor', null, 1400)
  expect(d.state.nodeId === 'office_w', '開いた扉を押して事務室に入れた')
  await act('exit:office_w', null, 1400)
  expect(d.state.nodeId === 'studio_e', '同じ扉から撮影室に戻れた')

  d.go('office_s')
  await act('office:manual')
  app.debug.ui.closeTop()
  expect(d.flags().read_manual, '作業手順を読んだ')

  d.go('office_n')
  await act('office:ledger')
  app.debug.ui.closeTop()
  await act('office:desk')
  await act('office:desk')
  expect(d.items().some((i) => i.startsWith('print_7')), '写真（七歳）を手に入れた')

  d.go('office_e')
  await act('office:safe')
  await act('cu:safe:handle', null)
  expect(!d.flags().safe_open, '番号が違えば開かない')
  // turn the dial to the recorded number the honest way
  app.debug.chapter.beginDialForTest ? app.debug.chapter.beginDialForTest(27) : null
  await act('cu:safe:dial')
  const handler = app.debug.chapter.activeDragHandler
  if (handler) {
    let guard = 0
    while (guard++ < 400) {
      handler(6)
      const n = app.debug.state.puzzle('p8_safe').work.angle
      void n
      if (readDial(app) === 27) break
    }
  }
  expect(readDial(app) === 27, '環を二十七に合わせた')
  await act('cu:safe:handle', null, 2600)
  expect(d.flags().safe_open, '金庫が開いた')
  await act('cu:safe:contents')
  expect(d.items().some((i) => i.startsWith('negative_last')), '最後のネガを手に入れた')
  expect(d.items().some((i) => i.startsWith('note_kyoichi')), '手記を手に入れた')
  expect(d.items().some((i) => i.startsWith('print_last_slot')), '写真（空欄の分）を手に入れた')

  // -------------------------------------------------------- phosphor marks
  // The hall mark hangs on the west wall, beside the fuse box. It used to sit
  // on the north wall plane at x = -2.0 - inside the archway opening, which
  // spans -2.6 to -1.0 - so it was floating across the passage to the studio
  // with no wall behind it.
  d.go('hall_w')
  await act('hall:phosphor')
  d.go('studio_w')
  await act('studio:phosphor')
  d.go('office_n')
  await act('office:phosphor')
  expect(d.flags().mark_hall && d.flags().mark_studio && d.flags().mark_office, '蓄光の三字を見つけた')

  if (route === 'normal') {
    note('— NORMAL ルートへ')
  } else {
    // ------------------------------------------------------ TRUE: develop it
    d.go('darkroom_n')
    await act('dark:trays')
    await act('cu:trays:0', 'negative_last', 14000)
    expect(d.flags().last_developed, '最後の一枚を現像した')
    expect(d.items().some((i) => i.startsWith('print_last')), '最後の一枚を手に入れた')

    if (route === 'hidden') {
      // ---------------------------------------------- HIDDEN: restore 4 prints
      d.go('darkroom_n')
      await act('dark:understore')
      await act('dark:understore')
      expect(d.items().some((i) => i.startsWith('print_4')), '写真（四歳）を手に入れた')
      d.go('studio_n')
      await act('studio:chronicle')
      // print_4 lives under the darkroom bench in the shipped build; if the
      // player has not got it the hidden route simply stays closed.
      const have = ['print_1', 'print_4', 'print_7', 'print_last_slot'].filter((p) =>
        d.items().some((i) => i.startsWith(p + ':')),
      )
      note('所持している写真: ' + have.join(', '))
      for (let i = 0; i < 4; i++) {
        const id = ['print_1', 'print_4', 'print_7', 'print_last_slot'][i]
        if (!d.items().some((x) => x.startsWith(id + ':'))) continue
        await act('cu:chronicle:slot' + i, id)
      }
      note('復元した枠: ' + [0, 1, 2, 3].filter((i) => d.flags()['restored_' + ['print_1', 'print_4', 'print_7', 'print_last_slot'][i]]).length)
    }
  }

  // ------------------------------------------------------------ P9 the lock
  d.go('hall_s')
  await act('hall:exitdoor')
  const target = [0, 1, 2, 3]
  for (let i = 0; i < 4; i++) {
    let guard = 0
    while (guard++ < 6) {
      const rings = app.debug.state.puzzle('p9_lock').work.rings || [2, 0, 3, 1]
      if (rings[i] === target[i]) break
      await act('cu:lock:ring' + i, null, 20)
    }
  }
  await advance(2.5)
  expect(d.flags().exit_open, '玄関の錠が外れた')
  // Opening the bolt and walking out are separate acts now.
  await act('cu:lock:leave', null, 6000)
  expect(d.flags().left_building, '館を出た')

  return { pass: fail.length === 0, log, fail, endings: app.debug.save.seenEndings() }
}

function readDial(app) {
  const a = app.debug.state.puzzle('p8_safe').work.angle || 0
  const turns = a / (Math.PI * 2)
  return Math.round((((turns % 1) + 1) % 1) * 50) % 50
}
