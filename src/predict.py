"""Single-patient inference: the online half of 'Predict Cardiovascular Disease Risk'.

Loads the persisted pipeline once, engineers features the same way training
did, and returns a classification + probability + SHAP explanation in one
call -- mirroring the <<include>> chain:
View AI Prediction Results -> Predict Cardiovascular Disease Risk -> View SHAP/LIME Explanation
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import joblib
import pandas as pd

from src.explain import explain_prediction
from src.preprocessing import FEATURE_COLUMNS, clean, engineer_features

RISK_THRESHOLD = 0.5


@dataclass
class PatientInput:
    age_days: int
    gender: int  # 1 = female, 2 = male
    height_cm: float
    weight_kg: float
    ap_hi: int
    ap_lo: int
    cholesterol: int  # 1 normal, 2 above normal, 3 well above normal
    gluc: int
    smoke: int
    alco: int
    active: int

    def to_frame(self) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {
                    "age": self.age_days,
                    "gender": self.gender,
                    "height": self.height_cm,
                    "weight": self.weight_kg,
                    "ap_hi": self.ap_hi,
                    "ap_lo": self.ap_lo,
                    "cholesterol": self.cholesterol,
                    "gluc": self.gluc,
                    "smoke": self.smoke,
                    "alco": self.alco,
                    "active": self.active,
                }
            ]
        )


class CardioRiskPredictor:
    def __init__(self, model_path: str = "models/cvd_model.joblib", background_path: str | None = None):
        self.pipeline = joblib.load(model_path)
        # A small reference sample the SHAP explainer needs to estimate
        # feature-absence baselines. Falls back to a synthetic midpoint row
        # if no background sample was saved alongside the model.
        if background_path and Path(background_path).exists():
            self.background = pd.read_parquet(background_path)
        else:
            self.background = None

    def predict(self, patient: PatientInput, explain: bool = True) -> dict:
        raw = patient.to_frame()
        raw = clean(engineer_features(raw).assign(cardio=0)).drop(columns=["cardio"])
        if raw.empty:
            raise ValueError("Input values are outside physiologically plausible ranges.")

        X = raw[FEATURE_COLUMNS]
        probability = float(self.pipeline.predict_proba(X)[0, 1])
        result = {
            "risk_probability": round(probability, 4),
            "risk_classification": "high_risk" if probability >= RISK_THRESHOLD else "low_risk",
        }

        if explain:
            background = self.background if self.background is not None else X
            result["explanation"] = explain_prediction(self.pipeline, X, background)

        return result
