"""Academic benchmark: compares Logistic Regression, Decision Tree, Random
Forest and Gradient Boosting on the real UCI Heart Disease (Cleveland)
dataset (Andrzejak et al./Detrano et al., 303 patients, 13 clinical features).

This is a methodology/results-chapter artifact, independent of the deployed
website model: it validates that the app's model-selection approach — train
several classifiers, compare them empirically on held-out data and 5-fold CV,
pick the best by ROC-AUC, explain it with SHAP — reproduces on the standard
academic benchmark for this problem, not just the larger Kaggle dataset the
live site uses. It does not touch models/cvd_model*.joblib.

Usage:
    python -m src.train_uci_benchmark --data data/uci_heart_disease_raw.csv
"""

from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd
import shap
from catboost import CatBoostClassifier
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.impute import SimpleImputer
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

# Column order as documented by the UCI repository for processed.cleveland.data.
COLUMNS = [
    "age", "sex", "cp", "trestbps", "chol", "fbs", "restecg",
    "thalach", "exang", "oldpeak", "slope", "ca", "thal", "num",
]
NUMERIC_FEATURES = ["age", "trestbps", "chol", "thalach", "oldpeak"]
CATEGORICAL_FEATURES = ["sex", "cp", "fbs", "restecg", "exang", "slope", "ca", "thal"]
TARGET = "num"

CANDIDATES = {
    "logistic_regression": LogisticRegression(max_iter=1000),
    "decision_tree": DecisionTreeClassifier(max_depth=4, random_state=42),
    "catboost": CatBoostClassifier(iterations=300, depth=6, random_state=42, verbose=False),
    "gradient_boosting": GradientBoostingClassifier(random_state=42),
}


def load_uci(csv_path: str) -> tuple[pd.DataFrame, pd.Series]:
    df = pd.read_csv(csv_path, header=None, names=COLUMNS, na_values="?")
    # Standard binarization for this dataset: 0 = no disease, 1-4 = disease present.
    y = (df[TARGET] > 0).astype(int)
    X = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
    return X, y


def build_pipeline(estimator) -> Pipeline:
    prep = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), NUMERIC_FEATURES),
            ("cat", Pipeline([("impute", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), CATEGORICAL_FEATURES),
        ]
    )
    return Pipeline([("prep", prep), ("clf", estimator)])


def full_metrics(y_true, y_pred, y_proba) -> dict:
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred)), 4),
        "recall": round(float(recall_score(y_true, y_pred)), 4),
        "f1_score": round(float(f1_score(y_true, y_pred)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, y_proba)), 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/uci_heart_disease_raw.csv")
    parser.add_argument("--out", default="models/uci_benchmark_metadata.json")
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    X, y = load_uci(args.data)
    print(f"UCI Heart Disease (Cleveland): {len(X)} patients, {X.shape[1]} features, "
          f"{y.mean():.1%} positive (disease present)\n")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed, stratify=y
    )

    print("=== 5-fold cross-validation (training set) ===")
    cv_table = []
    for name, estimator in CANDIDATES.items():
        pipeline = build_pipeline(estimator)
        scores = cross_val_score(pipeline, X_train, y_train, cv=5, scoring="roc_auc", n_jobs=-1)
        cv_table.append({
            "model": name,
            "cv_roc_auc_mean": round(float(scores.mean()), 4),
            "cv_roc_auc_std": round(float(scores.std()), 4),
        })
        print(f"{name:20s} CV ROC-AUC = {scores.mean():.4f} (+/- {scores.std():.4f})")

    print("\n=== Held-out test set comparison ===")
    comparison_table = []
    fitted = {}
    for name, estimator in CANDIDATES.items():
        pipeline = build_pipeline(estimator)
        pipeline.fit(X_train, y_train)
        fitted[name] = pipeline
        pred = pipeline.predict(X_test)
        proba = pipeline.predict_proba(X_test)[:, 1]
        metrics = full_metrics(y_test, pred, proba)
        metrics["model"] = name
        comparison_table.append(metrics)
        print(
            f"{name:20s} acc={metrics['accuracy']:.4f}  prec={metrics['precision']:.4f}  "
            f"rec={metrics['recall']:.4f}  f1={metrics['f1_score']:.4f}  "
            f"roc_auc={metrics['roc_auc']:.4f}"
        )

    best_name = max(comparison_table, key=lambda m: m["roc_auc"])["model"]
    best_pipeline = fitted[best_name]
    print(f"\nBest performing model on this benchmark: {best_name}")
    print(classification_report(y_test, best_pipeline.predict(X_test), target_names=["no_disease", "disease"]))

    # SHAP explainability check — confirms the winning model is explainable
    # with the same TreeExplainer approach used in the live app, or falls
    # back to a model-agnostic explainer if a linear model happens to win.
    prep = best_pipeline.named_steps["prep"]
    clf = best_pipeline.named_steps["clf"]
    X_test_t = prep.transform(X_test)
    X_test_t = X_test_t.toarray() if hasattr(X_test_t, "toarray") else X_test_t
    feature_names = list(prep.get_feature_names_out())
    if isinstance(clf, (CatBoostClassifier, GradientBoostingClassifier, DecisionTreeClassifier)):
        explainer = shap.TreeExplainer(clf)
        shap_values = explainer.shap_values(X_test_t)
        if isinstance(shap_values, list):
            shap_values = shap_values[1]
    else:
        explainer = shap.LinearExplainer(clf, X_test_t)
        shap_values = explainer.shap_values(X_test_t)
    mean_abs_shap = np.abs(np.asarray(shap_values)).mean(axis=0)
    top5 = sorted(zip(feature_names, mean_abs_shap), key=lambda t: -t[1])[:5]
    print("\nTop 5 features by mean |SHAP value| (explainability check):")
    for name, val in top5:
        print(f"  {name:30s} {val:.4f}")

    metadata = {
        "dataset": "UCI Heart Disease (Cleveland), Detrano et al. 1989 / UCI ML Repository #45",
        "n_patients": int(len(X)),
        "n_features": int(X.shape[1]),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "best_model": best_name,
        "cross_validation": cv_table,
        "test_set_comparison": comparison_table,
        "top_shap_features": [{"feature": n, "mean_abs_shap": round(float(v), 4)} for n, v in top5],
        "note": (
            "Independent benchmark validating the site's model-selection methodology "
            "(compare Logistic Regression / Decision Tree / Random Forest / Gradient "
            "Boosting, select best by ROC-AUC, explain with SHAP) on the standard "
            "academic dataset for this problem. Does not affect the deployed website "
            "model, which is trained on the larger Kaggle cardio dataset "
            "(70,000 patients) with wearable/clinical-test features."
        ),
    }
    with open(args.out, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"\nSaved benchmark results to {args.out}")


if __name__ == "__main__":
    main()
