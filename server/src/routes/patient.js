import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { requireRole } from "../auth.js";
import {
  ClinicalRecommendation, HealthRecord, Upload, User, getSetting, logActivity,
} from "../models.js";
import { humanizeExplanation, mlPredict } from "../ml.js";
import { buildRecommendations, sampleWearable } from "../recommendations.js";
import { analyzeReport } from "../reportAnalysis.js";
import { buildPdfReport } from "../pdf.js";
import { buildPlanPdf } from "../healthPlan.js";
import { chatReply } from "../chatbot.js";
import { recordPayload } from "../serialize.js";

const router = Router();
const patientOnly = requireRole("patient");

const UPLOAD_DIR = path.resolve(process.cwd(), "..", "data", "uploads");
const ALLOWED = new Set([".pdf", ".png", ".jpg", ".jpeg", ".csv", ".txt", ".dcm", ".xml"]);
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { mkdirSync(UPLOAD_DIR, { recursive: true }); cb(null, UPLOAD_DIR); },
    filename: (req, file, cb) =>
      cb(null, `${req.user._id}_${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ---- Manage Profile (incl. medical history) ---------------------------------

router.get("/profile", patientOnly, (req, res) => {
  const u = req.user;
  res.json({
    patient_id: u.patientId,
    anon_id: u.anonId,
    full_name: u.fullName,
    email: u.email,
    phone: u.phone || null,
    date_of_birth: u.dateOfBirth || null,
    address: u.address || null,
    medical_history: u.medicalHistory,
  });
});

router.put("/profile", patientOnly, async (req, res) => {
  const { full_name, phone, date_of_birth, address, medical_history } = req.body || {};
  if (full_name != null) {
    if (String(full_name).length < 2) return res.status(422).json({ detail: "Name too short." });
    req.user.fullName = full_name;
  }
  if (phone != null) req.user.phone = phone;
  if (date_of_birth != null) req.user.dateOfBirth = date_of_birth;
  if (address != null) req.user.address = address;
  if (medical_history != null)
    req.user.medicalHistory = { ...req.user.medicalHistory.toObject?.() ?? req.user.medicalHistory, ...medical_history };
  await req.user.save();
  await logActivity(req.user, "update_profile");
  res.json({ message: "Profile updated." });
});

// ---- Wearable sensor sync (simulated real-time physiological data) ----------

router.get("/wearable/sample", patientOnly, async (req, res) => {
  await logActivity(req.user, "wearable_sync");
  res.json(sampleWearable());
});

// ---- Predict (Enter Health Information -> AI risk -> SHAP -> recommendations)

const NUM_FIELDS = {
  age_years: [1, 120], gender: [1, 2], height_cm: [100, 250], weight_kg: [20, 300],
  ap_hi: [70, 250], ap_lo: [40, 180], cholesterol: [1, 3], gluc: [1, 3],
  smoke: [0, 1], alco: [0, 1], active: [0, 1],
  diabetes: [0, 1], hypertension_dx: [0, 1], high_chol_dx: [0, 1],
  family_history: [0, 1], prior_heart_disease: [0, 1], on_meds: [0, 1],
  resting_hr: [30, 220], hrv_ms: [1, 300], spo2: [70, 100], resp_rate: [6, 60],
  body_temp: [34, 42], sleep_hours: [0, 24], sleep_quality: [1, 10],
  stress_level: [1, 10], daily_steps: [0, 100000], exercise_freq: [0, 7],
  ecg_result: [0, 2], lvef: [10, 85], tmt_result: [0, 2], cac_score: [0, 5000],
};

// Clinical test reports are optional — default to "normal / not performed".
const OPTIONAL_DEFAULTS = { ecg_result: 0, lvef: 62, tmt_result: 0, cac_score: 0 };

router.post("/predict", patientOnly, async (req, res) => {
  const inputs = {};
  for (const [field, [lo, hi]] of Object.entries(NUM_FIELDS)) {
    const raw = req.body?.[field] ?? OPTIONAL_DEFAULTS[field];
    const v = Number(raw);
    if (!Number.isFinite(v)) return res.status(422).json({ detail: `Missing or invalid field: ${field}` });
    if (v < lo || v > hi) return res.status(422).json({ detail: `${field} must be between ${lo} and ${hi}.` });
    inputs[field] = v;
  }
  if (inputs.ap_hi < inputs.ap_lo)
    return res.status(422).json({ detail: "Systolic pressure must be >= diastolic pressure." });

  let ml;
  try {
    ml = await mlPredict(inputs);
  } catch (err) {
    return res.status(err.status || 502).json({ detail: err.message });
  }

  const medium = await getSetting("risk_threshold_medium", 0.4);
  const high = await getSetting("risk_threshold_high", 0.7);
  const p = ml.risk_probability;
  const riskLevel = p >= high ? "high" : p >= medium ? "medium" : "low";

  const recommendations = buildRecommendations(inputs, riskLevel, ml.bmi);

  const record = await HealthRecord.create({
    patient: req.user._id,
    inputs,
    bmi: ml.bmi,
    riskProbability: p,
    riskLevel,
    riskClassification: riskLevel === "high" ? "high_risk" : "low_risk",
    alertStatus: riskLevel === "high" ? "high_risk" : "normal",
    explanation: humanizeExplanation(ml.explanation, inputs),
    recommendations,
  });
  await logActivity(req.user, "predict", `record=${record._id} p=${p.toFixed(3)} level=${riskLevel}`);
  res.json(recordPayload(record));
});

// ---- Dashboard / History / Progress ------------------------------------------

router.get("/dashboard", patientOnly, async (req, res) => {
  const records = await HealthRecord.find({ patient: req.user._id }).sort({ createdAt: -1 });
  const recs = await ClinicalRecommendation.find({ patient: req.user._id })
    .sort({ createdAt: -1 }).populate("doctor", "fullName");
  const uploads = await Upload.find({ patient: req.user._id }).sort({ uploadedAt: -1 });
  const latest = records[0];

  res.json({
    patient_id: req.user.patientId,
    anon_id: req.user.anonId,
    total_assessments: records.length,
    latest: latest ? recordPayload(latest) : null,
    alert_status: latest ? latest.alertStatus : "normal",
    risk_trend: [...records].reverse().slice(-10).map((r) => ({
      date: r.createdAt.toISOString(),
      risk_probability: r.riskProbability,
    })),
    reminders: latest?.recommendations?.reminders || [],
    recommendations: recs.map((r) => ({
      id: String(r._id),
      doctor: r.doctor?.fullName || "Doctor",
      recommendation: r.recommendation,
      created_at: r.createdAt.toISOString(),
    })),
    uploads: uploads.map((u) => ({
      id: String(u._id), filename: u.filename, uploaded_at: u.uploadedAt.toISOString(),
    })),
  });
});

router.get("/history", patientOnly, async (req, res) => {
  const records = await HealthRecord.find({ patient: req.user._id }).sort({ createdAt: -1 });
  res.json(records.map(recordPayload));
});

router.get("/progress", patientOnly, async (req, res) => {
  const records = await HealthRecord.find({ patient: req.user._id }).sort({ createdAt: 1 });
  res.json({
    series: records.map((r) => ({
      date: r.createdAt.toISOString(),
      risk_probability: r.riskProbability,
      weight_kg: r.inputs.weight_kg,
      ap_hi: r.inputs.ap_hi,
      ap_lo: r.inputs.ap_lo,
      resting_hr: r.inputs.resting_hr,
      daily_steps: r.inputs.daily_steps,
      sleep_hours: r.inputs.sleep_hours,
    })),
  });
});

// ---- Download Prediction Report (PDF) ----------------------------------------

router.get("/records/:id/report", patientOnly, async (req, res) => {
  const record = await HealthRecord.findById(req.params.id).catch(() => null);
  if (!record || String(record.patient) !== String(req.user._id))
    return res.status(404).json({ detail: "Record not found." });
  const recs = await ClinicalRecommendation.find({ patient: req.user._id })
    .sort({ createdAt: -1 }).limit(5);
  const pdf = await buildPdfReport(record, req.user, recs);
  await logActivity(req.user, "download_report", `record=${record._id}`);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="cvd_report_${record._id}.pdf"`,
  }).send(pdf);
});

