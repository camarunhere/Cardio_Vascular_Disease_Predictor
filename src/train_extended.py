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
from catboost import CatBoostClassifier
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier

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
# explanations. Tree-based/non-parametric models keep that artifact small, so
# only they are candidates for deployment — Decision Tree is included as a
# non-parametric baseline alongside the two boosted ensembles.
CANDIDATES = {
    "decision_tree": DecisionTreeClassifier(max_depth=6, random_state=42),
    "catboost": CatBoostClassifier(iterations=300, depth=8, random_state=42, verbose=False),
    "gradient_boosting": GradientBoostingClassifier(random_state=42),
}


def full_metrics(y_true, y_pred, y_proba) -> dict:
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred)), 4),
        "recall": round(float(recall_score(y_true, y_pred)), 4),
        "f1_score": round(float(f1_score(y_true, y_pred)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, y_proba)), 4),
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
    cv_table = []
    for name, estimator in CANDIDATES.items():
        pipeline = build_pipeline(estimator)
        scores = cross_val_score(pipeline, X_train, y_train, cv=5, scoring="roc_auc", n_jobs=-1)
        scored.append((scores.mean(), name, pipeline))
        cv_table.append({
            "model": name,
            "cv_roc_auc_mean": round(float(scores.mean()), 4),
            "cv_roc_auc_std": round(float(scores.std()), 4),
        })
        print(f"{name:20s} CV ROC-AUC = {scores.mean():.4f} (+/- {scores.std():.4f})")

    scored.sort(key=lambda t: t[0], reverse=True)
    best_score, best_name, pipeline = scored[0]
    print(f"\nSelected model: {best_name} (CV ROC-AUC = {best_score:.4f})")

    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)[:, 1]
    test_auc = roc_auc_score(y_test, y_proba)
    print(f"\nHeld-out test ROC-AUC: {test_auc:.4f}")
    print(classification_report(y_test, y_pred, target_names=["low_risk", "high_risk"]))

    print("\n=== Full model comparison on held-out test set ===")
    comparison_table = []
    for name, estimator in CANDIDATES.items():
        candidate_pipeline = build_pipeline(estimator)
        candidate_pipeline.fit(X_train, y_train)
        cand_pred = candidate_pipeline.predict(X_test)
        cand_proba = candidate_pipeline.predict_proba(X_test)[:, 1]
        metrics = full_metrics(y_test, cand_pred, cand_proba)
        metrics["model"] = name
        comparison_table.append(metrics)
        print(
            f"{name:20s} acc={metrics['accuracy']:.4f}  prec={metrics['precision']:.4f}  "
            f"rec={metrics['recall']:.4f}  f1={metrics['f1_score']:.4f}  "
            f"roc_auc={metrics['roc_auc']:.4f}"
        )

    joblib.dump(pipeline, args.out)
    metadata = {
        "model_name": best_name,
        "test_roc_auc": round(float(test_auc), 4),
        "test_metrics": full_metrics(y_test, y_pred, y_proba),
        "cross_validation": cv_table,
        "model_comparison": comparison_table,
        "features": FEATURE_COLUMNS,
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "note": (
            "Trained on the Kaggle cardio dataset augmented with synthetic "
            "medical-history, wearable, and lifestyle features (src/augment.py). "
            "Logistic regression is excluded from candidates: it scores marginally "
            "higher on ROC-AUC but amplifies a demographic confound in the source "
            "data (smoking correlates with younger/male patients), producing a "
            "clinically misleading SHAP explanation. Non-parametric/tree-based "
            "models avoid this artifact."
        ),
    }
    with open(args.out.replace(".joblib", "_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"\nSaved model to {args.out}")


if __name__ == "__main__":
    main()
