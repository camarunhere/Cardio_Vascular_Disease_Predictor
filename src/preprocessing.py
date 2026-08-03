"""Data loading and feature engineering for the cardio_train.csv dataset.

Expected raw columns (semicolon-delimited, as distributed on Kaggle):
id;age;gender;height;weight;ap_hi;ap_lo;cholesterol;gluc;smoke;alco;active;cardio

age        - days
gender     - 1 = women, 2 = men
height     - cm
weight     - kg
ap_hi/lo   - systolic / diastolic blood pressure
cholesterol/gluc - 1 = normal, 2 = above normal, 3 = well above normal
smoke/alco/active - binary
cardio     - target (0/1)
"""

from __future__ import annotations

import pandas as pd

RAW_TARGET = "cardio"

NUMERIC_FEATURES = [
    "age_years",
    "bmi",
    "ap_hi",
    "ap_lo",
    "pulse_pressure",
]
CATEGORICAL_FEATURES = [
    "gender",
    "cholesterol",
    "gluc",
    "smoke",
    "alco",
    "active",
]
FEATURE_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def load_raw(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path, sep=";")
    if "id" in df.columns:
        df = df.drop(columns=["id"])
    return df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["age_years"] = (df["age"] / 365.25).round(1)
    df["bmi"] = df["weight"] / (df["height"] / 100) ** 2
    df["pulse_pressure"] = df["ap_hi"] - df["ap_lo"]
    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Drop physiologically implausible rows (data-entry errors)."""
    df = df.copy()
    df = df[
        (df["ap_hi"].between(70, 250))
        & (df["ap_lo"].between(40, 180))
        & (df["ap_hi"] >= df["ap_lo"])
        & (df["height"].between(120, 220))
        & (df["weight"].between(30, 200))
    ]
    return df.reset_index(drop=True)


def prepare_dataset(csv_path: str) -> tuple[pd.DataFrame, pd.Series]:
    df = load_raw(csv_path)
    df = clean(df)
    df = engineer_features(df)
    X = df[FEATURE_COLUMNS]
    y = df[RAW_TARGET]
    return X, y