// ---- Upload ECG / Medical Report ----------------------------------------------

router.post("/upload", patientOnly, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(422).json({ detail: "No file provided." });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!ALLOWED.has(ext))
    return res.status(422).json({ detail: `Unsupported file type '${ext}'. Allowed: ${[...ALLOWED].sort().join(", ")}` });

  // Analyze the report automatically: extract values, explain them, derive diet advice.
  let analysis;
  try {
    analysis = await analyzeReport(req.file.path, ext);
  } catch {
    analysis = { status: "unreadable", message: "Automatic analysis failed for this file." };
  }

  const doc = await Upload.create({
    patient: req.user._id,
    filename: req.file.originalname,
    storedPath: req.file.path,
    contentType: req.file.mimetype,
    analysis,
  });
  await logActivity(req.user, "upload_report", req.file.originalname);
  res.json({ message: `Uploaded ${req.file.originalname}.`, id: String(doc._id), analysis });
});

// List uploads including their stored analysis (used by the Upload Reports page).
router.get("/uploads", patientOnly, async (req, res) => {
  const uploads = await Upload.find({ patient: req.user._id }).sort({ uploadedAt: -1 });
  res.json(uploads.map((u) => ({
    id: String(u._id),
    filename: u.filename,
    uploaded_at: u.uploadedAt.toISOString(),
    analysis: u.analysis ?? null,
  })));
});

