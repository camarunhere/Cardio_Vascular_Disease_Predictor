import { useEffect, useRef, useState } from "react";
import { api, downloadPdf } from "./api";
import { UK_CARDIAC_CENTRES } from "./ukCardiacCentres";
import {
  Alert, Button, Card, Field, RiskBadge, RiskResult, Skeleton, Spinner,
  TrendChart, fmtDate, inputCls,
} from "./ui";

const EMPTY_FORM = {
  // Personal
  age_years: "", gender: "", height_cm: "", weight_kg: "",
  // Vitals / blood work
  ap_hi: "", ap_lo: "", cholesterol: "", gluc: "",
  // Medical history
  prior_heart_disease: false, hypertension_dx: false, diabetes: false,
  high_chol_dx: false, family_history: false, medications: "",
  // Wearable
  resting_hr: "", hrv_ms: "", spo2: "", resp_rate: "", body_temp: "",
  // Clinical test reports
  ecg_result: "0", lvef: "", tmt_result: "0", cac_score: "",
  // Lifestyle
  smoke: false, alco: false, active: false,
  daily_steps: "", sleep_hours: "", sleep_quality: "5", stress_level: "5", exercise_freq: "2",
};

/* ------------------------------ Medication reminders ------------------------------ */

function useReminderNotifications(reminders) {
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = now.toDateString();
      for (const r of reminders) {
        if (!r.enabled || r.time !== hhmm) continue;
        const key = `medfired_${r.id}_${today}`;
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, "1");
        new Notification("💊 Medication reminder", {
          body: `Time to take: ${r.medication}`,
          tag: key,
        });
      }
    };
    check();
    const iv = setInterval(check, 20000);
    return () => clearInterval(iv);
  }, [reminders]);
}

