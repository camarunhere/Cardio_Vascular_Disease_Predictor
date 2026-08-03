"""Authentication & authorization: Register / Login / Logout, JWT, role guards."""

from __future__ import annotations

from typing import Optional

import os
from datetime import datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from api.db import get_db
from api.models import ActivityLog, User

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 12

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def log_activity(db: Session, user: Optional[User], action: str, detail: str = "") -> None:
    db.add(
        ActivityLog(
            user_id=user.id if user else None,
            user_email=user.email if user else None,
            action=action,
            detail=detail,
        )
    )
    db.commit()


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    if user.is_blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is blocked")
    return user


def require_role(*roles: str):
    def guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role: {', '.join(roles)}")
        if user.role == "doctor" and not user.is_verified:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Doctor account pending admin verification"
            )
        return user

    return guard
