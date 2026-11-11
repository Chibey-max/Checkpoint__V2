"use client";

import { useEffect, useRef } from "react";
import { renderTier } from "@/lib/perf";

/**
 * The ring lock from the first version of the landing hero, now the intro that plays when someone first opens the
 * site (intro.tsx): ray-marched in raw WebGL2, one full-screen triangle, one fragment shader.
 *
 * Three decisions shape it:
 *   1. It's geometry, not a picture. Three machined rings (Guard inside, You, Vault outside), a knurled
 *      bezel and a recessed glass core are signed distance fields, so the engraved ticks, the notch slots
 *      and the bevels catch light correctly as the rings turn and the camera drifts with the pointer.
 *   2. Metal reads as metal because of the light, not the colour. Rings are lathe-brushed (concentric
 *      anisotropic highlight plus per-groove brightness streaks), lit by a soft studio environment with
 *      two soft boxes, and the bezel is darker anodised stock. Albedo alone would look like plastic.
 *   3. A lock is a mechanical event. JS integrates each ring's angle; to lock, the ring keeps its direction,
 *      decelerates on an under-damped spring into the notch-up position and "clunks" past it slightly. Only
 *      when it has settled does the gold seam in the groove inside it ignite, with a short flash. The glow is
 *      accumulated along the ray near each seam, so light spills onto the ring walls and floor.
 *
 * Misses are transparent, so the page atmosphere shows through. The canvas stops rendering off-screen and in
 * hidden tabs, caps its pixel count, and with reduced motion draws one still frame: everything locked.
 * Callers get `onUnsupported` when WebGL2 isn't there, and should render a fallback.
 */

export interface RingLockState {
  /** Ring lock targets, inner to outer: true = locked (notch up, seam lit). */
  locked: [boolean, boolean, boolean];
  /** Core glow once the basket has settled. */
  settled: boolean;
}

const PIXEL_BUDGET = 900_000;

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uAng;      // ring angles (rad), inner → outer
uniform vec3 uLock;     // seam intensity per ring, 0..1
uniform vec3 uFlash;    // short pulse when a ring clunks home
uniform float uSettle;  // core glow
uniform vec2 uTilt;     // pointer parallax
uniform float uLight;   // 0 dark theme, 1 light theme

const float PI = 3.14159265;
const float TAU = 6.2831853;
const vec3 GOLD = vec3(1.0, 0.7, 0.28);

// ring geometry: (inner r, outer r, top z)
const vec3 R0 = vec3(0.275, 0.435, 0.100); // Guard
const vec3 R1 = vec3(0.462, 0.640, 0.072); // You
const vec3 R2 = vec3(0.667, 0.852, 0.046); // Vault
const vec2 BEZ = vec2(0.878, 1.0);
const float FLOOR_Z = 0.0;
const float LENS_R = 0.248;
// seams sit in the grooves just inside each ring
const vec3 SEAM_R = vec3(0.2615, 0.4485, 0.6535);
const float SEAM_OUT = 0.865;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

