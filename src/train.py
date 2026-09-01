"""Train and select the Cardiovascular Disease Risk model.

Realizes the 'Predict Cardiovascular Disease Risk' use case (offline half):
fits a scikit-learn pipeline, compares candidate models on ROC-AUC via
cross-validation, and persists the best one for the FastAPI serving layer
('Manage AI Model' use case covers retraining/redeploying this artifact).

Usage:
    python -m src.train --data data/cardio_train.csv --out models/cvd_model.joblib
"""

from __future__ import annotations

import argparse
import json

import joblib
import numpy as np
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

from src.preprocessing import CATEGORICAL_FEATURES, NUMERIC_FEATURES, prepare_dataset

# Four supervised classifiers are compared empirically (5-fold CV ROC-AUC);
# the best-performing one is selected and deployed — the model is never
# hand-picked, it is determined by measured performance on held-out data.
CANDIDATES = {
    "logistic_regression": LogisticRegression(max_iter=1000),
    "decision_tree": DecisionTreeClassifier(max_depth=6, random_state=42),
    "catboost": CatBoostClassifier(
        iterations=300, depth=6, random_state=42, verbose=False
    ),
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


def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), NUMERIC_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ]
    )


def select_best_model(X_train, y_train) -> tuple[str, Pipeline, list[dict]]:
    scored = []
    cv_table = []
    for name, estimator in CANDIDATES.items():
        pipeline = Pipeline([("prep", build_preprocessor()), ("clf", estimator)])
        scores = cross_val_score(
            pipeline, X_train, y_train, cv=5, scoring="roc_auc", n_jobs=-1
        )
        scored.append((scores.mean(), name, pipeline))
        cv_table.append({
            "model": name,
            "cv_roc_auc_mean": round(float(scores.mean()), 4),
            "cv_roc_auc_std": round(float(scores.std()), 4),
        })
        print(f"{name:20s} CV ROC-AUC = {scores.mean():.4f} (+/- {scores.std():.4f})")

    scored.sort(key=lambda t: t[0], reverse=True)
    best_score, best_name, best_pipeline = scored[0]
    print(f"\nSelected model: {best_name} (CV ROC-AUC = {best_score:.4f})")
    return best_name, best_pipeline, cv_table


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/cardio_train.csv")
    parser.add_argument("--out", default="models/cvd_model.joblib")
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    X, y = prepare_dataset(args.data)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed, stratify=y
    )

    best_name, pipeline, cv_table = select_best_model(X_train, y_train)
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)[:, 1]
    test_auc = roc_auc_score(y_test, y_proba)

    print(f"\nHeld-out test ROC-AUC: {test_auc:.4f}")
    print(classification_report(y_test, y_pred, target_names=["low_risk", "high_risk"]))

    # Full held-out-test comparison across all four candidates (not just the
    # winner) — the results table for the dissertation's methodology chapter.
    print("\n=== Full model comparison on held-out test set ===")
    comparison_table = []
    for name, estimator in CANDIDATES.items():
        candidate_pipeline = Pipeline([("prep", build_preprocessor()), ("clf", estimator)])
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
        "features": list(X.columns),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
    }
    with open(args.out.replace(".joblib", "_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"\nSaved model to {args.out}")


if __name__ == "__main__":
    main()
