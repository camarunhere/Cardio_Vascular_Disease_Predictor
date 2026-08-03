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
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from src.preprocessing import CATEGORICAL_FEATURES, NUMERIC_FEATURES, prepare_dataset

CANDIDATES = {
    "logistic_regression": LogisticRegression(max_iter=1000),
    "random_forest": RandomForestClassifier(
        n_estimators=300, max_depth=8, random_state=42, n_jobs=-1
    ),
    "gradient_boosting": GradientBoostingClassifier(random_state=42),
}


def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), NUMERIC_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ]
    )


def select_best_model(X_train, y_train) -> tuple[str, Pipeline]:
    scored = []
    for name, estimator in CANDIDATES.items():
        pipeline = Pipeline([("prep", build_preprocessor()), ("clf", estimator)])
        scores = cross_val_score(
            pipeline, X_train, y_train, cv=5, scoring="roc_auc", n_jobs=-1
        )
        scored.append((scores.mean(), name, pipeline))
        print(f"{name:20s} CV ROC-AUC = {scores.mean():.4f} (+/- {scores.std():.4f})")

    scored.sort(key=lambda t: t[0], reverse=True)
    best_score, best_name, best_pipeline = scored[0]
    print(f"\nSelected model: {best_name} (CV ROC-AUC = {best_score:.4f})")
    return best_name, best_pipeline


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

    best_name, pipeline = select_best_model(X_train, y_train)
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)[:, 1]
    test_auc = roc_auc_score(y_test, y_proba)

    print(f"\nHeld-out test ROC-AUC: {test_auc:.4f}")
    print(classification_report(y_test, y_pred, target_names=["low_risk", "high_risk"]))

    joblib.dump(pipeline, args.out)
    metadata = {
        "model_name": best_name,
        "test_roc_auc": round(float(test_auc), 4),
        "features": list(X.columns),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
    }
    with open(args.out.replace(".joblib", "_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"\nSaved model to {args.out}")


if __name__ == "__main__":
    main()
