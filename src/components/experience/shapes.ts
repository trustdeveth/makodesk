/**
 * Particle target shapes. Each returns a Float32Array of xyz for `n` points.
 * All shapes are centred on the particle group origin, ~5–6 units tall.
 */

const rnd = Math.random;

/** Falcate dorsal-fin profile (unit space): convex swept leading edge, concave trailing notch. */
export const FIN_S = 5.2;
export const finLead = (y: number) => 0.95 * Math.pow(y, 2.4);
export const finTrail = (y: number) => 1.0 - 0.32 * Math.pow(y, 0.5) + 0.27 * Math.pow(y, 4);
export const finRootCurve = (u: number) => 0.09 * Math.sin(Math.PI * u);
export const finThick = (y: number, u: number) => 0.12 * (1 - y * 0.88) * Math.pow(Math.sin(Math.PI * u), 0.55);

/** Dorsal fin: dense volumetric shell (denser at the edges) + wake ring on the waterline. */
export function finShape(n: number): Float32Array {
  const out = new Float32Array(n * 3);
  const S = FIN_S;
  const xL = finLead;
  const xT = finTrail;
  for (let i = 0; i < n; i++) {
    let x: number, y: number, z: number;
    if (i < n * 0.86) {
      y = Math.pow(rnd(), 0.85);
      const a = xL(y), b = xT(y);
      // bias toward the leading/trailing edges so the silhouette reads crisply
      let u = rnd();
      if (rnd() < 0.3) u = rnd() < 0.5 ? Math.pow(rnd(), 3) * 0.08 : 1 - Math.pow(rnd(), 3) * 0.08;
      x = a + (b - a) * u;
      const th = finThick(y, u);
      z = (rnd() < 0.5 ? -1 : 1) * th * (0.85 + 0.15 * rnd());
      // soft, curved root: the base bows down in the middle...
      y -= finRootCurve(u) * Math.pow(1 - y, 6);
      // ...and dissolves: near the root, particles thin out and trail downward
      if (y < 0.22) {
        const d = (0.22 - y) / 0.22;
        y -= Math.pow(rnd(), 2.2) * 0.3 * d;
        x += (rnd() - 0.5) * 0.1 * d;
        z *= 1 - 0.45 * d;
      }
      x = -(x - 0.55) * S; y = y * S - 0.15; z *= S;   // mirrored to match the logo
    } else {
      // wake ring on the surface
      const ang = rnd() * Math.PI * 2;
      const r = 1.6 + Math.pow(rnd(), 2) * 3.2;
      x = Math.cos(ang) * r * 1.35 + 0.3; z = Math.sin(ang) * r * 0.7; y = -0.1 + (rnd() - 0.5) * 0.08;
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
}

/** Depth chart: mirrored cumulative bid / ask staircases (the classic order-book "valley"). */
export function bookShape(n: number): Float32Array {
  const out = new Float32Array(n * 3);
  const W = 5.0, H = 4.6, gap = 0.22, steps = 16;
  const bidSteps: number[] = [], askSteps: number[] = [];
  let cb = 0, ca = 0;
  for (let i = 0; i < steps; i++) {
    cb += 0.4 + rnd() * 1.2 + (rnd() < 0.15 ? 1.6 : 0);
    ca += 0.4 + rnd() * 1.2 + (rnd() < 0.15 ? 1.6 : 0);
    bidSteps.push(cb); askSteps.push(ca);
  }
  const maxC = Math.max(cb, ca);
  const h = (u: number, arr: number[]) => (arr[Math.min(steps - 1, Math.floor(u * steps))] / maxC) * H;
  for (let i = 0; i < n; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const u = rnd();
    const top = h(u, side < 0 ? bidSteps : askSteps);
    // bias points toward the staircase edge so the outline reads clearly
    const v = rnd() < 0.16 ? 1 - Math.pow(rnd(), 4) * 0.06 : Math.sqrt(rnd());
    out[i * 3] = side * (gap + u * W);
    out[i * 3 + 1] = top * v - H * 0.45;
    out[i * 3 + 2] = (rnd() - 0.5) * 0.5;
  }
  return out;
}

/** Rising flame / ember column. */
export function burnShape(n: number): Float32Array {
  const out = new Float32Array(n * 3);
  const Ht = 6.4;
  for (let i = 0; i < n; i++) {
    const y = Math.pow(rnd(), 1.5);
    const r = 1.55 * Math.sin(Math.PI * Math.pow(y, 0.55)) * Math.pow(1 - y, 0.35) + 0.05;
    const a = rnd() * Math.PI * 2;
    const rr = r * Math.sqrt(rnd());
    out[i * 3] = Math.cos(a) * rr + Math.sin(y * 9) * 0.25 * y;
    out[i * 3 + 1] = y * Ht - Ht * 0.45;
    out[i * 3 + 2] = Math.sin(a) * rr;
  }
  return out;
}

/** Logo mark: rounded square outline + fin + waterline. */
export function markShape(n: number): Float32Array {
  const out = new Float32Array(n * 3);
  const S = 4.7, rad = 0.22, half = 0.5;
  const roundedSquarePoint = (): [number, number] => {
    // perimeter of rounded square, side = 1
    const straight = 1 - 2 * rad, arc = (Math.PI / 2) * rad;
    const per = 4 * straight + 4 * arc;
    let t = rnd() * per;
    const corners: [number, number, number][] = [
      [half - rad, half - rad, 0], [-half + rad, half - rad, Math.PI / 2], [-half + rad, -half + rad, Math.PI], [half - rad, -half + rad, Math.PI * 1.5],
    ];
    for (let k = 0; k < 4; k++) {
      if (t < straight) {
        const s = -straight / 2 + t;
        if (k === 0) return [s * -1, half];
        if (k === 1) return [-half, -s];
        if (k === 2) return [s, -half];
        return [half, s];
      }
      t -= straight;
      if (t < arc) {
        const [cx, cy, a0] = corners[k];
        const a = a0 + (t / arc) * (Math.PI / 2);
        return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
      }
      t -= arc;
    }
    return [half, 0];
  };
  for (let i = 0; i < n; i++) {
    let x: number, y: number;
    const k = rnd();
    if (k < 0.42) {
      [x, y] = roundedSquarePoint();
      const j = (rnd() - 0.5) * 0.035; x += j; y += j;
    } else if (k < 0.86) {
      // fin (logo geometry, 64-unit space -> unit square)
      // base (yy=0) to apex (yy=1), matching the logo's fin
      const yy = Math.pow(rnd(), 0.85);
      const a = -0.28 + 0.296 * (1 - Math.pow(1 - yy, 1.6)); // leading edge
      const b = 0.31 - 0.294 * Math.pow(yy, 0.7);              // trailing edge
      x = a + (b - a) * rnd();
      y = -0.22 + yy * 0.53;
    } else {
      const u = rnd();
      x = -0.38 + u * 0.76;
      y = -0.29 + Math.sin(u * Math.PI * 4) * 0.025 + (rnd() - 0.5) * 0.02;
    }
    out[i * 3] = x * S; out[i * 3 + 1] = y * S; out[i * 3 + 2] = (rnd() - 0.5) * 0.35;
  }
  return out;
}

/** Smooth fin surface (both sides) for the glass body under the particles. */
export function finSurface(rows = 48, cols = 36): { position: Float32Array; index: Uint32Array; uv: Float32Array } {
  const S = FIN_S;
  const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (const side of [1, -1]) {
    const base = verts.length / 3;
    for (let r = 0; r <= rows; r++) {
      const y = r / rows;
      const a = finLead(y), b = finTrail(y);
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const x = a + (b - a) * u;
        verts.push(-(x - 0.55) * S, (y - finRootCurve(u) * Math.pow(1 - y, 6)) * S - 0.15, side * finThick(y, u) * S);
        uvs.push(u, y);
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i0 = base + r * (cols + 1) + c, i1 = i0 + 1, i2 = i0 + cols + 1, i3 = i2 + 1;
      if (side > 0) idx.push(i0, i2, i1, i1, i2, i3); else idx.push(i0, i1, i2, i1, i3, i2);
    }
  }
  return { position: new Float32Array(verts), index: new Uint32Array(idx), uv: new Float32Array(uvs) };
}

/** 1 for wake-ring particles, 0 for fin particles (matches the split inside finShape). */
export function finWakeMask(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = i < n * 0.86 ? 0 : 1;
  return out;
}
