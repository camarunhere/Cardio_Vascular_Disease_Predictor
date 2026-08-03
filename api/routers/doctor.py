"""Doctor use cases: View Patient Records (auto-includes AI prediction results),
Review Prediction Results, Generate Clinical Recommendation, Download Prediction
Report."""

from __future__ import annotations

from typing import Optional

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.auth import log_activity, require_role
from api.db import get_db
from api.models import ClinicalRecommendation, HealthRecord, UploadedReport, User
from api.services import build_pdf_report, record_to_dict

router = APIRouter(prefix="/api/doctor", tags=["doctor"])

doctor_only = require_role("doctor")


class ReviewRequest(BaseModel):
    note: str = Field(..., min_length=3)


class RecommendationRequest(BaseModel):
    recommendation: str = Field(..., min_length=3)
    record_id: Optional[int] = None


@router.get("/patients")
def list_patients(user: User = Depends(doctor_only), db: Session = Depends(get_db)) -> list[dict]:
    patients = db.query(User).filter(User.role == "patient").order_by(User.full_name).all()
    counts = {
        p.id: db.query(HealthRecord).filter(HealthRecord.patient_id == p.id).count()
        for p in patients
    }
    latest = {}
    for p in patients:
        rec = (
            db.query(HealthRecord)
            .filter(HealthRecord.patient_id == p.id)
            .order_by(HealthRecord.created_at.desc())
            .first()
        )
        latest[p.id] = rec
    return [
        {
            "id": p.id,
            "full_name": p.full_name,
            "email": p.email,
            "assessments": counts[p.id],
            "latest_risk": latest[p.id].risk_classification if latest[p.id] else None,
            "latest_probability": latest[p.id].risk_probability if latest[p.id] else None,
        }
        for p in patients
    ]


@router.get("/patients/{patient_id}/records")
def view_patient_records(
    patient_id: int,
    user: User = Depends(doctor_only),
    db: Session = Depends(get_db),
) -> dict:
    """'View Patient Records' — per the <<include>> relationship, the patient's
    AI prediction results are aggregated directly into the record view."""
    patient = db.get(User, patient_id)
    if patient is None or patient.role != "patient":
        raise HTTPException(404, "Patient not found.")

    records = (
        db.query(HealthRecord)
        .filter(HealthRecord.patient_id == patient_id)
        .order_by(HealthRecord.created_at.desc())
        .all()
    )
    uploads = (
        db.query(UploadedReport)
        .filter(UploadedReport.patient_id == patient_id)
        .order_by(UploadedReport.uploaded_at.desc())
        .all()
    )
    recommendations = (
        db.query(ClinicalRecommendation)
        .filter(ClinicalRecommendation.patient_id == patient_id)
        .order_by(ClinicalRecommendation.created_at.desc())
        .all()
    )
    log_activity(db, user, "view_patient_records", f"patient={patient_id}")
    return {
        "patient": {
            "id": patient.id,
            "full_name": patient.full_name,
            "email": patient.email,
            "phone": patient.phone,
            "date_of_birth": patient.date_of_birth,
        },
        "records": [record_to_dict(r) for r in records],
        "uploads": [
            {"id": u.id, "filename": u.filename, "uploaded_at": u.uploaded_at.isoformat()}
            for u in uploads
        ],
        "recommendations": [
            {
                "id": rec.id,
                "recommendation": rec.recommendation,
                "created_at": rec.created_at.isoformat(),
            }
            for rec in recommendations
        ],
    }


@router.post("/records/{record_id}/review")
def review_prediction(
    record_id: int,
    payload: ReviewRequest,
    user: User = Depends(doctor_only),
    db: Session = Depends(get_db),
) -> dict:
    """'Review Prediction Results'."""
    record = db.get(HealthRecord, record_id)
    if record is None:
        raise HTTPException(404, "Record not found.")
    record.reviewed_by_id = user.id
    record.review_note = payload.note
    record.reviewed_at = datetime.utcnow()
    db.add(record)
    db.commit()
    log_activity(db, user, "review_prediction", f"record={record_id}")
    return {"message": "Review saved."}


@router.post("/patients/{patient_id}/recommendations")
def generate_recommendation(
    patient_id: int,
    payload: RecommendationRequest,
    user: User = Depends(doctor_only),
    db: Session = Depends(get_db),
) -> dict:
    """'Generate Clinical Recommendation'."""
    patient = db.get(User, patient_id)
    if patient is None or patient.role != "patient":
        raise HTTPException(404, "Patient not found.")
    rec = ClinicalRecommendation(
        patient_id=patient_id,
        doctor_id=user.id,
        record_id=payload.record_id,
        recommendation=payload.recommendation,
    )
    db.add(rec)
    db.commit()
    log_activity(db, user, "generate_recommendation", f"patient={patient_id}")
    return {"message": "Recommendation saved.", "id": rec.id}


@router.get("/records/{record_id}/report")
def download_report(
    record_id: int,
    user: User = Depends(doctor_only),
    db: Session = Depends(get_db),
) -> Response:
    """'Download Prediction Report' (doctor side, e.g. for EHR filing)."""
    record = db.get(HealthRecord, record_id)
    if record is None:
        raise HTTPException(404, "Record not found.")
    patient = db.get(User, record.patient_id)
    pdf_bytes = build_pdf_report(db, record, patient)
    log_activity(db, user, "download_report", f"record={record_id}")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="cvd_report_{record_id}.pdf"'
        },
    )
