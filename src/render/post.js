// OWNER: A (render). The look: ink and gouache on a dark toned sheet. Three passes, in this order.
//   1. scene    drawn once into two targets: colour (linear, half float) and ink (view normal, and whether
//               the surface takes a line). Depth comes with it. See inkPatch in materials.js.
//   2. edge     one small pass that finds the drawn line: silhouettes from depth, creases from normals.
//   3. paint    the sheet: wobble, flat gouache bands, dry-brush smear, the line, pooling, pigment, grade.
// Nothing here animates on its own. Every noise comes from one fixed paper texture (paper.js), and the paper
// is pinned to a point on the roof (uAnchor), so when the camera drifts the hatching and the wobble travel
// with the picture instead of crawling over it.
import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { createPaper, PAPER_SIZE } from './paper.js';
import { inkPatch } from './materials.js';

const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

// ---- pass 2: the line, before it is drawn ---------------------------------------------------------------
// Depth is compared as 1/z. On any flat surface 1/z is exactly linear across the screen, so its second
// difference is zero however steeply the surface leans away: the deck never grows false lines at a grazing
// angle. The result is scaled so that 1.0 means "the slope changed by one across the kernel", at any distance.
const edgeFrag = /* glsl */ `
precision highp float;
uniform sampler2D tDepth; uniform sampler2D tInk;
uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uLine; uniform float uPixAng;
varying vec2 vUv;
float q(vec2 uv){ return mix(1. / uNear, 1. / uFar, texture2D(tDepth, uv).x); }
void main(){
  float s = uRes.y / 720.;
  vec2 o = uLine * s / uRes;
  vec2 ox = vec2(o.x, 0.), oy = vec2(0., o.y);
  float c = q(vUv), l = q(vUv - ox), r = q(vUv + ox), d = q(vUv - oy), u = q(vUv + oy);
  float L = (abs(l + r - 2. * c) + abs(u + d - 2. * c)) / (max(c, 1e-6) * uPixAng * uLine * s);
  float sil = smoothstep(1.3, 2.6, L);
  vec4 nl = texture2D(tInk, vUv - ox), nr = texture2D(tInk, vUv + ox), nd = texture2D(tInk, vUv - oy), nu = texture2D(tInk, vUv + oy);
  float nE = length(nl.xyz - nr.xyz) + length(nu.xyz - nd.xyz);
  float e = max(sil, smoothstep(.42, .9, nE) * .78);
  // paint with no surface (water, mist) is never drawn round: one inkless tap silences the line here
  float ink = min(min(texture2D(tInk, vUv).a, min(nl.a, nr.a)), min(nd.a, nu.a));
  e *= smoothstep(.5, .95, ink);
  // skin over its own skin (a bowed chin over the neck, seen from above) is a shadow, not an outline: drawn as a whole
  // line it read as stubble on her face (round thirteen). Every tap skin (.97) -> a faint line; skin against cloth,
  // hair or the night keeps its full line
  float inkHi = max(max(texture2D(tInk, vUv).a, max(nl.a, nr.a)), max(nd.a, nu.a));
  e *= mix(1., .55, step(.93, ink) * step(inkHi, .985));
  // a hand (.95) is small: a full line round every finger closes it up into a clump of ink at phone size (round
  // fourteen). Any tap on a hand -> the line at a little under half
  e *= mix(1., .42, step(.94, ink) * step(ink, .96));
  gl_FragColor = vec4(e, sil, 1. - exp(-1. / (c * 30.)), ink);
}`;

