// OWNER: A (render). The gouache material factory. World builds every surface through this,
// so the whole roof shares one shading model: three flat tones, no gradients, no specular.
// The paint pass (post.js) then lays those tones down as flat washes; nothing here needs a texture.
import * as THREE from 'three';
import { PAL } from '../core/palette.js';

// The tone ramp. Facing away from a light is not black: at night a painter still mixes a value for it.
export const TONES = [0.27, 0.59, 1.0];
let ramp = null;
function toneRamp() {
  if (ramp) return ramp;
  const data = new Uint8Array(TONES.length * 4);
  TONES.forEach((t, i) => { const v = Math.round(t * 255); data.set([v, v, v, 255], i * 4); });
  ramp = new THREE.DataTexture(data, TONES.length, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false; ramp.colorSpace = THREE.NoColorSpace;
  ramp.needsUpdate = true;
  return ramp;
}
// ---- the ink channel ----------------------------------------------------------------------------------
// The scene is drawn once into two targets: colour, and "ink" (view normal in rgb, and in alpha whether this
// surface takes a drawn line). The line pass reads the second one, so there is no second scene pass.
// Every material that reaches the renderer is given this small addition (gouache() does it at creation;
// post.js sweeps the scene for anything made elsewhere). Water, mist and anything see-through write alpha 0:
// they are paint laid over the drawing, never outlined.
const INK_OUT = 'layout(location = 1) out highp vec4 gInk;\n';
const UNPATCHABLE = new Set(['ShaderMaterial', 'RawShaderMaterial', 'ShadowMaterial', 'MeshDepthMaterial', 'MeshDistanceMaterial']);
const NO_SURFACE = new Set(['PointsMaterial', 'LineBasicMaterial', 'LineDashedMaterial', 'SpriteMaterial']);
export const inkless = (m) => !!(m.userData.noInk || m.transparent || NO_SURFACE.has(m.type));
export function inkPatch(m) {
  if (!m || m.userData.inkPatched || UNPATCHABLE.has(m.type)) return m;
  m.userData.inkPatched = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    const a = inkless(this) ? '0.' : '1.';
    let fs = shader.fragmentShader, vs = shader.vertexShader, body;
    if (fs.includes('#include <normal_fragment_begin>')) body = `gInk = vec4(normal * .5 + .5, ${a});`;
    else if (vs.includes('#include <project_vertex>')) {       // unlit: take the face normal from the surface itself
      vs = vs.replace('void main() {', 'varying vec3 vInkPos;\nvoid main() {').replace('#include <project_vertex>', '#include <project_vertex>\n\tvInkPos = mvPosition.xyz;');
      fs = 'varying vec3 vInkPos;\n' + fs;
      body = `gInk = vec4(normalize(cross(dFdx(vInkPos), dFdy(vInkPos))) * .5 + .5, ${a});`;
    } else body = 'gInk = vec4(.5, .5, 1., 0.);';
    // a surface close to the stair lamp is held under the paper reserve: a coat or a cap stays a coat or a cap
    const cap = this.userData.capLight;
    if (cap && fs.includes('#include <opaque_fragment>')) fs = fs.replace('#include <opaque_fragment>',
      `{ float capL = dot(outgoingLight, vec3(.2126, .7152, .0722)); if (capL > ${cap.toFixed(3)}) outgoingLight *= ${cap.toFixed(3)} / capL; }\n#include <opaque_fragment>`);
    const end = fs.lastIndexOf('}');
    shader.fragmentShader = INK_OUT + fs.slice(0, end) + '\t' + body + '\n' + fs.slice(end);
    shader.vertexShader = vs;
  };
  m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + (inkless(this) ? '|ink0' : '|ink1') + (this.userData.capLight ? '|cap' + this.userData.capLight : ''); };
  return m;
}

const cache = new Map();
// gouache('pot')            lit, three-tone, cached by key
// gouache('warm', {flat:1}) unlit flat colour (lamps, windows, sky pieces, sensor dots)
// opts: { flat, side, emissive (palette key), emissiveIntensity, transparent, opacity, unique,
//         depthWrite, vertexColors, noInk (paint with no drawn line: water, mist, stars) }
// key may be a palette key or any CSS colour. An unknown key paints as itself if three can parse it.
export function gouache(key, opts = {}) {
  const id = key + JSON.stringify(opts);
  if (!opts.unique && cache.has(id)) return cache.get(id);
  const color = new THREE.Color(PAL[key] || key);
  const common = { color, side: opts.side ?? THREE.FrontSide, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 };
  if (opts.depthWrite !== undefined) common.depthWrite = !!opts.depthWrite;
  if (opts.vertexColors) common.vertexColors = true;
  const m = opts.flat
    ? new THREE.MeshBasicMaterial({ ...common, fog: false })
    : new THREE.MeshToonMaterial({ ...common, gradientMap: toneRamp(),
        emissive: new THREE.Color(opts.emissive ? PAL[opts.emissive] || opts.emissive : '#000000'),
        emissiveIntensity: opts.emissiveIntensity ?? 0 });
  m.userData.paletteKey = key;
  // water is a mark of bare light, not an object: it is never outlined (opts.noInk: 0 to override)
  if (opts.noInk ?? /^water/.test(key)) m.userData.noInk = true;
  inkPatch(m);
  if (!opts.unique) cache.set(id, m);
  return m;
}