float sdRoundBox2(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sdBox3(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// angle measured clockwise from 12 o'clock
float dialAngle(vec2 p) { return atan(p.x, p.y); }

// one machined ring with engraved ticks and a notch slot
float ring(vec3 p, vec3 g, float ang, float ticks, out float tickMask) {
  float r = length(p.xy);
  float rc = 0.5 * (g.x + g.y), hw = 0.5 * (g.y - g.x);
  float zc = 0.5 * (g.z - 0.06), hh = 0.5 * (g.z + 0.06);
  float d = sdRoundBox2(vec2(r - rc, p.z - zc), vec2(hw, hh), 0.012);

  float a = dialAngle(p.xy) - ang;
  // engraved ticks on the outer band of the top face
  float f = fract(a * ticks / TAU + 0.5) - 0.5;
  float idx = floor(a * ticks / TAU + 0.5);
  float major = step(0.5, 1.0 - abs(sign(mod(idx, 6.0))));
  float arc = abs(f) * TAU / ticks * r;
  float band = mix(0.24, 0.5, major) * hw;
  vec3 q = vec3(arc, r - (g.y - band - 0.012), p.z - g.z);
  float groove = sdBox3(q, vec3(mix(0.0016, 0.0028, major), band, 0.005));
  tickMask = 1.0 - smoothstep(0.0, 0.004, groove);
  d = max(d, -groove);

  // notch slot across the ring at local angle 0
  float an = mod(a + PI, TAU) - PI;
  vec3 ns = vec3(an * r, r - rc, p.z - g.z);
  d = max(d, -sdBox3(ns, vec3(0.011, hw + 0.02, 0.026)));
  return d;
}

// returns (distance, material). 1 floor, 2/3/4 rings, 5 bezel, 6 lens
vec2 map(vec3 p, out float tick) {
  tick = 0.0;
  float r = length(p.xy);
  // base plate
  vec2 res = vec2(sdRoundBox2(vec2(r - 0.5, p.z + 0.07), vec2(0.5, 0.07), 0.01), 1.0);

  float t0, t1, t2;
  float d0 = ring(p, R0, uAng.x, 48.0, t0);
  float d1 = ring(p, R1, uAng.y, 72.0, t1);
  float d2 = ring(p, R2, uAng.z, 120.0, t2);
  if (d0 < res.x) { res = vec2(d0, 2.0); tick = t0; }
  if (d1 < res.x) { res = vec2(d1, 3.0); tick = t1; }
  if (d2 < res.x) { res = vec2(d2, 4.0); tick = t2; }

  // bezel: raised lip with a knurled outer wall and a fixed index notch at 12 o'clock
  float a = dialAngle(p.xy);
  float knurl = 0.0035 * smoothstep(-0.02, 0.03, -p.z + 0.02) * (0.5 + 0.5 * cos(a * 160.0));
  float db = sdRoundBox2(vec2(r - 0.5 * (BEZ.x + BEZ.y) + knurl, p.z - 0.005), vec2(0.5 * (BEZ.y - BEZ.x), 0.075), 0.018);
  vec3 ip = vec3(a * r, r - BEZ.x - 0.02, p.z - 0.08);
  db = max(db, -sdBox3(ip, vec3(0.008 + 0.25 * max(0.0, r - BEZ.x - 0.0), 0.03, 0.03)));
  if (db < res.x) res = vec2(db, 5.0);

  // glass core: a shallow dome in a recessed well
  float dome = length(p - vec3(0.0, 0.0, -0.95)) - 0.975;
  float dl = max(dome, r - LENS_R + 0.004);
  if (dl < res.x) res = vec2(dl, 6.0);
  return res;
}

float mapD(vec3 p) { float t; return map(p, t).x; }

vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0006;
  return normalize(k.xyy * mapD(p + k.xyy * h) + k.yyx * mapD(p + k.yyx * h) +
                   k.yxy * mapD(p + k.yxy * h) + k.xxx * mapD(p + k.xxx * h));
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.006 + 0.03 * float(i);
    occ += (h - mapD(p + h * n)) * sca;
    sca *= 0.82;
  }
  return clamp(1.0 - 4.0 * occ, 0.0, 1.0);
}

// studio environment: graded backdrop + two soft boxes and a strip
vec3 env(vec3 d) {
  vec3 lo = mix(vec3(0.010, 0.012, 0.016), vec3(0.42, 0.45, 0.50), uLight);
  vec3 hi = mix(vec3(0.090, 0.105, 0.130), vec3(0.93, 0.95, 0.98), uLight);
  vec3 c = mix(lo, hi, smoothstep(-0.4, 0.9, d.y));
  float sb1 = smoothstep(0.86, 0.95, dot(d, normalize(vec3(-0.55, 0.62, 0.56))));
  float sb2 = smoothstep(0.93, 0.985, dot(d, normalize(vec3(0.72, 0.28, 0.63))));
  float strip = smoothstep(0.035, 0.0, abs(d.x + 0.15)) * smoothstep(0.1, 0.6, d.y);
  c += vec3(1.0, 0.98, 0.95) * (2.4 * sb1 + 1.3 * sb2 + 0.5 * strip) * mix(1.0, 0.65, uLight);
  float allLocked = uLock.x * uLock.y * uLock.z;
  c += GOLD * 0.025 * allLocked * smoothstep(0.2, -0.6, d.y);
  return c;
}