// ---- pass 3: the sheet ----------------------------------------------------------------------------------
// RICH (tiers 2 and 3) adds pooling, bristle streaks and two more taps on the smear and the line.
const paintFrag = /* glsl */ `
precision highp float;
uniform sampler2D tColor; uniform sampler2D tEdge; uniform sampler2D tPaper; uniform sampler2D tDrift;
uniform vec2 uRes; uniform vec2 uAnchor; uniform float uDawn; uniform float uFade; uniform float uBand;
uniform vec3 uInk; uniform vec3 uChalk; uniform vec3 uShadowTint; uniform vec3 uPaperWhite; uniform vec3 uHaze; uniform vec3 uVeil;
varying vec2 vUv;
const float BW = .046;     // one gouache value step, in sqrt(luma)
const float SW = .11;      // how soft the step between two values is (a fraction of one step)
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float luma(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
vec3 col(vec2 uv){ vec3 l = max(texture2D(tColor, uv).rgb, 0.);     // the scene target is linear: bring it to display space
  return min(mix(l * 12.92, 1.055 * pow(l, vec3(1. / 2.4)) - .055, step(.0031308, l)), vec3(1.)); }
// Gouache is mixed to a value and laid flat. Lighting that falls off smoothly becomes a few flat steps;
// a surface that was already flat stays flat. jit moves the step by a fraction (tooth and stroke).
vec3 band(vec3 c, float jit){
  float y = max(luma(c), 1e-4), t = sqrt(y) / BW + jit;
  float tq = floor(t) + smoothstep(.5 - SW, .5 + SW, fract(t)) - jit * .5;
  float y2 = tq * BW; y2 *= y2;
  return c * mix(1., y2 / y, uBand);
}
void main(){
  float s = uRes.y / 720.;                       // everything is sized against a 720 line picture
  vec2 px = 1. / uRes;
  vec2 pp = vUv * uRes / s - uAnchor;            // paper space: device independent, pinned to the roof
  vec2 pt = pp / ${PAPER_SIZE}.;
  vec4 P = texture2D(tPaper, pt);                // tooth, body, bristle
  vec4 D = texture2D(tDrift, pt);                // wobble x, wobble y, slow field
  // 1. the hand: edges are never ruler straight
  vec2 u = vUv + (D.rg - .5) * 2.8 * s * px;
  // 2. the brush: mostly one hand's diagonal, wandering a little
  float ang = -.42 + (D.b - .5) * 1.9;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 d = dir * px * s * 1.5;
  float jit = P.r - .5;
  vec2 uj = u + d * jit * 2.2;                   // bristles drag each edge a little way along the stroke
  // strokes: long patches lying along the hand's diagonal, each mixed a hair lighter or darker than the last
  vec2 rp = vec2(pt.x * .913 - pt.y * .408, pt.x * .408 + pt.y * .913);
  vec4 K = texture2D(tDrift, rp * vec2(.2, .85) + vec2(.31, .77));
  float sk = K.a * 3.;
  sk = (floor(sk) + smoothstep(.38, .62, fract(sk))) / 3. - .5;
  float bj = jit * .3 + sk * .55;
  float bare = 1. - texture2D(tEdge, u).a;        // paint with no surface under it: water, mist. Never smeared, never dry-brushed.
  vec3 c0 = band(col(uj), bj);
#ifdef RICH
  vec3 c = c0 * .4 + (band(col(uj + d), bj) + band(col(uj - d), bj)) * .2
         + (band(col(uj + 2. * d), bj) + band(col(uj - 2. * d), bj)) * .1;
#else
  vec3 c = c0 * .5 + (band(col(uj + 1.6 * d), bj) + band(col(uj - 1.6 * d), bj)) * .25;
#endif
  c = mix(c, c0, bare);
  // 3. the line, found in pass 2. A few taps make it soft; a slow noise makes long edges swell and thin.
  vec4 E = texture2D(tEdge, u);
  vec2 r1 = px * s * .8;
#ifdef RICH
  float eb = (E.r * 2. + texture2D(tEdge, u + r1 * vec2(1., .4)).r + texture2D(tEdge, u - r1 * vec2(1., .4)).r
            + texture2D(tEdge, u + r1 * vec2(-.4, 1.)).r + texture2D(tEdge, u - r1 * vec2(-.4, 1.)).r) / 6.;
#else
  float eb = (E.r * 2. + texture2D(tEdge, u + r1 * vec2(.8, .8)).r + texture2D(tEdge, u - r1 * vec2(.8, .8)).r) / 4.;
#endif
  float zf = E.b;                                 // 0 at the lens, about .4 across the roof, 1 at the far city
  float th = mix(.2, .52, K.r) + smoothstep(.5, .95, zf) * .3 - E.g * .08;
  float line = smoothstep(th - .13, th + .15, eb);
  line *= smoothstep(.16, .44, P.r * .7 + P.g * .3 + .08);      // a dry brush skips on the tooth
  line *= mix(1., .28, smoothstep(.5, .86, zf));                 // and the far city is hardly drawn at all
  float pool = 0., st = P.b, thin = 0.;
#ifdef RICH
  // gouache pools: pigment sits a little darker along the inside edge of each fill
  vec2 r2 = px * s * 3.4;
  pool = (texture2D(tEdge, u + r2 * vec2(.8, .6)).r + texture2D(tEdge, u - r2 * vec2(.8, .6)).r) * .5;
  pool = smoothstep(.05, .7, max(pool, eb * .8)) * mix(1., .3, smoothstep(.5, .95, zf));
  // bristle streaks: noise integrated along the stroke, so pigment runs in the direction the brush went
  vec2 sd = dir * 5. / ${PAPER_SIZE}.;
  st = (st + texture2D(tPaper, pt - 1.5 * sd).b + texture2D(tPaper, pt - .5 * sd).b + texture2D(tPaper, pt + .5 * sd).b + texture2D(tPaper, pt + 1.5 * sd).b) / 5.;
  st = clamp(.5 + (st - .5) * 2.4, 0., 1.);
#endif
  // 4. pigment on the sheet: uneven by tooth, by the body of the paper, and along the stroke
  float paper = P.r * .62 + P.g * .38;
  float lum0 = luma(c);
  c *= 1. + (P.r - .5) * .07 + (P.g - .5) * .07 + (st - .5) * .09 + sk * .05 - pool * .1;
  // dry brush: where a stroke of light paint ran thin, the dark sheet shows through the tooth
  thin = smoothstep(.34, .14, st) * smoothstep(.62, .3, P.r) * smoothstep(.16, .5, lum0) * smoothstep(.4, .8, K.g) * (1. - bare);
  c = mix(c, uShadowTint * 1.25 + c * .3, thin * .2);
  // 5. night: nothing is black. The darkest wash is the indigo of the sheet, and shade leans toward it.
  c = max(c, uShadowTint * (.52 + .3 * paper));
  float lum = luma(c);
  c = mix(c, uShadowTint + c * .8, (1. - smoothstep(0., .22, lum)) * .25);
  // air: a breath of haze with distance, so the back of the roof sits behind the front
  c = mix(c, uHaze, smoothstep(.3, .62, zf) * .07 * (1. - smoothstep(.45, .8, lum)));
  // the line is ink where the paint is light. Where the paint is dark it is a deeper wash of the same indigo,
  // with a little chalk only along true silhouettes: forms hold at night without the roof turning to wire.
  float onDark = 1. - smoothstep(.09, .24, lum);
  float sil = smoothstep(.3, .8, E.g);
  float reserve = smoothstep(.74, .92, lum);      // the brightest water and the lamp are left as bare sheet colour
  vec3 darkLine = mix(uShadowTint * .72, uChalk, .42 * sil);
  float wLight = line * .88, wDark = line * mix(.2, .42, sil);
  c = mix(c, mix(uInk, darkLine, onDark), mix(wLight, wDark, onDark) * (1. - reserve));
  c = mix(c, uPaperWhite * (.96 + .08 * P.r), reserve * .55);
  // 6. first light warms the top of the sheet very slightly
  c += vec3(.07, .03, .005) * uDawn * smoothstep(.25, 1., vUv.y) * .7;
  // 7. the edge of the sheet
  vec2 v = vUv - .5; c *= 1. - dot(v, v) * .5;
  c = mix(uVeil, c, uFade);
  c += (hash(gl_FragCoord.xy / 97.) - .5) / 255.;   // dither, so dark washes do not band
  gl_FragColor = vec4(c, 1.);
}`;

