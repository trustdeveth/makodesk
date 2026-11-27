import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { bookShape, burnShape, finShape, finSurface, finWakeMask, markShape } from "./shapes";

/* ================================================================== */
/*  Scroll keyframes                                                   */
/* ================================================================== */
interface Key { p: number; cam: [number, number, number]; look: [number, number, number]; gy: number; morph: number }
// Original dive: camera glides from the hero down to the underwater book view (0.10 -> 0.30)
// while the fin sinks with it and morphs into the order book in the same move.
// All keys share one interpolation curve, so camera, group and morph stay in sync.
const KEYS: Key[] = [
  { p: 0.0, cam: [0, 1.4, 15.5], look: [0, 2.4, 0], gy: 0, morph: 0 },
  { p: 0.1, cam: [0.8, 1.0, 13.8], look: [0, 2.1, 0], gy: 0, morph: 0 },
  { p: 0.3, cam: [2.2, -5.0, 12.5], look: [0, -6.2, 0], gy: -6.2, morph: 1 },
  { p: 0.5, cam: [-4.4, -6.6, 11.2], look: [0, -6.2, 0], gy: -6.2, morph: 1 },
  { p: 0.7, cam: [0.3, -3.2, 15.5], look: [0, -6.9, 0], gy: -6.6, morph: 2 },   // above the flame: horizon line stays clear of it
  { p: 0.9, cam: [0, -7.4, 15.8], look: [0, -7.7, 0], gy: -5.6, morph: 3 },
  { p: 1.0, cam: [0, -7.4, 16.4], look: [0, -7.7, 0], gy: -5.6, morph: 3 },
];
const ease = (t: number) => t * t * (3 - 2 * t);
function sample(p: number) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) if (p >= KEYS[i].p && p <= KEYS[i + 1].p) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  const lin = Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p || 1)));
  // one shared curve for camera, target, group and morph so they stay in sync
  // one shared curve for camera, target, group and morph so they stay in sync
  const t = lin * 0.5 + ease(lin) * 0.5;
  const L = (x: number, y: number) => x + (y - x) * t;
  return {
    cam: new THREE.Vector3(L(a.cam[0], b.cam[0]), L(a.cam[1], b.cam[1]), L(a.cam[2], b.cam[2])),
    look: new THREE.Vector3(L(a.look[0], b.look[0]), L(a.look[1], b.look[1]), L(a.look[2], b.look[2])),
    gy: L(a.gy, b.gy),
    morph: L(a.morph, b.morph),
  };
}

