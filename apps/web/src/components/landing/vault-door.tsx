"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { isLiteDevice } from "@/lib/perf";
import { VAULT_DOOR_FRAG, VAULT_DOOR_LITE } from "./vault-door-shader";
import { seg, vaultPose } from "./vault-timeline";

export { vaultPose };

/**
 * The hero background: the vault door, drawn by one full-screen fragment shader. `progress` (0..1, owned by the
 * hero's scroll handler) drives the whole sequence: the wheel spins, the bolts pull back, the door swings open on
 * its hinge and the camera walks into the vault to the gold (timeline in vault-timeline.ts). The canvas only redraws when something on screen changed
 * (progress, pointer or size), stops off-screen, and caps its pixel count. Callers get `onUnsupported` when
 * WebGL2 isn't there and show the still poster instead.
 */

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export function VaultDoor({ progress, onUnsupported }: { progress: MutableRefObject<number>; onUnsupported?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "high-performance" });
    if (!gl) return void onUnsupported?.();

    // Phones and low-power devices get the lite shader and fewer pixels (lib/perf.ts).
    const lite = isLiteDevice();
    const shaders = (
      [
        [gl.VERTEX_SHADER, VERT],
        [gl.FRAGMENT_SHADER, lite ? VAULT_DOOR_LITE : VAULT_DOOR_FRAG],
      ] as const
    ).map(([type, src]) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    });
    const prog = gl.createProgram()!;
    shaders.forEach((sh) => gl.attachShader(prog, sh));
    gl.linkProgram(prog);
    // Where the driver allows it (KHR_parallel_shader_compile), the shader builds off the main thread: the intro and the
    // page keep moving while it compiles, instead of freezing for it. Status is only read once it's done.
    const parallel = gl.getExtension("KHR_parallel_shader_compile");

    const run = (): (() => void) => {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = Object.fromEntries(["uRes", "uWheel", "uBolt", "uOpen", "uCam", "uFrame", "uTilt", "uShift", "uNarrow", "uLamps", "uDay"].map((n) => [n, gl.getUniformLocation(prog, n)]));

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = { x: 0.55, zoom: 1, y: 0, sx: -0.24, sy: 0, narrow: 0 };
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    // Pixel budget; it steps down if a slower GPU can't hold the frame rate while the door is moving.
    let quality = 1;

    function resize() {
      const r = canvas!.getBoundingClientRect();
      // Ray marching is per pixel: render under the screen's resolution and let the browser scale it up.
      const budget = (r.width < 768 ? (lite ? 200_000 : 420_000) : lite ? 480_000 : 900_000) * quality;
      let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const px = r.width * r.height * dpr * dpr;
      if (px > budget) dpr *= Math.sqrt(budget / px);
      canvas!.width = Math.max(1, Math.round(r.width * dpr));
      canvas!.height = Math.max(1, Math.round(r.height * dpr));
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      // Wide screens: the door sits right of the copy. Narrow ones: centred, pulled back so it fits.
      const aspect = r.width / Math.max(1, r.height);
      const wide = r.width >= 1024 && aspect > 1.25;
      // Narrow screens put the door in the top half and leave the bottom half for the copy.
      frame.x = wide ? 0.55 : 0;
      frame.zoom = wide ? 1 : Math.min(1, Math.max(0.5, aspect * 1.15));
      frame.y = wide ? 0 : aspect < 0.55 ? -0.58 : aspect < 0.8 ? -0.42 : -0.2;
      // Inside, the gold slides aside for the Vault's card: left of it on wide screens, above it on narrow ones.
      frame.sx = wide ? -0.24 : 0;
      frame.sy = wide ? 0 : aspect < 0.8 ? 0.2 : 0.12;
      frame.narrow = wide ? 0 : Math.min(1, Math.max(0, (1.25 - aspect) / 0.8));
      dirty = true;
    }

    let dirty = true;
    let last = { p: -1, tx: 0, ty: 0 };
    // the theme: the hall is lit for whichever one is on, and eases across when it changes
    const isDay = () => (document.documentElement.dataset.theme === "light" ? 1 : 0);
    let day = isDay();
    let dayTo = day;
    function draw() {
      const p = reduced ? 0 : progress.current;
      const pose = vaultPose(p);
      gl!.uniform2f(U.uRes!, canvas!.width, canvas!.height);
      gl!.uniform1f(U.uWheel!, pose.wheel);
      gl!.uniform1f(U.uBolt!, pose.bolt);
      gl!.uniform1f(U.uOpen!, pose.open);
      gl!.uniform1f(U.uCam!, pose.cam);
      // The framing eases back to centre as the camera squares up to the door.
      const c = 1 - pose.centre;
      gl!.uniform3f(U.uFrame!, frame.x, frame.zoom + (1 - frame.zoom) * (1 - c), frame.y * c);
      gl!.uniform2f(U.uShift!, frame.sx * pose.shift, frame.sy * pose.shift);
      gl!.uniform1f(U.uNarrow!, frame.narrow);
      gl!.uniform3f(U.uLamps!, ...pose.lamps);
      gl!.uniform1f(U.uDay!, day);
      // Parallax fades out once the door starts opening, so the camera move stays clean.
      const k = 1 - seg(p, 0.05, 0.3);
      gl!.uniform2f(U.uTilt!, tilt.x * k, tilt.y * k);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      last = { p, tx: tilt.x, ty: tilt.y };
      dirty = false;
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const themeWatch = new MutationObserver(() => {
      dayTo = isDay();
      // nothing is animating (reduced motion, or the hero is off screen): just be right next time it's seen
      if (reduced || !raf) {
        day = dayTo;
        draw();
      }
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    if (reduced) {
      draw();
      const redraw = new ResizeObserver(() => draw());
      redraw.observe(canvas);
      return () => {
        ro.disconnect();
        redraw.disconnect();
        themeWatch.disconnect();
      };
    }

    let visible = true;
    let prev = performance.now();
    // frame times of consecutive redraws; if the median of 24 in a row is over ~22 ms, drop to 70% of the pixels
    // (floor 35%). The median, so one-off hitches (a card painting for the first time) don't cost resolution.
    let slow: number[] = [];
    const loop = (now: number) => {
      const ms = now - prev;
      const dt = Math.min(0.05, ms / 1000);
      prev = now;
      tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 2.5);
      tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 2.5);
      if (day !== dayTo) {
        day += (dayTo - day) * Math.min(1, dt * 7);
        if (Math.abs(dayTo - day) < 0.004) day = dayTo;
        dirty = true;
      }
      const moved = Math.abs(progress.current - last.p) > 1e-4 || Math.abs(tilt.x - last.tx) > 1e-3 || Math.abs(tilt.y - last.ty) > 1e-3;
      if (dirty || moved) {
        draw();
        slow.push(ms);
        if (slow.length >= (lite ? 12 : 24)) {
          const median = slow.sort((a, b) => a - b)[slow.length >> 1]!;
          slow = [];
          if (median > 22 && quality > 0.3) {
            quality = Math.max(0.3, quality * 0.7);
            resize();
          }
        }
      } else slow = [];
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!raf && visible && !document.hidden) {
        prev = performance.now();
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
      tilt.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      tilt.ty = -(e.clientY / window.innerHeight - 0.5) * 2;
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
      themeWatch.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("webglcontextlost", onLost);
    };
    };

    let poll = 0;
    let dead = false;
    let stop: (() => void) | undefined;
    const whenBuilt = () => {
      if (dead) return;
      if (parallel && !gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR)) {
        poll = requestAnimationFrame(whenBuilt);
        return;
      }
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(prog), ...shaders.map((sh) => gl.getShaderInfoLog(sh)));
        return void onUnsupported?.();
      }
      stop = run();
    };
    whenBuilt();
    return () => {
      dead = true;
      cancelAnimationFrame(poll);
      stop?.();
    };
    // progress is a ref; the effect wires it once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 block size-full" aria-hidden />;
}
