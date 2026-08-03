import { Router } from "express";
import { requireRole } from "../auth.js";
import {
  ActivityLog, ClinicalRecommendation, HealthRecord, Upload, User,
  getSetting, logActivity, setSetting,
} from "../models.js";
import { mlMetadata, mlReload, mlRetrain } from "../ml.js";

const router = Router();
const adminOnly = requireRole("admin");

// ---- Manage Users -----------------------------------------------------------

router.get("/users", adminOnly, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users.map((u) => ({
    id: String(u._id),
    full_name: u.fullName,
    email: u.email,
    role: u.role,
    patient_id: u.patientId || null,
    is_verified: u.isVerified,
    is_blocked: u.isBlocked,
    created_at: u.createdAt.toISOString(),
  })));
});

router.patch("/users/:id", adminOnly, async (req, res) => {
  const target = await User.findById(req.params.id).catch(() => null);
  if (!target) return res.status(404).json({ detail: "User not found." });
  if (target.role === "admin" && req.body?.is_blocked)
    return res.status(403).json({ detail: "Administrators cannot be blocked." });
  if (req.body?.is_verified != null) target.isVerified = !!req.body.is_verified;
  if (req.body?.is_blocked != null) target.isBlocked = !!req.body.is_blocked;
  await target.save();
  await logActivity(req.user, "manage_users", `user=${target._id} ${JSON.stringify(req.body)}`);
  res.json({ message: "User updated." });
});

router.delete("/users/:id", adminOnly, async (req, res) => {
  const target = await User.findById(req.params.id).catch(() => null);
  if (!target) return res.status(404).json({ detail: "User not found." });
  if (target.role === "admin") return res.status(403).json({ detail: "Administrators cannot be deleted." });
  await Promise.all([
    HealthRecord.deleteMany({ patient: target._id }),
    ClinicalRecommendation.deleteMany({ patient: target._id }),
    Upload.deleteMany({ patient: target._id }),
    target.deleteOne(),
  ]);
  await logActivity(req.user, "manage_users", `deleted user=${req.params.id}`);
  res.json({ message: "User deleted." });
});

// ---- Manage Patient Records ---------------------------------------------------

router.get("/records", adminOnly, async (req, res) => {
  const records = await HealthRecord.find().sort({ createdAt: -1 }).limit(500)
    .populate("patient", "fullName email");
  res.json(records.map((r) => ({
    id: String(r._id),
    patient: r.patient?.fullName || "(deleted)",
    email: r.patient?.email || "",
    created_at: r.createdAt.toISOString(),
    risk_probability: r.riskProbability,
    risk_classification: r.riskClassification,
    risk_level: r.riskLevel,
    reviewed: !!r.reviewedAt,
  })));
});

router.delete("/records/:id", adminOnly, async (req, res) => {
  const record = await HealthRecord.findById(req.params.id).catch(() => null);
  if (!record) return res.status(404).json({ detail: "Record not found." });
  await record.deleteOne();
  await logActivity(req.user, "manage_patient_records", `deleted record=${req.params.id}`);
  res.json({ message: "Record deleted." });
});

// ---- Manage AI Model -----------------------------------------------------------

router.get("/model", adminOnly, async (req, res) => {
  let ml = { metadata: {}, model_file_exists: false, retraining: false };
  try { ml = await mlMetadata(); } catch { /* ML service down */ }
  res.json({
    ...ml,
    risk_threshold: await getSetting("risk_threshold_high", 0.7),
    risk_threshold_medium: await getSetting("risk_threshold_medium", 0.4),
  });
});

router.patch("/model/threshold", adminOnly, async (req, res) => {
  const high = Number(req.body?.risk_threshold);
  const medium = Number(req.body?.risk_threshold_medium ?? (await getSetting("risk_threshold_medium", 0.4)));
  if (!(high > 0 && high < 1)) return res.status(422).json({ detail: "High threshold must be between 0 and 1." });
  if (!(medium > 0 && medium < high))
    return res.status(422).json({ detail: "Medium threshold must be between 0 and the high threshold." });
  await setSetting("risk_threshold_high", high);
  await setSetting("risk_threshold_medium", medium);
  await logActivity(req.user, "manage_ai_model", `thresholds medium=${medium} high=${high}`);
  res.json({ message: `Risk thresholds set: medium >= ${medium}, high >= ${high}.` });
});

router.post("/model/retrain", adminOnly, async (req, res) => {
  try {
    const out = await mlRetrain();
    await logActivity(req.user, "manage_ai_model", "retrain started");
    res.json(out);
  } catch (err) {
    res.status(err.status || 502).json({ detail: err.message });
  }
});

router.post("/model/reload", adminOnly, async (req, res) => {
  try {
    const out = await mlReload();
    await logActivity(req.user, "manage_ai_model", "model reloaded");
    res.json(out);
  } catch (err) {
    res.status(err.status || 502).json({ detail: err.message });
  }
});

// ---- Generate System Reports -----------------------------------------------------

router.get("/reports", adminOnly, async (req, res) => {
  const [totalUsers, patients, doctors, admins, totalPreds, highRisk, reviewed, uploads] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "patient" }),
      User.countDocuments({ role: "doctor" }),
      User.countDocuments({ role: "admin" }),
      HealthRecord.countDocuments(),
      HealthRecord.countDocuments({ riskLevel: "high" }),
      HealthRecord.countDocuments({ reviewedAt: { $ne: null } }),
      Upload.countDocuments(),
    ]);
  const medium = await HealthRecord.countDocuments({ riskLevel: "medium" });
  let meta = {};
  try { meta = (await mlMetadata()).metadata || {}; } catch { /* ML service down */ }
  res.json({
    total_users: totalUsers,
    users_by_role: { patient: patients, doctor: doctors, admin: admins },
    total_predictions: totalPreds,
    high_risk_predictions: highRisk,
    medium_risk_predictions: medium,
    low_risk_predictions: totalPreds - highRisk - medium,
    reviewed_predictions: reviewed,
    uploaded_reports: uploads,
    model_accuracy: meta.test_roc_auc ?? null,
    model_name: meta.model_name ?? null,
  });
});

// ---- Monitor Website Activity ------------------------------------------------------

router.get("/activity", adminOnly, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(limit);
  res.json(logs.map((l) => ({
    id: String(l._id),
    user_email: l.userEmail || null,
    action: l.action,
    detail: l.detail || null,
    created_at: l.createdAt.toISOString(),
  })));
});

export default router;
