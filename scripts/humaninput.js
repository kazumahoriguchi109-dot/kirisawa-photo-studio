/**
 * Real pointer input for QA.
 *
 * Not a debug API and not a shortcut: this synthesises the same pointer events a
 * mouse produces and dispatches them at the element under the given viewport
 * point. The game's own input path handles them exactly as it handles a human.
 * Nothing here can find a hotspot, name one, or solve anything - a reviewer
 * still has to work out where to click by looking at the screen.
 *
 * It exists because the headless browser pane does not always deliver its
 * synthetic clicks to the page, which makes a click-only review report working
 * controls as dead.
 */
;(() => {
  const send = (type, x, y, extra) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerdown' ? 1 : 0,
      ...extra,
    }
    const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent
    el.dispatchEvent(new Ctor(type, init))
    return el
  }

  /** Move the pointer to a viewport point, so hover labels update. */
  window.__hoverAt = (x, y) => {
    const el = send('pointermove', x, y)
    send('mousemove', x, y)
    return el ? el.tagName + (el.className ? '.' + el.className : '') : null
  }

  /** A full click at a viewport point: move, press, release, click. */
  window.__clickAt = (x, y) => {
    window.__hoverAt(x, y)
    send('pointerdown', x, y)
    send('mousedown', x, y)
    send('pointerup', x, y)
    send('mouseup', x, y)
    const el = send('click', x, y)
    return el ? el.tagName + (el.className ? '.' + el.className : '') : null
  }

  /** Right click, which the game uses to back out of a close-up. */
  window.__rightClickAt = (x, y) => {
    const el = document.elementFromPoint(x, y)
    if (el) el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }))
    return !!el
  }

  /** Viewport size, so a scaled screenshot can be mapped to real coordinates. */
  window.__vp = () => ({ w: window.innerWidth, h: window.innerHeight })

  /** What the game is showing right now, read from the DOM only. */
  window.__screen = () => {
    const t = (sel) => {
      const e = document.querySelector(sel)
      return e && e.offsetParent !== null ? (e.textContent || '').trim() : ''
    }
    const zone = (side) => {
      const z = document.querySelector('.turn-zone.' + side)
      if (!z || z.dataset.live !== '1') return null
      const r = z.querySelector('.chev').getBoundingClientRect()
      return {
        to: (z.querySelector('.zone-label').textContent || '').trim(),
        arrow: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)],
      }
    }
    const bar = document.getElementById('closeup-bar')
    const back = document.getElementById('closeup-back')
    const br = back ? back.getBoundingClientRect() : null
    return {
      hover: t('#verb-chip'),
      narration: t('#narration .line'),
      closeupTitle: bar && getComputedStyle(bar).display !== 'none' ? t('#closeup-bar .cu-title') : null,
      backButton: bar && getComputedStyle(bar).display !== 'none' && br
        ? [Math.round(br.left + br.width / 2), Math.round(br.top + br.height / 2)]
        : null,
      turnLeft: zone('left'),
      turnRight: zone('right'),
      panel: t('.panel-title') || null,
    }
  }
})()
