import { useEffect, useRef, useState } from "react";

export function Card({ title, children, className = "" }) {
  return (
    <div className={`bg-white/75 backdrop-blur-md border border-white/60 rounded-2xl shadow-lg shadow-slate-900/[0.07] p-6 transition-shadow hover:shadow-xl hover:shadow-slate-900/10 ${className}`}>
      {title && (
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const styles = {
    primary: "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-600/25",
    danger: "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-md shadow-red-600/25",
    subtle: "bg-white/70 hover:bg-white border border-slate-200 text-slate-700 shadow-sm",
    success: "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/25",
  };
  return (
    <button
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
      {children}
      {hint}
    </div>
  );
}

export const inputCls =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 hover:border-slate-400";

const LEVEL_STYLES = {
  high: { cls: "bg-red-100 text-red-700", label: "HIGH RISK" },
  medium: { cls: "bg-amber-100 text-amber-700", label: "MEDIUM RISK" },
  low: { cls: "bg-green-100 text-green-700", label: "LOW RISK" },
};

export function RiskBadge({ classification, probability, level }) {
  const lvl = level || (classification === "high_risk" ? "high" : "low");
  const s = LEVEL_STYLES[lvl] || LEVEL_STYLES.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${s.cls}`}>
      {s.label}
      {probability != null && ` ${(probability * 100).toFixed(1)}%`}
    </span>
  );
}

/** Animated number that counts up to `value` on mount / when value changes. */
function CountUp({ value, decimals = 1, duration = 800 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{display.toFixed(decimals)}</>;
}

const BANNER_STYLES = {
  high: { box: "bg-red-50 border-red-200", text: "text-red-600", bar: "bg-red-600", label: "High Risk" },
  medium: { box: "bg-amber-50 border-amber-200", text: "text-amber-600", bar: "bg-amber-500", label: "Medium Risk" },
  low: { box: "bg-green-50 border-green-200", text: "text-green-600", bar: "bg-green-600", label: "Low Risk" },
};

export function RiskResult({ record }) {
  const level = record.risk_level || (record.risk_classification === "high_risk" ? "high" : "low");
  const s = BANNER_STYLES[level] || BANNER_STYLES.low;
  const pct = record.risk_probability * 100;
  const maxAbs = Math.max(...record.explanation.map((f) => Math.abs(f.shap_contribution)), 1e-9);
  const [hovered, setHovered] = useState(null);

  return (
    <div className="animate-fade-in-up">
      {record.alert_status === "high_risk" && (
        <div className="flex items-start gap-3 bg-red-600 text-white rounded-xl p-4 mb-4 animate-fade-in-up">
          <span className="text-xl leading-none">⚠️</span>
          <div className="text-sm">
            <div className="font-bold">High-risk alert</div>
            Please consult a doctor promptly to review these results. This tool does not
            replace professional medical evaluation.
          </div>
        </div>
      )}
      <div className={`rounded-xl border p-6 mb-4 ${s.box}`}>
        <div className="flex items-center justify-between">
          <div className={`text-xs font-bold uppercase tracking-wide ${s.text}`}>{s.label}</div>
          {record.bmi != null && (
            <div className="text-xs text-slate-500 font-medium">BMI {record.bmi}</div>
          )}
        </div>
        <div className="text-4xl font-bold text-slate-900 my-2">
          <CountUp value={pct} />%
        </div>
        <div className="h-2.5 bg-black/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${s.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {record.main_reason && (
        <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 text-sm">
          <span className="text-lg leading-none">🎯</span>
          <div>
            <span className="font-semibold text-slate-800">Main reason: </span>
            <span className="text-slate-700">{record.main_reason}</span>
          </div>
        </div>
      )}

      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
        Key Contributing Factors (SHAP)
      </h3>
      <ul>
        {record.explanation.map((f, i) => {
          const up = f.direction === "increases_risk";
          const width = (Math.abs(f.shap_contribution) / maxAbs) * 100;
          return (
            <li
              key={i}
              className={`py-2 px-2 -mx-2 rounded-lg text-sm text-slate-700 cursor-default transition-colors ${
                hovered === i ? "bg-slate-50" : ""
              }`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="flex items-center gap-2.5">
                <span className={up ? "text-red-600" : "text-green-600"}>{up ? "▲" : "▼"}</span>
                <span>{f.factor}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {hovered === i
                    ? `SHAP ${f.shap_contribution > 0 ? "+" : ""}${f.shap_contribution.toFixed(3)}`
                    : up ? "increases risk" : "decreases risk"}
                </span>
              </div>
              <div className="mt-1.5 ml-6 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full animate-grow-bar ${up ? "bg-red-400" : "bg-green-400"}`}
                  style={{ width: `${width}%`, animationDelay: `${i * 90}ms` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {record.recommendations && <Recommendations data={record.recommendations} />}

      {record.review_note && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
          <div className="font-semibold text-blue-800 mb-1">Clinician review</div>
          <div className="text-slate-700">{record.review_note}</div>
        </div>
      )}
      <p className="text-xs text-slate-400 mt-4">
        These are general wellness recommendations generated by a machine learning model
        and do not replace professional medical advice.
      </p>
    </div>
  );
}

const REC_GROUPS = [
  ["diet", "🥗", "Diet"],
  ["exercise", "🏃", "Exercise"],
  ["sleep", "😴", "Sleep"],
  ["lifestyle", "🚭", "Lifestyle"],
  ["reminders", "💧", "Daily reminders"],
  ["tests", "🧪", "Recommended tests"],
];

export function Recommendations({ data }) {
  const [open, setOpen] = useState("diet");
  const groups = REC_GROUPS.filter(([key]) => data[key]?.length);
  if (!groups.length) return null;
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
        Personalized Wellness Recommendations
      </h3>
      {data.follow_up && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-3">
          {data.follow_up}
        </div>
      )}
      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
        {groups.map(([key, emoji, title]) => (
          <div key={key}>
            <button
              type="button"
              onClick={() => setOpen(open === key ? null : key)}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition text-left"
            >
              <span>{emoji}</span>
              {title}
              <span className="ml-auto text-xs text-slate-400">
                {data[key].length} tip{data[key].length === 1 ? "" : "s"}
              </span>
              <span className={`text-slate-400 text-xs transition-transform ${open === key ? "rotate-90" : ""}`}>▶</span>
            </button>
            {open === key && (
              <ul className="px-5 pb-3 space-y-1.5 animate-fade-in-up">
                {data[key].map((tip, i) => (
                  <li key={i} className="text-sm text-slate-600 flex gap-2">
                    <span className="text-slate-300">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Interactive single-series trend chart (the title names the series, so no
 * legend). Crosshair + tooltip on hover, recessive grid, 2px line.
 * `points`: [{date, value}]. `format(v)` renders axis/tooltip values.
 */
export function TrendChart({ points, format = (v) => String(v), domain }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  let [lo, hi] = domain || [Math.min(...values), Math.max(...values)];
  if (lo === hi) { lo -= 1; hi += 1; }
  if (!domain) {
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
  }

  const W = 640, H = 200;
  const PAD = { top: 12, right: 16, bottom: 24, left: 52 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const xs = points.map((_, i) => PAD.left + (i / (points.length - 1)) * iw);
  const ys = points.map((p) => PAD.top + (1 - (p.value - lo) / (hi - lo)) * ih);
  const path = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const area = `${path} L${xs[xs.length - 1].toFixed(1)},${PAD.top + ih} L${xs[0].toFixed(1)},${PAD.top + ih} Z`;

  const onMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i;
    setHover(best);
  };

  const fmtD = (iso) =>
    new Date(iso.endsWith("Z") ? iso : iso + "Z").toLocaleDateString(undefined, {
      month: "short", day: "numeric",
    });

  return (
    <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img"
        aria-label="Trend over time">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD.top + (1 - t) * ih;
          return (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + iw} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill="#94a3b8">
                {format(lo + t * (hi - lo))}
              </text>
            </g>
          );
        })}
        <text x={PAD.left} y={H - 6} fontSize="10" fill="#94a3b8">{fmtD(points[0].date)}</text>
        <text x={PAD.left + iw} y={H - 6} textAnchor="end" fontSize="10" fill="#94a3b8">
          {fmtD(points[points.length - 1].date)}
        </text>

        <path d={area} fill="#2563eb" opacity="0.08" />
        <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {hover != null && (
          <>
            <line x1={xs[hover]} x2={xs[hover]} y1={PAD.top} y2={PAD.top + ih}
              stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={xs[hover]} cy={ys[hover]} r="5" fill="#2563eb" stroke="#fff" strokeWidth="2" />
          </>
        )}
      </svg>

      {hover != null && (
        <div
          className="absolute -translate-x-1/2 -translate-y-full pointer-events-none bg-slate-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          style={{
            left: `${(xs[hover] / W) * 100}%`,
            top: `${(ys[hover] / H) * 100 - 4}%`,
          }}
        >
          <span className="font-semibold">{format(points[hover].value)}</span>
          <span className="text-slate-300 ml-1.5">{fmtD(points[hover].date)}</span>
        </div>
      )}
    </div>
  );
}

export function Alert({ kind = "error", children }) {
  if (!children) return null;
  const styles = {
    error: "bg-red-50 border-red-200 text-red-700",
    success: "bg-green-50 border-green-200 text-green-700",
    info: "bg-blue-50 border-blue-200 text-blue-700",
  };
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm mb-4 animate-fade-in-up ${styles[kind]}`}>
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin align-[-3px] mr-2" />
  );
}

export function Skeleton({ lines = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4 bg-slate-200 rounded"
          style={{ width: `${85 - i * 15}%`, animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}

export const fmtDate = (iso) =>
  new Date(iso.endsWith("Z") ? iso : iso + "Z").toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
