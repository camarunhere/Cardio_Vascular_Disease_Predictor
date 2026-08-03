"""SQLAlchemy models backing the use-case diagram's actors and artifacts."""

from __future__ import annotations

from typing import Optional

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="patient")  # patient|doctor|admin
    # Doctors must be verified by an admin before they can access patient data.
    is_verified: Mapped[bool] = mapped_column(Boolean, default=True)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    # Manage Profile fields
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    date_of_birth: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    health_records: Mapped[list["HealthRecord"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan", foreign_keys="HealthRecord.patient_id"
    )


class HealthRecord(Base):
    """One 'Enter Health Information' submission + its AI prediction + SHAP explanation."""

    __tablename__ = "health_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Raw health information
    age_years: Mapped[int] = mapped_column(Integer)
    gender: Mapped[int] = mapped_column(Integer)
    height_cm: Mapped[float] = mapped_column(Float)
    weight_kg: Mapped[float] = mapped_column(Float)
    ap_hi: Mapped[int] = mapped_column(Integer)
    ap_lo: Mapped[int] = mapped_column(Integer)
    cholesterol: Mapped[int] = mapped_column(Integer)
    gluc: Mapped[int] = mapped_column(Integer)
    smoke: Mapped[int] = mapped_column(Integer)
    alco: Mapped[int] = mapped_column(Integer)
    active: Mapped[int] = mapped_column(Integer)

    # AI prediction (<<include>>: predict -> SHAP explanation, stored together)
    risk_probability: Mapped[float] = mapped_column(Float)
    risk_classification: Mapped[str] = mapped_column(String(20))
    explanation_json: Mapped[str] = mapped_column(Text)  # SHAP top factors

    # Doctor review
    reviewed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    patient: Mapped[User] = relationship(back_populates="health_records", foreign_keys=[patient_id])


class ClinicalRecommendation(Base):
    __tablename__ = "clinical_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    record_id: Mapped[Optional[int]] = mapped_column(ForeignKey("health_records.id"), nullable=True)
    recommendation: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UploadedReport(Base):
    """'Upload ECG/Medical Report' artifacts."""

    __tablename__ = "uploaded_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ActivityLog(Base):
    """'Monitor Website Activity' feed."""

    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    user_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(100))
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Setting(Base):
    """Key/value store, e.g. the adjustable risk threshold ('Manage AI Model')."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(String(500))
