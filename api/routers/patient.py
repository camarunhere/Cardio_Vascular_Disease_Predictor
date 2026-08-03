"""Patient use cases: Manage Profile, Enter Health Information, Upload ECG/Medical
Report, View Dashboard, View AI Prediction Results (+ SHAP explanation), View
Health History, Download Prediction Report."""

from __future__ import annotations

from typing import Optional

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.auth import log_activity, require_role
from api.db import get_db
from api.models import ClinicalRecommendation, HealthRecord, UploadedReport, User
from api.services import build_pdf_report, record_to_dict, run_prediction

router = APIRouter(prefix="/api/patient", tags=["patient"])

UPLOAD_DIR = Path("data/uploads")
ALLOWED_UPLOAD_TYPES = {".pdf", ".png", ".jpg", ".jpeg", ".csv", ".txt", ".dcm", ".xml"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

patient_only = require_role("patient")


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    address: Optional[str] = None


class HealthInformation(BaseModel):
    """'Enter Health Information' payload."""

    age_years: int = Field(..., ge=1, le=120)
    gender: int = Field(..., ge=1, le=2, description="1 = female, 2 = male")
    height_cm: float = Field(..., gt=0)
    weight_kg: float = Field(..., gt=0)
    ap_hi: int = Field(..., description="Systolic blood pressure")
    ap_lo: int = Field(..., description="Diastolic blood pressure")
    cholesterol: int = Field(..., ge=1, le=3)
    gluc: int = Field(..., ge=1, le=3)
    smoke: int = Field(..., ge=0, le=1)
    alco: int = Field(..., ge=0, le=1)
    active: int = Field(..., ge=0, le=1)


@router.get("/profile")
def get_profile(user: User = Depends(patient_only)) -> dict:
    return {
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "date_of_birth": user.date_of_birth,
        "address": user.address,
    }


@router.put("/profile")
def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(patient_only),
    db: Session = Depends(get_db),
) -> dict:
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.add(user)
    db.commit()
    log_activity(db, user, "update_profile")
    return {"message": "Profile updated."}


@router.post("/predict")
def predict(
    payload: HealthInformation,
    request: Request,
    user: User = Depends(patient_only),
    db: Session = Depends(get_db),
) -> dict:
    """'View AI Prediction Results' -> runs 'Predict Cardiovascular Disease Risk'
    -> includes 'View SHAP/LIME Explanation' (per the <<include>> chain)."""
    predictor = request.app.state.predictor
    if predictor is None:
        raise HTTPException(503, "AI model not loaded yet.")
    try:
        record = run_prediction(predictor, db, user, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    log_activity(db, user, "predict", f"record={record.id} p={record.risk_probability:.3f}")
    return record_to_dict(record)


@router.get("/dashboard")
def dashboard(user: User = Depends(patient_only), db: Session = Depends(get_db)) -> dict:
    """'View Dashboard' — aggregate personal health metrics."""
    records = (
        db.query(HealthRecord)
        .filter(HealthRecord.patient_id == user.id)
        .order_by(HealthRecord.created_at.desc())
        .all()
    )
    recommendations = (
        db.query(ClinicalRecommendation)
        .filter(ClinicalRecommendation.patient_id == user.id)
        .order_by(ClinicalRecommendation.created_at.desc())
        .all()
    )
    doctor_names = {
        u.id: u.full_name
        for u in db.query(User).filter(
            User.id.in_([r.doctor_id for r in recommendations] or [0])
        )
    }
    uploads = (
        db.query(UploadedReport)
        .filter(UploadedReport.patient_id == user.id)
        .order_by(UploadedReport.uploaded_at.desc())
        .all()
    )
    return {
        "total_assessments": len(records),
        "latest": record_to_dict(records[0]) if records else None,
        "risk_trend": [
            {"date": r.created_at.isoformat(), "risk_probability": r.risk_probability}
            for r in reversed(records[-10:] if len(records) > 10 else records)
        ],
        "recommendations": [
            {
                "id": rec.id,
                "doctor": doctor_names.get(rec.doctor_id, "Doctor"),
                "recommendation": rec.recommendation,
                "created_at": rec.created_at.isoformat(),
            }
            for rec in recommendations
        ],
        "uploads": [
            {"id": up.id, "filename": up.filename, "uploaded_at": up.uploaded_at.isoformat()}
            for up in uploads
        ],
    }


@router.get("/history")
def history(user: User = Depends(patient_only), db: Session = Depends(get_db)) -> list[dict]:
    """'View Health History' — all past submissions and risk results."""
    records = (
        db.query(HealthRecord)
        .filter(HealthRecord.patient_id == user.id)
        .order_by(HealthRecord.created_at.desc())
        .all()
    )
    return [record_to_dict(r) for r in records]


@router.get("/records/{record_id}/report")
def download_report(
    record_id: int,
    user: User = Depends(patient_only),
    db: Session = Depends(get_db),
) -> Response:
    """'Download Prediction Report' — PDF."""
    record = db.get(HealthRecord, record_id)
    if record is None or record.patient_id != user.id:
        raise HTTPException(404, "Record not found.")
    pdf_bytes = build_pdf_report(db, record, user)
    log_activity(db, user, "download_report", f"record={record_id}")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="cvd_report_{record_id}.pdf"'
        },
    )


@router.post("/upload")
async def upload_report(
    file: UploadFile,
    user: User = Depends(patient_only),
    db: Session = Depends(get_db),
) -> dict:
    """'Upload ECG/Medical Report'."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(
            422, f"Unsupported file type '{suffix}'. Allowed: {', '.join(sorted(ALLOWED_UPLOAD_TYPES))}"
        )
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(422, "File exceeds the 20 MB limit.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_path = UPLOAD_DIR / f"{user.id}_{uuid.uuid4().hex}{suffix}"
    stored_path.write_bytes(content)

    upload = UploadedReport(
        patient_id=user.id,
        filename=file.filename or stored_path.name,
        stored_path=str(stored_path),
        content_type=file.content_type,
    )
    db.add(upload)
    db.commit()
    log_activity(db, user, "upload_report", file.filename or "")
    return {"message": f"Uploaded {file.filename}.", "id": upload.id}