float seamField(vec3 p, out vec3 col) {
  float r = length(p.xy);
  float z = p.z - 0.004;
  vec3 dsv = vec3(length(vec2(r - SEAM_R.x, z)), length(vec2(r - SEAM_R.y, z)), length(vec2(r - SEAM_R.z, z)));
  vec3 k = uLock + 1.8 * uFlash;
  vec3 w = k * (0.000020 / (dsv * dsv + 0.000012) + 0.000028 / (dsv * dsv + 0.0006));
  float dso = length(vec2(r - SEAM_OUT, z));
  float wo = uSettle * (0.000012 / (dso * dso + 0.00001) + 0.00002 / (dso * dso + 0.0008));
  col = GOLD;
  return w.x + w.y + w.z + wo;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // camera: slightly below centre so the rings' top faces and walls both read; pointer adds parallax
  vec3 ro = vec3(0.18 + 0.35 * uTilt.x, -0.78 + 0.28 * uTilt.y, 2.75);
  vec3 ta = vec3(0.0, 0.03, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.32 * ww);

  // bounding sphere
  float b = dot(ro, rd), c = dot(ro, ro) - 1.06 * 1.06, h = b * b - c;
  if (h < 0.0) { outColor = vec4(0.0); return; }
  float t = max(0.0, -b - sqrt(h));
  float tmax = -b + sqrt(h);

  float glow = 0.0;
  vec2 hit = vec2(-1.0);
  float tick = 0.0;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd * t;
    float tk;
    vec2 m = map(p, tk);
    vec3 gc;
    glow += seamField(p, gc) * min(m.x, 0.02);
    if (m.x < 0.00035 * t) { hit = vec2(t, m.y); tick = tk; break; }
    t += m.x * 0.82;
    if (t > tmax) break;
  }

  vec3 col = vec3(0.0);
  float alpha = 0.0;
  if (hit.x > 0.0) {
    alpha = 1.0;
    vec3 p = ro + rd * hit.x;
    vec3 n = calcNormal(p);
    float r = length(p.xy);
    float ao = calcAO(p, n);
    vec3 tng = normalize(vec3(-p.y, p.x, 0.0) + 1e-5);
    vec3 refl = reflect(rd, n);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
    vec3 L = normalize(vec3(-0.5, 0.65, 0.6));
    float mat = hit.y;

    if (mat >= 2.0 && mat <= 5.0) {
      bool bezel = mat > 4.5;
      vec3 base = bezel ? mix(vec3(0.30, 0.32, 0.36), vec3(0.62, 0.65, 0.70), uLight)
                        : mix(vec3(0.70, 0.73, 0.78), vec3(0.86, 0.88, 0.91), uLight);
      // lathe streaks: per-groove brightness, finer on the top faces
      float streak = 0.80 + 0.20 * hash11(floor(r * (bezel ? 380.0 : 900.0)));
      // anisotropic blur: average the environment along the brushing direction
      vec3 e = env(refl) * 0.40 + env(normalize(refl + tng * 0.22)) * 0.30 + env(normalize(refl - tng * 0.22)) * 0.30;
      vec3 f0 = base * streak;
      vec3 spec = e * (f0 + (1.0 - f0) * fres);
      // Ward-style anisotropic key highlight
      vec3 H = normalize(L - rd);
      vec3 bt = normalize(cross(n, tng));
      float nh = max(dot(n, H), 1e-3);
      float ax = 0.06, ay = 0.45;
      float th = dot(H, tng) / ax, bh = dot(H, bt) / ay;
      float ward = exp(-(th * th + bh * bh) / (nh * nh)) * max(dot(n, L), 0.0);
      col = spec + vec3(1.0, 0.97, 0.92) * ward * 1.4 * streak;
      col *= mix(1.0, 0.6, tick);                 // engraved ticks sit in shadow
      if (bezel) col *= 0.78;
      col *= mix(0.35, 1.0, ao);
    } else if (mat < 1.5) {
      // floor between the rings: matte, nearly black, catches seam light
      col = mix(vec3(0.012, 0.014, 0.018), vec3(0.20, 0.22, 0.25), uLight) * (0.4 + 0.6 * ao);
      col += env(refl) * 0.04 * fres;
    } else {
      // glass core: dark lens with fresnel reflections and an inner glow once settled
      vec3 deep = mix(vec3(0.004, 0.007, 0.009), vec3(0.03, 0.045, 0.05), uLight);
      col = deep + env(refl) * (0.03 + 0.85 * fres);
      // iris: fine concentric rings under the glass, a lit ring and a pin of light when settled
      float iris = 0.5 + 0.5 * cos(r * 420.0);
      col += vec3(0.03, 0.04, 0.045) * iris * smoothstep(LENS_R, 0.12, r) * smoothstep(0.06, 0.12, r);
      float ringGlow = exp(-pow((r - 0.165) * 95.0, 2.0));
      col += GOLD * (0.03 + uSettle * 0.9) * ringGlow;
      col += GOLD * uSettle * exp(-r * r * 3000.0) * 1.2;
      col += vec3(1.0) * pow(max(dot(refl, normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 400.0) * 2.2;
    }

    // seam light bouncing onto nearby surfaces
    float z = p.z;
    vec3 near = vec3(abs(r - SEAM_R.x), abs(r - SEAM_R.y), abs(r - SEAM_R.z));
    vec3 bounce = (uLock + uFlash) * exp(-near * 90.0) * exp(-max(z, 0.0) * 22.0);
    col += GOLD * (bounce.x + bounce.y + bounce.z) * 0.32;
  }

  col += GOLD * glow * 0.9;
  alpha = max(alpha, clamp(glow * 0.8, 0.0, 1.0));

  // filmic tone map (ACES approx) and gamma
  col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
  col = pow(col, vec3(1.0 / 2.2));
  outColor = vec4(col * alpha, alpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
  return s;
}

/** Search speeds (rad/s): rings counter-rotate like a combination being dialled. */
const SEARCH = [0.55, -0.38, 0.24] as const;

export function RingLock({
  state,
  className = "",
  onUnsupported,
  onSeat,
}: {
  state: RingLockState;
  className?: string;
  onUnsupported?: () => void;
  /** a ring has clunked home (0 inner .. 2 outer) */
  onSeat?: (ring: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const onSeatRef = useRef(onSeat);
  useEffect(() => {
    stateRef.current = state;
    onSeatRef.current = onSeat;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "high-performance" });
    if (!gl) {
      onUnsupported?.();
      return;
    }

    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link failed");
    } catch (e) {
      console.error(e);
      onUnsupported?.();
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = Object.fromEntries(
      ["uRes", "uTime", "uAng", "uLock", "uFlash", "uSettle", "uTilt", "uLight"].map((n) => [n, gl.getUniformLocation(prog, n)]),
    ) as Record<string, WebGLUniformLocation | null>;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ring physics
    const ang = [0.9, -2.1, 1.4];
    const vel = [...SEARCH] as number[];
    const target: (number | null)[] = [null, null, null];
    const lock = [0, 0, 0];
    const flash = [0, 0, 0];
    const seated = [false, false, false];
    let settle = 0;
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      const px = rect.width * rect.height * dpr * dpr;
      const budget = renderTier() === "mobile" ? 300_000 : PIXEL_BUDGET;
      if (px > budget) dpr *= Math.sqrt(budget / px);
      canvas!.width = Math.max(1, Math.round(rect.width * dpr));
      canvas!.height = Math.max(1, Math.round(rect.height * dpr));
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
    }

    function step(dt: number) {
      const s = stateRef.current;
      for (let i = 0; i < 3; i++) {
        const want = s.locked[i]!;
        if (want && target[i] === null) {
          // keep turning the same way and stop on the next notch-up position at least a little ahead
          const dir = Math.sign(vel[i]!) || 1;
          const ahead = ang[i]! + dir * (0.6 + Math.abs(vel[i]!) * 0.4);
          target[i] = dir > 0 ? Math.ceil(ahead / (2 * Math.PI)) * 2 * Math.PI : Math.floor(ahead / (2 * Math.PI)) * 2 * Math.PI;
          seated[i] = false;
        }
        if (!want && target[i] !== null) {
          target[i] = null;
          seated[i] = false;
        }
        if (target[i] !== null) {
          // under-damped spring: travels in, overshoots a hair, settles (the "clunk")
          const k = 90, c = 2 * 0.5 * Math.sqrt(k);
          const acc = k * (target[i]! - ang[i]!) - c * vel[i]!;
          vel[i]! += acc * dt;
          ang[i]! += vel[i]! * dt;
          if (!seated[i] && Math.abs(target[i]! - ang[i]!) < 0.012 && Math.abs(vel[i]!) < 0.12) {
            seated[i] = true;
            flash[i] = 1;
            onSeatRef.current?.(i);
          }
          lock[i]! += ((seated[i] ? 1 : 0) - lock[i]!) * Math.min(1, dt * 5);
        } else {
          vel[i]! += (SEARCH[i]! - vel[i]!) * Math.min(1, dt * 1.2);
          ang[i]! += vel[i]! * dt;
          lock[i]! += (0 - lock[i]!) * Math.min(1, dt * 4);
        }
        flash[i]! *= Math.exp(-dt * 5.5);
      }
      settle += ((s.settled ? 1 : 0) - settle) * Math.min(1, dt * 2.2);
      tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 3);
      tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 3);
    }

    function draw(time: number) {
      const light = 0;
      gl!.uniform2f(U.uRes!, canvas!.width, canvas!.height);
      gl!.uniform1f(U.uTime!, time);
      gl!.uniform3f(U.uAng!, ang[0]!, ang[1]!, ang[2]!);
      gl!.uniform3f(U.uLock!, lock[0]!, lock[1]!, lock[2]!);
      gl!.uniform3f(U.uFlash!, flash[0]!, flash[1]!, flash[2]!);
      gl!.uniform1f(U.uSettle!, settle);
      gl!.uniform2f(U.uTilt!, tilt.x, tilt.y);
      gl!.uniform1f(U.uLight!, light);
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    if (reduced) {
      ang.fill(0);
      lock.fill(1);
      settle = 1;
      draw(0);
      return () => ro.disconnect();
    }

    let raf = 0;
    let visible = true;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw(now / 1000);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!raf && visible && !document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tilt.tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.9)));
      tilt.ty = Math.max(-1, Math.min(1, -(e.clientY - (r.top + r.height / 2)) / (r.height * 0.9)));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    const onLost = (e: Event) => {
      e.preventDefault();
      stop();
      onUnsupported?.();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("webglcontextlost", onLost);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className={`block size-full ${className}`} aria-hidden />;
}
