// Manages the Python ML microservice as a child process so the whole app
// starts with a single `npm start`, like any Node application.
//
// If something is already serving on the ML port (e.g. started manually),
// it is reused. Set SKIP_ML_SPAWN=1 to never spawn, or ML_PYTHON to point at
// a specific Python interpreter.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const ML_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8001";
const ML_PORT = new URL(ML_URL).port || "8001";
const REPO_ROOT = path.resolve(process.cwd(), "..");

let child = null;

async function isUp() {
  try {
    const res = await fetch(`${ML_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function pythonBin() {
  if (process.env.ML_PYTHON) return process.env.ML_PYTHON;
  // venv layout differs by OS: Scripts\python.exe on Windows, bin/python elsewhere.
  const winVenv = path.join(REPO_ROOT, ".venv", "Scripts", "python.exe");
  const unixVenv = path.join(REPO_ROOT, ".venv", "bin", "python");
  if (existsSync(winVenv)) return winVenv;
  if (existsSync(unixVenv)) return unixVenv;
  // No venv found — fall back to whatever's on PATH. "python3" is rarely a
  // real command on Windows (only the Store-alias stub); "py" is the actual
  // standard launcher there.
  return process.platform === "win32" ? "py" : "python3";
}

export async function ensureMlService() {
  if (await isUp()) {
    console.log(`[ml] Reusing ML service already running at ${ML_URL}`);
    return;
  }
  if (process.env.SKIP_ML_SPAWN) {
    console.warn("[ml] SKIP_ML_SPAWN set and ML service is down — predictions will fail.");
    return;
  }

  const py = pythonBin();
  console.log(`[ml] Starting Python ML service (${py}, port ${ML_PORT})…`);
  child = spawn(
    py,
    ["-m", "uvicorn", "src.ml_service:app", "--port", ML_PORT, "--host", "127.0.0.1"],
    { cwd: REPO_ROOT, stdio: ["ignore", "inherit", "inherit"] }
  );
  child.on("exit", (code) => {
    if (code !== null && code !== 0)
      console.error(`[ml] ML service exited with code ${code}.`);
    child = null;
  });

  // Wait for it to come up (model + SHAP imports take a few seconds).
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isUp()) {
      console.log("[ml] ML service is up.");
      return;
    }
    if (!child) break; // crashed
  }
  console.warn(
    "[ml] ML service did not come up. Check that the Python venv exists " +
    "(python3 -m venv .venv && pip install -r requirements.txt) and that the " +
    "model is trained (python -m src.augment && python -m src.train_extended)."
  );
}

export function stopMlService() {
  if (child) {
    child.kill("SIGTERM");
    child = null;
  }
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopMlService();
    process.exit(0);
  });
}
process.on("exit", stopMlService);