function MedicationReminders() {
  const [reminders, setReminders] = useState([]);
  const [med, setMed] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [perm, setPerm] = useState(
    "Notification" in window ? Notification.permission : "unsupported"
  );

  const refresh = () => api("/api/patient/reminders").then(setReminders).catch(() => {});
  useEffect(() => { refresh(); }, []);
  useReminderNotifications(reminders);

  const add = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api("/api/patient/reminders", { method: "POST", body: { medication: med, time } });
      setMed(""); setTime("");
      refresh();
    } catch (err) { setError(err.message); }
  };

  const remove = async (id) => {
    try { await api(`/api/patient/reminders/${id}`, { method: "DELETE" }); refresh(); } catch { /* noop */ }
  };

  const askPermission = async () => {
    const p = await Notification.requestPermission();
    setPerm(p);
  };

  return (
    <Card title="💊 Medication Reminders">
      {perm === "default" && (
        <button onClick={askPermission}
          className="w-full mb-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-blue-100 transition">
          🔔 Enable browser notifications for tablet reminders
        </button>
      )}
      {perm === "denied" && (
        <p className="text-xs text-amber-600 mb-3">
          Notifications are blocked in your browser settings — reminders are saved but won't pop up.
        </p>
      )}
      <Alert>{error}</Alert>

      {reminders.length > 0 && (
        <ul className="divide-y divide-slate-100 mb-4">
          {reminders.map((r) => (
            <li key={r.id} className="py-2 flex items-center gap-3 text-sm">
              <span className="text-lg">💊</span>
              <span className="font-medium text-slate-800">{r.medication}</span>
              <span className="ml-auto font-mono text-slate-500">{r.time}</span>
              <button onClick={() => remove(r.id)}
                className="text-xs text-slate-400 hover:text-red-600 transition font-semibold">✕</button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex gap-2 flex-wrap">
        <input className={`${inputCls} flex-1 min-w-[140px]`} placeholder="Tablet name, e.g. Amlodipine 5mg"
          value={med} onChange={(e) => setMed(e.target.value)} required minLength={2} />
        <input type="time" className={`${inputCls} w-32`} value={time}
          onChange={(e) => setTime(e.target.value)} required />
        <Button type="submit">Add</Button>
      </form>
      <p className="text-xs text-slate-400 mt-2">
        You'll get a browser notification at each time while the site is open in a tab.
      </p>
    </Card>
  );
}

/* --------------------------------- Nearby hospitals --------------------------------- */

const TIER_STYLES = {
  low: { box: "bg-green-50 border-green-200 text-green-800", title: "GP & Cardiology Clinics Near You" },
  medium: { box: "bg-amber-50 border-amber-200 text-amber-800", title: "Cardiology Departments Near You" },
  high: { box: "bg-red-50 border-red-300 text-red-800", title: "Cardiac Emergency Centres Near You" },
};

function UkDirectory({ highRisk }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-700 transition"
      >
        <span className={`text-xs text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        🇬🇧 UK cardiac centres directory
        <span className="text-xs font-normal text-slate-400">(Bedford · London · Wales · Sussex)</span>
      </button>
      {open && (
        <div className="mt-4 space-y-5 animate-fade-in-up">
          {UK_CARDIAC_CENTRES.map((region) => (
            <div key={region.region}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{region.region}</h4>
              <ul className="divide-y divide-slate-100">
                {region.entries.map((c) => (
                  <li key={c.name} className={`py-2.5 ${highRisk && !c.emergency ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">{c.name}</span>
                      {c.rating != null && (
                        <span className="text-xs font-semibold text-amber-600">★ {c.rating}</span>
                      )}
                      <span className="text-xs text-slate-400">{c.type}</span>
                      {c.emergency && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">EMERGENCY CARE</span>
                      )}
                      <span className="ml-auto flex gap-3 text-xs font-semibold">
                        <a className="text-blue-600 hover:underline" href={c.website} target="_blank" rel="noreferrer">Website</a>
                        <a className="text-blue-600 hover:underline" href={c.directions} target="_blank" rel="noreferrer">Directions</a>
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {c.blurb}{c.operator ? ` — ${c.operator}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NearbyCare({ riskLevel }) {
  const [state, setState] = useState("idle"); // idle | locating | loading | done | error
  const [hospitals, setHospitals] = useState([]);
  const [error, setError] = useState("");
  const [coords, setCoords] = useState(null);
  const [place, setPlace] = useState("");
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [tier, setTier] = useState(riskLevel || null);
  const [tierLabel, setTierLabel] = useState(null);

  const s = TIER_STYLES[tier] || TIER_STYLES.medium;

  const mapsSearchUrl = coords
    ? `https://www.google.com/maps/search/heart+hospital/@${coords.lat},${coords.lon},13z`
    : `https://www.google.com/maps/search/heart+hospital+near+me`;

  const fetchHospitals = async (query) => {
    setState("loading");
    setError("");
    try {
      const res = await api(`/api/patient/hospitals?${query}`);
      setHospitals(res.hospitals);
      setResolvedLocation(res.resolved_location || null);
      setTier(res.tier || null);
      setTierLabel(res.tier_label || null);
      setState("done");
    } catch (err) {
      setError(err.message);
      setState("error");
    }
  };

  const searchByPlace = (e) => {
    e.preventDefault();
    if (place.trim().length < 2) return;
    setResolvedLocation(null);
    fetchHospitals(`q=${encodeURIComponent(place.trim())}`);
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location — search by city or area name below instead.");
      setState("error");
      return;
    }
    setState("locating");
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
        setResolvedLocation(null);
        fetchHospitals(`lat=${latitude}&lon=${longitude}`);
      },
      (err) => {
        setError(
          err.code === 1
            ? "Location permission denied by the browser. Allow location access (click the icon near the address bar), or search by city below."
            : err.code === 3
              ? "Getting your location timed out. Try again, or search by city below."
              : "Your device couldn't determine its location (on a Mac, check System Settings → Privacy & Security → Location Services is on for your browser). No problem — just type your city or area below."
        );
        setState("error");
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  };

  return (
    <Card title="🏥 Cardiac Hospitals Near You" className="animate-fade-in-up">
      <div className={`border rounded-xl px-4 py-3 text-sm font-medium mb-4 ${s.box}`}>
        {tierLabel || (
          tier === "low" ? "Based on your LOW risk — cardiology clinics near your location for a routine review."
          : tier === "high" ? "Based on your HIGH risk — cardiac emergency-capable centres near your location."
          : "Based on your risk — cardiology departments near your location."
        )}
      </div>

      <p className="text-sm font-semibold text-slate-700 mb-2">
        📍 Where are you right now? Enter your exact location to see cardiac hospitals around you:
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={searchByPlace} className="flex gap-2 flex-1 min-w-[260px]">
          <input
            className={inputCls}
            placeholder="Your exact area & city, e.g. Kempston, Bedford"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
          <Button type="submit" disabled={state === "loading" || place.trim().length < 2}>
            {state === "loading" && <Spinner />}Find
          </Button>
        </form>
        <span className="text-xs text-slate-400 font-semibold">OR</span>
        <Button variant="subtle" onClick={locate} disabled={state === "locating" || state === "loading"}>
          {state === "locating" && <Spinner />}
          {state === "locating" ? "Detecting…" : "Use my current location"}
        </Button>
      </div>
      <div className="mt-3"><Alert>{error}</Alert></div>
      {resolvedLocation && state === "done" && (
        <p className="text-xs text-slate-500 mt-2">📍 Cardiac facilities near: {resolvedLocation}</p>
      )}

      {(state === "error" || (state === "done" && !hospitals.length)) && (
        <a href={mapsSearchUrl} target="_blank" rel="noreferrer"
          className="inline-block mt-3 px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
          🗺️ Search cardiac hospitals on Google Maps ↗
        </a>
      )}

      {state === "done" && !hospitals.length && (
        <p className="text-sm text-slate-500 mt-4">
          No dedicated cardiac facilities found near that location on OpenStreetMap — use the
          Google Maps search above, or check the UK cardiac centres directory below.
        </p>
      )}

      {hospitals.length > 0 && (
        <ul className="divide-y divide-slate-100 mt-4">
          {hospitals.map((h, i) => (
            <li key={i} className="py-3 flex items-start gap-3 animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="text-xl mt-0.5">{h.heart_specialty ? "🫀" : h.type === "Hospital" ? "🏥" : "🩺"}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800 text-sm">{h.name}</span>
                  <span className="text-xs text-slate-400">{h.type}</span>
                  {h.heart_specialty && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">CARDIAC</span>
                  )}
                  {h.emergency && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">24×7 ER</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {h.distance_km} km away{h.address ? ` · ${h.address}` : ""}{h.phone ? ` · ${h.phone}` : ""}
                </div>
              </div>
              <span className="ml-auto flex-shrink-0 flex gap-2">
                {h.website && (
                  <a href={h.website} target="_blank" rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
                    Website
                  </a>
                )}
                {h.phone && (
                  <a href={`tel:${h.phone}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
                    Call
                  </a>
                )}
                <a href={h.directions_url} target="_blank" rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition">
                  Directions ↗
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}

      <UkDirectory highRisk={tier === "high"} />

      <p className="text-xs text-slate-400 mt-4">
        ⚠️ If you are experiencing chest pain, severe breathlessness or fainting right now,
        call your local emergency number immediately — do not wait for directions.
      </p>
    </Card>
  );
}

export default function PatientPortal({ tab }) {
  if (tab === "dashboard") return <Dashboard />;
  if (tab === "assess") return <Assessment />;
  if (tab === "progress") return <Progress />;
  if (tab === "history") return <History />;
  if (tab === "upload") return <Upload />;
  if (tab === "profile") return <Profile />;
  return null;
}

/* ---------------------------------- Dashboard ---------------------------------- */

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/patient/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Card><Skeleton lines={4} /></Card>;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {data.alert_status === "high_risk" && (
        <div className="flex items-start gap-3 bg-red-600 text-white rounded-xl p-4">
          <span className="text-xl leading-none">⚠️</span>
          <div className="text-sm">
            <div className="font-bold">Your latest assessment is HIGH RISK</div>
            Please consult a doctor promptly to review these results.
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-4 gap-4">
        <Card>
          <Stat label="Patient ID" value={<span className="font-mono text-lg">{data.patient_id || "—"}</span>} />
          <div className="text-xs text-slate-400 mt-1">Research ID: {data.anon_id || "—"}</div>
        </Card>
        <Card><Stat label="Total assessments" value={data.total_assessments} /></Card>
        <Card>
          <Stat
            label="Latest result"
            value={data.latest ? <RiskBadge level={data.latest.risk_level} probability={data.latest.risk_probability} /> : "—"}
          />
        </Card>
        <Card><Stat label="Uploaded reports" value={data.uploads.length} /></Card>
      </div>

      <MedicationReminders />

      {data.reminders.length > 0 && (
        <Card title="💧 Daily Health Reminders">
          <ul className="grid sm:grid-cols-2 gap-2">
            {data.reminders.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-blue-500">✓</span>{r}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.risk_trend.length >= 2 && (
        <Card title="Risk Probability Over Time">
          <TrendChart
            points={data.risk_trend.map((p) => ({ date: p.date, value: p.risk_probability }))}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            domain={[0, 1]}
          />
          <p className="text-xs text-slate-400 mt-2">Hover over the chart to inspect each assessment.</p>
        </Card>
      )}

      {data.latest && (
        <Card title="Latest AI Prediction">
          <RiskResult record={data.latest} />
        </Card>
      )}

      {data.recommendations.length > 0 && (
        <Card title="Clinical Recommendations from Your Doctor">
          <ul className="space-y-3">
            {data.recommendations.map((r) => (
              <li key={r.id} className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                <div className="text-slate-700">{r.recommendation}</div>
                <div className="text-xs text-slate-400 mt-1">{r.doctor} · {fmtDate(r.created_at)}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!data.latest && (
        <Card>
          <p className="text-sm text-slate-500">
            No assessments yet — go to <strong>New Assessment</strong> to check your
            cardiovascular risk. Your wearable data can be synced there too.
          </p>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

/* ------------------------------- Assessment form ------------------------------- */

function HintChip({ tone, children }) {
  const styles = {
    good: "bg-green-100 text-green-700",
    warn: "bg-amber-100 text-amber-700",
    bad: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs font-semibold animate-fade-in-up ${styles[tone]}`}>
      {children}
    </span>
  );
}

function bmiHint(height, weight) {
  const h = +height, w = +weight;
  if (!h || !w) return null;
  const bmi = w / (h / 100) ** 2;
  if (!isFinite(bmi) || bmi < 8 || bmi > 80) return null;
  const v = bmi.toFixed(1);
  if (bmi < 18.5) return <HintChip tone="warn">BMI {v} — underweight</HintChip>;
  if (bmi < 25) return <HintChip tone="good">BMI {v} — healthy range</HintChip>;
  if (bmi < 30) return <HintChip tone="warn">BMI {v} — overweight</HintChip>;
  return <HintChip tone="bad">BMI {v} — obese</HintChip>;
}

function bpHint(hi, lo) {
  const s = +hi, d = +lo;
  if (!s || !d) return null;
  if (s > 180 || d > 120) return <HintChip tone="bad">Hypertensive crisis range — seek care</HintChip>;
  if (s >= 140 || d >= 90) return <HintChip tone="bad">Stage 2 hypertension range</HintChip>;
  if (s >= 130 || d >= 80) return <HintChip tone="warn">Stage 1 hypertension range</HintChip>;
  if (s >= 120) return <HintChip tone="warn">Elevated</HintChip>;
  return <HintChip tone="good">Normal blood pressure</HintChip>;
}

function lvefHint(v) {
  const x = +v;
  if (v === "" || !isFinite(x)) return null;
  if (x < 40) return <HintChip tone="bad">Reduced ejection fraction</HintChip>;
  if (x < 55) return <HintChip tone="warn">Borderline ejection fraction</HintChip>;
  return <HintChip tone="good">Normal ejection fraction</HintChip>;
}

function cacHint(v) {
  const x = +v;
  if (v === "" || !isFinite(x)) return null;
  if (x === 0) return <HintChip tone="good">No detectable calcium</HintChip>;
  if (x < 100) return <HintChip tone="warn">Mild plaque burden</HintChip>;
  if (x < 400) return <HintChip tone="warn">Moderate plaque burden</HintChip>;
  return <HintChip tone="bad">Severe plaque burden</HintChip>;
}

const REQUIRED_NUM = [
  "age_years", "gender", "height_cm", "weight_kg", "ap_hi", "ap_lo",
  "cholesterol", "gluc", "resting_hr", "spo2", "daily_steps", "sleep_hours",
];

function Assessment() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [ecg, setEcg] = useState(null);

  // Prefill medical history from the saved profile.
  useEffect(() => {
    api("/api/patient/profile").then((p) => {
      const h = p.medical_history || {};
      setForm((f) => ({
        ...f,
        prior_heart_disease: !!h.priorHeartDisease,
        hypertension_dx: !!h.hypertension,
        diabetes: !!h.diabetes,
        high_chol_dx: !!h.highCholesterol,
        family_history: !!h.familyHistory,
        medications: h.medications || "",
      }));
    }).catch(() => {});
  }, []);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const syncWearable = async () => {
    setSyncing(true);
    setError("");
    try {
      const w = await api("/api/patient/wearable/sample");
      setEcg(w.ecg_rhythm);
      setForm((f) => ({
        ...f,
        resting_hr: String(w.resting_hr),
        hrv_ms: String(w.hrv_ms),
        ap_hi: String(w.ap_hi),
        ap_lo: String(w.ap_lo),
        spo2: String(w.spo2),
        resp_rate: String(w.resp_rate),
        body_temp: String(w.body_temp),
        daily_steps: String(w.daily_steps),
        sleep_hours: String(w.sleep_hours),
        sleep_quality: String(w.sleep_quality),
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const filled = REQUIRED_NUM.filter((k) => form[k] !== "").length;
  const progress = Math.round((filled / REQUIRED_NUM.length) * 100);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = {
        age_years: +form.age_years, gender: +form.gender,
        height_cm: +form.height_cm, weight_kg: +form.weight_kg,
        ap_hi: +form.ap_hi, ap_lo: +form.ap_lo,
        cholesterol: +form.cholesterol, gluc: +form.gluc,
        prior_heart_disease: form.prior_heart_disease ? 1 : 0,
        hypertension_dx: form.hypertension_dx ? 1 : 0,
        diabetes: form.diabetes ? 1 : 0,
        high_chol_dx: form.high_chol_dx ? 1 : 0,
        family_history: form.family_history ? 1 : 0,
        on_meds: form.medications.trim() ? 1 : 0,
        resting_hr: +form.resting_hr,
        hrv_ms: form.hrv_ms === "" ? 45 : +form.hrv_ms,
        spo2: +form.spo2,
        resp_rate: form.resp_rate === "" ? 15 : +form.resp_rate,
        body_temp: form.body_temp === "" ? 36.8 : +form.body_temp,
        ecg_result: +form.ecg_result,
        lvef: form.lvef === "" ? 62 : +form.lvef,
        tmt_result: +form.tmt_result,
        cac_score: form.cac_score === "" ? 0 : +form.cac_score,
        smoke: form.smoke ? 1 : 0, alco: form.alco ? 1 : 0, active: form.active ? 1 : 0,
        daily_steps: +form.daily_steps,
        sleep_hours: +form.sleep_hours,
        sleep_quality: +form.sleep_quality,
        stress_level: +form.stress_level,
        exercise_freq: +form.exercise_freq,
      };
      const record = await api("/api/patient/predict", { method: "POST", body });
      setResult(record);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {result && (
        <Card title="Your AI Prediction Result">
          <RiskResult record={result} />
          <div className="mt-4 flex gap-3 flex-wrap">
            <Button onClick={() => downloadPdf(`/api/patient/records/${result.id}/plan`, `weekly_health_plan_${result.id}.pdf`)}>
              📅 Download weekly health plan
            </Button>
            <Button variant="subtle" onClick={() => downloadPdf(`/api/patient/records/${result.id}/report`, `cvd_report_${result.id}.pdf`)}>
              Download PDF report
            </Button>
            <Button variant="subtle" onClick={() => { setResult(null); }}>
              New assessment
            </Button>
          </div>
        </Card>
      )}

      {result && <NearbyCare key={result.id} riskLevel={result.risk_level} />}

      <Alert>{error}</Alert>

      <form onSubmit={submit} className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-[width] duration-300"
              style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-semibold text-slate-500 w-28 text-right">
            {progress === 100 ? "Ready to check ✓" : `${progress}% complete`}
          </span>
        </div>

        <Card title="Personal Information">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Age (years)">
              <input type="number" className={inputCls} min={1} max={120} value={form.age_years} onChange={set("age_years")} placeholder="e.g. 45" required />
            </Field>
            <Field label="Gender">
              <select className={inputCls} value={form.gender} onChange={set("gender")} required>
                <option value="" disabled>Select…</option>
                <option value="2">Male</option>
                <option value="1">Female</option>
              </select>
            </Field>
            <Field label="Height (cm)">
              <input type="number" className={inputCls} min={120} max={220} value={form.height_cm} onChange={set("height_cm")} placeholder="e.g. 170" required />
            </Field>
            <Field label="Weight (kg)" hint={bmiHint(form.height_cm, form.weight_kg)}>
              <input type="number" step="0.1" className={inputCls} min={30} max={200} value={form.weight_kg} onChange={set("weight_kg")} placeholder="e.g. 75" required />
            </Field>
          </div>
        </Card>

        <Card title="Medical History">
          <div className="flex flex-wrap gap-3 mb-4">
            {[
              ["prior_heart_disease", "History of heart disease"],
              ["hypertension_dx", "High blood pressure (hypertension)"],
              ["diabetes", "Diabetes"],
              ["high_chol_dx", "High cholesterol (diagnosed)"],
              ["family_history", "Family history of heart disease"],
            ].map(([k, label]) => (
              <label key={k}
                className={`flex items-center gap-2 border rounded-lg px-4 py-2.5 text-sm font-medium cursor-pointer transition ${
                  form[k] ? "border-blue-400 bg-blue-50 text-blue-800" : "border-slate-200 hover:border-slate-300"
                }`}>
                <input type="checkbox" checked={form[k]} onChange={set(k)} className="w-4 h-4" />
                {label}
              </label>
            ))}
          </div>
          <Field label="Current medications (leave blank if none)">
            <input className={inputCls} value={form.medications} onChange={set("medications")}
              placeholder="e.g. Amlodipine 5mg, Metformin 500mg" />
          </Field>
        </Card>

        <Card title="Real-Time Physiological Data (wearable sensors)">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <Button type="button" variant="success" disabled={syncing} onClick={syncWearable}>
              {syncing && <Spinner />}⌚ Sync wearable device
            </Button>
            {ecg && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full animate-fade-in-up ${
                ecg.includes("Normal") ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}>
                ECG: {ecg}
              </span>
            )}
            <span className="text-xs text-slate-400">Simulated sensor feed — values can be edited manually.</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Systolic BP (mmHg)">
              <input type="number" className={inputCls} min={70} max={250} value={form.ap_hi} onChange={set("ap_hi")} placeholder="e.g. 120" required />
            </Field>
            <Field label="Diastolic BP (mmHg)" hint={bpHint(form.ap_hi, form.ap_lo)}>
              <input type="number" className={inputCls} min={40} max={180} value={form.ap_lo} onChange={set("ap_lo")} placeholder="e.g. 80" required />
            </Field>
            <Field label="Resting heart rate (bpm)">
              <input type="number" className={inputCls} min={30} max={220} value={form.resting_hr} onChange={set("resting_hr")} placeholder="e.g. 72" required />
            </Field>
            <Field label="Heart rate variability (ms)">
              <input type="number" step="0.1" className={inputCls} min={1} max={300} value={form.hrv_ms} onChange={set("hrv_ms")} placeholder="e.g. 45" />
            </Field>
            <Field label="Oxygen saturation SpO₂ (%)">
              <input type="number" step="0.1" className={inputCls} min={70} max={100} value={form.spo2} onChange={set("spo2")} placeholder="e.g. 97.5" required />
            </Field>
            <Field label="Respiratory rate (/min)">
              <input type="number" step="0.1" className={inputCls} min={6} max={60} value={form.resp_rate} onChange={set("resp_rate")} placeholder="e.g. 15" />
            </Field>
            <Field label="Body temperature (°C, optional)">
              <input type="number" step="0.01" className={inputCls} min={34} max={42} value={form.body_temp} onChange={set("body_temp")} placeholder="e.g. 36.8" />
            </Field>
            <Field label="Cholesterol (blood work)">
              <select className={inputCls} value={form.cholesterol} onChange={set("cholesterol")} required>
                <option value="" disabled>Select…</option>
                <option value="1">Normal</option>
                <option value="2">Above normal</option>
                <option value="3">Well above normal</option>
              </select>
            </Field>
            <Field label="Glucose (blood work)">
              <select className={inputCls} value={form.gluc} onChange={set("gluc")} required>
                <option value="" disabled>Select…</option>
                <option value="1">Normal</option>
                <option value="2">Above normal</option>
                <option value="3">Well above normal</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Clinical Test Reports (optional — enter if available)">
          <p className="text-xs text-slate-400 mb-4">
            Values from hospital/lab reports: 12-lead ECG, 2D Echocardiogram, Treadmill
            Test (TMT), and Coronary Artery Calcium (CAC) scan. Leave at the defaults if
            you don't have a report.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="ECG report finding">
              <select className={inputCls} value={form.ecg_result} onChange={set("ecg_result")}>
                <option value="0">Normal</option>
                <option value="1">ST-T wave abnormality</option>
                <option value="2">Left ventricular hypertrophy</option>
              </select>
            </Field>
            <Field label="2D Echo — ejection fraction LVEF (%)" hint={lvefHint(form.lvef)}>
              <input type="number" className={inputCls} min={10} max={85} value={form.lvef}
                onChange={set("lvef")} placeholder="e.g. 62 (normal 55–70)" />
            </Field>
            <Field label="Treadmill Test (TMT) result">
              <select className={inputCls} value={form.tmt_result} onChange={set("tmt_result")}>
                <option value="0">Not performed</option>
                <option value="1">Negative (normal)</option>
                <option value="2">Positive (inducible ischemia)</option>
              </select>
            </Field>
            <Field label="CAC score (Agatston)" hint={cacHint(form.cac_score)}>
              <input type="number" className={inputCls} min={0} max={5000} value={form.cac_score}
                onChange={set("cac_score")} placeholder="e.g. 0" />
            </Field>
          </div>
        </Card>

        <Card title="Lifestyle Data">
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <Field label="Daily activity (steps)">
              <input type="number" className={inputCls} min={0} max={100000} value={form.daily_steps} onChange={set("daily_steps")} placeholder="e.g. 7000" required />
            </Field>
            <Field label="Sleep duration (hours/night)">
              <input type="number" step="0.1" className={inputCls} min={0} max={24} value={form.sleep_hours} onChange={set("sleep_hours")} placeholder="e.g. 7.5" required />
            </Field>
            <Field label={`Sleep quality: ${form.sleep_quality}/10`}>
              <input type="range" className="w-full accent-blue-600" min={1} max={10} value={form.sleep_quality} onChange={set("sleep_quality")} />
            </Field>
            <Field label={`Stress level: ${form.stress_level}/10`}>
              <input type="range" className="w-full accent-blue-600" min={1} max={10} value={form.stress_level} onChange={set("stress_level")} />
            </Field>
            <Field label={`Exercise frequency: ${form.exercise_freq} day${form.exercise_freq === "1" ? "" : "s"}/week`}>
              <input type="range" className="w-full accent-blue-600" min={0} max={7} value={form.exercise_freq} onChange={set("exercise_freq")} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3">
            {[["smoke", "Smoker"], ["alco", "Drinks alcohol"], ["active", "Physically active"]].map(([k, label]) => (
              <label key={k}
                className={`flex items-center gap-2 border rounded-lg px-4 py-2.5 text-sm font-medium cursor-pointer flex-1 min-w-[140px] transition ${
                  form[k] ? "border-blue-400 bg-blue-50 text-blue-800" : "border-slate-200 hover:border-slate-300"
                }`}>
                <input type="checkbox" checked={form[k]} onChange={set(k)} className="w-4 h-4" />
                {label}
              </label>
            ))}
          </div>
        </Card>

        <Button type="submit" className="w-full py-3" disabled={busy}>
          {busy && <Spinner />}Check My Risk
        </Button>
      </form>
    </div>
  );
}

/* --------------------------------- Progress tab --------------------------------- */

const PROGRESS_CHARTS = [
  ["risk_probability", "Risk Score", (v) => `${(v * 100).toFixed(0)}%`, [0, 1]],
  ["weight_kg", "Weight (kg)", (v) => v.toFixed(1)],
  ["ap_hi", "Systolic BP (mmHg)", (v) => v.toFixed(0)],
  ["ap_lo", "Diastolic BP (mmHg)", (v) => v.toFixed(0)],
  ["resting_hr", "Resting Heart Rate (bpm)", (v) => v.toFixed(0)],
  ["daily_steps", "Daily Steps", (v) => Math.round(v).toLocaleString()],
  ["sleep_hours", "Sleep Duration (h)", (v) => v.toFixed(1)],
];

function Progress() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/patient/progress").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Card><Skeleton lines={4} /></Card>;
  if (data.series.length < 2)
    return (
      <Card title="Progress Tracking">
        <p className="text-sm text-slate-500">
          Complete at least two assessments to see your trends for risk score, blood
          pressure, heart rate, weight, activity, and sleep.
        </p>
      </Card>
    );

  return (
    <div className="grid md:grid-cols-2 gap-6 animate-fade-in-up">
      {PROGRESS_CHARTS.map(([key, title, format, domain]) => (
        <Card key={key} title={title}>
          <TrendChart
            points={data.series.map((s) => ({ date: s.date, value: s[key] }))}
            format={format}
            domain={domain}
          />
        </Card>
      ))}
    </div>
  );
}

/* ----------------------------------- History ----------------------------------- */

function History() {
  const [records, setRecords] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/patient/history").then(setRecords).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!records) return <Card><Skeleton lines={4} /></Card>;
  if (!records.length)
    return <Card><p className="text-sm text-slate-500">No past assessments yet.</p></Card>;

  return (
    <Card title="Health History" className="animate-fade-in-up">
      <ul className="divide-y divide-slate-100">
        {records.map((r) => (
          <li key={r.id} className="py-1">
            <button
              type="button"
              onClick={() => setOpen(open === r.id ? null : r.id)}
              className="w-full flex items-center gap-3 flex-wrap py-2 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition text-left"
            >
              <span className={`text-slate-400 text-xs transition-transform ${open === r.id ? "rotate-90" : ""}`}>▶</span>
              <span className="text-sm text-slate-600">{fmtDate(r.created_at)}</span>
              <RiskBadge level={r.risk_level} probability={r.risk_probability} />
              <span className="text-xs text-slate-400">
                BP {r.inputs.ap_hi}/{r.inputs.ap_lo} · {r.inputs.weight_kg} kg · HR {r.inputs.resting_hr}
              </span>
              <span
                role="button"
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadPdf(`/api/patient/records/${r.id}/report`, `cvd_report_${r.id}.pdf`);
                }}
              >
                PDF
              </span>
            </button>
            {open === r.id && <div className="mt-2 mb-3 pl-7"><RiskResult record={r} /></div>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------ Upload ------------------------------------ */

function ReportAnalysis({ analysis }) {
  if (!analysis) return null;
  if (analysis.status !== "ok") {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 animate-fade-in-up">
        {analysis.message}
      </div>
    );
  }
  return (
    <div className="space-y-4 animate-fade-in-up">
      {analysis.consult_cardiologist && (
        <div className="flex items-start gap-3 bg-red-600 text-white rounded-xl p-4">
          <span className="text-xl leading-none">⚠️</span>
          <div className="text-sm">
            <div className="font-bold">This report contains findings a cardiologist should review</div>
            Please share it with a cardiologist promptly.
          </div>
        </div>
      )}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          📋 What this report says
        </h3>
        <ul className="space-y-1.5">
          {analysis.explanation.map((line, i) => (
            <li key={i} className="text-sm text-slate-700 flex gap-2">
              <span className="text-blue-500 flex-shrink-0">•</span>{line}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          🥗 Diet recommendations based on this report
        </h3>
        <ul className="space-y-1.5">
          {analysis.diet.map((line, i) => (
            <li key={i} className="text-sm text-slate-700 flex gap-2">
              <span className="text-green-600 flex-shrink-0">•</span>{line}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-slate-400">
        These are general wellness suggestions generated automatically from your report and
        do not replace professional medical advice.
      </p>
    </div>
  );
}

function Upload() {
  const fileRef = useRef();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [uploads, setUploads] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(null);
  const [latestAnalysis, setLatestAnalysis] = useState(null);
  const [openId, setOpenId] = useState(null);

  const refresh = () =>
    api("/api/patient/uploads").then(setUploads).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const send = async (file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setMsg("");
    setLatestAnalysis(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api("/api/patient/upload", { method: "POST", formData });
      setMsg(res.message);
      setLatestAnalysis(res.analysis || null);
      setPending(null);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Upload ECG / Medical Report">
        <Alert>{error}</Alert>
        <Alert kind="success">{msg}</Alert>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            setPending(e.dataTransfer.files[0] || null);
          }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${
            dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
          }`}
        >
          <div className="text-3xl mb-2">📄</div>
          <p className="text-sm font-semibold text-slate-700">
            {dragging ? "Drop the file here" : "Drag & drop a file here, or click to browse"}
          </p>
          <p className="text-xs text-slate-400 mt-1">PDF, image, CSV, DICOM or XML — max 20 MB</p>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.dcm,.xml"
            onChange={(e) => setPending(e.target.files[0] || null)}
          />
        </div>

        {pending && (
          <div className="mt-4 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 animate-fade-in-up">
            <span className="text-sm text-slate-700 font-medium">{pending.name}</span>
            <span className="text-xs text-slate-400">{(pending.size / 1024).toFixed(1)} KB</span>
            <div className="ml-auto flex gap-2">
              <Button disabled={busy} onClick={() => send(pending)}>
                {busy && <Spinner />}Upload
              </Button>
              <Button variant="subtle" disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>

      {latestAnalysis && (
        <Card title="Report Analysis">
          <ReportAnalysis analysis={latestAnalysis} />
        </Card>
      )}

      {uploads.length > 0 && (
        <Card title="Your Uploaded Reports">
          <p className="text-xs text-slate-400 mb-2">
            Click a report to see its explanation and diet recommendations.
          </p>
          <ul className="divide-y divide-slate-100 text-sm">
            {uploads.map((u) => (
              <li key={u.id} className="py-1">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === u.id ? null : u.id)}
                  className="w-full flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition text-left"
                >
                  <span className={`text-slate-400 text-xs transition-transform ${openId === u.id ? "rotate-90" : ""}`}>▶</span>
                  <span className="text-slate-700">{u.filename}</span>
                  {u.analysis?.status === "ok" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">analyzed</span>
                  )}
                  <span className="ml-auto text-slate-400 text-xs">{fmtDate(u.uploaded_at)}</span>
                </button>
                {openId === u.id && (
                  <div className="pl-7 pb-3">
                    {u.analysis
                      ? <ReportAnalysis analysis={u.analysis} />
                      : <p className="text-sm text-slate-400">This report was uploaded before automatic analysis was added — re-upload it to analyze.</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------ Profile ------------------------------------ */

function Profile() {
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/patient/profile").then(setForm).catch((e) => setError(e.message));
  }, []);

  if (error && !form) return <Alert>{error}</Alert>;
  if (!form) return <Card><Skeleton lines={5} /></Card>;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setHist = (k) => (e) =>
    setForm({
      ...form,
      medical_history: { ...form.medical_history, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value },
    });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await api("/api/patient/profile", {
        method: "PUT",
        body: {
          full_name: form.full_name,
          phone: form.phone || null,
          date_of_birth: form.date_of_birth || null,
          address: form.address || null,
          medical_history: form.medical_history,
        },
      });
      setMsg(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const h = form.medical_history || {};

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Card title="Manage Profile">
        <Alert>{error}</Alert>
        <Alert kind="success">{msg}</Alert>
        <div className="flex gap-6 mb-4 text-sm">
          <div><span className="text-slate-400">Patient ID:</span> <span className="font-mono font-semibold">{form.patient_id || "—"}</span></div>
          <div><span className="text-slate-400">Anonymous research ID:</span> <span className="font-mono">{form.anon_id || "—"}</span></div>
        </div>
        <form onSubmit={submit} className="space-y-4 max-w-lg">
          <Field label="Full name">
            <input className={inputCls} value={form.full_name} onChange={set("full_name")} required minLength={2} />
          </Field>
          <Field label="Email">
            <input className={`${inputCls} bg-slate-50 text-slate-400`} value={form.email} disabled />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={form.phone || ""} onChange={set("phone")} />
          </Field>
          <Field label="Date of birth">
            <input type="date" className={inputCls} value={form.date_of_birth || ""} onChange={set("date_of_birth")} />
          </Field>
          <Field label="Address">
            <textarea className={inputCls} rows={3} value={form.address || ""} onChange={set("address")} />
          </Field>

          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 pt-2">Medical History</h3>
          <div className="flex flex-wrap gap-2">
            {[
              ["priorHeartDisease", "Heart disease"],
              ["hypertension", "Hypertension"],
              ["diabetes", "Diabetes"],
              ["highCholesterol", "High cholesterol"],
              ["familyHistory", "Family history"],
            ].map(([k, label]) => (
              <label key={k}
                className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer transition ${
                  h[k] ? "border-blue-400 bg-blue-50 text-blue-800" : "border-slate-200 hover:border-slate-300"
                }`}>
                <input type="checkbox" checked={!!h[k]} onChange={setHist(k)} className="w-4 h-4" />
                {label}
              </label>
            ))}
          </div>
          <Field label="Current medications">
            <input className={inputCls} value={h.medications || ""} onChange={setHist("medications")}
              placeholder="e.g. Amlodipine 5mg daily" />
          </Field>

          <Button type="submit" disabled={busy}>{busy && <Spinner />}Save changes</Button>
        </form>
      </Card>
    </div>
  );
}
