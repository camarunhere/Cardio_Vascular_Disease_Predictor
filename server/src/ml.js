// Client for the Python ML microservice (scikit-learn + SHAP, port 8001).
const ML_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8001";

async function call(path, options = {}) {
  let res;
  try {
    res = await fetch(`${ML_URL}${path}`, options);
  } catch {
    throw Object.assign(new Error("AI model service is unavailable."), { status: 503 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail
      : Array.isArray(data.detail) && data.detail[0]?.msg
        ? `${data.detail[0].loc?.slice(-1)[0]}: ${data.detail[0].msg}` : "Prediction failed.";
    throw Object.assign(new Error(detail), { status: res.status === 422 ? 422 : 502 });
  }
  return data;
}

export const mlPredict = (features) =>
  call("/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(features),
  });

export const mlMetadata = () => call("/metadata");
export const mlRetrain = () => call("/retrain", { method: "POST" });
export const mlReload = () => call("/reload", { method: "POST" });
export const mlHealth = () => call("/health");

// ---- Humanize SHAP feature names into patient-readable labels ---------------

const LEVELS = { 1: "normal", 2: "above normal", 3: "well above normal" };

const NUM_LABELS = {
  age_years: (x) => `Age (${x.age_years} years)`,
  bmi: (x) => `BMI (${(x.weight_kg / (x.height_cm / 100) ** 2).toFixed(1)})`,
  ap_hi: (x) => `Systolic blood pressure (${x.ap_hi} mmHg)`,
  ap_lo: (x) => `Diastolic blood pressure (${x.ap_lo} mmHg)`,
  pulse_pressure: (x) => `Pulse pressure (${x.ap_hi - x.ap_lo} mmHg)`,
  resting_hr: (x) => `Resting heart rate (${x.resting_hr} bpm)`,
  hrv_ms: (x) => `Heart rate variability (${x.hrv_ms} ms)`,
  spo2: (x) => `Oxygen saturation (${x.spo2}% SpO₂)`,
  resp_rate: (x) => `Respiratory rate (${x.resp_rate}/min)`,
  body_temp: (x) => `Body temperature (${x.body_temp} °C)`,
  sleep_hours: (x) => `Sleep duration (${x.sleep_hours} h/night)`,
  sleep_quality: (x) => `Sleep quality (${x.sleep_quality}/10)`,
  stress_level: (x) => `Stress level (${x.stress_level}/10)`,
  daily_steps: (x) => `Daily activity (${Math.round(x.daily_steps).toLocaleString()} steps)`,
  exercise_freq: (x) => `Exercise frequency (${x.exercise_freq} days/week)`,
  lvef: (x) => `Ejection fraction (${x.lvef}% LVEF, 2D Echo)`,
  cac_score: (x) => `Coronary calcium score (${Math.round(x.cac_score)} Agatston)`,
};

const ECG_TEXT = ["normal", "ST-T abnormality", "left ventricular hypertrophy"];
const TMT_TEXT = ["not performed", "negative", "positive — inducible ischemia"];

const CAT_LABELS = {
  gender: (x) => (x.gender === 2 ? "Male" : "Female"),
  cholesterol: (x) => `Cholesterol (${LEVELS[x.cholesterol]})`,
  gluc: (x) => `Glucose (${LEVELS[x.gluc]})`,
  smoke: (x) => (x.smoke ? "Smoker" : "Non-smoker"),
  alco: (x) => (x.alco ? "Alcohol consumption" : "No alcohol consumption"),
  active: (x) => (x.active ? "Physically active" : "Physically inactive"),
  diabetes: (x) => (x.diabetes ? "Diabetes" : "No diabetes"),
  hypertension_dx: (x) => (x.hypertension_dx ? "Diagnosed hypertension" : "No hypertension diagnosis"),
  high_chol_dx: (x) => (x.high_chol_dx ? "Diagnosed high cholesterol" : "No high-cholesterol diagnosis"),
  family_history: (x) => (x.family_history ? "Family history of heart disease" : "No family history"),
  prior_heart_disease: (x) => (x.prior_heart_disease ? "History of heart disease" : "No prior heart disease"),
  on_meds: (x) => (x.on_meds ? "Taking medications" : "No current medications"),
  ecg_result: (x) => `ECG report (${ECG_TEXT[x.ecg_result] || "normal"})`,
  tmt_result: (x) => `Treadmill test (${TMT_TEXT[x.tmt_result] || "not performed"})`,
};

export function humanizeExplanation(explanation, inputs) {
  const out = [];
  const seen = new Set();
  for (const item of explanation) {
    let label = null;
    if (item.feature.startsWith("num__")) {
      const fn = NUM_LABELS[item.feature.slice(5)];
      label = fn ? fn(inputs) : null;
    } else if (item.feature.startsWith("cat__")) {
      const base = item.feature.slice(5).replace(/_\d+(\.\d+)?$/, "");
      const fn = CAT_LABELS[base];
      label = fn ? fn(inputs) : null;
    }
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({
      factor: label,
      shap_contribution: Math.round(item.shap_contribution * 1e4) / 1e4,
      direction: item.direction,
    });
    if (out.length >= 6) break;
  }
  return out;
}