export function createPost(renderer, seed = 340) {
  const gl = renderer.getContext();
  const half = !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
  // one scene pass, two colour attachments: [0] the paint (half float keeps the dark washes from banding), [1] the ink channel
  const color = new THREE.WebGLRenderTarget(2, 2, { count: 2, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
    type: half ? THREE.HalfFloatType : THREE.UnsignedByteType });
  color.textures[1].type = THREE.UnsignedByteType;
  color.textures.forEach((t) => { t.generateMipmaps = false; });
  color.depthTexture = new THREE.DepthTexture(2, 2); color.depthTexture.type = THREE.UnsignedIntType;
  const edge = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  edge.texture.generateMipmaps = false;
  const { paper, drift } = createPaper(seed);
  const srgb = (hex) => new THREE.Color(hex).convertLinearToSRGB();   // the paint pass works in display space
  const eU = {
    tDepth: { value: color.depthTexture }, tInk: { value: color.textures[1] }, uRes: { value: new THREE.Vector2(2, 2) },
    uNear: { value: 0.5 }, uFar: { value: 220 }, uLine: { value: 1.15 }, uPixAng: { value: 0.001 },
  };
  const uniforms = {
    tColor: { value: color.textures[0] }, tEdge: { value: edge.texture }, tPaper: { value: paper }, tDrift: { value: drift },
    uRes: eU.uRes, uAnchor: { value: new THREE.Vector2(0, 0) }, uDawn: { value: 0 }, uFade: { value: 1 },
    uBand: { value: 0.8 },
    uInk: { value: srgb(PAL.ink) }, uChalk: { value: srgb(PAL.chalk) }, uShadowTint: { value: srgb('#1A1F3A') },
    uPaperWhite: { value: srgb(PAL.paper) }, uHaze: { value: srgb(PAL.skyLow) }, uVeil: { value: new THREE.Color(0.09, 0.098, 0.145) },
  };
  const mat = (fragmentShader, u, defines = {}) => new THREE.ShaderMaterial({ uniforms: u, fragmentShader, vertexShader: vert, depthTest: false, depthWrite: false, defines });
  const pass = (m) => { const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false; return q; };
  const paintRich = mat(paintFrag, uniforms, { RICH: 1 }), paintLean = mat(paintFrag, uniforms);
  const edgeQuad = pass(mat(edgeFrag, eU)), paintQuad = pass(paintRich);
  const edgeScene = new THREE.Scene(), paintScene = new THREE.Scene(); edgeScene.add(edgeQuad); paintScene.add(paintQuad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const opts = { rich: true, anchor: true };
  const v = new THREE.Vector3();
  let W = 2, H = 2, sweep = 0, known = -1;
  // Anything in the scene that was not made by gouache() still has to write the ink channel. Sweep now and then.
  function patchScene(scene) {
    let n = 0;
    scene.traverse((o) => { const m = o.material; if (!m) return; n++;
      if (Array.isArray(m)) m.forEach(inkPatch); else if (!m.userData.inkPatched) inkPatch(m); });
    known = n;
  }
  return {
    uniforms, targets: { color, edge }, paper, options: opts, passes: { edgeQuad, paintQuad },
    setOptions(o) { Object.assign(opts, o); paintQuad.material = opts.rich ? paintRich : paintLean; },
    setSize(w, h) { W = w; H = h; color.setSize(w, h); edge.setSize(w, h); eU.uRes.value.set(w, h); },
    // anchorWorld: a fixed point on the roof. The paper is pinned to wherever that point lands on screen.
    render(scene, camera, anchorWorld) {
      eU.uNear.value = camera.near; eU.uFar.value = camera.far;
      eU.uPixAng.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / H;
      if (anchorWorld && opts.anchor) { v.copy(anchorWorld).project(camera); const s = H / 720;
        uniforms.uAnchor.value.set(((v.x * 0.5 + 0.5) * W) / s, ((v.y * 0.5 + 0.5) * H) / s); }
      else uniforms.uAnchor.value.set(0, 0);
      if (sweep-- <= 0) { patchScene(scene); sweep = 40; }
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(color); renderer.render(scene, camera);
      renderer.setRenderTarget(edge); renderer.render(edgeScene, postCam);
      renderer.setRenderTarget(prevTarget); renderer.render(paintScene, postCam);
    },
    dispose() { color.dispose(); edge.dispose(); paper.dispose(); drift.dispose(); },
  };
}
