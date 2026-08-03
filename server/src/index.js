// AI-Based Cardiovascular Disease Prediction Website — Node.js + MongoDB backend.
// Serves the React frontend and all /api routes; delegates AI predictions to
// the Python ML microservice (scikit-learn + SHAP) on port 8001.
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import express from "express";
import { connectDb } from "./db.js";
import { User } from "./models.js";
import authRoutes from "./routes/auth.js";
import patientRoutes from "./routes/patient.js";
import doctorRoutes from "./routes/doctor.js";
import adminRoutes from "./routes/admin.js";
import { mlHealth } from "./ml.js";
import { ensureMlService } from "./mlProcess.js";

const PORT = Number(process.env.PORT) || 8000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, "..", "..", "frontend", "dist");

const SEED_USERS = [
  ["admin@cvd-demo.com", "admin123", "System Administrator", "admin"],
  ["doctor@cvd-demo.com", "doctor123", "Dr. Asha Menon", "doctor"],
  ["patient@cvd-demo.com", "patient123", "Demo Patient", "patient"],
];

async function seedUsers() {
  for (const [email, password, fullName, role] of SEED_USERS) {
    if (!(await User.findOne({ email }))) {
      await User.create({
        email,
        passwordHash: await bcrypt.hash(password, 10),
        fullName,
        role,
        isVerified: true,
        patientId: role === "patient" ? "PT-DEMO01" : undefined,
        anonId: role === "patient" ? "ANON-demo0001" : undefined,
      });
    }
  }
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/patient", patientRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/admin", adminRoutes);

app.get("/health", async (req, res) => {
  let model = false;
  try { model = (await mlHealth()).model_loaded; } catch { /* ml down */ }
  res.json({ status: "ok", model_loaded: model, backend: "node+mongodb" });
});

// React SPA
if (existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(FRONTEND_DIST, "index.html")));
}

// JSON error handler (keeps the {detail} contract the frontend expects)
app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large" || err?.code === "LIMIT_FILE_SIZE")
    return res.status(422).json({ detail: "File exceeds the 20 MB limit." });
  console.error(err);
  res.status(500).json({ detail: "Internal server error." });
});

const start = async () => {
  await connectDb();
  await seedUsers();
  await ensureMlService();
  app.listen(PORT, () => console.log(`[server] http://127.0.0.1:${PORT}`));
};

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
