import './ui/styles.css'
import { App } from './game/App'

/**
 * 霧沢写真館 ― 最後の一枚
 * Entry point. Everything else is built by App.
 */

function boot(): void {
  try {
    const app = new App()
    ;(window as unknown as Record<string, unknown>).__kirisawa = app
  } catch (err) {
    console.error('[霧沢写真館] failed to start', err)
    const ui = document.getElementById('ui')
    if (ui) {
      ui.innerHTML = `
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                    padding:8vw;text-align:center;font-family:'Hiragino Sans','Yu Gothic',sans-serif;
                    color:#ded2ba;line-height:2;letter-spacing:.08em;pointer-events:auto">
          <div>
            <p style="font-size:1.1em">霧沢写真館を開けませんでした。</p>
            <p style="font-size:.86em;color:#a2957e">
              WebGLに対応したブラウザで開き直してください。<br>
              動作が重い場合は、ほかのタブを閉じてからもう一度お試しください。
            </p>
          </div>
        </div>`
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