/* ================================================================== */
/*  Shared GLSL                                                        */
/* ================================================================== */
const NOISE = /* glsl */ `
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash21(i), b = hash21(i + vec2(1,0)), c = hash21(i + vec2(0,1)), d = hash21(i + vec2(1,1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

const FLEX = /* glsl */ `
uniform float uWake;
vec3 flexFin(vec3 p, float t, float isWake){
  if (isWake > 0.5) { p.y += sin(t * 0.9 + p.x * 0.35 + p.z * 0.25) * 0.1; return p; }
  // soft, living root: particles near the base sway gently like a dissolving edge
  float root = clamp(1.0 - (p.y + 0.6) / 1.6, 0.0, 1.0);
  p.x += sin(t * 0.7 + p.y * 3.0 + p.z * 5.0) * 0.07 * root;
  p.z += cos(t * 0.6 + p.x * 2.0) * 0.05 * root;
  float yy = clamp((p.y + 0.15) / 5.2, 0.0, 1.0);
  float w = yy * yy;
  p.x += sin(t * 1.0 - yy * 2.2) * 0.15 * w;
  p.z += sin(t * 0.8 - yy * 1.8 + 0.8) * 0.09 * w;
  p.y -= w * w * 0.035 * (1.0 + sin(t * 1.0 - 1.2));
  return p;
}
`;

/* ---------- sky: deep navy, soft moon glow behind fbm clouds ---------- */
const SKY_VERT = /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = /* glsl */ `
${NOISE}
uniform vec3 uMoon; uniform vec3 uFog; uniform float uUnder; uniform float uTime;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 zen = vec3(0.003, 0.008, 0.024);
  vec3 hor = vec3(0.022, 0.058, 0.14);
  vec3 col = mix(hor, zen, smoothstep(0.0, 0.45, y));
  col = mix(vec3(0.004, 0.014, 0.036), col, smoothstep(-0.12, 0.0, y));
  float m = max(dot(d, normalize(uMoon)), 0.0);
  float glow = pow(m, 10.0) * 0.12 + pow(m, 70.0) * 0.2;
  // clouds: fbm in a sky-dome projection, thicker near the horizon
  vec2 uv = d.xz / (y + 0.25) * 1.4 + vec2(uTime * 0.004, 0.0);
  float cl = smoothstep(0.42, 0.85, fbm(uv * 0.9));
  float band = smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.25, 0.6, y));
  vec3 cloudCol = mix(vec3(0.008, 0.02, 0.05), vec3(0.06, 0.12, 0.24), glow * 2.2);
  col += vec3(0.32, 0.5, 0.82) * glow * (1.0 - cl * 0.75);
  col = mix(col, cloudCol, cl * band * 0.85);
  float fogMix = uUnder * mix(1.0, 0.35, smoothstep(0.0, 0.3, y));
  col = mix(col, uFog, fogMix);
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---------- ocean: gerstner swell, fbm ripples, sky reflection; snell window from below ---------- */
const OCEAN_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
vec3 gerstner(vec2 p, vec2 dir, float steep, float wl, inout vec3 T, inout vec3 B){
  float k = 6.2831853 / wl;
  float c = sqrt(9.8 / k) * 0.55;
  vec2 d = normalize(dir);
  float f = k * (dot(d, p) - c * uTime);
  float a = steep / k;
  float sf = sin(f), cf = cos(f);
  T += vec3(-d.x * d.x * steep * sf, d.x * steep * cf, -d.x * d.y * steep * sf);
  B += vec3(-d.x * d.y * steep * sf, d.y * steep * cf, -d.y * d.y * steep * sf);
  return vec3(d.x * a * cf, a * sf, d.y * a * cf);
}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec2 p = w.xz;
  vec3 T = vec3(1.0, 0.0, 0.0), B = vec3(0.0, 0.0, 1.0), o = vec3(0.0);
  o += gerstner(p, vec2(1.0, 0.6), 0.16, 24.0, T, B);
  o += gerstner(p, vec2(0.3, 1.0), 0.14, 14.0, T, B);
  o += gerstner(p, vec2(-0.7, 0.5), 0.13, 8.5, T, B);
  o += gerstner(p, vec2(0.9, -0.4), 0.11, 5.2, T, B);
  o += gerstner(p, vec2(-0.2, -1.0), 0.09, 3.3, T, B);
  o += gerstner(p, vec2(0.6, 0.8), 0.07, 2.1, T, B);
  w.xyz += o;
  vNormal = normalize(cross(B, T));
  vCrest = o.y;
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const OCEAN_FRAG = /* glsl */ `
${NOISE}
uniform vec3 uCam; uniform vec3 uMoon; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime; uniform float uNear;
varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
vec3 skyCol(vec3 d){
  float y = max(d.y, 0.0);
  vec3 c = mix(vec3(0.022, 0.058, 0.14), vec3(0.003, 0.008, 0.024), smoothstep(0.0, 0.45, y));
  float m = max(dot(d, normalize(uMoon)), 0.0);
  return c + vec3(0.32, 0.5, 0.82) * (pow(m, 10.0) * 0.12 + pow(m, 70.0) * 0.2);
}
float rh(vec2 q, float t){ return fbm(q + vec2(t * 0.12, t * 0.07)) + 0.5 * fbm(q * 2.3 - vec2(t * 0.18, -t * 0.1)); }
vec3 ripple(vec2 p, float dist){
  vec2 q = p * 0.55;
  float e = 0.06;
  float h0 = rh(q, uTime), hx = rh(q + vec2(e, 0.0), uTime), hz = rh(q + vec2(0.0, e), uTime);
  float att = exp(-dist * 0.035);
  return vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * 0.22 * att;
}
void main(){
  float dist = length(uCam - vWorld);
  vec3 N = normalize(vNormal + ripple(vWorld.xz, dist));
  vec3 V = normalize(uCam - vWorld);
  vec3 L = normalize(uMoon);
  vec3 col;
  if (gl_FrontFacing) {
    float ndv = max(dot(N, V), 0.0);
    float Fr = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    vec3 R = reflect(-V, N);
    vec3 refl = skyCol(R);
    vec3 deep = vec3(0.003, 0.016, 0.04);
    float crest = smoothstep(0.05, 0.75, vCrest);
    vec3 sss = vec3(0.02, 0.11, 0.15) * crest * (0.4 + 0.6 * pow(max(dot(V, -L), 0.0), 2.0));
    col = mix(deep + sss, refl, Fr);
    float sp = max(dot(R, L), 0.0);
    col += vec3(0.55, 0.75, 1.0) * (pow(sp, 420.0) * 1.0 + pow(sp, 60.0) * 0.06);
    col += vec3(0.2, 0.72, 0.87) * exp(-length(vWorld.xz - vec2(0.0, 0.5)) * 0.28) * 0.22 * (0.35 + Fr);
    float fogF = 1.0 - exp(-dist * uFogDensity);
    // while the camera passes through the surface, nearby water turns see-through so the fin stays visible
    float nearA = 1.0 - uNear * (1.0 - smoothstep(2.0, 10.0, dist));
    gl_FragColor = vec4(mix(col, uFogColor, fogF), nearA);
  } else {
    // looking up through the surface: inside snell's window we see the sky (translucent),
    // outside it the surface mirrors the depths (total internal reflection, opaque)
    vec3 ray = normalize(vWorld - uCam);
    float k = dot(ray, N);
    float win = smoothstep(0.55, 0.78, k);
    vec3 tir = vec3(0.01, 0.045, 0.09);
    vec3 tint = vec3(0.08, 0.26, 0.42);
    col = mix(tir, tint, win);
    col += vec3(0.4, 0.75, 1.0) * pow(max(k, 0.0), 30.0) * 0.3;
    col += vec3(0.1, 0.3, 0.5) * smoothstep(0.35, 0.9, vCrest) * 0.18;
    float fogF = 1.0 - exp(-dist * uFogDensity * 0.8);
    float alpha = mix(0.96, 0.42, win);
    float nearA = 1.0 - uNear * (1.0 - smoothstep(2.0, 10.0, dist));
    gl_FragColor = vec4(mix(col, uFogColor, fogF), max(alpha, fogF) * nearA);
  }
}`;

