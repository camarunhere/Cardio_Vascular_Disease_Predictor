"""Shared services: model inference, human-readable labels, PDF report generation."""

from __future__ import annotations

import json
from datetime import datetime

from fpdf import FPDF
from sqlalchemy.orm import Session

from api.models import ClinicalRecommendation, HealthRecord, Setting, User
from src.predict import CardioRiskPredictor, PatientInput

_LEVEL_TEXT = {1: "normal", 2: "above normal", 3: "well above normal"}


def get_risk_threshold(db: Session) -> float:
    row = db.get(Setting, "risk_threshold")
    return float(row.value) if row else 0.5


def run_prediction(
    predictor: CardioRiskPredictor, db: Session, patient: User, data: dict
) -> HealthRecord:
    """'Predict Cardiovascular Disease Risk' — always with SHAP (<<include>>)."""
    patient_input = PatientInput(
        age_days=int(data["age_years"] * 365.25),
        gender=data["gender"],
        height_cm=data["height_cm"],
        weight_kg=data["weight_kg"],
        ap_hi=data["ap_hi"],
        ap_lo=data["ap_lo"],
        cholesterol=data["cholesterol"],
        gluc=data["gluc"],
        smoke=data["smoke"],
        alco=data["alco"],
        active=data["active"],
    )
    result = predictor.predict(patient_input, explain=True)

    threshold = get_risk_threshold(db)
    probability = result["risk_probability"]
    record = HealthRecord(
        patient_id=patient.id,
        **{k: data[k] for k in (
            "age_years", "gender", "height_cm", "weight_kg", "ap_hi", "ap_lo",
            "cholesterol", "gluc", "smoke", "alco", "active",
        )},
        risk_probability=probability,
        risk_classification="high_risk" if probability >= threshold else "low_risk",
        explanation_json=json.dumps(humanize_explanation(result["explanation"], data)),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


_NUMERIC_LABELS = {
    "age_years": lambda d: f"Age ({d['age_years']} years)",
    "ap_hi": lambda d: f"Systolic blood pressure ({d['ap_hi']} mmHg)",
    "ap_lo": lambda d: f"Diastolic blood pressure ({d['ap_lo']} mmHg)",
    "bmi": lambda d: f"BMI ({d['weight_kg'] / (d['height_cm'] / 100) ** 2:.1f})",
    "pulse_pressure": lambda d: f"Pulse pressure ({d['ap_hi'] - d['ap_lo']} mmHg)",
}

_CATEGORICAL_LABELS = {
    "gender": lambda d: "Male" if d["gender"] == 2 else "Female",
    "cholesterol": lambda d: f"Cholesterol ({_LEVEL_TEXT[d['cholesterol']]})",
    "gluc": lambda d: f"Glucose ({_LEVEL_TEXT[d['gluc']]})",
    "smoke": lambda d: "Smoker" if d["smoke"] else "Non-smoker",
    "alco": lambda d: "Alcohol intake" if d["alco"] else "No alcohol intake",
    "active": lambda d: "Physically active" if d["active"] else "Physically inactive",
}


def humanize_explanation(explanation: list[dict], data: dict) -> list[dict]:
    """Translate transformed feature names (num__ap_hi, cat__cholesterol_3)
    into patient-readable labels, keeping SHAP weight and direction."""
    items: list[dict] = []
    seen: set[str] = set()
    for item in explanation:
        feature = item["feature"]
        if feature.startswith("num__"):
            labeler = _NUMERIC_LABELS.get(feature[len("num__"):])
        elif feature.startswith("cat__"):
            labeler = _CATEGORICAL_LABELS.get(feature[len("cat__"):].rsplit("_", 1)[0])
        else:
            labeler = None
        if labeler is None:
            continue
        label = labeler(data)
        if label in seen:
            continue
        seen.add(label)
        items.append(
            {
                "factor": label,
                "shap_contribution": round(item["shap_contribution"], 4),
                "direction": item["direction"],
            }
        )
    return items


def record_to_dict(record: HealthRecord) -> dict:
    return {
        "id": record.id,
        "created_at": record.created_at.isoformat(),
        "inputs": {
            "age_years": record.age_years,
            "gender": record.gender,
            "height_cm": record.height_cm,
            "weight_kg": record.weight_kg,
            "ap_hi": record.ap_hi,
            "ap_lo": record.ap_lo,
            "cholesterol": record.cholesterol,
            "gluc": record.gluc,
            "smoke": record.smoke,
            "alco": record.alco,
            "active": record.active,
        },
        "risk_probability": record.risk_probability,
        "risk_classification": record.risk_classification,
        "explanation": json.loads(record.explanation_json),
        "review_note": record.review_note,
        "reviewed_at": record.reviewed_at.isoformat() if record.reviewed_at else None,
    }


def build_pdf_report(db: Session, record: HealthRecord, patient: User) -> bytes:
    """'Download Prediction Report' — PDF summary of one prediction."""
    explanation = json.loads(record.explanation_json)
    recommendations = (
        db.query(ClinicalRecommendation)
        .filter(ClinicalRecommendation.patient_id == patient.id)
        .order_by(ClinicalRecommendation.created_at.desc())
        .limit(5)
        .all()
    )

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Cardiovascular Disease Prediction Report", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100)
    pdf.cell(0, 6, f"Generated {datetime.utcnow():%Y-%m-%d %H:%M} UTC", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_text_color(0)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Patient", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 6, f"Name: {patient.full_name}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Email: {patient.email}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Assessment date: {record.created_at:%Y-%m-%d %H:%M} UTC", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "AI Risk Assessment", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 14)
    high = record.risk_classification == "high_risk"
    pdf.set_text_color(220, 38, 38) if high else pdf.set_text_color(22, 163, 74)
    pdf.cell(
        0, 8,
        f"{'HIGH RISK' if high else 'LOW RISK'} - {record.risk_probability * 100:.1f}% probability",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.set_text_color(0)
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Health Information Provided", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    rows = [
        f"Age: {record.age_years} years    Gender: {'Male' if record.gender == 2 else 'Female'}",
        f"Height: {record.height_cm:g} cm    Weight: {record.weight_kg:g} kg",
        f"Blood pressure: {record.ap_hi}/{record.ap_lo} mmHg",
        f"Cholesterol: {_LEVEL_TEXT[record.cholesterol]}    Glucose: {_LEVEL_TEXT[record.gluc]}",
        f"Smoker: {'yes' if record.smoke else 'no'}    Alcohol: {'yes' if record.alco else 'no'}    "
        f"Physically active: {'yes' if record.active else 'no'}",
    ]
    for row in rows:
        pdf.cell(0, 6, row, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Explanation (SHAP) - Key Contributing Factors", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    for item in explanation:
        arrow = "increases risk" if item["direction"] == "increases_risk" else "decreases risk"
        pdf.cell(0, 6, f"- {item['factor']}: {arrow}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    if record.review_note:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Clinician Review", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        pdf.multi_cell(0, 6, record.review_note)
        pdf.ln(2)

    if recommendations:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Clinical Recommendations", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        for rec in recommendations:
            pdf.multi_cell(0, 6, f"- {rec.recommendation}")
        pdf.ln(2)

    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(100)
    pdf.multi_cell(
        0, 5,
        "This assessment is generated by a machine learning model and does not replace "
        "professional medical advice.",
    )
    return bytes(pdf.output())
