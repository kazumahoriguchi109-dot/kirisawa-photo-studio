import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { QualityLevel } from './Settings'

/**
 * Rendering stack.
 *
 * Bloom is used only to bleed the practical lamps, never as a global glow:
 * threshold sits above every diffuse surface in the building so plaster and
 * paper can never smear. The grade pass carries the film character - a gentle
 * lift, a warm/cool split, aperture vignette, and fine grain that hides the
 * banding you otherwise get in a dark interior.
 */

/**
 * Longest edge the drawing buffer is allowed to reach, whatever the window and
 * the device pixel ratio ask for. Kept below the usual 4096 driver limit so the
 * composer's several full-size targets all fit.
 */
const MAX_DRAWING_BUFFER = 3840

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.86 },
    uGrain: { value: 0.038 },
    uLift: { value: new THREE.Vector3(0.014, 0.012, 0.019) },
    uGain: { value: new THREE.Vector3(1.02, 1.0, 0.975) },
    uSaturation: { value: 1.04 },
    uContrast: { value: 0.34 },
    uAberration: { value: 0.0016 },
    uFade: { value: 0 },
    uFadeColor: { value: new THREE.Color(0x000000) },
    uRedShift: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform vec3 uLift;
    uniform vec3 uGain;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uAberration;
    uniform float uFade;
    uniform vec3 uFadeColor;
    uniform float uRedShift;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 uv = vUv;
      vec2 fromCenter = uv - 0.5;
      float r2 = dot(fromCenter, fromCenter);

      // lateral chromatic aberration, strongest at the frame edge
      float ca = uAberration * r2 * 4.0;
      vec3 color;
      color.r = texture2D(tDiffuse, uv + fromCenter * ca).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - fromCenter * ca).b;

      // lift / gain grade
      color = clamp(color * uGain + uLift, 0.0, 1.0);

      // a shallow S-curve: the tone map keeps highlights, this puts the
      // shadows back where a dark interior wants them
      color = mix(color, color * color * (3.0 - 2.0 * color), uContrast);

      // saturation around Rec.709 luma
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);

      // safelight pass: push everything toward the darkroom red without
      // crushing it to a flat wash
      if (uRedShift > 0.001) {
        vec3 red = vec3(luma * 1.28 + 0.03, luma * 0.20, luma * 0.14);
        color = mix(color, red, uRedShift);
      }

      // aperture vignette
      float v = smoothstep(0.86, 0.16, r2 * uVignette * 2.6);
      color *= mix(1.0, v, 0.85);

      // fine grain, animated slowly so it never looks like static
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime * 0.37)) - 0.5;
      color += g * uGrain * (1.0 - luma * 0.55);

      color = mix(color, uFadeColor, uFade);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

export interface RenderStack {
  renderer: THREE.WebGLRenderer
  composer: EffectComposer
  bloom: UnrealBloomPass
  grade: ShaderPass
  renderPass: RenderPass
  setQuality(q: QualityLevel): void
  resize(width: number, height: number): void
  /** Redraw the shadow maps on the next frame. Cheap to call every frame. */
  requestShadowUpdate(): void
  render(dt: number): void
  dispose(): void
}

export const QUALITY_PROFILES: Record<
  QualityLevel,
  {
    pixelRatioCap: number
    shadowMapSize: number
    shadows: boolean
    bloom: boolean
    smaa: boolean
    textureScale: number
    softShadows: boolean
  }
> = {
  low: {
    pixelRatioCap: 1,
    shadowMapSize: 512,
    shadows: false,
    bloom: false,
    smaa: false,
    textureScale: 0.5,
    softShadows: false,
  },
  medium: {
    pixelRatioCap: 1.35,
    shadowMapSize: 1024,
    shadows: true,
    bloom: true,
    smaa: false,
    textureScale: 0.75,
    softShadows: false,
  },
  high: {
    pixelRatioCap: 2,
    shadowMapSize: 2048,
    shadows: true,
    bloom: true,
    smaa: true,
    textureScale: 1,
    softShadows: true,
  },
}

/**
 * Hold the horizontal field of view, not the vertical one, once the window gets
 * narrow.
 *
 * Three keeps `fov` vertical, so a narrowing window crops the sides away. In a
 * game of fixed compositions that is not a cosmetic difference: on a phone the
 * fuse box and the coat rack left the frame entirely, and nothing on screen
 * told the player that a third of the room - including the first puzzle - was
 * simply not there. Below the reference shape the vertical angle is widened
 * instead, so the width the composition was framed for is preserved and the
 * extra pixels go above and below.
 *
 * Applied around the render and reverted afterwards, because the camera rig
 * writes `fov` every frame and damps toward its own target: a permanent
 * rewrite here and the two would fight.
 */
const REFERENCE_ASPECT = 4 / 3

function framedFov(authored: number, aspect: number): number {
  if (aspect >= REFERENCE_ASPECT) return authored
  const halfH = THREE.MathUtils.degToRad(authored) / 2
  const halfW = Math.atan(Math.tan(halfH) * REFERENCE_ASPECT)
  return THREE.MathUtils.radToDeg(Math.atan(Math.tan(halfW) / aspect)) * 2
}

