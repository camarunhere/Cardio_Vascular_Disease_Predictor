"""Register / Login / Logout use cases (all three actors)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from api.auth import (
    create_token,
    get_current_user,
    hash_password,
    log_activity,
    verify_password,
)
from api.db import get_db
from api.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: str = Field("patient", pattern="^(patient|doctor)$")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict:
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(409, "An account with this email already exists.")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        # Doctors need admin verification before accessing patient data.
        is_verified=payload.role != "doctor",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_activity(db, user, "register", f"role={user.role}")

    return {
        "token": create_token(user),
        "user": _user_payload(user),
        "message": (
            "Doctor account created - an administrator must verify it before you can "
            "access patient records." if user.role == "doctor" and not user.is_verified else
            "Account created."
        ),
    }


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password.")
    if user.is_blocked:
        raise HTTPException(403, "This account has been blocked by an administrator.")

    log_activity(db, user, "login")
    return {"token": create_token(user), "user": _user_payload(user)}


@router.post("/logout")
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    log_activity(db, user, "logout")
    return {"message": "Logged out."}


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return _user_payload(user)


def _user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_verified": user.is_verified,
        "phone": user.phone,
        "date_of_birth": user.date_of_birth,
        "address": user.address,
    }
