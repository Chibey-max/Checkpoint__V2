"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { debugRender, pinnedScale, RENDER, renderTier } from "@/lib/perf";
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

    // Desktops and phones each have their own render settings (lib/perf.ts): phones get the lite shader and fewer pixels.
    const tier = renderTier();
    const cfg = RENDER[tier];
    const lite = cfg.lite;
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
    // Render scale (linear, 1 = the tier's full resolution). The auto-adjuster moves it between cfg.minScale and 1;
    // ?res= pins it.
    const pinned = pinnedScale();
    let scale = pinned ?? 1;

    function resize() {
      const r = canvas!.getBoundingClientRect();
      // Ray marching is per pixel: render at most cfg.maxPixels and let the browser scale the canvas up.
      let dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDpr);
      const px = r.width * r.height * dpr * dpr;
      if (px > cfg.maxPixels) dpr *= Math.sqrt(cfg.maxPixels / px);
      dpr *= scale;
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
    const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    let query: WebGLQuery | null = null;
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
      // time this draw on the GPU when the browser allows it (one query in flight at a time)
      const timing = timer && !query;
      if (timing) {
        query = gl!.createQuery();
        gl!.beginQuery(timer.TIME_ELAPSED_EXT, query!);
      }
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      if (timing) gl!.endQuery(timer.TIME_ELAPSED_EXT);
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
    // The auto-adjuster. Samples are GPU milliseconds per draw where the timer extension exists, otherwise frame
    // intervals (which include main-thread work, so their thresholds are looser). Every 20 samples it looks at the
    // 90th percentile, because the stutters come from the heaviest moments (the door opening, the walk inside), which
    // a median hides. Over target, it steps the scale down 12%; well under target twice running, it steps back up.
    // It never goes below the tier's floor.
    let samples: number[] = [];
    let calm = 0;
    let gpuMs = 0;
    const [over, under] = timer ? [cfg.targetMs, cfg.targetMs * 0.55] : [26, 18];
    const readQuery = () => {
      if (!query || !timer) return;
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return;
      const ok = !gl.getParameter(timer.GPU_DISJOINT_EXT);
      if (ok) samples.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(query);
      query = null;
    };
    const adjust = () => {
      if (samples.length < 20) return;
      const sorted = samples.sort((a, b) => a - b);
      const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
      samples = [];
      gpuMs = p90;
      if (pinned) return report();
      if (p90 > over && scale > cfg.minScale) {
        scale = Math.max(cfg.minScale, scale * 0.88);
        calm = 0;
        resize();
      } else if (p90 < under && scale < 1) {
        if (++calm >= 2) {
          scale = Math.min(1, scale / 0.88);
          calm = 0;
          resize();
        }
      } else calm = 0;
      report();
    };
    // ?debug=render: a small readout of what this device is rendering
    const readout = debugRender() ? document.createElement("div") : null;
    if (readout) {
      readout.style.cssText =
        "position:fixed;left:8px;bottom:8px;z-index:99;padding:6px 9px;border-radius:8px;background:rgb(0 0 0/.75);color:#f0cf8a;font:11px/1.4 ui-monospace,monospace;pointer-events:none";
      document.body.appendChild(readout);
    }
    const report = () => {
      if (readout)
        readout.textContent = `${tier}${lite ? " · lite shader" : ""} · ${canvas.width}×${canvas.height} · scale ${scale.toFixed(2)}${pinned ? " (pinned)" : ""} · ${timer ? "gpu" : "frame"} p90 ${gpuMs.toFixed(1)} ms`;
    };
    report();
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
      readQuery();
      if (dirty || moved) {
        draw();
        if (!timer) samples.push(ms);
        adjust();
      } else if (!timer) samples = [];
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
      readout?.remove();
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
