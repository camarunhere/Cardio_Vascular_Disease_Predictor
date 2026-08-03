"""AI-Based Cardiovascular Disease Prediction Website — FastAPI backend.

Implements the full use-case diagram:
- Patient: Register/Login/Logout, Manage Profile, Enter Health Information,
  Upload ECG/Medical Report, View Dashboard, View AI Prediction Results
  (<<include>> Predict CVD Risk <<include>> SHAP Explanation), View Health
  History, Download Prediction Report.
- Doctor: View Patient Records (auto-includes AI predictions), Review
  Prediction Results, Generate Clinical Recommendation, Download Report.
- Administrator: Manage Users, Manage Patient Records, Manage AI Model,
  Generate System Reports, Monitor Website Activity.

Stack per the design doc: FastAPI + scikit-learn + SHAP; React + Tailwind
frontend served from frontend/dist; SQL database via SQLAlchemy (PostgreSQL
in production via DATABASE_URL, SQLite for local development).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.auth import hash_password
from api.db import Base, SessionLocal, engine
from api.models import User
from api.routers import admin, auth_routes, doctor, patient
from src.predict import CardioRiskPredictor

MODEL_PATH = "models/cvd_model.joblib"
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

SEED_USERS = [
    # (email, password, name, role) — demo accounts for each actor.
    ("admin@cvd-demo.com", "admin123", "System Administrator", "admin"),
    ("doctor@cvd-demo.com", "doctor123", "Dr. Asha Menon", "doctor"),
    ("patient@cvd-demo.com", "patient123", "Demo Patient", "patient"),
]


def seed_users() -> None:
    db = SessionLocal()
    try:
        for email, password, name, role in SEED_USERS:
            if not db.query(User).filter(User.email == email).first():
                db.add(
                    User(
                        email=email,
                        password_hash=hash_password(password),
                        full_name=name,
                        role=role,
                        is_verified=True,
                    )
                )
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path("data").mkdir(exist_ok=True)
    Base.metadata.create_all(engine)
    seed_users()
    app.state.predictor = (
        CardioRiskPredictor(model_path=MODEL_PATH) if Path(MODEL_PATH).exists() else None
    )
    yield


app = FastAPI(
    title="AI-Based Cardiovascular Disease Prediction Website",
    description="Patients check cardiac risk, doctors review results, admins maintain the system.",
    version="2.0.0",
    lifespan=lifespan,
)

app.include_router(auth_routes.router)
app.include_router(patient.router)
app.include_router(doctor.router)
app.include_router(admin.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_loaded": app.state.predictor is not None}


# ---- React frontend (built with Vite + Tailwind, served statically) ---------

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
