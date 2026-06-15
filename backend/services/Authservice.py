import uuid
import hashlib
from datetime import datetime, timedelta

import os
from db import SessionLocal
from models import User

_DEFAULT_USERS = [
    {
        "id": "USR-001", "email": "admin@bank.com", "name": "System Administrator", "role": "admin", "department": "IT Operations", "password": "Admin@123"
    },
    {
        "id": "USR-002", "email": "remittance.officer@bank.com", "name": "Remittance Officer", "role": "officer", "department": "Outward Remittance", "password": "Officer@123"
    },
    {
        "id": "USR-003", "email": "trade.ops@bank.com", "name": "Trade Operations", "role": "officer", "department": "Trade Finance", "password": "Trade@123"
    },
    {
        "id": "USR-004", "email": "supervisor@bank.com", "name": "Operations Supervisor", "role": "supervisor", "department": "Outward Remittance", "password": "Super@123"
    },
    {
        "id": "USR-005", "email": "ops.team@bank.com", "name": "Ops Team", "role": "officer", "department": "Operations", "password": "Ops@12345"
    },
]

def _seed_users_if_empty():
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            for u in _DEFAULT_USERS:
                new_user = User(**u)
                db.add(new_user)
            db.commit()
    except Exception as e:
        print("Error seeding users. Make sure DB is running and connected:", e)
    finally:
        db.close()

# Seed default users on startup
_seed_users_if_empty()

def create_user(email, password, name, role, department):
    email = email.lower().strip()
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            return False, "User with this email already exists."
        
        new_id = f"USR-{uuid.uuid4().hex[:6].upper()}"
        new_user = User(
            id=new_id, email=email, name=name, 
            role=role, department=department, password=password
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        return True, {
            "id": new_user.id, "email": new_user.email, "name": new_user.name,
            "role": new_user.role, "department": new_user.department
        }
    finally:
        db.close()

def get_all_users():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        return [
            {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "department": u.department}
            for u in users
        ]
    finally:
        db.close()

# ── Active token store: token → {user_id, expires_at} ─────────────────────
_TOKENS: dict[str, dict] = {}
TOKEN_TTL_HOURS = 8

def _make_token(user_id: str) -> str:
    raw = f"{user_id}-{uuid.uuid4().hex}"
    return hashlib.sha256(raw.encode()).hexdigest()

def login(email: str, password: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower()).first()
        if not user or user.password != password:
            return None, "Invalid email or password."

        token = _make_token(user.id)
        _TOKENS[token] = {
            "user_id":    user.id,
            "email":      user.email,
            "expires_at": datetime.now() + timedelta(hours=TOKEN_TTL_HOURS),
        }

        safe_user = {
            "id": user.id, "email": user.email, "name": user.name, 
            "role": user.role, "department": user.department
        }
        return token, safe_user
    except Exception as e:
        return None, f"Database connection error: {str(e)}"
    finally:
        db.close()

def logout(token: str):
    _TOKENS.pop(token, None)

def get_user_from_token(token: str):
    entry = _TOKENS.get(token)
    if not entry:
        return None
    if datetime.now() > entry["expires_at"]:
        _TOKENS.pop(token, None)
        return None
    
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == entry["email"]).first()
        if not user:
            return None
        return {
            "id": user.id, "email": user.email, "name": user.name, 
            "role": user.role, "department": user.department
        }
    except Exception:
        return None
    finally:
        db.close()

def list_dummy_credentials():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        return [
            {"email": u.email, "password": u.password, "name": u.name, "role": u.role}
            for u in users
        ]
    except Exception:
        return []
    finally:
        db.close()