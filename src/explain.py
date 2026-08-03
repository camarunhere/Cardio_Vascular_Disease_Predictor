"""SHAP explainability layer.

Realizes the <<include>> from 'Predict Cardiovascular Disease Risk' to
'View SHAP/LIME Explanation': every risk prediction is accompanied by the
feature contributions that drove it.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import shap
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


def _make_explainer(pipeline: Pipeline, background: np.ndarray):
    clf = pipeline.named_steps["clf"]
    if isinstance(clf, (RandomForestClassifier, GradientBoostingClassifier)):
        return shap.TreeExplainer(clf)
    if isinstance(clf, LogisticRegression):
        return shap.LinearExplainer(clf, background)
    # Fallback: model-agnostic explainer for any other estimator type.
    return shap.Explainer(clf.predict_proba, background)


def explain_prediction(
    pipeline: Pipeline, X_row: pd.DataFrame, background: pd.DataFrame, top_n: int = 5
) -> list[dict]:
    """Return the top_n features that most influenced this single prediction."""
    prep = pipeline.named_steps["prep"]
    feature_names = prep.get_feature_names_out()

    X_row_t = prep.transform(X_row)
    background_t = prep.transform(background)

    explainer = _make_explainer(pipeline, background_t)
    shap_values = explainer.shap_values(X_row_t)

    # Tree/Linear explainers on a binary classifier may return a list of
    # per-class arrays; take the "positive" (high-risk) class contribution.
    if isinstance(shap_values, list):
        shap_values = shap_values[1]

    row_values = np.asarray(shap_values)[0]
    row_features = np.asarray(X_row_t.todense() if hasattr(X_row_t, "todense") else X_row_t)[0]

    ranked = sorted(
        zip(feature_names, row_features, row_values),
        key=lambda t: abs(t[2]),
        reverse=True,
    )[:top_n]

    return [
        {
            "feature": name,
            "value": float(value),
            "shap_contribution": float(contribution),
            "direction": "increases_risk" if contribution > 0 else "decreases_risk",
        }
        for name, value, contribution in ranked
    ]
