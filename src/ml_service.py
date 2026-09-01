"""Internal ML microservice (port 8001).

The Node.js + MongoDB backend is the public API; this FastAPI service only
does the AI work: predict cardiovascular risk from the expanded feature set
and return the SHAP explanation. Run with:

    uvicorn src.ml_service:app --port 8001
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from src.train_extended import CATEGORICAL_FEATURES, FEATURE_COLUMNS, NUMERIC_FEATURES

MODEL_PATH = "models/cvd_model_extended.joblib"
METADATA_PATH = "models/cvd_model_extended_metadata.json"
BACKGROUND_DATA = "data/cardio_extended.csv"

app = FastAPI(title="CVD ML Service", version="1.0.0")

_pipeline = None
_background = None  # transformed sample for SHAP baselines
_retrain_process: Optional[subprocess.Popen] = None


def _load() -> None:
    global _pipeline, _background
    _pipeline = joblib.load(MODEL_PATH) if Path(MODEL_PATH).exists() else None
    _background = None
    if _pipeline is not None and Path(BACKGROUND_DATA).exists():
        sample = pd.read_csv(BACKGROUND_DATA, nrows=2000).sample(200, random_state=42)
        X_bg = _pipeline.named_steps["prep"].transform(sample[FEATURE_COLUMNS])
        _background = np.asarray(X_bg.todense() if hasattr(X_bg, "todense") else X_bg)


@app.on_event("startup")
def startup() -> None:
    _load()


class Features(BaseModel):
    # Personal
    age_years: int = Field(..., ge=1, le=120)
    gender: int = Field(..., ge=1, le=2)
    height_cm: float = Field(..., gt=100, lt=250)
    weight_kg: float = Field(..., gt=20, lt=300)
    # Vitals / wearable
    ap_hi: int = Field(..., ge=70, le=250)
    ap_lo: int = Field(..., ge=40, le=180)
    resting_hr: float = Field(72, ge=30, le=220)
    hrv_ms: float = Field(45, ge=1, le=300)
    spo2: float = Field(97.5, ge=70, le=100)
    resp_rate: float = Field(15, ge=6, le=60)
    body_temp: float = Field(36.8, ge=34, le=42)
    # Blood work levels
    cholesterol: int = Field(..., ge=1, le=3)
    gluc: int = Field(..., ge=1, le=3)
    # Clinical test reports
    ecg_result: int = Field(0, ge=0, le=2, description="0 normal, 1 ST-T abnormality, 2 LVH")
    lvef: float = Field(62, ge=10, le=85, description="2D Echo ejection fraction %")
    tmt_result: int = Field(0, ge=0, le=2, description="0 not done, 1 negative, 2 positive")
    cac_score: float = Field(0, ge=0, le=5000, description="Agatston CAC score")
    # Medical history
    diabetes: int = Field(0, ge=0, le=1)
    hypertension_dx: int = Field(0, ge=0, le=1)
    high_chol_dx: int = Field(0, ge=0, le=1)
    family_history: int = Field(0, ge=0, le=1)
    prior_heart_disease: int = Field(0, ge=0, le=1)
    on_meds: int = Field(0, ge=0, le=1)
    # Lifestyle
    smoke: int = Field(..., ge=0, le=1)
    alco: int = Field(..., ge=0, le=1)
    active: int = Field(..., ge=0, le=1)
    sleep_hours: float = Field(7, ge=0, le=24)
    sleep_quality: float = Field(7, ge=1, le=10)
    stress_level: float = Field(5, ge=1, le=10)
    daily_steps: float = Field(7000, ge=0, le=100000)
    exercise_freq: float = Field(2, ge=0, le=7)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_loaded": _pipeline is not None}


@app.get("/metadata")
def metadata() -> dict:
    meta = json.loads(Path(METADATA_PATH).read_text()) if Path(METADATA_PATH).exists() else {}
    retraining = _retrain_process is not None and _retrain_process.poll() is None
    return {"metadata": meta, "model_file_exists": Path(MODEL_PATH).exists(), "retraining": retraining}


@app.post("/predict")
def predict(payload: Features) -> dict:
    if _pipeline is None:
        raise HTTPException(503, "Model not loaded. Train it first (src.augment + src.train_extended).")

    row = payload.model_dump()
    if row["ap_hi"] < row["ap_lo"]:
        raise HTTPException(422, "Systolic pressure must be >= diastolic pressure.")
    row["bmi"] = row["weight_kg"] / (row["height_cm"] / 100) ** 2
    row["pulse_pressure"] = row["ap_hi"] - row["ap_lo"]

    X = pd.DataFrame([row])[FEATURE_COLUMNS]
    probability = float(_pipeline.predict_proba(X)[0, 1])

    prep = _pipeline.named_steps["prep"]
    clf = _pipeline.named_steps["clf"]
    X_t = prep.transform(X)
    X_t = np.asarray(X_t.todense() if hasattr(X_t, "todense") else X_t)
    background = _background if _background is not None else X_t
    if type(clf).__name__ in ("GradientBoostingClassifier", "CatBoostClassifier"):
        explainer = shap.TreeExplainer(clf)
    else:
        explainer = shap.LinearExplainer(clf, background)
    shap_values = explainer.shap_values(X_t)
    if isinstance(shap_values, list):
        shap_values = shap_values[1]
    values = np.asarray(shap_values)[0]
    names = prep.get_feature_names_out()

    # Aggregate one-hot columns (cat__smoke_0 + cat__smoke_1 -> cat__smoke) so a
    # category's net effect is reported, not a single misleading dummy column.
    agg: dict[str, float] = {}
    for name, contrib in zip(names, values):
        name = str(name)
        base = "cat__" + name[5:].rsplit("_", 1)[0] if name.startswith("cat__") else name
        agg[base] = agg.get(base, 0.0) + float(contrib)

    ranked = sorted(agg.items(), key=lambda t: abs(t[1]), reverse=True)[:8]
    explanation = [
        {
            "feature": base,
            "value": float(row.get(base.split("__", 1)[1], 0.0)),
            "shap_contribution": round(contrib, 4),
            "direction": "increases_risk" if contrib > 0 else "decreases_risk",
        }
        for base, contrib in ranked
    ]
    return {"risk_probability": round(probability, 4), "explanation": explanation, "bmi": round(row["bmi"], 1)}


@app.post("/retrain")
def retrain() -> dict:
    global _retrain_process
    if _retrain_process is not None and _retrain_process.poll() is None:
        raise HTTPException(409, "Retraining already in progress.")
    _retrain_process = subprocess.Popen(
        f"{sys.executable} -m src.augment && {sys.executable} -m src.train_extended",
        shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return {"message": "Retraining started."}


@app.post("/reload")
def reload_model() -> dict:
    if not Path(MODEL_PATH).exists():
        raise HTTPException(422, "No model artifact found.")
    _load()
    return {"message": "Model reloaded."}
