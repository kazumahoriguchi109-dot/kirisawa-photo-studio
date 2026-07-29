/**
 * The order-of-play regression.
 *
 * The scripted playthrough always looks at the 1985 photograph before winding
 * the backdrop up. A player has no reason to. The crank hangs inside the
 * clock-mark close-up and winding the backdrop is the loudest affordance in the
 * studio, so "take the crank, wind the backdrop, and only then go and look at
 * the framed photo in the reception" is an ordinary way to play - and it used
 * to make the game unwinnable, because the velvet stops being a clickable
 * surface the moment it goes up and 違い二 could then never be observed.
 *
 * This drives exactly that order and asserts the run is still completable to
 * the point where the hidden ending's first requirement is in hand.
 */
window.__badorder = async function badorder() {
  const app = window.__kirisawa
  const d = app.debug
  const log = []
  const fail = []
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const expect = (cond, m) => {
    if (!cond) fail.push(m)
    else log.push('ok  ' + m)
  }
  const advance = async (seconds) => {
    const slice = 0.1
    for (let t = 0; t < seconds; t += slice) {
      d.pump(slice)
      await sleep(0)
    }
  }
  // Same discipline as the main playthrough: wait for the chapter to go idle
  // on both sides of the act, in game time and in real time, because narration
  // runs on wall-clock timers while tweens run on pumped game time.
  const idle = async (where) => {
    for (let i = 0; i < 900; i++) {
      if (!d.chapter.isBusy) return
      d.pump(0.1)
      await sleep(20)
    }
    fail.push('idle timeout at ' + (where || '?'))
  }
  const act = async (id, item = null, wait = 120) => {
    await idle('before ' + id)
    try {
      if (item !== undefined) d.state.selectItem(item)
      await d.act(id, item)
    } catch (e) {
      fail.push('act ' + id + ': ' + e.message)
    }
    await advance(wait / 1000)
    await idle('after ' + id)
  }

  localStorage.clear()
  await d.begin()
  await advance(0.6)
  app.debug.ui.clearNarration()

  // --- power on, so the studio is reachable
  d.go('hall_n')
  await act('hall:drawer')
  await act('cu:drawer:pull')
  await act('cu:drawer:pull')
  d.go('hall_w')
  await act('hall:fusebox')
  await act('cu:fusebox:door')
  await act('cu:fusebox:socket1', 'spare_fuse')
  await act('cu:fusebox:lever')
  expect(d.flags().power_on, '通電した')

  // --- the bad order: crank and backdrop FIRST, photograph afterwards
  d.go('studio_e')
  await act('studio:clockghost')
  await act('cu:clock:crank')
  expect(d.items().some((i) => i.startsWith('crank')), 'クランクを先に取った')

  d.go('studio_n')
  await act('studio:socket')
  await act('cu:socket:hole', 'crank')
  await act('cu:socket:hole')
  expect(d.flags().chronicle_open, '写真を見るまえに幕を巻き上げた')
  expect(!d.flags().diff_backdrop, 'この時点では違い2はまだ立っていない')

  // --- now go and look at the photograph
  d.go('hall_n')
  await act('hall:record')
  await act('cu:record:look')
  expect(d.flags().saw_1985, '昭和六十年の写真を見た')
  expect(d.flags().diff_backdrop, '違い2が遡って記録された（これが無いと詰む）')

  // --- and the rest of the observation puzzle still completes
  d.go('studio_e')
  await act('studio:clockghost')
  await act('cu:clock:disc')
  expect(d.flags().diff_clock, '違い1：時計の跡')
  d.go('studio_n')
  await act('studio:chair')
  await act('cu:chair:seat')
  expect(d.flags().diff_chair, '違い3：椅子の向き')
  expect(d.state.isSolved('p2_observe'), '観察の謎が解けた')

  // --- and the photograph the hidden ending needs is obtainable
  d.go('hall_n')
  await act('hall:record')
  // Two clicks now: lift the backing board, then take what is under it.
  await act('cu:record:back')
  await act('cu:record:back')
  expect(d.items().some((i) => i.startsWith('print_1')), '写真（一歳）を手に入れた')

  return { pass: fail.length === 0, log, fail }
}