export function createRenderStack(
  canvas: HTMLCanvasElement,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  quality: QualityLevel,
): RenderStack {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    // Off by default - keeping the back buffer around costs bandwidth on every
    // frame. `?capture=1` turns it on so the QA tooling can read finished
    // frames out of the canvas for review.
    preserveDrawingBuffer:
      typeof location !== 'undefined' && new URLSearchParams(location.search).has('capture'),
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // The building does not move. Camera compositions are fixed, and the only
  // geometry that ever animates is a door swinging or a backdrop rolling up, so
  // regenerating every shadow map on every frame is re-rasterising an identical
  // scene sixty times a second. The pendant alone is a point light, i.e. a cube
  // map, i.e. six full caster passes. Leaving this on cost more than half the
  // frame; the game now asks for an update only while something is actually
  // moving (see App.frame).
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  renderer.setClearColor(0x05050a, 1)

  const composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.62, 0.9)
  composer.addPass(bloom)

  // EffectComposer renders the scene into a half-float target, and three only
  // applies tone mapping and the output colour space on the pass that writes to
  // the default framebuffer. Without OutputPass the whole game would be shown
  // in linear light with ACES never running - so the grade below, whose
  // constants are display-referred, must come after it, and SMAA must come last
  // or it would try to find edges in HDR and then have grain added on top.
  const output = new OutputPass()
  composer.addPass(output)

  const grade = new ShaderPass(GradeShader)
  composer.addPass(grade)

  const smaa = new SMAAPass(1, 1)
  smaa.renderToScreen = true
  composer.addPass(smaa)

  let currentQuality = quality
  let width = 1
  let height = 1
  let elapsed = 0

  function applyQuality(q: QualityLevel): void {
    currentQuality = q
    const p = QUALITY_PROFILES[q]
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatioCap))
    renderer.shadowMap.enabled = p.shadows
    renderer.shadowMap.type = p.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    renderer.shadowMap.needsUpdate = true
    bloom.enabled = p.bloom
    smaa.enabled = p.smaa
    // When SMAA is off, the grade pass becomes the one that reaches the screen.
    grade.renderToScreen = !p.smaa
    scene.traverse((o) => {
      const l = o as THREE.Light & { shadow?: THREE.LightShadow }
      if (l.shadow && l.shadow.mapSize) {
        // Scale relative to the size the lighting artist chose for this light,
        // instead of flattening every light to one number.
        const authored = (l.userData.authoredShadowSize as number | undefined) ?? l.shadow.mapSize.x
        l.userData.authoredShadowSize = authored
        const size = Math.max(256, Math.round((authored * p.shadowMapSize) / 2048))
        l.shadow.mapSize.setScalar(size)
        l.shadow.map?.dispose()
        // three regenerates the map on the next frame once it is null
        ;(l.shadow as unknown as { map: THREE.WebGLRenderTarget | null }).map = null
      }
    })
    renderer.shadowMap.needsUpdate = true
    resize(width, height)
  }

  function resize(w: number, h: number): void {
    width = Math.max(1, w)
    height = Math.max(1, h)
    // Cap the drawing buffer, not just the ratio. On a large window at 2x, the
    // requested buffer runs past what the driver will allocate - a reviewer on
    // a 2400x1800 window got a scene rendered into one corner of the page and
    // nothing anywhere else - and the composer keeps several targets this size,
    // so the ceiling is hit several times over.
    const cap = Math.min(
      renderer.capabilities.maxTextureSize || 4096,
      MAX_DRAWING_BUFFER,
    )
    const wanted = Math.min(
      window.devicePixelRatio || 1,
      QUALITY_PROFILES[currentQuality].pixelRatioCap,
    )
    renderer.setPixelRatio(Math.min(wanted, cap / Math.max(width, height)))
    renderer.setSize(width, height, false)
    // EffectComposer samples the renderer's pixel ratio once, in its
    // constructor - which runs before the quality profile has set one. Without
    // this the whole scene was rendered at 1x into the composer's targets and
    // then blitted up to the canvas's 2x buffer, so the "high" preset bought
    // nothing but a more expensive final blit, and SMAA found its edges at half
    // resolution only to have them stretched afterwards.
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(width, height)
    bloom.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.shadowMap.needsUpdate = true
  }

  applyQuality(quality)

  return {
    renderer,
    composer,
    bloom,
    grade,
    renderPass,
    setQuality: applyQuality,
    resize,
    requestShadowUpdate() {
      renderer.shadowMap.needsUpdate = true
    },
    render(dt: number) {
      elapsed += dt
      grade.uniforms.uTime.value = elapsed
      const authored = camera.fov
      const framed = framedFov(authored, camera.aspect)
      if (framed !== authored) {
        camera.fov = framed
        camera.updateProjectionMatrix()
      }
      composer.render(dt)
      if (framed !== authored) {
        camera.fov = authored
        camera.updateProjectionMatrix()
      }
    },
    dispose() {
      composer.dispose()
      renderer.dispose()
      void currentQuality
    },
  }
}
