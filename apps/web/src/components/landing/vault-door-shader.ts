/**
 * The hero's vault door, ray-marched: a round bank-vault door in a concrete wall, swung on a hinge, with a
 * brass wheel and thrown bolts. Behind it a machined passage leads into a vault room: walls of safe-deposit
 * boxes (keyways, number plates, handles), a coffered ceiling with lamps, a polished stone floor, and a pallet of
 * cast gold bars in interlocking layers. Everything is a signed distance field, so the wheel can spin, the bolts
 * retract and the door swing open from scroll alone. Inside, reflections come from a cheap analytic picture of
 * the room rather than a second march, and only the gold casts marched shadows.
 *
 * Uniforms: uWheel (rad), uBolt (0 thrown → 1 retracted), uOpen (door swing, rad), uCam (0 resting shot →
 * 0.35 square on → 1 at the gold), uFrame (x: where the door sits on screen, y: zoom, z: vertical offset),
 * uTilt (pointer parallax), uShift (lens shift that makes room for the copy inside), uNarrow (0 wide → 1 phone).
 */
export const VAULT_DOOR_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uRes;
uniform float uWheel;   // wheel angle (rad)
uniform float uBolt;    // 0 bolts thrown, 1 retracted
uniform float uOpen;    // door swing (rad)
uniform float uCam;     // 0 resting shot, 0.35 square on to the door, 1 inside the vault
uniform vec3 uFrame;    // x: horizontal offset of the door on screen, y: zoom, z: vertical offset
uniform vec2 uTilt;     // pointer parallax
uniform vec2 uShift;    // lens shift, so the inside shot can leave room for the copy
uniform float uNarrow;  // 0 wide screen, 1 tall phone: inside, the camera stands further back

const float PI = 3.14159265;
const float TAU = 6.2831853;

// ---- the door (wall face at z = 0, opening radius 1) ----
const float RO = 1.0;          // opening
const float DR = 0.975;        // door radius
const float DZ0 = -0.36;       // door back
const float DZ1 = 0.16;        // door front
const vec3 HINGE = vec3(1.34, 0.0, 0.34);

// ---- the vault behind it: a round passage through the wall, then a room lined with deposit boxes ----
const float ZT = -0.62;        // end of the passage
const float ZB = -4.7;         // back wall
const float RW = 1.8;          // half width
const float FL = -0.62;        // floor
const float CE = 1.32;         // ceiling
const float PLINTH = 0.08;     // kick plate under the boxes
const float BOXH = 1.52;       // height of the box wall above the plinth

// ---- the gold: a pallet of cast bars in interlocking layers ----
const vec3 STACK = vec3(0.0, -0.555, -3.3);   // top of the pallet, centre
const float LP = 0.043;        // layer pitch
const float NL = 8.0;          // layers
const float PX = 0.094;        // bar pitch across
const float PZ = 0.256;        // bar pitch along
const float WB = 0.043, WT = 0.033, HH = 0.0205, LB = 0.121, LT = 0.108;  // half sizes: bottom/top width, height, bottom/top length

const vec3 LMP0 = vec3(0.0, CE - 0.03, -1.3);
const vec3 LMP1 = vec3(0.0, CE - 0.03, -2.7);   // just in front of the gold, like a display light
const vec3 LMP2 = vec3(0.0, CE - 0.03, -3.7);

