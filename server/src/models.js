import mongoose from "mongoose";

const { Schema } = mongoose;

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  passwordHash: { type: String, required: true },
  fullName: { type: String, required: true },
  role: { type: String, enum: ["patient", "doctor", "admin"], default: "patient" },
  isVerified: { type: Boolean, default: true }, // doctors start unverified
  isBlocked: { type: Boolean, default: false },
  // Patient identifiers (Patient ID + anonymous research ID)
  patientId: { type: String },
  anonId: { type: String },
  // Manage Profile
  phone: String,
  dateOfBirth: String,
  address: String,
  // Medical history (persisted so assessments prefill)
  medicalHistory: {
    priorHeartDisease: { type: Boolean, default: false },
    hypertension: { type: Boolean, default: false },
    diabetes: { type: Boolean, default: false },
    highCholesterol: { type: Boolean, default: false },
    familyHistory: { type: Boolean, default: false },
    medications: { type: String, default: "" },
  },
  // Tablet/medication reminders, shown as browser notifications.
  medReminders: [{ medication: String, time: String, enabled: { type: Boolean, default: true } }],
  createdAt: { type: Date, default: Date.now },
});

const healthRecordSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  createdAt: { type: Date, default: Date.now },
  inputs: { type: Schema.Types.Mixed, required: true }, // full expanded feature payload
  bmi: Number,
  riskProbability: { type: Number, required: true },
  riskLevel: { type: String, enum: ["low", "medium", "high"], required: true },
  riskClassification: { type: String, enum: ["low_risk", "high_risk"], required: true },
  alertStatus: { type: String, enum: ["normal", "high_risk"], required: true },
  explanation: [{ factor: String, shap_contribution: Number, direction: String }],
  recommendations: Schema.Types.Mixed,
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reviewNote: String,
  reviewedAt: Date,
});

const clinicalRecommendationSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  doctor: { type: Schema.Types.ObjectId, ref: "User", required: true },
  record: { type: Schema.Types.ObjectId, ref: "HealthRecord" },
  recommendation: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Free-form notes a doctor keeps on a patient (separate from per-record reviews).
const doctorNoteSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  doctor: { type: Schema.Types.ObjectId, ref: "User", required: true },
  note: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const uploadSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  filename: String,
  storedPath: String,
  contentType: String,
  uploadedAt: { type: Date, default: Date.now },
  // Automatic report analysis: extracted findings, explanation, diet advice.
  analysis: Schema.Types.Mixed,
});

const activityLogSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User" },
  userEmail: String,
  action: { type: String, required: true },
  detail: String,
  createdAt: { type: Date, default: Date.now, index: true },
});

const settingSchema = new Schema({
  key: { type: String, unique: true, required: true },
  value: Schema.Types.Mixed,
});

export const User = mongoose.model("User", userSchema);
export const HealthRecord = mongoose.model("HealthRecord", healthRecordSchema);
export const ClinicalRecommendation = mongoose.model("ClinicalRecommendation", clinicalRecommendationSchema);
export const DoctorNote = mongoose.model("DoctorNote", doctorNoteSchema);
export const Upload = mongoose.model("Upload", uploadSchema);
export const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
export const Setting = mongoose.model("Setting", settingSchema);

export async function logActivity(user, action, detail = "") {
  try {
    await ActivityLog.create({
      user: user?._id,
      userEmail: user?.email,
      action,
      detail,
    });
  } catch { /* logging must never break a request */ }
}

export async function getSetting(key, fallback) {
  const row = await Setting.findOne({ key });
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
}
