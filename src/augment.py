"""Augment the Kaggle cardio dataset with medical-history, wearable, and
lifestyle features so the model can be trained on the full expanded input set.

The Kaggle 'Cardiovascular Disease dataset' has no wearable or lifestyle
columns, so this script SYNTHESIZES them with clinically plausible
correlations (seeded, reproducible). This is a prototype/dissertation
technique — the generated columns carry signal derived from the real
label and real vitals, and the report/README documents that they are
synthetic. Swap in a real extended dataset here when one is available.

Usage:
    python -m src.augment --data data/cardio_train.csv --out data/cardio_extended.csv
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from src.preprocessing import clean, engineer_features, load_raw

SEED = 42


def augment(df: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    n = len(df)
    y = df["cardio"].to_numpy()
    age = df["age_years"].to_numpy()
    ap_hi = df["ap_hi"].to_numpy()
    ap_lo = df["ap_lo"].to_numpy()
    gluc = df["gluc"].to_numpy()
    chol = df["cholesterol"].to_numpy()
    smoke = df["smoke"].to_numpy()
    active = df["active"].to_numpy()

    out = df.copy()

    # ---- Medical history flags ------------------------------------------------
    p_diab = 0.04 + 0.55 * (gluc == 3) + 0.10 * (gluc == 2) + 0.04 * y
    out["diabetes"] = (rng.random(n) < p_diab).astype(int)

    hypertensive = (ap_hi >= 140) | (ap_lo >= 90)
    out["hypertension_dx"] = ((rng.random(n) < 0.75) & hypertensive).astype(int)

    out["high_chol_dx"] = ((rng.random(n) < (0.10 + 0.55 * (chol >= 2)))).astype(int)
    out["family_history"] = (rng.random(n) < (0.18 + 0.14 * y)).astype(int)
    out["prior_heart_disease"] = (rng.random(n) < (0.02 + 0.08 * y)).astype(int)

    p_meds = 0.10 + 0.35 * out["hypertension_dx"] + 0.25 * out["diabetes"] + 0.10 * (age > 55)
    out["on_meds"] = (rng.random(n) < np.clip(p_meds, 0, 0.95)).astype(int)

    # ---- Wearable-sensor vitals -------------------------------------------------
    out["resting_hr"] = np.clip(
        rng.normal(71, 8, n) + 6 * y + 4 * smoke - 3 * active + 0.08 * (age - 50), 45, 130
    ).round(0)
    out["hrv_ms"] = np.clip(
        rng.normal(48, 13, n) - 9 * y - 0.35 * (age - 50) + 5 * active, 8, 150
    ).round(1)
    out["spo2"] = np.clip(rng.normal(97.6, 0.9, n) - 0.8 * smoke - 0.5 * y, 88, 100).round(1)
    out["resp_rate"] = np.clip(rng.normal(14.8, 1.8, n) + 1.4 * y, 10, 30).round(1)
    out["body_temp"] = np.clip(rng.normal(36.8, 0.25, n), 35.5, 38.5).round(2)

    # ---- Clinical test reports (ECG / 2D Echo / TMT / CAC score) ---------------
    # ecg_result: 0 = normal, 1 = ST-T abnormality, 2 = left ventricular hypertrophy
    u = rng.random(n)
    p_abn = 0.13 + 0.16 * y + 0.10 * hypertensive
    p_lvh = 0.04 + 0.09 * y + 0.08 * hypertensive
    out["ecg_result"] = np.select([u < p_lvh, u < p_lvh + p_abn], [2, 1], default=0)

    # lvef: left ventricular ejection fraction from 2D Echo (%, normal 55-70)
    out["lvef"] = np.clip(
        rng.normal(62, 5, n) - 10 * out["prior_heart_disease"] - 3.5 * y, 25, 75
    ).round(0)

    # tmt_result: 0 = not performed, 1 = negative, 2 = positive (inducible ischemia)
    done = rng.random(n) < 0.40
    positive = rng.random(n) < (0.10 + 0.30 * y)
    out["tmt_result"] = np.where(done, np.where(positive, 2, 1), 0)

    # cac_score: Agatston coronary artery calcium score (zero-inflated)
    p_nonzero = np.clip(0.03 * (age - 38), 0, 0.75) + 0.20 * y
    nonzero = rng.random(n) < np.clip(p_nonzero, 0, 0.92)
    magnitude = np.exp(rng.normal(3.0 + 0.05 * (age - 50) + 0.9 * y, 1.1, n))
    out["cac_score"] = np.where(nonzero, np.clip(magnitude, 1, 3000), 0).round(0)

    # ---- Lifestyle -------------------------------------------------------------
    stress = np.clip(rng.normal(5.0, 2.0, n) + 0.8 * y, 1, 10).round(0)
    out["stress_level"] = stress
    out["sleep_hours"] = np.clip(rng.normal(7.1, 1.0, n) - 0.12 * (stress - 5) - 0.25 * y, 3, 12).round(1)
    out["sleep_quality"] = np.clip(rng.normal(6.8, 1.6, n) - 0.25 * (stress - 5) - 0.5 * y, 1, 10).round(0)
    out["daily_steps"] = np.clip(
        rng.normal(6800, 2600, n) + 2600 * active - 1200 * y - 30 * (age - 50), 300, 30000
    ).round(0)
    out["exercise_freq"] = np.clip(
        rng.normal(2.2, 1.6, n) + 1.8 * active - 0.5 * y, 0, 7
    ).round(0)

    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/cardio_train.csv")
    parser.add_argument("--out", default="data/cardio_extended.csv")
    args = parser.parse_args()

    df = load_raw(args.data)
    df = clean(df)
    df = engineer_features(df)
    df = augment(df)
    df.to_csv(args.out, index=False)
    print(f"Wrote {len(df)} rows x {len(df.columns)} cols to {args.out}")


if __name__ == "__main__":
    main()