const vec3 GOLD = vec3(1.0, 0.72, 0.3);
const vec3 BRASS = vec3(0.92, 0.70, 0.40);
const vec3 STEEL = vec3(0.62, 0.63, 0.65);
const vec3 LAMP = vec3(1.0, 0.83, 0.62);

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdRBox(vec3 p, vec3 b, float r) { return sdBox(p, b - r) - r; }
float sdRect2(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdTorusZ(vec3 p, float R, float r) { return length(vec2(length(p.xy) - R, p.z)) - r; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
// cylinder along z: radius r, z in [z0, z1], edge rounding e
float sdCylZ(vec3 p, float r, float z0, float z1, float e) {
  vec2 d = vec2(length(p.xy) - r + e, abs(p.z - 0.5 * (z0 + z1)) - 0.5 * (z1 - z0) + e);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - e;
}
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

// materials: 1 wall, 2 frame, 3 door steel, 3.5 hub, 4 brass, 5 bolt chrome, 6 vault room, 7 gold bars, 8 hinge,
// 9 passage steel, 10 threshold, 11 pallet
vec2 opU(vec2 a, vec2 b) { return a.x < b.x ? a : b; }

// door in its own closed frame (axis z, centred at origin in xy)
vec2 door(vec3 q) {
  float r = length(q.xy);
  float bound = sdCylZ(q, DR + 0.24, DZ0 - 0.02, 0.62, 0.0);
  if (bound > 0.25) return vec2(bound, 3.0);

  // body: plug with a stepped face (outer band proud, inner field recessed)
  float body = sdCylZ(q, DR, DZ0, DZ1, 0.018);
  float field = sdCylZ(q, 0.78, DZ1 - 0.035, DZ1 + 0.2, 0.012);
  body = max(body, -field);
  // concentric lathe grooves cut into the field
  float dr = abs(fract(r * 9.0 + 0.5) - 0.5) / 9.0;
  float cutter = max(dr - 0.0035, (DZ1 - 0.035 - 0.007) - q.z);
  cutter = max(cutter, max(r - 0.74, 0.24 - r));
  body = max(body, -cutter);
  vec2 res = vec2(body, 3.0);

  // rivets on the outer band
  {
    float a = atan(q.y, q.x);
    float n = 28.0;
    float la = mod(a + PI / n, TAU / n) - PI / n;
    vec2 rp = vec2(cos(la), sin(la)) * r;
    float riv = length(vec3(rp.x - 0.885, rp.y, q.z - DZ1)) - 0.026;
    res = opU(res, vec2(riv, 5.0));
  }

  // hub
  float hub = sdCylZ(q, 0.19, DZ1 - 0.04, DZ1 + 0.16, 0.02);
  hub = min(hub, sdCylZ(q, 0.13, DZ1 + 0.1, DZ1 + 0.24, 0.025));
  res = opU(res, vec2(hub, 3.5));

  // wheel: rim, spokes and handles, spinning about z
  {
    vec3 w = q;
    w.xy = rot(uWheel) * w.xy;
    float zc = DZ1 + 0.2;
    float rim = sdTorusZ(w - vec3(0, 0, zc), 0.5, 0.032);
    float a = atan(w.y, w.x);
    float n = 5.0;
    float la = mod(a + PI / n, TAU / n) - PI / n;
    vec2 sp = vec2(cos(la), sin(la)) * length(w.xy);
    vec3 s3 = vec3(sp, w.z);
    float spoke = sdCapsule(s3, vec3(0.1, 0, zc), vec3(0.62, 0, zc), 0.026);
    float knob = length(s3 - vec3(0.69, 0, zc)) - 0.055;
    knob = smin(knob, sdCapsule(s3, vec3(0.6, 0, zc), vec3(0.67, 0, zc), 0.036), 0.03);
    float cap = sdCylZ(w, 0.1, DZ1 + 0.18, DZ1 + 0.28, 0.03);
    float wheel = min(min(rim, spoke), min(knob, cap));
    res = opU(res, vec2(wheel, 4.0));
  }

  // locking bolts round the edge: thrown into the frame, or retracted into the door
  {
    float a = atan(q.y, q.x);
    float n = 12.0;
    float la = mod(a + PI / n, TAU / n) - PI / n;
    vec2 bp = vec2(cos(la), sin(la)) * r;
    float ext = mix(0.2, -0.1, uBolt);
    float zb = 0.5 * (DZ0 + DZ1);
    float bolt = sdCapsule(vec3(bp, q.z), vec3(0.85, 0, zb), vec3(DR + ext, 0, zb), 0.06);
    res = opU(res, vec2(bolt, 5.0));
  }
  return res;
}

// one layer of the gold stack: bars side by side, every other layer turned 90 degrees so the stack interlocks.
// c: point in the bar's own frame (long axis z), cell: which bar.
float barLayer(vec3 b, float L, out vec3 c, out vec2 cell) {
  vec3 q = b - vec3(0.0, (L + 0.5) * LP, 0.0);
  if (mod(L, 2.0) > 0.5) q.xz = vec2(q.z, -q.x);
  // eight bars across and three along, so both orientations cover the same square; the top layer is smaller
  bool top = L > NL - 1.5;
  float nx = top ? 2.5 : 3.5;
  float ox = floor(q.x / PX) + 0.5;
  float cz = top ? clamp(floor(q.z / PZ) + 0.5, -0.5, 0.5) : clamp(round(q.z / PZ), -1.0, 1.0);
  cell = vec2(clamp(ox, -nx, nx), cz);
  c = q - vec3(cell.x * PX, 0.0, cell.y * PZ);
  // cast ingot: sloped sides and ends, narrower on top, edges eased
  float t = clamp((c.y + HH) / (2.0 * HH), 0.0, 1.0);
  vec3 hb = vec3(mix(WB, WT, t), HH, mix(LB, LT, t));
  return sdRBox(c, hb, 0.0045) * 0.92;
}

float goldStack(vec3 p, out vec3 c, out vec3 id) {
  vec3 b = p - STACK;
  c = vec3(0.0); id = vec3(0.0);
  float bound = sdBox(b - vec3(0.0, NL * LP * 0.5, 0.0), vec3(0.4, NL * LP * 0.5, 0.4));
  if (bound > 0.04) return bound;
  float L = clamp(floor(b.y / LP), 0.0, NL - 1.0);
  vec3 c1; vec2 k1;
  float d = barLayer(b, L, c1, k1);
  float L2 = clamp(L + (fract(b.y / LP) > 0.5 ? 1.0 : -1.0), 0.0, NL - 1.0);
  vec3 c2; vec2 k2;
  float d2 = barLayer(b, L2, c2, k2);
  if (d2 < d) { d = d2; c1 = c2; k1 = k2; L = L2; }
  c = c1; id = vec3(k1, L);
  return d;
}

// a dark oak pallet under the stack: a deck on three runners
float pallet(vec3 p) {
  vec3 b = p - vec3(STACK.x, FL, STACK.z);
  float bound = sdBox(b - vec3(0.0, 0.035, 0.0), vec3(0.5, 0.04, 0.5));
  if (bound > 0.05) return bound;
  float deck = sdRBox(b - vec3(0.0, 0.054, 0.0), vec3(0.45, 0.011, 0.45), 0.003);
  vec3 rb = b; rb.x -= 0.39 * clamp(round(rb.x / 0.39), -1.0, 1.0);
  float runners = sdRBox(rb - vec3(0.0, 0.022, 0.0), vec3(0.045, 0.022, 0.45), 0.003);
  return min(deck, runners);
}

float stackShadowMap(vec3 p) { vec3 c, id; return min(goldStack(p, c, id), pallet(p)); }

vec2 map(vec3 p) {
  float r = length(p.xy);
  // the wall is everything that isn't open space: in front of the wall, the round passage, or the room
  float room = sdBox(p - vec3(0.0, 0.5 * (FL + CE), 0.5 * (ZT + ZB)), vec3(RW, 0.5 * (CE - FL), 0.5 * (ZT - ZB)));
  float passage = sdCylZ(p, RO, ZT - 0.05, 0.2, 0.0);
  float solid = -min(min(-p.z, passage), room);
  vec2 res = vec2(solid, p.z > -0.01 ? 1.0 : (p.z > ZT + 0.003 ? 9.0 : 6.0));
  // threshold plate across the bottom of the passage, flush with the vault floor
  res = opU(res, vec2(max(max(p.y - FL, max(p.z, ZT - p.z)), r - RO - 0.02), 10.0));

  // frame ring proud of the wall
  float fr = sdRect2(vec2(r - 1.2, p.z - 0.05), vec2(0.2, 0.05), 0.02);
  fr = max(fr, -(r - RO));
  res = opU(res, vec2(fr, 2.0));

  if (p.z < ZT + 0.1) {
    vec3 c, id;
    res = opU(res, vec2(goldStack(p, c, id), 7.0));
    res = opU(res, vec2(pallet(p), 11.0));
  }

  // hinge: pin and two arms, fixed to the wall
  {
    vec3 h = p - HINGE;
    float pin = sdCylZ(h.xzy, 0.07, -0.62, 0.62, 0.02);
    float knuckles = min(sdCylZ((h - vec3(0, 0.38, 0)).xzy, 0.1, -0.12, 0.12, 0.02), sdCylZ((h - vec3(0, -0.38, 0)).xzy, 0.1, -0.12, 0.12, 0.02));
    float plate = sdRBox(p - vec3(1.38, 0.0, 0.09), vec3(0.08, 0.7, 0.08), 0.02);
    res = opU(res, vec2(min(min(pin, knuckles), plate), 8.0));
  }

  // door, swung about the hinge pin
  {
    vec3 q = p - HINGE;
    float c = cos(-uOpen), s = sin(-uOpen);
    q = vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c) + HINGE;
    vec2 d = door(q);
    vec3 a = q;
    float arms = min(sdRBox(a - vec3(1.14, 0.38, DZ1 + 0.06), vec3(0.24, 0.07, 0.07), 0.02), sdRBox(a - vec3(1.14, -0.38, DZ1 + 0.06), vec3(0.24, 0.07, 0.07), 0.02));
    d = opU(d, vec2(arms, 8.0));
    res = opU(res, d);
  }
  return res;
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0005, -0.0005);
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 28; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.02, 0.25);
    if (res < 0.01 || t > 4.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

// shadows inside the vault only come from the gold and its pallet, so they march just those
float stackShadow(vec3 ro, vec3 rd, float maxT) {
  float res = 1.0, t = 0.01;
  for (int i = 0; i < 24; i++) {
    float h = stackShadowMap(ro + rd * t);
    res = min(res, 8.0 * h / t);
    t += clamp(h, 0.006, 0.12);
    if (res < 0.01 || t > maxT) break;
  }
  return clamp(res, 0.0, 1.0);
}

float ao(vec3 p, vec3 n) {
  float o = 0.0, s = 1.0;
  for (int i = 1; i <= 4; i++) {
    float h = 0.025 * float(i);
    o += (h - map(p + n * h).x) * s;
    s *= 0.6;
  }
  return clamp(1.0 - 3.5 * o, 0.0, 1.0);
}

// ---------- the deposit-box wall ----------
// Rows, bottom to top: two of tall boxes, two medium, four small; the small rows have two narrow doors per column.
// uv: x along the wall, y height above the floor. Returns the relief (0 = door face); mat: 0 steel door,
// 1 brass hardware, 2 dark (gaps, keyways, engraving), 3 panelling above, 4 plinth. id: per door.
float boxWall(vec2 uv, out float mat, out float id) {
  mat = 0.0; id = 0.0;
  if (uv.y < PLINTH) { mat = 4.0; return uv.y > PLINTH - 0.006 ? -1.0 : 0.0; }
  float v = uv.y - PLINTH;
  if (v > BOXH) {
    mat = 3.0;
    if (v < BOXH + 0.03) { mat = 1.0; return 0.4 - 12.0 * abs(v - BOXH - 0.015); }  // brass rail
    float pan = abs(fract(uv.x / 0.48) - 0.5) * 0.48;
    return -smoothstep(0.012, 0.004, min(pan, abs(v - BOXH - 0.33)));
  }
  float y0 = 0.0, rh = 0.25, row = 0.0;
  float hs[8] = float[8](0.25, 0.25, 0.2, 0.2, 0.155, 0.155, 0.155, 0.155);
  for (int k = 0; k < 8; k++) {
    rh = hs[k]; row = float(k);
    if (v < y0 + rh || k == 7) break;
    y0 += rh;
  }
  float cw = row > 3.5 ? 0.12 : 0.24;
  float col = floor(uv.x / cw);
  vec2 f = vec2(uv.x - (col + 0.5) * cw, v - (y0 + 0.5 * rh));
  vec2 hs2 = vec2(0.5 * cw, 0.5 * rh);
  id = hash21(vec2(col, row * 7.0 + 3.0));
  vec2 e = hs2 - abs(f);
  float edge = min(e.x, e.y);
  if (edge < 0.0035) { mat = 2.0; return -1.0; }
  float h = -smoothstep(0.014, 0.0035, edge) * 0.7;          // bevel round each door
  h -= smoothstep(0.024, 0.02, edge) * smoothstep(0.016, 0.02, edge) * 0.12;  // fine inset line

  // engraved brass number plate near the top
  vec2 np = f - vec2(0.0, hs2.y - 0.028);
  if (abs(np.x) < 0.021 && abs(np.y) < 0.0075) {
    mat = 1.0; h = 0.25;
    float ci = floor((np.x + 0.0165) / 0.011);
    if (ci >= 0.0 && ci <= 2.0) {
      vec2 g = vec2(np.x + 0.0165 - (ci + 0.5) * 0.011, np.y);
      float bits = floor(hash21(vec2(id * 31.0, ci)) * 127.0);
      float seg = 1e3;
      if (mod(bits, 2.0) > 0.5) seg = min(seg, max(abs(g.x) - 0.0026, abs(g.y - 0.0045)));
      if (mod(floor(bits / 2.0), 2.0) > 0.5) seg = min(seg, max(abs(g.x) - 0.0026, abs(g.y)));
      if (mod(floor(bits / 4.0), 2.0) > 0.5) seg = min(seg, max(abs(g.x) - 0.0026, abs(g.y + 0.0045)));
      if (mod(floor(bits / 8.0), 2.0) > 0.5) seg = min(seg, max(abs(g.x - 0.0026), abs(g.y - 0.0022) - 0.0022));
      if (mod(floor(bits / 16.0), 2.0) > 0.5) seg = min(seg, max(abs(g.x + 0.0026), abs(g.y + 0.0022) - 0.0022));
      seg = min(seg, max(abs(g.x - 0.0026), abs(g.y + 0.0022) - 0.0022));
      if (seg < 0.0007) { mat = 2.0; h = 0.1; }
    }
    return h;
  }
  // two keyways, the bank's and the renter's, each in a brass escutcheon
  for (int k = 0; k < 2; k++) {
    vec2 kp = f - vec2(k == 0 ? -0.024 : 0.024, rh > 0.19 ? 0.012 : -0.004);
    float d = length(kp);
    if (d < 0.011) {
      mat = 1.0; h = 0.35 - 8.0 * max(d - 0.008, 0.0);
      if (length(kp - vec2(0.0, 0.0018)) < 0.0028 || (abs(kp.x) < 0.0011 && kp.y < 0.002 && kp.y > -0.0058)) { mat = 2.0; h = -0.6; }
      return h;
    }
  }
  // pull handle on the tall doors
  if (rh > 0.19) {
    vec2 hp = f - vec2(0.0, -hs2.y + 0.05);
    float hd = sdRect2(hp, vec2(0.04, 0.0055), 0.005);
    if (hd < 0.0) { mat = 1.0; return 0.5 + hd * 40.0; }
  }
  // two hinge knuckles down the left side
  vec2 kn = vec2(f.x + hs2.x - 0.009, abs(f.y) - hs2.y * 0.6);
  if (length(kn * vec2(1.0, 0.45)) < 0.0045) { mat = 0.0; h = 0.3; }
  return h;
}

// ---------- a cheap picture of the room, for reflections ----------
float lampPanels(vec2 xz, float blur) {
  float s = 0.0;
  for (int k = 0; k < 3; k++) {
    vec2 d = abs(xz - vec2(0.0, k == 0 ? -1.3 : (k == 1 ? -2.7 : -3.7))) - vec2(0.24);
    s += 1.0 - smoothstep(-blur, blur + 0.006, max(d.x, d.y));
  }
  return s;
}
float lampFall(vec3 p) {
  return 1.0 / (1.0 + 1.2 * dot(p - LMP0, p - LMP0)) + 1.0 / (1.0 + 1.2 * dot(p - LMP1, p - LMP1)) + 1.0 / (1.0 + 1.2 * dot(p - LMP2, p - LMP2));
}
vec3 roomRadiance(vec3 o, vec3 d, float rough, float seeGold) {
  vec3 inv = 1.0 / d;
  vec3 t1 = (vec3(-RW, FL, ZB) - o) * inv, t2 = (vec3(RW, CE, ZT) - o) * inv;
  vec3 tf = max(t1, t2);
  float te = min(min(tf.x, tf.y), tf.z);
  vec3 hp = o + d * te;
  float blur = 0.01 + rough * 0.35;
  vec3 c;
  if (te == tf.y) {
    // the ceiling: lamp panels, and the warm wash they throw on the plaster round them
    c = d.y > 0.0 ? vec3(0.07, 0.06, 0.05) + LAMP * (0.35 * lampFall(hp) + 5.0 * lampPanels(hp.xz, blur)) : vec3(0.02, 0.018, 0.016);
  } else {
    float lit = lampFall(hp);
    float h = hp.y - FL;
    vec2 along = te == tf.x ? vec2(hp.z, h) : vec2(hp.x, h);
    // rows of steel doors with a fleck of brass, panelling above
    float rows = h < PLINTH + BOXH ? 1.0 : 0.0;
    float g = 0.75 + 0.25 * smoothstep(0.3, 0.6, noise(along * vec2(1.0 / 0.12, 1.0 / 0.155)));
    c = mix(vec3(0.24, 0.2, 0.16), vec3(0.3, 0.28, 0.25) * g, rows) * lit;
    if (te == tf.z && d.z > 0.0) c *= 0.4;   // the wall with the passage in it, behind the camera
  }
  // the gold, as a warm block
  vec3 b0 = STACK + vec3(-0.36, 0.0, -0.38), b1 = STACK + vec3(0.36, NL * LP, 0.38);
  vec3 g1 = (b0 - o) * inv, g2 = (b1 - o) * inv;
  vec3 gn = min(g1, g2), gx = max(g1, g2);
  float tn = max(max(gn.x, gn.y), gn.z), tx = min(min(gx.x, gx.y), gx.z);
  if (seeGold > 0.0 && tx > max(tn, 0.0) && tn < te) {
    // read as bars, not a block: dark seams between layers and between bar ends; glossy, so it fades with distance
    vec3 gp = o + d * max(tn, 0.0) - STACK;
    float seam = smoothstep(0.08, 0.2, abs(fract(gp.y / LP) - 0.5) * 2.0) * smoothstep(0.04, 0.14, abs(fract(gp.x / PX) - 0.5) * 2.0);
    vec3 gc = GOLD * (0.12 + 0.35 * seam) * (0.6 + 0.4 * smoothstep(0.0, 1.0, d.y + 0.5));
    c = mix(c, gc, seeGold * exp(-max(tn, 0.0) * 1.6) * mix(1.0, 0.3, smoothstep(0.12, 0.35, rough)));
  }
  return c;
}

// studio environment outside: a warm soft box upper left, a cool strip right, dark floor
vec3 env(vec3 d, float rough) {
  float w = mix(0.05, 0.6, rough);
  vec3 c = vec3(0.02, 0.02, 0.022) + vec3(0.11, 0.1, 0.09) * smoothstep(-0.3, 1.0, d.y);
  float box = smoothstep(w + 0.35, 0.3 - w * 0.4, length(d - normalize(vec3(-0.5, 0.6, 0.62))));
  c += vec3(1.0, 0.86, 0.66) * box * 2.8;
  float box2 = smoothstep(w + 0.3, 0.2 - w * 0.4, length(d - normalize(vec3(0.35, 0.75, 0.55))));
  c += vec3(0.9, 0.85, 0.8) * box2 * 0.9;
  float strip = smoothstep(0.08 + w, 0.0, abs(d.x - 0.85)) * smoothstep(-0.4, 0.3, d.y) * step(0.0, d.z);
  c += vec3(0.5, 0.58, 0.72) * strip * 0.7;
  // the lit vault reflects in the door once it's open
  c += LAMP * smoothstep(0.5, 1.0, -d.z) * smoothstep(0.2, 1.2, uOpen) * 0.3;
  return c;
}

vec3 ggx(vec3 n, vec3 v, vec3 l, vec3 F0, vec3 diffC, float rough) {
  vec3 hv = normalize(l + v);
  float ndl = max(dot(n, l), 0.0);
  float a2 = pow(max(rough, 0.05), 4.0);
  float ndh = max(dot(n, hv), 0.0);
  float D = a2 / (PI * pow(ndh * ndh * (a2 - 1.0) + 1.0, 2.0));
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(hv, v), 0.0), 5.0);
  return (diffC / PI + F * D * 0.25) * ndl;
}