/* ---------- seabed: dunes + animated caustics ---------- */
const SEABED_VERT = /* glsl */ `
varying vec3 vWorld; varying vec3 vNormal;
float h(vec2 p){
  return sin(p.x*0.14 + sin(p.y*0.09)*1.6)*1.3 + sin(p.y*0.21 + p.x*0.05)*0.8 + sin(p.x*0.9 + p.y*0.35)*0.12 + sin(p.x*2.3 - p.y*1.1)*0.03;
}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  float e = 0.2, h0 = h(w.xz), hx = h(w.xz + vec2(e,0.0)), hz = h(w.xz + vec2(0.0,e));
  w.y += h0;
  vNormal = normalize(vec3(-(hx-h0)/e, 1.0, -(hz-h0)/e));
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SEABED_FRAG = /* glsl */ `
uniform vec3 uCam; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime; uniform float uLight;
varying vec3 vWorld; varying vec3 vNormal;
float caustic(vec2 p, float t){
  float c = 0.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    vec2 q = p * (1.2 + fi * 0.55) + vec2(t * (0.35 + fi * 0.1), -t * (0.28 + fi * 0.07));
    c += abs(sin(q.x + sin(q.y * 1.3)) * sin(q.y + sin(q.x * 1.1)));
  }
  return pow(1.0 - c / 3.0, 6.0);
}
void main(){
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(-0.25, 1.0, 0.2));
  float diff = max(dot(N, L), 0.0);
  vec3 sand = vec3(0.03, 0.09, 0.2);
  vec3 col = sand * (0.25 + 0.9 * diff);
  col += vec3(0.22, 0.55, 0.85) * caustic(vWorld.xz * 0.55, uTime) * 0.55 * diff;
  // light pool under the particles
  col += vec3(0.12, 0.42, 0.6) * exp(-length(vWorld.xz) * 0.12) * 0.35;
  col *= uLight;
  float d = length(uCam - vWorld);
  gl_FragColor = vec4(mix(col, uFogColor, 1.0 - exp(-d * uFogDensity * 0.85)), 1.0);
}`;

/* ---------- hero particles ---------- */
const PART_VERT = /* glsl */ `
${FLEX}
uniform float uTime; uniform float uMorph; uniform float uSize; uniform float uPR; uniform float uFocus; uniform float uAperture;
uniform vec2 uMouse; uniform float uHover; uniform float uAspect;
attribute vec3 aFin; attribute vec3 aBook; attribute vec3 aBurn; attribute vec3 aMark; attribute vec4 aRand; attribute float aWake;
varying float vAlpha; varying float vMix; varying float vHeat; varying float vBlur; varying float vGlint; varying float vFlameH; varying float vBlue;
float fhash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fnoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fhash(i), fhash(i + vec3(1,0,0)), f.x), mix(fhash(i + vec3(0,1,0)), fhash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fhash(i + vec3(0,0,1)), fhash(i + vec3(1,0,1)), f.x), mix(fhash(i + vec3(0,1,1)), fhash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// Particle flame. h = life (0 = born at the base, 1 = dies at a tip). Noise fields scroll upward over time,
// so every bulge and tongue travels up the flame like real fire instead of the whole shape swaying.
// Iconic flame: semicircular bulb at the bottom (h < 0.3), smooth taper to a single pointed tip
// that curves slightly and sways gently. Particles fill the silhouette evenly.
float gFlameA = 1.0;
vec3 flamePos(vec4 r, float t, out float heat, out float blue){
  float h = fract(r.y + t * 0.08);                         // slow upward drift keeps it alive
  const float B = 0.3;                                     // bulb height fraction
  float w = h < B ? sqrt(max(0.0, 1.0 - pow((B - h) / B, 2.0)))
                  : pow(cos((h - B) / (1.0 - B) * 1.5707963), 1.25);
  float ang = r.z * 6.2831853;
  float rad = sqrt(fract(r.x * 7.13 + r.z * 3.1));        // uniform fill of each cross-section
  // centre line: tip leans and sways a little
  float sway = sin(t * 1.3) * 0.18 + (fnoise(vec3(0.0, h * 2.0 - t * 1.2, 3.0)) - 0.5) * 0.35;
  float cx = (0.35 + sway) * pow(h, 2.2);
  float R = 1.75 * w;
  gFlameA = clamp(w * w, 0.08, 1.0) * 0.72;                // even visual density: brightness follows cross-section area
  // full round volume (not a flat slab) + small vertical jitter so no layer bunches up
  vec3 p = vec3(cx + cos(ang) * R * rad, h * 6.0 + (fract(r.x * 13.7 + r.w * 5.1) - 0.5) * 0.25, sin(ang) * R * rad);
  // sparks above the tip
  float ember = step(0.97, fract(r.w * 5.3 + r.x));
  float eh = fract(r.y * 1.7 + t * 0.12);
  vec3 ep = vec3(0.35 + (fnoise(vec3(r.x * 9.0, eh * 2.0 - t * 0.5, 1.0)) - 0.5) * 2.0 * eh, 6.2 + eh * 2.5, (r.z - 0.5) * 0.8);
  p = mix(p, ep, ember);
  p.y -= 3.3;
  // colour: hot core (low, centre) -> cooler edges and tip
  // heat mostly by height (fade only at the tip), slightly cooler at the outer edge
  heat = clamp(0.06 + h * 0.84 + rad * 0.1 + ember * 0.3, 0.0, 1.0);
  blue = 0.0;
  return p;
}
vec3 flow(vec3 p, float t){
  return vec3(sin(p.y*1.7 + t) + sin(p.z*2.3 - t*0.7),
              sin(p.z*1.9 + t*1.1) + sin(p.x*2.1 + t*0.6),
              sin(p.x*1.6 - t*0.9) + sin(p.y*2.4 + t*0.8)) * 0.5;
}
void main(){
  float m = clamp(uMorph, 0.0, 3.0);
  float seg = min(floor(m), 2.0);
  float local = m - seg;
  float t = clamp((local - aRand.x * 0.4) / 0.6, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec3 fin = flexFin(aFin, uTime, aWake);
  float fh, fblue;
  vec3 flame = flamePos(aRand, uTime, fh, fblue);
  vec3 from = seg < 0.5 ? fin : (seg < 1.5 ? aBook : flame);
  vec3 to   = seg < 0.5 ? aBook : (seg < 1.5 ? flame : aMark);
  vec3 p = mix(from, to, t);
  float swirl = sin(t * 3.14159);
  p += flow(p * 0.55 + aRand.xyz * 3.0, uTime * 0.6) * swirl * 1.1;
  p += flow(p * 1.2 + aRand.yzx * 9.0, uTime * 0.35) * 0.018;

  float burnW = clamp(1.0 - abs(m - 2.0) * 1.4, 0.0, 1.0);
  vHeat = burnW;
  vFlameH = fh;
  vBlue = fblue * burnW;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // hover split: particles near the cursor (in screen space) are pushed outward, slightly randomised
  vec4 cp = projectionMatrix * mv;
  vec2 ndc = cp.xy / cp.w;
  vec2 dd = ndc - uMouse; dd.x *= uAspect;
  float r = length(dd);
  float fall = smoothstep(0.38, 0.0, r);
  fall = fall * (0.4 + 0.6 * fall);
  vec2 dir = normalize(dd + 1e-4);
  vec2 tang = vec2(-dir.y, dir.x);
  float push = fall * uHover;
  // particles flow softly around the cursor like a current, easing slightly outward
  mv.xy += (tang * (0.7 + 0.6 * sin(uTime * 1.3 + aRand.x * 6.2831)) + dir * 0.35) * push * (-mv.z) * 0.028;
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  float coc = clamp(abs(dist - uFocus) * uAperture, 0.0, 1.0);
  float glint = step(0.972, aRand.w);
  float size = uSize * uPR * (0.45 + aRand.y * 0.9) / max(dist, 0.5);
  gl_PointSize = size * (1.0 + coc * 3.2) * (1.0 + glint * 1.4) * (1.0 + push * 0.12) * mix(1.0, 1.15 - fh * 0.55, burnW);   // particles shrink as they rise
  float flameFade = mix(1.0, (1.0 - smoothstep(0.85, 1.0, fh)) * gFlameA * 1.15, burnW);
  vAlpha = mix(1.0, uWake, aWake * (1.0 - step(0.5, m))) * (0.24 + 0.34 * aRand.z) * (1.0 - coc * 0.7) * flameFade * (1.0 + glint * 0.35);
  vBlur = coc; vMix = aRand.x; vGlint = glint;
}`;
const PART_FRAG = /* glsl */ `
uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColWarm;
varying float vAlpha; varying float vMix; varying float vHeat; varying float vBlur; varying float vGlint; varying float vFlameH; varying float vBlue;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float sharp = smoothstep(0.5, 0.32, d) * 0.55 + pow(smoothstep(0.5, 0.0, d), 3.0) * 0.6;
  float bokeh = smoothstep(0.5, 0.38, d) * 0.55 + smoothstep(0.5, 0.0, d) * 0.15;
  float a = mix(sharp, bokeh, vBlur);
  // tiny cross flare on glints
  a += vGlint * (smoothstep(0.06, 0.0, abs(c.x)) + smoothstep(0.06, 0.0, abs(c.y))) * smoothstep(0.5, 0.0, d) * 0.35;
  vec3 col = mix(uColA, uColB, vMix * 0.7 + vGlint * 0.3);
  // fire palette by height in the flame: white-hot base -> amber -> orange -> red tips
  // white-hot core -> yellow -> orange -> red -> ember-dark tips, with a thin blue root
  vec3 fire = mix(vec3(1.0, 0.93, 0.75), vec3(1.0, 0.72, 0.28), smoothstep(0.04, 0.25, vFlameH));
  fire = mix(fire, vec3(1.0, 0.45, 0.08), smoothstep(0.22, 0.5, vFlameH));
  fire = mix(fire, vec3(0.9, 0.2, 0.04), smoothstep(0.48, 0.76, vFlameH));
  fire = mix(fire, vec3(0.45, 0.07, 0.03), smoothstep(0.76, 1.0, vFlameH));
  fire = mix(fire, vec3(0.35, 0.65, 1.0), clamp(vBlue, 0.0, 1.0) * 0.85);
  col = mix(col, fire, vHeat);
  gl_FragColor = vec4(col, a * vAlpha);
}`;

/* ---------- glass fin body under the particles ---------- */
const FINGLASS_VERT = /* glsl */ `
${FLEX}
uniform float uTime;
varying vec3 vView; varying vec2 vUv;
void main(){
  vec3 p = flexFin(position, uTime, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = mv.xyz; vUv = uv;
  gl_Position = projectionMatrix * mv;
}`;
const FINGLASS_FRAG = /* glsl */ `
uniform float uVis; uniform vec2 uMousePx; uniform float uHover; uniform float uPxScale;
varying vec3 vView; varying vec2 vUv;
void main(){
  vec3 N = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 V = normalize(-vView);
  float ndv = abs(dot(N, V));
  float rim = pow(1.0 - ndv, 2.4);
  float edge = smoothstep(0.08, 0.0, vUv.x);
  // flesh: dark teal core, lighter toward the top, subsurface glow along the leading edge
  vec3 base = mix(vec3(0.015, 0.07, 0.11), vec3(0.05, 0.2, 0.29), smoothstep(0.0, 1.0, vUv.y));
  float lit = 0.55 + 0.45 * ndv;
  vec3 col = base * lit + vec3(0.16, 0.55, 0.72) * rim * 0.55 + vec3(0.55, 0.85, 1.0) * edge * 0.45;
  float a = mix(0.94, 0.7, smoothstep(0.0, 1.0, vUv.y)) * uVis * smoothstep(0.02, 0.3, vUv.y);
  float hole = smoothstep(0.22 * uPxScale, 0.06 * uPxScale, length(gl_FragCoord.xy - uMousePx)) * uHover;
  a *= 1.0 - hole * 0.92;
  gl_FragColor = vec4(col, a);
}`;

/* ---------- shards: dark glass with cyan facet rims ---------- */
const SHARD_VERT = /* glsl */ `
varying vec3 vView;
void main(){
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const SHARD_FRAG = /* glsl */ `
uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vView;
void main(){
  vec3 N = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 V = normalize(-vView);
  float ndv = abs(dot(N, V));
  float rim = pow(1.0 - ndv, 2.6);
  float top = max(N.y, 0.0);
  vec3 col = vec3(0.008, 0.025, 0.05) + vec3(0.2, 0.62, 0.86) * rim * 0.75 + vec3(0.3, 0.55, 0.9) * pow(top, 6.0) * 0.25;
  float d = length(vView);
  gl_FragColor = vec4(mix(col, uFogColor, 1.0 - exp(-d * uFogDensity)), 1.0);
}`;

/* ---------- god rays ---------- */
const UV_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const RAY_FRAG = /* glsl */ `
uniform float uOpacity; uniform float uTime; uniform float uSeed;
varying vec2 vUv;
void main(){
  float x = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float flick = 0.8 + 0.2 * uSeed;
  float a = pow(x, 3.0) * smoothstep(0.0, 0.75, vUv.y) * (1.0 - smoothstep(0.8, 1.0, vUv.y)) * uOpacity * flick;
  gl_FragColor = vec4(vec3(0.42, 0.72, 1.0), a);
}`;

/* ---------- grade: tint, vignette, subtle chroma, grain ---------- */
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCross: { value: 0 }, uUnder: { value: 0 } },
  vertexShader: UV_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uCross; uniform float uUnder;
    varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      uv.x += sin(uv.y * 26.0 + uTime * 2.2) * 0.006 * uCross + sin(uv.y * 7.0 + uTime * 0.7) * 0.0012 * uUnder;
      uv.y += cos(uv.x * 22.0 + uTime * 1.8) * 0.005 * uCross;
      vec4 c = texture2D(tDiffuse, uv);
      // lift shadows toward navy, keep highlights cool
      c.rgb = c.rgb + vec3(0.004, 0.009, 0.022) * (1.0 - c.rgb);
      float vig = smoothstep(1.1, 0.3, length(vUv - 0.5) * 1.3);
      c.rgb *= mix(0.5, 1.0, vig);
      gl_FragColor = c;
    }`,
};

/* ================================================================== */
/*  Scene                                                              */
/* ================================================================== */
export class OceanScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private grade: ShaderPass | null = null;
  private timer = new THREE.Timer();
  private raf = 0;
  private target = 0;
  private progress = 0;
  private pointer = new THREE.Vector2();
  private pointerS = new THREE.Vector2();
  private group = new THREE.Group();
  private skyMat: THREE.ShaderMaterial;
  private oceanMat: THREE.ShaderMaterial;
  private ocean!: THREE.Mesh;
  private pointerH = new THREE.Vector2(9, 9);
  private pointerIn = false;
  private hover = 0;
  private tmpV2 = new THREE.Vector2();
  private up = new THREE.Vector3(0, 1, 0);
  private rawCamY = 0;
  private bedMat: THREE.ShaderMaterial;
  private partMat: THREE.ShaderMaterial;
  private finMat: THREE.ShaderMaterial;
  private fireGlow!: THREE.Sprite;
  private shardMat: THREE.ShaderMaterial;
  private rayMats: THREE.ShaderMaterial[] = [];
  private shards: THREE.InstancedMesh;
  private shardData: { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3; v: number }[] = [];
  private dust: THREE.Points;
  private bubbles: THREE.Points;
  private bubbleBase: Float32Array;
  private lookCur = new THREE.Vector3(0, 2.4, 0);
  private mobile: boolean;
  private running = true;
  private tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), c1: new THREE.Color(), c2: new THREE.Color(), c3: new THREE.Color() };

  constructor(private canvas: HTMLCanvasElement) {
    this.mobile = window.innerWidth < 768;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 700);
    const moon = new THREE.Vector3(-0.32, 0.16, -1).normalize();

    // sky
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: { uMoon: { value: moon }, uFog: { value: new THREE.Color() }, uUnder: { value: 0 }, uTime: { value: 0 } },
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), this.skyMat));

    // ocean
    const seg = this.mobile ? 150 : 260;
    const og = new THREE.PlaneGeometry(800, 800, seg, seg);
    og.rotateX(-Math.PI / 2);
    this.oceanMat = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG, side: THREE.DoubleSide, transparent: true,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uMoon: { value: moon }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.02 }, uNear: { value: 0 } },
    });
    this.ocean = new THREE.Mesh(og, this.oceanMat);
    this.scene.add(this.ocean);

    // seabed
    const bg = new THREE.PlaneGeometry(320, 320, this.mobile ? 110 : 200, this.mobile ? 110 : 200);
    bg.rotateX(-Math.PI / 2);
    bg.translate(0, -15.5, 0);
    this.bedMat = new THREE.ShaderMaterial({
      vertexShader: SEABED_VERT, fragmentShader: SEABED_FRAG,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.05 }, uLight: { value: 1 } },
    });
    this.scene.add(new THREE.Mesh(bg, this.bedMat));

    // particles
    const N = this.mobile ? 12000 : 32000;
    const g = new THREE.BufferGeometry();
    const fin = finShape(N);
    g.setAttribute("position", new THREE.BufferAttribute(fin.slice(), 3));
    g.setAttribute("aFin", new THREE.BufferAttribute(fin, 3));
    g.setAttribute("aBook", new THREE.BufferAttribute(bookShape(N), 3));
    g.setAttribute("aBurn", new THREE.BufferAttribute(burnShape(N), 3));
    g.setAttribute("aMark", new THREE.BufferAttribute(markShape(N), 3));
    const rnd = new Float32Array(N * 4);
    for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
    g.setAttribute("aRand", new THREE.BufferAttribute(rnd, 4));
    g.setAttribute("aWake", new THREE.BufferAttribute(finWakeMask(N), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    this.partMat = new THREE.ShaderMaterial({
      vertexShader: PART_VERT, fragmentShader: PART_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uMorph: { value: 0 }, uSize: { value: this.mobile ? 30 : 30 }, uPR: { value: this.renderer.getPixelRatio() },
        uFocus: { value: 14 }, uAperture: { value: 0.045 }, uWake: { value: 1 },
        uMouse: { value: new THREE.Vector2(9, 9) }, uHover: { value: 0 }, uAspect: { value: 1 },
        uColA: { value: new THREE.Color("#34b7dd") }, uColB: { value: new THREE.Color("#e8f7ff") }, uColWarm: { value: new THREE.Color("#ff9a6b") },
      },
    });
    this.group.add(new THREE.Points(g, this.partMat));

    const fs = finSurface(this.mobile ? 32 : 56, this.mobile ? 24 : 40);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(fs.position, 3));
    fg.setAttribute("uv", new THREE.BufferAttribute(fs.uv, 2));
    fg.setIndex(new THREE.BufferAttribute(fs.index, 1));
    this.finMat = new THREE.ShaderMaterial({
      vertexShader: FINGLASS_VERT, fragmentShader: FINGLASS_FRAG, transparent: true, depthWrite: false,
      blending: THREE.NormalBlending, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uVis: { value: 1 }, uWake: { value: 1 }, uMousePx: { value: new THREE.Vector2(-9999, -9999) }, uHover: { value: 0 }, uPxScale: { value: 1 } },
    });
    const finMesh = new THREE.Mesh(fg, this.finMat);
    finMesh.renderOrder = -1;
    finMesh.visible = false; // particles only: the shape is carried by the small white elements
    {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const x = c.getContext("2d")!;
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,190,110,1)");
      gr.addColorStop(0.35, "rgba(255,120,50,0.45)");
      gr.addColorStop(1, "rgba(255,80,20,0)");
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      this.fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      this.fireGlow.position.set(0, -0.9, 0.4);
      this.fireGlow.scale.set(7.5, 9.5, 1);
      this.fireGlow.visible = false; // flame only: no surrounding light
    }
    this.scene.add(this.group);

    // god rays
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: UV_VERT, fragmentShader: RAY_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uSeed: { value: Math.random() } },
      });
      this.rayMats.push(mat);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + Math.random() * 3.2, 30), mat);
      r.position.set(-15 + i * 3.2 + Math.random() * 2, -14, -7 - Math.random() * 9);
      r.rotation.z = -0.22 + Math.random() * 0.12;
      r.rotation.y = (Math.random() - 0.5) * 0.6;
      this.scene.add(r);
    }

    // shards
    const SH = this.mobile ? 22 : 46;
    this.shardMat = new THREE.ShaderMaterial({ vertexShader: SHARD_VERT, fragmentShader: SHARD_FRAG, uniforms: { uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.05 } } });
    this.shards = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3, 0), this.shardMat, SH);
    for (let i = 0; i < SH; i++) {
      // keep shards behind the camera path (z < 3) and off the centre line
      const side = Math.random() < 0.5 ? -1 : 1;
      const s = 0.35 + Math.random() * 0.8;
      this.shardData.push({
        p: new THREE.Vector3(side * (5 + Math.random() * 16), -3 - Math.random() * 11, 3 - Math.random() * 22),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        s: new THREE.Vector3(s * (0.5 + Math.random()), s * (0.25 + Math.random() * 0.4), s * (0.6 + Math.random())),
        v: 0.08 + Math.random() * 0.3,
      });
    }
    this.scene.add(this.shards);

    // plankton dust
    const D = this.mobile ? 1000 : 2600;
    const dp = new Float32Array(D * 3);
    for (let i = 0; i < D; i++) { dp[i * 3] = (Math.random() - 0.5) * 48; dp[i * 3 + 1] = -17 + Math.random() * 16.5; dp[i * 3 + 2] = -16 + Math.random() * 30; }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x8fc8f0, size: 0.045, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.dust);

    // rising bubbles
    const B = this.mobile ? 120 : 260;
    this.bubbleBase = new Float32Array(B * 4);
    const bp = new Float32Array(B * 3);
    for (let i = 0; i < B; i++) {
      this.bubbleBase[i * 4] = (Math.random() - 0.5) * 26;
      this.bubbleBase[i * 4 + 1] = Math.random();
      this.bubbleBase[i * 4 + 2] = -10 + Math.random() * 18;
      this.bubbleBase[i * 4 + 3] = 0.4 + Math.random();
    }
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute("position", new THREE.BufferAttribute(bp, 3));
    this.bubbles = new THREE.Points(bgeo, new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.07, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.bubbles);

    // post
    if (!this.mobile) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.62, 0.62, 0.72));
      this.grade = new ShaderPass(GRADE);
      this.composer.addPass(this.grade);
      this.composer.addPass(new OutputPass());
    }

    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setProgress(p: number) { this.target = Math.min(1, Math.max(0, p)); }
  setPointer(x: number, y: number) { this.pointer.set(x, y); this.pointerIn = true; }
  setPointerOut() { this.pointerIn = false; }
  setRunning(on: boolean) {
    if (on === this.running) return;
    this.running = on;
    if (on) { this.timer.reset(); this.raf = requestAnimationFrame(this.loop); }
    else cancelAnimationFrame(this.raf);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 58 : 42;
    this.group.scale.setScalar(w / h < 0.8 ? 0.62 : 1);
    this.camera.updateProjectionMatrix();
  }

  private loop(ts?: number) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update(ts);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const t = this.timer.getElapsed();
    const { m, q, v, c1, c2 } = this.tmp;

    this.progress += (this.target - this.progress) * Math.min(1, dt * 8);   // Lenis already smooths the wheel
    this.pointerS.lerp(this.pointer, Math.min(1, dt * 1.8));
    const k = sample(this.progress);

    // keyframe position + soft parallax orbit toward the cursor
    const yaw = this.pointerS.x * 0.13;
    v.copy(k.cam).sub(k.look).applyAxisAngle(this.up, yaw);
    v.y += v.length() * this.pointerS.y * 0.05;
    this.camera.position.copy(k.look).add(v);
    this.camera.position.y += Math.sin(t * 0.6) * 0.05;
    // continuous dive: the camera passes through the swell with the scroll (no jump)
    this.rawCamY = this.camera.position.y;
    this.lookCur.copy(k.look);   // camera aim locked to the same keyframe as the shape (no extra lag)
    this.camera.lookAt(this.lookCur);

    // particles
    this.group.position.y = k.gy;
    this.group.rotation.y = (k.morph < 0.5 ? -0.3 : 0) + Math.sin(t * 0.2) * (k.morph < 0.5 ? 0.07 : 0.12);
    const pu = this.partMat.uniforms;
    pu.uTime.value = t;
    pu.uMorph.value = k.morph;
    const burnW = Math.max(0, 1 - Math.abs(k.morph - 2) * 1.4);
    void burnW;
    pu.uFocus.value = this.camera.position.distanceTo(v.set(0, k.gy + 1.5, 0));
    this.finMat.uniforms.uTime.value = t;
    pu.uMouse.value.copy(this.pointerH);
    pu.uHover.value = this.hover;
    pu.uAspect.value = this.camera.aspect;
    {
      const sz = this.renderer.getDrawingBufferSize(this.tmpV2);
      const fu = this.finMat.uniforms;
      fu.uMousePx.value.set((this.pointerH.x + 1) * 0.5 * sz.x, (this.pointerH.y + 1) * 0.5 * sz.y);
      fu.uHover.value = this.hover;
      fu.uPxScale.value = sz.y;
    }
    const wake = 1 - THREE.MathUtils.smoothstep(-k.gy, 0.3, 2.5);
    pu.uWake.value = wake;
    this.finMat.uniforms.uWake.value = wake;
    this.finMat.uniforms.uVis.value = 1 - THREE.MathUtils.smoothstep(k.morph, 0.05, 0.45);

    // environment
    const under = THREE.MathUtils.smoothstep(-this.camera.position.y, -0.4, 0.8);
    // above: fog = sky horizon (seamless horizon). below: brighter near the surface, deeper blue lower down
    const depth = THREE.MathUtils.smoothstep(-this.camera.position.y, 0.5, 9);
    const fog = c1.set(0x060f24).lerp(c2.set(0x05203a).lerp(this.tmp.c3.set(0x020f20), depth), under);
    const dens = THREE.MathUtils.lerp(0.011, 0.062, under);
    this.renderer.setClearColor(fog);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.7, 0.9, under);
    // surface is always drawn before the particles. Above water it writes depth (hides what is below);
    // below water it is translucent and does not, so the sky and the fin show through it
    const below = this.camera.position.y < 0;
    this.ocean.renderOrder = -10;
    this.oceanMat.uniforms.uNear.value = 0;
    this.oceanMat.depthWrite = !below;

    // hover split: follow the cursor closely, ease the strength in/out
    this.pointerH.lerp(this.pointer, Math.min(1, dt * 14));
    this.hover += ((this.pointerIn ? 1 : 0) - this.hover) * Math.min(1, dt * (this.pointerIn ? 3 : 1.5));
    this.skyMat.uniforms.uFog.value.copy(fog);
    this.skyMat.uniforms.uUnder.value = under;
    this.skyMat.uniforms.uTime.value = t;
    const ou = this.oceanMat.uniforms;
    ou.uTime.value = t; ou.uCam.value.copy(this.camera.position); ou.uFogColor.value.copy(fog); ou.uFogDensity.value = dens;
    const bu = this.bedMat.uniforms;
    bu.uTime.value = t; bu.uCam.value.copy(this.camera.position); bu.uFogColor.value.copy(fog); bu.uFogDensity.value = dens; bu.uLight.value = 0.35 + 0.85 * under;
    this.shardMat.uniforms.uFogColor.value.copy(fog);
    this.shardMat.uniforms.uFogDensity.value = dens;
    this.rayMats.forEach((r, i) => { r.uniforms.uOpacity.value = 0.065 * under; r.uniforms.uTime.value = t + i; });

    this.shardData.forEach((d, i) => {
      d.r.x += dt * d.v * 0.6; d.r.y += dt * d.v;
      q.setFromEuler(d.r);
      v.copy(d.p); v.y += Math.sin(t * 0.3 + i) * 0.3;
      m.compose(v, q, d.s);
      this.shards.setMatrixAt(i, m);
    });
    this.shards.instanceMatrix.needsUpdate = true;

    const bpos = this.bubbles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bpos.count; i++) {
      const b = this.bubbleBase;
      const y = -16 + ((b[i * 4 + 1] + t * 0.05 * b[i * 4 + 3]) % 1) * 15.5;
      bpos.setXYZ(i, b[i * 4] + Math.sin(t * 1.3 + i) * 0.12, y, b[i * 4 + 2]);
    }
    bpos.needsUpdate = true;
    (this.bubbles.material as THREE.PointsMaterial).opacity = 0.45 * under;
    this.dust.rotation.y = t * 0.008;
    (this.dust.material as THREE.PointsMaterial).opacity = 0.1 + 0.32 * under;

    if (this.composer) {
      if (this.grade) {
        const gu = this.grade.uniforms;
        gu.uTime.value = t % 100;
        gu.uCross.value = 1 - THREE.MathUtils.smoothstep(Math.abs(this.rawCamY), 0.0, 2.0);
        gu.uUnder.value = under;
      }
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.scene.traverse(o => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose?.();
    });
    this.composer?.dispose();
    this.timer.dispose();
    this.renderer.dispose();
  }
}
