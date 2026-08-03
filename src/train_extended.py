"""Train the extended Cardiovascular Disease Risk model on the augmented
feature set (personal + medical history + wearable vitals + lifestyle).

Usage:
    python -m src.augment                       # build data/cardio_extended.csv
    python -m src.train_extended                # train models/cvd_model_extended.joblib
"""

from __future__ import annotations

import argparse
import json

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

NUMERIC_FEATURES = [
    "age_years", "bmi", "ap_hi", "ap_lo", "pulse_pressure",
    "resting_hr", "hrv_ms", "spo2", "resp_rate", "body_temp",
    "sleep_hours", "sleep_quality", "stress_level", "daily_steps", "exercise_freq",
    "lvef", "cac_score",
]
CATEGORICAL_FEATURES = [
    "gender", "cholesterol", "gluc", "smoke", "alco", "active",
    "diabetes", "hypertension_dx", "high_chol_dx", "family_history",
    "prior_heart_disease", "on_meds", "ecg_result", "tmt_result",
]
FEATURE_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES
TARGET = "cardio"

# Logistic regression scores marginally higher on ROC-AUC but amplifies a known
# confound in the Kaggle cardio dataset (smokers skew younger/male, so 'smoke'
# gets a negative coefficient), which produces clinically misleading SHAP
# explanations. Tree ensembles keep that artifact small, so only they are
# candidates for deployment.
CANDIDATES = {
    "random_forest": RandomForestClassifier(n_estimators=300, max_depth=8, random_state=42, n_jobs=-1),
    "gradient_boosting": GradientBoostingClassifier(random_state=42),
}


def build_pipeline(estimator) -> Pipeline:
    prep = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), NUMERIC_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ]
    )
    return Pipeline([("prep", prep), ("clf", estimator)])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/cardio_extended.csv")
    parser.add_argument("--out", default="models/cvd_model_extended.joblib")
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    df = pd.read_csv(args.data)
    X, y = df[FEATURE_COLUMNS], df[TARGET]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed, stratify=y
    )

    scored = []
    for name, estimator in CANDIDATES.items():
        pipeline = build_pipeline(estimator)
        scores = cross_val_score(pipeline, X_train, y_train, cv=5, scoring="roc_auc", n_jobs=-1)
        scored.append((scores.mean(), name, pipeline))
        print(f"{name:20s} CV ROC-AUC = {scores.mean():.4f} (+/- {scores.std():.4f})")

    scored.sort(key=lambda t: t[0], reverse=True)
    best_score, best_name, pipeline = scored[0]
    print(f"\nSelected model: {best_name} (CV ROC-AUC = {best_score:.4f})")

    pipeline.fit(X_train, y_train)
    y_proba = pipeline.predict_proba(X_test)[:, 1]
    test_auc = roc_auc_score(y_test, y_proba)
    print(f"\nHeld-out test ROC-AUC: {test_auc:.4f}")
    print(classification_report(y_test, pipeline.predict(X_test), target_names=["low_risk", "high_risk"]))

    joblib.dump(pipeline, args.out)
    metadata = {
        "model_name": best_name,
        "test_roc_auc": round(float(test_auc), 4),
        "features": FEATURE_COLUMNS,
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "note": (
            "Trained on the Kaggle cardio dataset augmented with synthetic "
            "medical-history, wearable, and lifestyle features (src/augment.py)."
        ),
    }
    with open(args.out.replace(".joblib", "_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"\nSaved model to {args.out}")


if __name__ == "__main__":
    main()