// a recessed ceiling lamp: light thrown downward
vec3 lamp(vec3 p, vec3 n, vec3 v, vec3 L, vec3 F0, vec3 diffC, float rough, float sh) {
  vec3 ld = L - p;
  float dd = dot(ld, ld);
  vec3 l = ld * inversesqrt(dd);
  float cone = smoothstep(0.05, 0.75, l.y);
  return ggx(n, v, l, F0, diffC, rough) * LAMP * 4.4 * cone * sh / (1.0 + dd * 0.7);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y - uShift;

  // camera: the resting shot looks past the door so it sits to one side; then it squares up to the door,
  // and once the door is open it walks through the passage to the gold
  float k1 = smoothstep(0.0, 0.35, uCam);
  float k2 = smoothstep(0.35, 1.0, uCam);
  vec3 ro = vec3(-0.55 + uTilt.x * 0.3, 0.22 + uTilt.y * 0.18, 7.0 / uFrame.y);
  ro = mix(ro, vec3(0.0, 0.05, 5.0), k1);
  ro = mix(ro, vec3(0.0, 0.3 + 0.3 * uNarrow, -1.25 + 0.5 * uNarrow), k2);
  vec3 ta = vec3(-uFrame.x * 1.85, 0.08 + uFrame.z * 1.6, 0.0);
  ta = mix(ta, vec3(0.0, -0.02, -1.0), k1);
  ta = mix(ta, vec3(0.0, -0.4, -3.3), k2);
  vec3 ww = normalize(ta - ro), uu = normalize(cross(ww, vec3(0, 1, 0))), vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + mix(1.9, 1.2 - 0.18 * uNarrow, k2) * ww);

  float t = 0.0;
  vec2 h = vec2(0.0);
  bool hit = false;
  for (int i = 0; i < 150; i++) {
    h = map(ro + rd * t);
    if (h.x < 0.0004 * t) { hit = true; break; }
    t += h.x * 0.9;
    if (t > 20.0) break;
  }

  vec3 col = vec3(0.004);
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    float m = h.y;
    vec3 v = -rd;
    vec3 emit = vec3(0.0);

    // the door's local frame, for brushing and highlights on its face
    vec3 q = p - HINGE;
    float c = cos(-uOpen), s = sin(-uOpen);
    q = vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c) + HINGE;
    float rq = length(q.xy);

    vec3 base; float metal; float rough;
    if (m < 1.5) {              // concrete wall
      float nz = fbm(p.xy * 3.0) * 0.6 + fbm(p.xy * 18.0) * 0.4;
      base = vec3(0.16, 0.15, 0.14) * (0.6 + 0.8 * nz);
      metal = 0.0; rough = 0.9;
    } else if (m < 2.5) {       // frame
      base = STEEL * 0.8; metal = 1.0; rough = 0.36 + 0.1 * noise(vec2(atan(p.y, p.x) * 40.0, length(p.xy) * 300.0));
    } else if (m < 3.25) {      // door steel, lathe brushed; the back face is plain mill-finish plate
      float streak = noise(vec2(rq * 420.0, 0.5)) * 0.6 + noise(vec2(rq * 90.0, 3.1)) * 0.4;
      base = STEEL * (0.85 + 0.25 * streak); metal = 1.0; rough = 0.3 + 0.16 * streak;
      if (q.z < DZ0 + 0.02) { base = STEEL * (0.38 + 0.08 * streak); rough = 0.5; }
      else if (rq > DR - 0.012) { base = STEEL * (0.42 + 0.1 * noise(vec2(atan(q.y, q.x) * 3.0, q.z * 260.0))); rough = 0.42; }
    } else if (m < 3.75) {      // hub
      base = STEEL * 0.95; metal = 1.0; rough = 0.18;
    } else if (m < 4.5) {       // brass wheel
      base = BRASS; metal = 1.0; rough = 0.16 + 0.08 * noise(p.xy * 60.0);
    } else if (m < 5.5) {       // chrome bolts and rivets
      base = vec3(0.8, 0.8, 0.82); metal = 1.0; rough = 0.12;
    } else if (m < 6.5) {       // the vault room
      if (n.y > 0.7) {          // polished dark stone floor, faint veining, joints every 0.6
        vec2 fp = p.xz;
        float vein = smoothstep(0.04, 0.0, abs(fbm(fp * 0.9 + fbm(fp * 1.7) * 1.1) - 0.5)) * 0.18 + 0.25 * smoothstep(0.55, 0.8, noise(fp * 260.0)) * smoothstep(3.5, 1.0, t);
        vec2 jt = abs(fract(fp / 0.6) - 0.5) * 0.6;
        float joint = smoothstep(0.0015, 0.004, min(0.3 - jt.x, 0.3 - jt.y));
        base = mix(vec3(0.028, 0.026, 0.024), vec3(0.14, 0.125, 0.105), vein * 0.5) * mix(0.4, 1.0, joint) * (0.9 + 0.2 * hash21(floor(fp / 0.6)));
        metal = 0.0; rough = mix(0.32, 0.1, joint);
      } else if (n.y < -0.7) {  // coffered ceiling with three lamp panels down the middle
        vec2 cp = vec2(p.x, p.z + 1.3);
        vec2 cf = abs(fract(cp / 0.6 + 0.5) - 0.5) * 0.6;
        float rib = smoothstep(0.03, 0.018, 0.3 - max(cf.x, cf.y));
        base = vec3(0.22, 0.2, 0.17) * (1.0 - 0.45 * rib);
        metal = 0.0; rough = 0.85;
        emit = LAMP * 6.0 * lampPanels(p.xz, 0.004);
      } else {                  // deposit boxes on the side and back walls
        bool side = abs(n.x) > 0.7;
        vec2 wuv = side ? vec2(p.z * sign(n.x), p.y - FL) : vec2(p.x, p.y - FL);
        vec3 T = side ? vec3(0.0, 0.0, sign(n.x)) : vec3(1.0, 0.0, 0.0);
        float bm, bid;
        float h0 = boxWall(wuv, bm, bid);
        float fade = smoothstep(4.5, 1.5, t);   // fine relief only where it can be seen
        if (fade > 0.0) {
          float e = 0.0012, dm, di;
          float hx = boxWall(wuv + vec2(e, 0.0), dm, di);
          float hy = boxWall(wuv + vec2(0.0, e), dm, di);
          vec2 g = clamp(vec2(hx - h0, hy - h0) / e * 0.012, -2.0, 2.0) * fade;
          n = normalize(n - g.x * T - g.y * vec3(0.0, 1.0, 0.0));
        }
        if (bm < 0.5) {         // brushed steel door, each a slightly different sheet
          float br = noise(vec2(wuv.x * 30.0, wuv.y * 900.0)) * 0.5 + noise(vec2(wuv.x * 4.0, wuv.y * 260.0)) * 0.5;
          base = STEEL * (0.62 + 0.18 * br) * (0.9 + 0.2 * bid);
          metal = 1.0; rough = 0.26 + 0.12 * br;
        } else if (bm < 1.5) {  // brass
          base = BRASS * (0.92 + 0.1 * bid); metal = 1.0; rough = 0.2;
        } else if (bm < 2.5) {  // gaps and keyways
          base = vec3(0.012); metal = 0.0; rough = 0.7;
        } else if (bm < 3.5) {  // warm panelling above the boxes
          base = vec3(0.3, 0.26, 0.21) * (0.9 + 0.2 * fbm(wuv * 6.0)); metal = 0.0; rough = 0.7;
        } else {                // dark bronze plinth
          base = vec3(0.16, 0.12, 0.08); metal = 1.0; rough = 0.35;
        }
      }
    } else if (m < 7.5) {       // gold: cast bars, polished tops with an assay stamp
      vec3 bc, bid;
      goldStack(p, bc, bid);
      vec3 nl = n;
      if (mod(bid.z, 2.0) > 0.5) nl.xz = vec2(n.z, -n.x);
      float hv = hash21(bid.xy + bid.z * 13.1);
      base = GOLD * mix(vec3(1.0), vec3(1.0, 0.95, 0.88), hv);
      metal = 1.0;
      rough = 0.22 + 0.1 * fbm(bc.xz * 220.0 + hv * 9.0);
      if (nl.y > 0.85) {
        rough = 0.16 + 0.05 * hv;
        vec2 s2 = bc.xz;
        // stamped border, round hallmark, serial lines
        float border = abs(sdRect2(s2, vec2(0.024, 0.088), 0.006)) - 0.0009;
        float mark = abs(length(s2 - vec2(0.0, 0.058)) - 0.011) - 0.0011;
        float lines = 1e3;
        for (int k = 0; k < 2; k++) {
          float zr = 0.012 - float(k) * 0.03;
          float ch = step(0.3, hash21(vec2(floor((s2.x + 0.02) / 0.004), float(k) + hv * 17.0)));
          float lw = k == 0 ? 0.013 : 0.009;
          if (abs(s2.x) < lw && ch > 0.5 && abs(fract((s2.x + 0.02) / 0.004) - 0.5) < 0.32) lines = min(lines, abs(s2.y - zr) - 0.0026);
        }
        float stamp = min(min(border, mark), lines);
        float sk = smoothstep(0.0006, -0.0002, stamp) * smoothstep(3.2, 1.2, t);
        base *= 1.0 - 0.2 * sk;
        rough = mix(rough, 0.38, sk);
        n = normalize(n + vec3(0.12 * sk * sin(s2.x * 900.0), 0.0, 0.12 * sk * sin(s2.y * 900.0)));
      } else {
        // the sides keep the slightly rippled skin of the mould
        n = normalize(n + 0.03 * vec3(noise(bc.yz * 380.0) - 0.5, 0.0, noise(bc.xy * 380.0) - 0.5));
      }
    } else if (m < 8.5) {       // hinge
      base = vec3(0.22, 0.23, 0.25); metal = 1.0; rough = 0.35;
    } else if (m < 9.5) {       // the passage: machined steel, with the sockets the bolts lock into
      float a = atan(p.y, p.x);
      float la = mod(a + PI / 12.0, TAU / 12.0) - PI / 12.0;
      float sock = length(vec2(la * RO, p.z - 0.5 * (DZ0 + DZ1)));
      float ring = smoothstep(0.004, 0.0, abs(fract(p.z * 14.0) - 0.5) - 0.46);
      base = STEEL * (0.55 + 0.12 * noise(vec2(a * 200.0, p.z * 10.0))) * (1.0 - 0.4 * ring);
      metal = 1.0; rough = 0.3;
      if (sock < 0.07) { base = sock < 0.058 ? vec3(0.015) : BRASS * 0.8; rough = sock < 0.058 ? 0.8 : 0.25; }
    } else if (m < 10.5) {      // threshold: brushed steel plate with a brass nosing
      base = STEEL * (0.45 + 0.1 * noise(vec2(p.x * 700.0, p.z * 6.0)));
      metal = 1.0; rough = 0.34;
      if (p.z > -0.05) { base = BRASS * 0.85; rough = 0.22; }
    } else {                    // oak pallet
      float grain = fbm(vec2(p.x * 3.0, p.z * 90.0)) * 0.6 + noise(vec2(p.x * 40.0, p.z * 400.0)) * 0.4;
      base = vec3(0.13, 0.075, 0.04) * (0.6 + 0.6 * grain);
      metal = 0.0; rough = 0.62;
    }

    // how far into the vault this point is: outside lights fade, the vault's own lamps take over
    float inside = smoothstep(0.0, -0.6, p.z);
    float open = smoothstep(0.0, 0.9, uOpen);

    vec3 F0 = mix(vec3(0.04), base, metal);
    vec3 diffC = base * (1.0 - metal);
    float occ = ao(p, n);
    vec3 lit = vec3(0.0);

    // outside: warm key from upper left (a spot centred on the door) and a cool rim
    if (inside < 0.999) {
      vec3 L1 = normalize(vec3(-0.55, 0.65, 0.75));
      float spot = mix(0.12, 1.0, smoothstep(3.4, 0.8, length(p.xy - vec2(0.1, 0.25))));
      float sh = softShadow(p + n * 0.003, L1);
      lit += ggx(n, v, L1, F0, diffC, rough) * sh * vec3(1.0, 0.9, 0.78) * 3.2 * spot * (1.0 - inside);
      vec3 L2 = normalize(vec3(0.85, 0.15, 0.45));
      lit += (diffC * 0.3 + F0 * 0.25) * max(dot(n, L2), 0.0) * vec3(0.45, 0.55, 0.75) * 0.35 * (1.0 - inside);
    }
    // inside: three ceiling lamps; only the gold and its pallet cast shadows worth marching
    float reach = max(inside, 0.35 * open * smoothstep(0.6, -0.3, p.z));
    if (reach > 0.0) {
      float s1 = 1.0, s2 = 1.0;
      if (length(p.xz - STACK.xz) < 1.0 && p.y < STACK.y + NL * LP + 0.02) {
        s1 = stackShadow(p + n * 0.002, normalize(LMP1 - p), 2.0);
        s2 = stackShadow(p + n * 0.002, normalize(LMP2 - p), 2.0);
      }
      vec3 li = lamp(p, n, v, LMP0, F0, diffC, rough, 1.0) + lamp(p, n, v, LMP1, F0, diffC, rough, s1) + lamp(p, n, v, LMP2, F0, diffC, rough, s2);
      lit += li * reach * mix(0.6, 1.0, occ);
    }
    // reflections: the studio outside, a picture of the room inside
    vec3 refl = reflect(rd, n);
    vec3 Fv = F0 + (1.0 - F0) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 envC = env(refl, rough) * mix(1.0, 0.55, inside * (1.0 - open));
    if (inside > 0.0) envC = mix(envC, roomRadiance(p + n * 0.002, refl, rough, m > 6.5 && m < 7.5 ? 0.0 : (m < 6.5 && n.y < 0.7 ? 0.3 : 1.0)), inside);
    lit += envC * Fv * mix(0.35, 1.0, metal) * occ;
    lit += diffC * (0.02 + 0.05 * inside) * occ;
    // gold: the warm bounce of the room off every face, so the bars never go olive in shadow
    if (m > 6.5 && m < 7.5) lit += base * 0.09 * occ * inside;
    lit += emit;

    col = lit;
    // distance haze outside
    col = mix(col, vec3(0.006, 0.005, 0.004), 1.0 - exp(-0.015 * t * t * (1.0 - inside)));
  }

  // lamps blooming in the vault's air
  {
    float glow = 0.0;
    for (int k = 0; k < 3; k++) {
      vec3 L = k == 0 ? LMP0 : (k == 1 ? LMP1 : LMP2);
      float tl = dot(L - ro, rd);
      if (tl > 0.0 && (!hit || tl < t + 0.05)) {
        vec3 cp = ro + rd * tl - L;
        glow += 0.0007 / (dot(cp, cp) + 0.0025);
      }
    }
    col += LAMP * glow * smoothstep(0.1, 0.9, uOpen);
  }
  // light spilling out of the opening, as a glow over the frame
  {
    vec3 oc = -ro;
    float tc = dot(oc, rd);
    vec3 cp = ro + rd * max(tc, 0.0);
    float glow = exp(-pow(length(cp.xy) * 1.1, 2.0)) * smoothstep(0.2, 1.4, uOpen);
    col += GOLD * glow * 0.07 * (1.0 - smoothstep(0.3, 0.5, uCam));
  }

  // vignette and grade
  vec2 suv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float vig = smoothstep(1.25, 0.25, length(suv * vec2(0.85, 1.0)));
  col *= mix(0.35, 1.0, vig);
  col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}
`;