// ---- Weekly Health Plan PDF -----------------------------------------------------

router.get("/records/:id/plan", patientOnly, async (req, res) => {
  const record = await HealthRecord.findOne({ _id: req.params.id, patient: req.user._id });
  if (!record) return res.status(404).json({ detail: "Record not found." });
  const pdf = await buildPlanPdf(record, req.user);
  await logActivity(req.user, "download_weekly_plan", `record=${record._id}`);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="weekly_health_plan_${record._id}.pdf"`,
  }).send(pdf);
});

// ---- Nearby heart hospitals (OpenStreetMap Overpass, no API key) ------------------

const HEART_RE = /heart|cardi|cardio/i;

router.get("/hospitals", patientOnly, async (req, res) => {
  let lat = Number(req.query.lat), lon = Number(req.query.lon);
  let resolvedLocation = null;

  // Fallback for devices without location access: geocode a typed place name.
  if (req.query.q) {
    try {
      const geo = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(String(req.query.q).slice(0, 100))}`,
        { headers: { "User-Agent": "CardioAI-local-demo/1.0" }, signal: AbortSignal.timeout(10000) }
      );
      const results = await geo.json();
      if (!results.length)
        return res.status(422).json({ detail: `Couldn't find "${req.query.q}" — try a city or area name like "Chennai" or "T Nagar, Chennai".` });
      lat = Number(results[0].lat);
      lon = Number(results[0].lon);
      resolvedLocation = results[0].display_name;
    } catch {
      return res.status(502).json({ detail: "The location search service is busy — please try again in a moment." });
    }
  }

  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return res.status(422).json({ detail: "Provide your location or a place name to search." });

  // Risk-tiered care level, from the patient's latest AI assessment:
  //   low    → GP surgeries & cardiology clinics (routine check-ups)
  //   medium → hospital cardiology departments
  //   high   → cardiac emergency centres
  const latest = await HealthRecord.findOne({ patient: req.user._id }).sort({ createdAt: -1 });
  const tier = latest?.riskLevel || "medium";
  const TIER_LABELS = {
    low: "Your latest AI risk is LOW — cardiology clinics near your location for a routine review.",
    medium: "Your latest AI risk is MEDIUM — cardiology departments near your location.",
    high: "Your latest AI risk is HIGH — cardiac emergency-capable centres near your location.",
  };
  const amenityRe = tier === "low" ? "doctors|clinic|hospital" : "hospital";

  // Dedicated cardiac centres are sparse, so search wide.
  const radius = Math.min(Number(req.query.radius_km) || (tier === "high" ? 30 : 25), 50) * 1000;
  // Public Overpass instances are often overloaded; try a full query first,
  // then a lighter node-only query, across mirrors.
  const queries = [
    `[out:json][timeout:15];(node["amenity"~"${amenityRe}"](around:${radius},${lat},${lon});way["amenity"~"${amenityRe}"](around:${radius},${lat},${lon}););out center 80;`,
    `[out:json][timeout:12];node["amenity"~"${amenityRe}"](around:8000,${lat},${lon});out 50;`,
  ];
  const MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];

  try {
    let data = null;
    outer: for (const query of queries) {
      for (const url of MIRRORS) {
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              // Overpass rejects requests without a User-Agent (406).
              "User-Agent": "CardioAI-local-demo/1.0",
              "Accept": "application/json",
            },
            body: "data=" + encodeURIComponent(query),
            signal: AbortSignal.timeout(18000),
          });
          if (!resp.ok) continue;
          data = await resp.json();
          if ((data.elements || []).length) break outer;
        } catch { /* try next mirror */ }
      }
    }
    if (!data) throw new Error("all Overpass mirrors failed");

    const toRad = (d) => (d * Math.PI) / 180;
    const dist = (la, lo) => {
      const R = 6371, dLa = toRad(la - lat), dLo = toRad(lo - lon);
      const a = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(la)) * Math.sin(dLo / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const TYPE_LABELS = { doctors: "GP practice", clinic: "Clinic", hospital: "Hospital" };

    // Rank differently per tier: low prefers GP/clinics; high prefers
    // emergency-capable cardiac hospitals.
    const rank = (h) => {
      if (tier === "high")
        return h.heart_specialty && h.emergency ? 0 : h.emergency ? 1 : h.heart_specialty ? 2 : 3;
      if (tier === "low")
        return h.heart_specialty ? 0 : h.type !== "Hospital" ? 1 : 2;
      return h.heart_specialty ? 0 : 1;
    };

    const hospitals = (data.elements || [])
      .map((el) => {
        const la = el.lat ?? el.center?.lat, lo = el.lon ?? el.center?.lon;
        const tags = el.tags || {};
        if (la == null || !tags.name) return null;
        const specialty = `${tags.name} ${tags["healthcare:speciality"] || ""} ${tags.description || ""}`;
        return {
          name: tags.name,
          type: TYPE_LABELS[tags.amenity] || "Hospital",
          lat: la,
          lon: lo,
          distance_km: +dist(la, lo).toFixed(1),
          heart_specialty: HEART_RE.test(specialty),
          address: [tags["addr:street"], tags["addr:city"] || tags["addr:suburb"]].filter(Boolean).join(", ") || null,
          phone: tags.phone || tags["contact:phone"] || null,
          website: tags.website || tags["contact:website"] || null,
          emergency: tags.emergency === "yes",
          directions_url: `https://www.google.com/maps/dir/?api=1&destination=${la},${lo}`,
        };
      })
      .filter(Boolean)
      // Cardiac-related facilities only.
      .filter((h) => h.heart_specialty)
      .sort((a, b) => (rank(a) - rank(b)) || (a.distance_km - b.distance_km))
      .slice(0, 12);

    await logActivity(req.user, "find_hospitals", `tier=${tier} cardiac=${hospitals.length}`);
    res.json({
      hospitals,
      tier,
      tier_label: TIER_LABELS[tier],
      source: "OpenStreetMap",
      resolved_location: resolvedLocation,
      maps_search_url: `https://www.google.com/maps/search/heart+hospital/@${lat},${lon},13z`,
    });
  } catch {
    res.status(502).json({
      detail: "Could not fetch nearby hospitals right now (map service busy). Please try again in a minute.",
      maps_search_url: `https://www.google.com/maps/search/heart+hospital/@${lat},${lon},13z`,
    });
  }
});

