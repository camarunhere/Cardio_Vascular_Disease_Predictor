import { Router } from "express";
import { requireRole } from "../auth.js";
import { ClinicalRecommendation, DoctorNote, HealthRecord, Upload, User, logActivity } from "../models.js";
import { buildPdfReport } from "../pdf.js";
import { recordPayload } from "../serialize.js";

const router = Router();
const doctorOnly = requireRole("doctor");

// ---- Doctor notes on a patient ------------------------------------------------

router.get("/patients/:id/notes", doctorOnly, async (req, res) => {
  const notes = await DoctorNote.find({ patient: req.params.id })
    .sort({ createdAt: -1 })
    .populate("doctor", "fullName");
  res.json(notes.map((n) => ({
    id: String(n._id),
    note: n.note,
    doctor: n.doctor?.fullName || "Doctor",
    mine: String(n.doctor?._id) === String(req.user._id),
    created_at: n.createdAt.toISOString(),
  })));
});

router.post("/patients/:id/notes", doctorOnly, async (req, res) => {
  const patient = await User.findOne({ _id: req.params.id, role: "patient" });
  if (!patient) return res.status(404).json({ detail: "Patient not found." });
  const note = String(req.body?.note || "").trim();
  if (note.length < 3) return res.status(422).json({ detail: "Note is too short." });
  const doc = await DoctorNote.create({ patient: patient._id, doctor: req.user._id, note });
  await logActivity(req.user, "add_doctor_note", `patient=${patient._id}`);
  res.json({ message: "Note added.", id: String(doc._id) });
});

router.delete("/notes/:id", doctorOnly, async (req, res) => {
  const note = await DoctorNote.findOne({ _id: req.params.id, doctor: req.user._id });
  if (!note) return res.status(404).json({ detail: "Note not found (you can only delete your own notes)." });
  await note.deleteOne();
  res.json({ message: "Note deleted." });
});

router.get("/patients", doctorOnly, async (req, res) => {
  const patients = await User.find({ role: "patient" }).sort({ fullName: 1 });
  const out = [];
  for (const p of patients) {
    const latest = await HealthRecord.findOne({ patient: p._id }).sort({ createdAt: -1 });
    const count = await HealthRecord.countDocuments({ patient: p._id });
    out.push({
      id: String(p._id),
      patient_id: p.patientId,
      full_name: p.fullName,
      email: p.email,
      assessments: count,
      latest_risk: latest ? latest.riskClassification : null,
      latest_risk_level: latest ? latest.riskLevel : null,
      latest_probability: latest ? latest.riskProbability : null,
    });
  }
  res.json(out);
});

router.get("/patients/:id/records", doctorOnly, async (req, res) => {
  const patient = await User.findById(req.params.id).catch(() => null);
  if (!patient || patient.role !== "patient")
    return res.status(404).json({ detail: "Patient not found." });

  const records = await HealthRecord.find({ patient: patient._id }).sort({ createdAt: -1 });
  const uploads = await Upload.find({ patient: patient._id }).sort({ uploadedAt: -1 });
  const recs = await ClinicalRecommendation.find({ patient: patient._id }).sort({ createdAt: -1 });
  await logActivity(req.user, "view_patient_records", `patient=${patient._id}`);

  res.json({
    patient: {
      id: String(patient._id),
      patient_id: patient.patientId,
      full_name: patient.fullName,
      email: patient.email,
      phone: patient.phone || null,
      date_of_birth: patient.dateOfBirth || null,
      medical_history: patient.medicalHistory,
    },
    records: records.map(recordPayload),
    uploads: uploads.map((u) => ({
      id: String(u._id), filename: u.filename, uploaded_at: u.uploadedAt.toISOString(),
    })),
    recommendations: recs.map((r) => ({
      id: String(r._id), recommendation: r.recommendation, created_at: r.createdAt.toISOString(),
    })),
  });
});

router.post("/records/:id/review", doctorOnly, async (req, res) => {
  const note = req.body?.note;
  if (!note || note.length < 3) return res.status(422).json({ detail: "Review note is too short." });
  const record = await HealthRecord.findById(req.params.id).catch(() => null);
  if (!record) return res.status(404).json({ detail: "Record not found." });
  record.reviewedBy = req.user._id;
  record.reviewNote = note;
  record.reviewedAt = new Date();
  await record.save();
  await logActivity(req.user, "review_prediction", `record=${record._id}`);
  res.json({ message: "Review saved." });
});

router.post("/patients/:id/recommendations", doctorOnly, async (req, res) => {
  const text = req.body?.recommendation;
  if (!text || text.length < 3) return res.status(422).json({ detail: "Recommendation is too short." });
  const patient = await User.findById(req.params.id).catch(() => null);
  if (!patient || patient.role !== "patient")
    return res.status(404).json({ detail: "Patient not found." });
  const rec = await ClinicalRecommendation.create({
    patient: patient._id,
    doctor: req.user._id,
    record: req.body?.record_id || undefined,
    recommendation: text,
  });
  await logActivity(req.user, "generate_recommendation", `patient=${patient._id}`);
  res.json({ message: "Recommendation saved.", id: String(rec._id) });
});

router.get("/records/:id/report", doctorOnly, async (req, res) => {
  const record = await HealthRecord.findById(req.params.id).catch(() => null);
  if (!record) return res.status(404).json({ detail: "Record not found." });
  const patient = await User.findById(record.patient);
  const recs = await ClinicalRecommendation.find({ patient: record.patient })
    .sort({ createdAt: -1 }).limit(5);
  const pdf = await buildPdfReport(record, patient, recs);
  await logActivity(req.user, "download_report", `record=${record._id}`);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="cvd_report_${record._id}.pdf"`,
  }).send(pdf);
});

export default router;
