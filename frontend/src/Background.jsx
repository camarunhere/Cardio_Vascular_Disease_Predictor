import { useEffect, useRef } from "react";

/**
 * Quiet, slow-moving canvas backgrounds — one per page, each shaped around
 * what that page is for. Kept deliberately calm: soft strokes, low alpha,
 * gentle speed. The goal is a page that feels alive at a glance, never one
 * that competes with the content sitting on top of it.
 *
 * Variants:
 *   ecg        — a single slow heartbeat trace (login page)
 *   aurora     — softly drifting light (dashboard, the overview page)
 *   pulse      — a slow heartbeat ripple, occasionally (assessment — "checking")
 *   chartgrid  — a faint rising trend line over a quiet grid (progress)
 *   waves      — one calm horizon line (health history — a timeline)
 *   bubbles    — a few slow-rising particles (uploads — things going up)
 *   calm       — barely-there twinkling dots (profile — the quietest page)
 *   medic      — drifting medical crosses, sparse (doctor)
 *   network    — a sparse, slow node-link graph (admin)
 */
export default function Background({ variant }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W, H, dpr, raf;
    const mouse = { x: -9999, y: -9999, lastEmit: 0 };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    window.addEventListener("mousemove", onMove);

    const rand = (a, b) => a + Math.random() * (b - a);
    const state = init(variant);

    function init(v) {
      switch (v) {
        case "aurora":
          return {
            blobs: [
              { c: "59,130,246", r: 360, ox: 0.22, oy: 0.28, sp: 0.00006, ph: 0 },
              { c: "16,185,129", r: 320, ox: 0.78, oy: 0.24, sp: 0.00005, ph: 2 },
              { c: "168,85,247", r: 380, ox: 0.5, oy: 0.78, sp: 0.00004, ph: 4 },
            ],
          };
        case "pulse":
          return { ripples: [], lastSpawn: -99999 };
        case "chartgrid":
          return { dots: Array.from({ length: 14 }, () => ({
            x: rand(0, 1), y: rand(0, 1), v: rand(0.06, 0.16), r: rand(1, 2),
          })) };
        case "bubbles":
          return { bubbles: Array.from({ length: 10 }, () => ({
            x: rand(0, 1), y: rand(0, 1.2), r: rand(5, 16), v: rand(0.06, 0.18), drift: rand(-0.05, 0.05),
          })) };
        case "calm":
          return { stars: Array.from({ length: 26 }, () => ({
            x: rand(0, 1), y: rand(0, 1), r: rand(0.8, 1.8), ph: rand(0, Math.PI * 2), sp: rand(0.0004, 0.001),
          })) };
        case "medic":
          return { items: Array.from({ length: 12 }, () => ({
            x: rand(0, 1), y: rand(0, 1), s: rand(6, 11), vx: rand(-0.05, 0.05), vy: rand(-0.05, 0.05),
            rot: rand(0, Math.PI), vr: rand(-0.0008, 0.0008),
          })) };
        case "network":
          return { nodes: Array.from({ length: 22 }, () => ({
            x: rand(0, 1), y: rand(0, 1), vx: rand(-0.06, 0.06), vy: rand(-0.06, 0.06), r: rand(1.2, 2.2),
          })) };
        case "waves":
        case "ecg":
        default:
          return {};
      }
    }

    // Piecewise ECG waveform: flat → P → QRS spike → T → flat (period 1).
    const ecgY = (p) => {
      p = ((p % 1) + 1) % 1;
      if (p < 0.16) return 0;
      if (p < 0.22) return -6 * Math.sin(((p - 0.16) / 0.06) * Math.PI);          // P wave
      if (p < 0.26) return 0;
      if (p < 0.28) return 12 * ((p - 0.26) / 0.02);                               // Q dip
      if (p < 0.31) return 12 - 60 * ((p - 0.28) / 0.03);                          // R spike up
      if (p < 0.34) return -48 + 62 * ((p - 0.31) / 0.03);                         // S down
      if (p < 0.38) return 14 - 14 * ((p - 0.34) / 0.04);
      if (p < 0.55) return 0;
      if (p < 0.68) return -9 * Math.sin(((p - 0.55) / 0.13) * Math.PI);           // T wave
      return 0;
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, W, H);

      if (variant === "ecg") {
        // One quiet, slow heartbeat trace — calm, not attention-grabbing.
        ctx.beginPath();
        const y0 = H * 0.5, amp = 0.9, speed = 0.0022, period = 340;
        for (let x = 0; x <= W; x += 2) {
          const y = y0 + ecgY((x + t * speed * period) / period) * amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(225,29,72,0.22)";
        ctx.lineWidth = 1.75;
        ctx.stroke();
      }

      if (variant === "aurora") {
        for (const b of state.blobs) {
          const cx = W * b.ox + Math.sin(t * b.sp + b.ph) * W * 0.05;
          const cy = H * b.oy + Math.cos(t * b.sp * 1.3 + b.ph) * H * 0.05;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r);
          g.addColorStop(0, `rgba(${b.c},0.16)`);
          g.addColorStop(1, `rgba(${b.c},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(cx - b.r, cy - b.r, b.r * 2, b.r * 2);
        }
      }

      if (variant === "pulse") {
        // A slow, occasional heartbeat ripple — like a quiet monitor blip.
        if (t - state.lastSpawn > 3400) {
          state.lastSpawn = t;
          state.ripples.push({ x: rand(W * 0.15, W * 0.85), y: rand(H * 0.2, H * 0.8), r: 0, a: 0.22 });
        }
        state.ripples = state.ripples.filter((rp) => rp.a > 0.004);
        for (const rp of state.ripples) {
          rp.r += 0.7; rp.a *= 0.983;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(220,38,38,${rp.a})`;
          ctx.lineWidth = 1.25;
          ctx.stroke();
        }
      }

      if (variant === "chartgrid") {
        const offY = (t * 0.006) % 56;
        ctx.strokeStyle = "rgba(37,99,235,0.08)";
        ctx.lineWidth = 1;
        for (let y = -56; y < H + 56; y += 56) {
          ctx.beginPath(); ctx.moveTo(0, y - offY); ctx.lineTo(W, y - offY); ctx.stroke();
        }
        ctx.beginPath();
        for (let x = 0; x <= W; x += 4) {
          const y = H * 0.62 - Math.sin(x * 0.006 + t * 0.0003) * 34 - Math.sin(x * 0.0017 + t * 0.00015) * 56 - x * 0.03;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(22,163,74,0.2)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "rgba(37,99,235,0.16)";
        for (const d of state.dots) {
          d.y -= d.v / H * 0.6;
          if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
          ctx.beginPath();
          ctx.arc(d.x * W, d.y * H, d.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (variant === "waves") {
        // A single calm horizon line — a timeline, quietly breathing.
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 6) {
          const y = H * 0.78 + Math.sin(x * 0.005 + t * 0.00018) * 16;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = "rgba(13,148,136,0.09)";
        ctx.fill();
      }

      if (variant === "bubbles") {
        for (const b of state.bubbles) {
          b.y -= b.v / H * 0.5;
          b.x += b.drift / W * 0.4;
          if (b.y < -0.06) { b.y = 1.1; b.x = Math.random(); }
          const x = b.x * W, y = b.y * H;
          ctx.beginPath();
          ctx.arc(x, y, b.r, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(37,99,235,0.16)";
          ctx.lineWidth = 1.25;
          ctx.stroke();
        }
      }

      if (variant === "calm") {
        for (const s of state.stars) {
          const a = 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
          ctx.beginPath();
          ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(124,58,237,${a})`;
          ctx.fill();
        }
      }

      if (variant === "medic") {
        for (const it of state.items) {
          it.x += it.vx / W; it.y += it.vy / H; it.rot += it.vr;
          if (it.x < -0.05) it.x = 1.05; if (it.x > 1.05) it.x = -0.05;
          if (it.y < -0.05) it.y = 1.05; if (it.y > 1.05) it.y = -0.05;
          const x = it.x * W, y = it.y * H;
          ctx.save();
          ctx.translate(x, y); ctx.rotate(it.rot);
          ctx.fillStyle = "rgba(13,148,136,0.16)";
          const s = it.s;
          ctx.fillRect(-s / 6, -s / 2, s / 3, s);
          ctx.fillRect(-s / 2, -s / 6, s, s / 3);
          ctx.restore();
        }
      }

      if (variant === "network") {
        const pts = state.nodes;
        for (const n of pts) {
          n.x += n.vx / W; n.y += n.vy / H;
          if (n.x < 0 || n.x > 1) n.vx *= -1;
          if (n.y < 0 || n.y > 1) n.vy *= -1;
        }
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const dx = (pts[i].x - pts[j].x) * W, dy = (pts[i].y - pts[j].y) * H;
            const d = Math.hypot(dx, dy);
            if (d < 120) {
              ctx.beginPath();
              ctx.moveTo(pts[i].x * W, pts[i].y * H);
              ctx.lineTo(pts[j].x * W, pts[j].y * H);
              ctx.strokeStyle = `rgba(79,70,229,${0.14 * (1 - d / 120)})`;
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
        }
        ctx.fillStyle = "rgba(79,70,229,0.28)";
        for (const n of pts) {
          ctx.beginPath();
          ctx.arc(n.x * W, n.y * H, n.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    if (reduced) {
      draw(0); // static single frame for reduced-motion users
    } else {
      const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, [variant]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
}

/** Per-variant page tint — soft, light gradients so the quiet motion reads clearly. */
export const BG_TINTS = {
  ecg: "bg-gradient-to-br from-slate-50 via-rose-50 to-slate-100",
  aurora: "bg-gradient-to-br from-blue-50 via-slate-50 to-cyan-50",
  pulse: "bg-gradient-to-br from-rose-50 via-slate-50 to-orange-50",
  chartgrid: "bg-gradient-to-br from-emerald-50 via-slate-50 to-teal-50",
  waves: "bg-gradient-to-b from-cyan-50 via-slate-50 to-blue-50",
  bubbles: "bg-gradient-to-b from-sky-50 via-slate-50 to-indigo-50",
  calm: "bg-gradient-to-br from-violet-50 via-slate-50 to-purple-50",
  medic: "bg-gradient-to-br from-teal-50 via-slate-50 to-cyan-50",
  network: "bg-gradient-to-br from-indigo-50 via-slate-50 to-blue-50",
};
