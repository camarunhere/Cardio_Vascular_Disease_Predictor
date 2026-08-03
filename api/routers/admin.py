"""Administrator use cases: Manage Users, Manage Patient Records, Manage AI
Model (retrain / threshold / metadata), Generate System Reports, Monitor
Website Activity."""

from __future__ import annotations

from typing import Optional

import json
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.auth import log_activity, require_role
from api.db import get_db
from api.models import ActivityLog, HealthRecord, Setting, UploadedReport, User
from api.services import get_risk_threshold

router = APIRouter(prefix="/api/admin", tags=["admin"])

admin_only = require_role("admin")

MODEL_PATH = "models/cvd_model.joblib"
METADATA_PATH = "models/cvd_model_metadata.json"
DATA_PATH = "data/cardio_train.csv"

# Tracks an in-flight retrain launched from 'Manage AI Model'.
_retrain_process: Optional[subprocess.Popen] = None


class UserUpdate(BaseModel):
    is_verified: Optional[bool] = None
    is_blocked: Optional[bool] = None


class ThresholdUpdate(BaseModel):
    risk_threshold: float = Field(..., gt=0, lt=1)


# ---- Manage Users -----------------------------------------------------------

@router.get("/users")
def list_users(user: User = Depends(admin_only), db: Session = Depends(get_db)) -> list[dict]:
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "is_verified": u.is_verified,
            "is_blocked": u.is_blocked,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdate,
    user: User = Depends(admin_only),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found.")
    if target.role == "admin" and payload.is_blocked:
        raise HTTPException(403, "Administrators cannot be blocked.")
    if payload.is_verified is not None:
        target.is_verified = payload.is_verified
    if payload.is_blocked is not None:
        target.is_blocked = payload.is_blocked
    db.add(target)
    db.commit()
    log_activity(db, user, "manage_users", f"user={user_id} {payload.model_dump(exclude_none=True)}")
    return {"message": "User updated."}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int, user: User = Depends(admin_only), db: Session = Depends(get_db)
) -> dict:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found.")
    if target.role == "admin":
        raise HTTPException(403, "Administrators cannot be deleted.")
    db.delete(target)
    db.commit()
    log_activity(db, user, "manage_users", f"deleted user={user_id}")
    return {"message": "User deleted."}


# ---- Manage Patient Records -------------------------------------------------

@router.get("/records")
def list_records(user: User = Depends(admin_only), db: Session = Depends(get_db)) -> list[dict]:
    rows = (
        db.query(HealthRecord, User.full_name, User.email)
        .join(User, User.id == HealthRecord.patient_id)
        .order_by(HealthRecord.created_at.desc())
        .limit(500)
        .all()
    )
    return [
        {
            "id": r.id,
            "patient": name,
            "email": email,
            "created_at": r.created_at.isoformat(),
            "risk_probability": r.risk_probability,
            "risk_classification": r.risk_classification,
            "reviewed": r.reviewed_at is not None,
        }
        for r, name, email in rows
    ]


@router.delete("/records/{record_id}")
def delete_record(
    record_id: int, user: User = Depends(admin_only), db: Session = Depends(get_db)
) -> dict:
    record = db.get(HealthRecord, record_id)
    if record is None:
        raise HTTPException(404, "Record not found.")
    db.delete(record)
    db.commit()
    log_activity(db, user, "manage_patient_records", f"deleted record={record_id}")
    return {"message": "Record deleted."}


# ---- Manage AI Model --------------------------------------------------------

@router.get("/model")
def model_info(user: User = Depends(admin_only), db: Session = Depends(get_db)) -> dict:
    metadata = {}
    if Path(METADATA_PATH).exists():
        metadata = json.loads(Path(METADATA_PATH).read_text())
    global _retrain_process
    retraining = _retrain_process is not None and _retrain_process.poll() is None
    return {
        "metadata": metadata,
        "risk_threshold": get_risk_threshold(db),
        "model_file_exists": Path(MODEL_PATH).exists(),
        "retraining": retraining,
    }


@router.patch("/model/threshold")
def update_threshold(
    payload: ThresholdUpdate,
    user: User = Depends(admin_only),
    db: Session = Depends(get_db),
) -> dict:
    row = db.get(Setting, "risk_threshold")
    if row is None:
        row = Setting(key="risk_threshold", value=str(payload.risk_threshold))
    else:
        row.value = str(payload.risk_threshold)
    db.add(row)
    db.commit()
    log_activity(db, user, "manage_ai_model", f"threshold={payload.risk_threshold}")
    return {"message": f"Risk threshold set to {payload.risk_threshold}."}


@router.post("/model/retrain")
def retrain_model(
    request: Request, user: User = Depends(admin_only), db: Session = Depends(get_db)
) -> dict:
    """Kick off retraining in the background; reload the model when it finishes."""
    global _retrain_process
    if _retrain_process is not None and _retrain_process.poll() is None:
        raise HTTPException(409, "A retraining run is already in progress.")
    if not Path(DATA_PATH).exists():
        raise HTTPException(422, f"Training data not found at {DATA_PATH}.")

    _retrain_process = subprocess.Popen(
        [sys.executable, "-m", "src.train", "--data", DATA_PATH, "--out", MODEL_PATH],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    log_activity(db, user, "manage_ai_model", "retrain started")
    return {"message": "Retraining started. Refresh model status to track progress."}


@router.post("/model/reload")
def reload_model(
    request: Request, user: User = Depends(admin_only), db: Session = Depends(get_db)
) -> dict:
    """Swap the serving model for the freshly trained artifact."""
    from src.predict import CardioRiskPredictor

    if not Path(MODEL_PATH).exists():
        raise HTTPException(422, "No model artifact found.")
    request.app.state.predictor = CardioRiskPredictor(model_path=MODEL_PATH)
    log_activity(db, user, "manage_ai_model", "model reloaded")
    return {"message": "Model reloaded into the serving layer."}


# ---- Generate System Reports ------------------------------------------------

@router.get("/reports")
def system_reports(user: User = Depends(admin_only), db: Session = Depends(get_db)) -> dict:
    total_users = db.query(func.count(User.id)).scalar()
    by_role = dict(db.query(User.role, func.count(User.id)).group_by(User.role).all())
    total_predictions = db.query(func.count(HealthRecord.id)).scalar()
    high_risk = (
        db.query(func.count(HealthRecord.id))
        .filter(HealthRecord.risk_classification == "high_risk")
        .scalar()
    )
    reviewed = (
        db.query(func.count(HealthRecord.id))
        .filter(HealthRecord.reviewed_at.isnot(None))
        .scalar()
    )
    uploads = db.query(func.count(UploadedReport.id)).scalar()
    metadata = {}
    if Path(METADATA_PATH).exists():
        metadata = json.loads(Path(METADATA_PATH).read_text())
    return {
        "total_users": total_users,
        "users_by_role": by_role,
        "total_predictions": total_predictions,
        "high_risk_predictions": high_risk,
        "low_risk_predictions": total_predictions - high_risk,
        "reviewed_predictions": reviewed,
        "uploaded_reports": uploads,
        "model_accuracy": metadata.get("test_roc_auc"),
        "model_name": metadata.get("model_name"),
    }


# ---- Monitor Website Activity -----------------------------------------------

@router.get("/activity")
def activity(
    limit: int = 100, user: User = Depends(admin_only), db: Session = Depends(get_db)
) -> list[dict]:
    logs = (
        db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(min(limit, 500)).all()
    )
    return [
        {
            "id": log.id,
            "user_email": log.user_email,
            "action": log.action,
            "detail": log.detail,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