// ---- Medication reminders (browser notifications) ----------------------------------

router.get("/reminders", patientOnly, (req, res) => {
  res.json((req.user.medReminders || []).map((r) => ({
    id: String(r._id), medication: r.medication, time: r.time, enabled: r.enabled,
  })));
});

router.post("/reminders", patientOnly, async (req, res) => {
  const { medication, time } = req.body || {};
  if (!medication || String(medication).trim().length < 2)
    return res.status(422).json({ detail: "Medication name is required." });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || ""))
    return res.status(422).json({ detail: "Time must be in HH:MM (24h) format." });
  req.user.medReminders.push({ medication: String(medication).trim(), time, enabled: true });
  await req.user.save();
  await logActivity(req.user, "add_reminder", `${medication} @ ${time}`);
  const r = req.user.medReminders[req.user.medReminders.length - 1];
  res.json({ message: "Reminder added.", id: String(r._id) });
});

router.delete("/reminders/:id", patientOnly, async (req, res) => {
  const r = req.user.medReminders.id(req.params.id);
  if (!r) return res.status(404).json({ detail: "Reminder not found." });
  r.deleteOne();
  await req.user.save();
  res.json({ message: "Reminder removed." });
});

// ---- AI chatbot ---------------------------------------------------------------------

router.post("/chat", patientOnly, async (req, res) => {
  const message = String(req.body?.message || "").slice(0, 500);
  const latest = await HealthRecord.findOne({ patient: req.user._id }).sort({ createdAt: -1 });
  const reply = chatReply(message, latest, req.user);
  res.json({ reply });
});

export default router;
