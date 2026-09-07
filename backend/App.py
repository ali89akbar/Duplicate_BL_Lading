import uuid, os, sys, base64, hashlib, mimetypes
os.environ["NO_PROXY"] = "localhost,127.0.0.1,0.0.0.0,10.224.118.151"
os.environ["no_proxy"] = "localhost,127.0.0.1,0.0.0.0,10.224.118.151"
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, make_response, send_from_directory

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
app.url_map.strict_slashes = False

ATTACHMENTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "storage", "attachments")
os.makedirs(ATTACHMENTS_DIR, exist_ok=True)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.store import store, make_expires_at, compute_status
import services.duplicate_engine as dedup
import services.notification_service as notif
import services.email_service as email_svc
import services.Authservice as auth_svc
from db import SessionLocal
from models import AuditLog, Notification, Document as DocModel, DuplicateLog as DupLogModel

@app.after_request
def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"]  = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    return resp

@app.route("/api/<path:_>", methods=["OPTIONS"])
def _options(_): return jsonify({}), 200

def _load_docs_from_db():
    """Load all documents from DB into in-memory store on startup."""
    print(">>> LOADING DOCS FROM DB...")
    db = SessionLocal()
    try:
        # Migrate legacy revalidation_required statuses in DB
        try:
            db.query(DocModel).filter(DocModel.status == 'revalidation_required').update({DocModel.status: 'revalidated'})
            db.commit()
        except Exception:
            db.rollback()

        rows = db.query(DocModel).all()
        existing_ids = set()
        for row in rows:
            existing_ids.add(row.id)
            doc = {
                "id":             row.id,
                "source":         row.source,
                "filename":       row.filename or "",
                "upload_time":    row.upload_time.isoformat() if row.upload_time else "",
                "cleared_at":     row.cleared_at.isoformat() if row.cleared_at else None,
                "expires_at":     row.expires_at.isoformat() if row.expires_at else None,
                "till_date":      row.till_date.isoformat() if row.till_date else None,
                "is_duplicate":   bool(row.is_duplicate),
                "is_revalidate":  bool(row.is_revalidate),
                "duplicate_info": row.duplicate_info,
                "status":         row.status,
                "attachments":    row.attachments or [],
                "uploaded_by":    row.uploaded_by or "",
                "screening_date": row.screening_date.isoformat() if row.screening_date else "",
                "dr_ccy":         row.dr_ccy or "",
                "amount":         float(row.amount) if row.amount else 0,
                "portal_ref_no":  row.portal_ref_no or "",
                "product":        row.product or "",
                "bl_number":      row.bl_number or "",
                "is_master":      bool(row.is_master),
                "fields":         row.fields or {},
                "cleared_by":     getattr(row, 'cleared_by', None),
                "rejected_by":    getattr(row, 'rejected_by', None),
                "rejected_at":    getattr(row, 'rejected_at', None),
                "reject_reason":  getattr(row, 'reject_reason', None),
                "reclearance_requested_at": row.reclearance_requested_at.isoformat() if row.reclearance_requested_at else None,
                "reclearance_requested_by": getattr(row, 'reclearance_requested_by', None),
                "last_edited_by":           getattr(row, 'last_edited_by', None),
                "last_edited_at":           row.last_edited_at.isoformat() if row.last_edited_at else None,
            }
            doc["current_status"] = compute_status(doc)
            doc["is_editable"]    = _is_editable(doc)
            store.documents[row.id] = doc
            # Rebuild dedup index for non-duplicate docs
            if not row.is_duplicate and not row.is_revalidate and row.status != "rejected":
                check = {
                    "bl_number":      row.bl_number or "",
                    "portal_ref_no":  row.portal_ref_no or "",
                    "screening_date": row.screening_date.isoformat() if row.screening_date else "",
                    "dr_ccy":         row.dr_ccy or "",
                    "amount":         float(row.amount) if row.amount else 0,
                    "product":        row.product or "",
                }
                dedup.store_bl(row.id, check, store)

        # Sync initial seed documents into DB if missing
        for doc_id, doc in list(store.documents.items()):
            if doc_id not in existing_ids and isinstance(doc, dict):
                _save_doc_to_db(doc)

        # Enforce Reference Group status cascade across all loaded documents
        ref_groups = {}
        for d in store.documents.values():
            ref = str(d.get("portal_ref_no") or d.get("reference_group") or d.get("fields", {}).get("portal_ref_no") or "").strip().upper()
            if ref:
                ref_groups.setdefault(ref, []).append(d)

        for ref, g_docs in ref_groups.items():
            has_user_cleared = any(d.get("status") == "cleared" and not d.get("is_duplicate") for d in g_docs)
            if has_user_cleared:
                for d in g_docs:
                    d["is_duplicate"] = False
                    d["is_revalidate"] = False
                    d["status"] = "cleared"
                    d["current_status"] = "cleared"
                    d["duplicate_info"] = None
                continue

            dup_doc = next((d for d in g_docs if d.get("is_duplicate") or d.get("status") == "duplicate_blocked"), None)
            reval_doc = next((d for d in g_docs if d.get("is_revalidate") or d.get("status") == "revalidate"), None)
            hold_doc = next((d for d in g_docs if d.get("status") == "hold"), None)

            if dup_doc:
                dup_info = dup_doc.get("duplicate_info") or {}
                for d in g_docs:
                    d["is_duplicate"] = True
                    d["is_revalidate"] = False
                    d["status"] = "duplicate_blocked"
                    d["current_status"] = "duplicate_blocked"
                    if not d.get("duplicate_info"):
                        d["duplicate_info"] = dup_info
            elif hold_doc:
                for d in g_docs:
                    d["status"] = "hold"
                    d["current_status"] = "hold"
            elif reval_doc:
                for d in g_docs:
                    d["is_revalidate"] = True
                    d["is_duplicate"] = False
                    d["status"] = "revalidate"
                    d["current_status"] = "revalidated"

        print(f"  Loaded {len(store.documents)} documents into memory store and DB.")
    except Exception as e:
        print(f"  Failed to load documents from DB: {e}")
        import traceback; traceback.print_exc()
    finally:
        db.close()



# ═══════════════════════════════════════════════════════
#  AUTH

def _get_token():
    a = request.headers.get("Authorization", "")
    if a.startswith("Bearer "):
        return a[7:].strip()
    return request.args.get("token") or None

def _require_auth():
    user = auth_svc.get_user_from_token(_get_token() or "")
    if not user:
        return None, (jsonify({"error": "Unauthorized. Please log in."}), 401)
    if isinstance(user, dict):
        return user, None
    return {
        "id": getattr(user, "id", None),
        "email": getattr(user, "email", ""),
        "name": getattr(user, "name", ""),
        "role": getattr(user, "role", ""),
        "department": getattr(user, "department", "")
    }, None

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    try:
        b = request.get_json(force=True, silent=True) or {}
        email = str(b.get("email") or "").strip().lower()
        password = str(b.get("password") or "")
        
        token, result = auth_svc.login(email, password)
        if token is None:
            return jsonify({"error": result or "Invalid email or password"}), 401
        
        return jsonify({
            "token": token, 
            "user": result, 
            "message": f"Welcome, {result.get('name', 'User')}!"
        })
    except Exception as e:
        print("Error in /api/auth/login:", e)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    t = _get_token()
    if t: auth_svc.logout(t)
    return jsonify({"message": "Logged out."})

@app.route("/api/auth/me")
def auth_me():
    user, err = _require_auth()
    if err: return err
    return jsonify({"user": user})

@app.route("/api/auth/test-accounts")
def test_accounts():
    return jsonify({"accounts": auth_svc.list_dummy_credentials()})

# ═══════════════════════════════════════════════════════
#  ADMIN
# ═══════════════════════════════════════════════════════

@app.route("/api/admin/users", methods=["GET", "POST"])
def admin_users():
    user, err = _require_auth()
    if err: return err
    if user.get("role") != "admin":
        return jsonify({"error": "Forbidden"}), 403

    if request.method == "GET":
        return jsonify({"users": auth_svc.get_all_users()})

    # POST — create user
    b = request.get_json(force=True) or {}
    success, result = auth_svc.create_user(
        b.get("email", ""),
        b.get("password", ""),
        b.get("name", ""),
        b.get("role", "officer"),
        b.get("department", "Operations")
    )
    if not success:
        return jsonify({"error": result}), 400
    return jsonify({"user": result, "message": "User created successfully."})

@app.route("/api/admin/users/<user_id>", methods=["PATCH", "DELETE"])
def admin_user_detail(user_id):
    user, err = _require_auth()
    if err: return err
    if user.get("role") != "admin":
        return jsonify({"error": "Forbidden"}), 403

    if request.method == "DELETE":
        success, msg = auth_svc.delete_user(user_id)
        if not success:
            return jsonify({"error": msg}), 400
        return jsonify({"message": msg})

    # PATCH — edit user / reset password
    b = request.get_json(force=True) or {}
    success, result = auth_svc.update_user(
        user_id=user_id,
        name=b.get("name"),
        role=b.get("role"),
        department=b.get("department"),
        password=b.get("password")
    )
    if not success:
        return jsonify({"error": result}), 400
    return jsonify({"user": result, "message": "User updated successfully."})

@app.route("/api/admin/tat", methods=["GET"])
def get_tat():
    user, err = _require_auth()
    if err: return err
    if user.get("role") not in ("admin", "supervisor"):
        return jsonify({"error": "Forbidden"}), 403

    docs = list(store.documents.values())
    tat_map = {}
    for d in docs:
        ub = d.get("uploaded_by", "unknown")
        tat_map[ub] = tat_map.get(ub, 0) + 1

    tat_list = [{"email": k, "count": v} for k, v in tat_map.items()]
    tat_list.sort(key=lambda x: x["count"], reverse=True)
    return jsonify({"tat": tat_list})

@app.route("/api/admin/tat/detail", methods=["GET"])
def get_tat_detail():
    """Per-employee records grouped by date with full doc details."""
    user, err = _require_auth()
    if err: return err
    if user.get("role") not in ("admin", "supervisor"):
        return jsonify({"error": "Forbidden"}), 403

    employee = request.args.get("employee")  # optional filter
    docs = list(store.documents.values())
    if employee:
        docs = [d for d in docs if d.get("uploaded_by", "") == employee]

    # Build per-employee -> date -> [records]
    result = {}
    for d in docs:
        ub   = d.get("uploaded_by", "unknown")
        date = (d.get("screening_date") or d.get("upload_time", ""))[:10]
        result.setdefault(ub, {}).setdefault(date, []).append({
            "id":             d["id"],
            "bl_number":      d.get("bl_number", ""),
            "product":        d.get("product", ""),
            "portal_ref_no": d.get("portal_ref_no", ""),
            "screening_date": d.get("screening_date", ""),
            "amount":         d.get("amount", 0),
            "dr_ccy":         d.get("dr_ccy", ""),
            "status":         d.get("status", ""),
            "current_status": compute_status(d),
            "is_duplicate":   d.get("is_duplicate", False),
            "is_revalidate":  d.get("is_revalidate", False),
            "upload_time":    d.get("upload_time", ""),
            "till_date":      d.get("till_date", ""),
        })

    # Sort dates descending per employee
    for emp in result:
        result[emp] = dict(sorted(result[emp].items(), reverse=True))

    return jsonify({"detail": result})


# ═══════════════════════════════════════════════════════
#  ALERT RECIPIENTS & SMTP MANAGEMENT (ADMIN)
# ═══════════════════════════════════════════════════════

@app.route("/api/admin/alert_recipients", methods=["GET", "POST", "DELETE", "PATCH", "OPTIONS"])
def alert_recipients_route():
    if request.method == "OPTIONS":
        return jsonify({}), 200
    user, err = _require_auth()
    if err: return err
    if user.get("role") not in ("admin", "supervisor"):
        return jsonify({"error": "Forbidden"}), 403

    if request.method == "GET":
        recipients = email_svc.get_recipients()
        cfg = email_svc.get_smtp_config()
        return jsonify({
            "smtp_host": cfg["smtp_host"],
            "smtp_port": cfg["smtp_port"],
            "sender": cfg["sender_email"],
            "recipients": recipients
        })
    elif request.method == "POST":
        b = request.get_json(force=True, silent=True) or {}
        email = b.get("email")
        added_by = user.get("email") or user.get("name") or "Admin"
        success, result = email_svc.add_recipient(email, added_by=added_by)
        if not success:
            return jsonify({"error": result}), 400
        return jsonify({"message": "Recipient added successfully", "recipient": result})
    elif request.method == "PATCH":
        b = request.get_json(force=True, silent=True) or {}
        host = b.get("smtp_host")
        port = b.get("smtp_port")
        sender = b.get("sender")
        success, res = email_svc.update_smtp_config(host, port, sender)
        if not success:
            return jsonify({"error": res}), 400
        return jsonify({"message": "SMTP configuration updated", "config": res})
    elif request.method == "DELETE":
        email = request.args.get("email") or (request.get_json(force=True, silent=True) or {}).get("email")
        success, msg = email_svc.remove_recipient(email)
        if not success:
            return jsonify({"error": msg}), 400
        return jsonify({"message": msg})

@app.route("/api/admin/alert_recipients/test", methods=["POST", "GET", "OPTIONS"])
def test_alert_email():
    if request.method == "OPTIONS":
        return jsonify({}), 200
    user, err = _require_auth()
    if err: return err
    if user.get("role") not in ("admin", "supervisor"):
        return jsonify({"error": "Forbidden"}), 403

    b = request.get_json(force=True, silent=True) or {}
    test_email = b.get("email") or user.get("email")
    
    success, msg = email_svc.test_smtp_connection(test_email)
    if not success:
        return jsonify({"error": msg}), 500
    return jsonify({"message": msg})


# ═══════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════
def _now():   return datetime.now().isoformat()
def _today(): return datetime.now().strftime("%Y-%m-%d")

def _clean_date(val):
    import re
    if not val: return val
    val = str(val).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", val): return val
    m = re.match(r"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$", val)
    if m: return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return val

def _calendar_days_since(val):
    if not val: return 0
    try:
        if isinstance(val, (datetime, date)):
            past = val.date() if isinstance(val, datetime) else val
            return (datetime.now().date() - past).days
        val_str = str(val).split('T')[0].split(' ')[0].strip()
        past = datetime.strptime(val_str, "%Y-%m-%d").date()
        return (datetime.now().date() - past).days
    except Exception:
        return 0

def _is_editable(doc):
    """
    Editable if:
      - NOT duplicate_blocked (permanent), AND
      - NOT rejected (permanent), AND
      - EITHER within 3-day upload window
      - OR live status is revalidation_required (edit resets the cycle)
    """
    if doc.get("status") in ("duplicate_blocked", "rejected"):
        return False
    live = compute_status(doc)
    if live in ("revalidation_required", "revalidated", "reclearance_requested", "hold"):  # ← add reclearance_requested, hold, revalidated
        return True
   
    try:
        return datetime.now() <= datetime.fromisoformat(doc.get("expires_at", ""))
    except:
        return False

# FIX 1: Added bl_number field to every audit log entry
def _audit(action, doc_id, product, is_dup, is_rev, user, filename="", bl_number="",portal_ref_no=""):
    db = SessionLocal()
    try:
        log = AuditLog(
            id=f"AUD-{uuid.uuid4().hex[:6].upper()}",
            action=action,
            doc_id=doc_id,
            doc_type=product,
            bl_number=bl_number,
            is_duplicate=is_dup,
            is_revalidate=is_rev,
            timestamp=datetime.now(),
            user_email=user,
            filename=filename,
            portal_ref_no=portal_ref_no
        )
        db.add(log)
        db.commit()
    except Exception as e:
        print("Failed to save audit log:", e)
    finally:
        db.close()


# ═══════════════════════════════════════════════════════
#  VALIDATION
# ═══════════════════════════════════════════════════════
VALID_CCY = {"USD", "EUR", "GBP", "AED", "SAR", "PKR", "CNY", "JPY"}

def _validate_ref(fields):
    import re
    errors = {}
    for f in ["screening_date", "dr_ccy", "amount", "portal_ref_no"]:
        if not str(fields.get(f, "")).strip():
            errors[f] = "This field is required."

    sd = fields.get("screening_date", "")
    if sd:
        fixed = _clean_date(sd)
        fields["screening_date"] = fixed
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", fixed):
            errors["screening_date"] = "Date must be YYYY-MM-DD."

    amt = fields.get("amount")
    try:
        amt_f = float(amt) if amt not in (None, "", 0, "0") else 0.0
    except:
        amt_f = -1.0
    if amt_f <= 0:
        errors["amount"] = "Amount is required." if amt in (None, "", 0, "0", 0.0) \
            else "Amount must be > 0."
    else:
        fields["amount"] = amt_f

    ccy = str(fields.get("dr_ccy", "")).upper().strip()
    if ccy and ccy not in VALID_CCY:
        errors["dr_ccy"] = f"Invalid currency. Use: {', '.join(sorted(VALID_CCY))}"
    elif ccy:
        fields["dr_ccy"] = ccy

    return errors

def _validate_bl(bl_fields):
    errors = {}
    for f in ["bl_number", "product"]:
        if not str(bl_fields.get(f, "")).strip():
            errors[f] = "This field is required."
    product = str(bl_fields.get("product", "")).upper().strip()
    if product and product not in ("BL", "COMMERCIAL INVOICE"):
        errors["product"] = "Must be 'BL' or 'COMMERCIAL INVOICE'."
    else:
        bl_fields["product"] = product
    return errors


# ═══════════════════════════════════════════════════════
#  DOCUMENT BUILDER
#
#  STATUS LIFECYCLE (unique docs):
#    cleared ──(3 calendar days)──► revalidation_required
#       ▲                                    │
#       └──────── any edit resets ───────────┘  (cycle repeats)
#
#  duplicate_blocked → permanent, no cycle
#  rejected          → permanent, no cycle
#  revalidate (engine)→ stays revalidation_required until first edit
# ═══════════════════════════════════════════════════════
def _build_doc(sub_id, ref_fields, bl_fields, dup, submitted_by, source, filename=""):
    ts     = _now()
    is_dup = dup["is_duplicate"]
    is_rev = dup.get("is_revalidate", False)

    if is_dup:
        status, cleared_at = "duplicate_blocked", None
    elif is_rev:
        # cleared_at=None → compute_status returns revalidation_required until first edit
        status, cleared_at = "revalidate", None
    else:
        # Unique: start cleared, 3-day clock starts now
        status, cleared_at = "cleared", ts

    expires_at = make_expires_at(ts)
    merged = {**ref_fields, **bl_fields}

    dup_info = None
    if is_dup or is_rev:
        dup_info = dict(dup)
        orig = store.documents.get(dup.get("original_doc_id")) if dup.get("original_doc_id") else None
        if orig:
            dup_info["original_portal_ref"] = orig.get("portal_ref_no")
            dup_info["original_bl_number"] = orig.get("bl_number")
        elif dup.get("matched_values", {}).get("portal_ref_no"):
            dup_info["original_portal_ref"] = dup.get("matched_values", {}).get("portal_ref_no")

    doc = {
        "id": sub_id, "source": source, "filename": filename,
        "upload_time": ts,
        "cleared_at":  cleared_at,   # drives 3-day cycle clock
        "expires_at":  expires_at,
        "till_date":   expires_at[:10],
        "is_duplicate":   is_dup,
        "is_revalidate":  is_rev,
        "duplicate_info": dup_info,
        "status":         status,
        "current_status": compute_status({
            "status": status, "cleared_at": cleared_at,
            "upload_time": ts, "attachments": []
        }),
        "attachments":  [],
        "uploaded_by":  submitted_by,
        # Reference-level fields
        "screening_date": ref_fields.get("screening_date", ""),
        "dr_ccy":         ref_fields.get("dr_ccy", ""),
        "amount":         ref_fields.get("amount", 0),
        "portal_ref_no":  ref_fields.get("portal_ref_no", ""),
        # BL-level fields
        "product":   bl_fields.get("product", ""),
        "bl_number": bl_fields.get("bl_number", ""),
        "is_master": bool(bl_fields.get("is_master", False)),
        "fields":    merged,
    }
    return doc

def _get_original(dup):
    if not dup.get("original_doc_id"): return None
    orig = store.documents.get(dup["original_doc_id"])
    if not orig: return None
    return {
        "id": orig["id"], "submitted_by": orig.get("uploaded_by"),
        "submitted_at": orig.get("upload_time"), "source": orig.get("source", ""),
        "bl_number": orig.get("bl_number", ""),
        "portal_ref_no": orig.get("portal_ref_no", ""),
        "screening_date": orig.get("screening_date", ""),
    }

def _save_doc_to_db(doc):
    """Persist a document dict to MySQL documents table."""
    db = SessionLocal()
    try:
        from datetime import date
        def _d(v):
            if not v: return None
            if isinstance(v, date): return v
            try: return datetime.fromisoformat(str(v)).date()
            except: return None
        def _dt(v):
            if not v: return None
            if isinstance(v, datetime): return v
            try: return datetime.fromisoformat(str(v))
            except: return None
        row = DocModel(
            id=doc["id"], source=doc.get("source"), filename=doc.get("filename", ""),
            upload_time=_dt(doc.get("upload_time")),
            cleared_at=_dt(doc.get("cleared_at")),
            expires_at=_dt(doc.get("expires_at")),
            till_date=_d(doc.get("till_date")),
            is_duplicate=bool(doc.get("is_duplicate", False)),
            is_revalidate=bool(doc.get("is_revalidate", False)),
            duplicate_info=doc.get("duplicate_info"),
            status=doc.get("status", "cleared"),
            attachments=doc.get("attachments", []),
            uploaded_by=doc.get("uploaded_by", ""),
            screening_date=_d(doc.get("screening_date")),
            dr_ccy=doc.get("dr_ccy", ""),
            amount=doc.get("amount", 0),
            portal_ref_no=doc.get("portal_ref_no", ""),
            product=doc.get("product", ""),
            bl_number=doc.get("bl_number", ""),
            is_master=bool(doc.get("is_master", False)),
            fields=doc.get("fields"),
            cleared_by = doc.get("cleared_by"),
            reclearance_requested_at = _dt(doc.get("reclearance_requested_at")),
            reclearance_requested_by = doc.get("reclearance_requested_by"),
        )
        db.merge(row)  # merge: insert or update
        db.commit()
    except Exception as e:
        print("Failed to save document to DB:", e)
    finally:
        db.close()

def _log_dup(doc_id, fields, dup, user):
    if not (dup["is_duplicate"] or dup.get("is_revalidate")): return
    entry = {
        "id": f"DUP-LOG-{uuid.uuid4().hex[:6].upper()}",
        "doc_id": doc_id, "original_doc_id": dup.get("original_doc_id"),
        "document_type": fields.get("product", ""),
        "bl_number": fields.get("bl_number", ""),
        "matched_on": dup.get("matched_on", []),
        "matched_values": dup.get("matched_values", {}),
        "detected_at": _now(), "severity": dup.get("severity", ""),
        "duplicate_type": dup.get("duplicate_type", ""), "uploaded_by": user,
    }
    store.dup_logs.append(entry)
    # Also persist to DB
    db = SessionLocal()
    try:
        row = DupLogModel(
            id=entry["id"], doc_id=doc_id,
            original_doc_id=dup.get("original_doc_id"),
            document_type=fields.get("product", ""),
            bl_number=fields.get("bl_number", ""),
            matched_on=dup.get("matched_on", []),
            matched_values=dup.get("matched_values", {}),
            detected_at=datetime.now(),
            severity=dup.get("severity", ""),
            duplicate_type=dup.get("duplicate_type", ""),
            uploaded_by=user,
        )
        db.add(row)
        db.commit()
    except Exception as e:
        print("Failed to save dup log to DB:", e)
    finally:
        db.close()
    if dup["is_duplicate"]:
        notif.send_duplicate_alert(doc_id, fields.get("product", ""), dup, user)
    elif dup.get("is_revalidate"):
        notif.send_revalidate_alert(doc_id, fields.get("product", ""), dup, user)


# ═══════════════════════════════════════════════════════
#  GROUP SUBMIT  POST /api/manual/submit_group
#
#  FIX 2: Two-phase approach — check ALL BLs first, then store.
#  This prevents BL #2 in the same batch from falsely triggering
#  REVALIDATE because BL #1 (same ref, different BL) was already
#  stored mid-loop. Multiple BLs under one reference = a valid batch,
#  not a revalidate condition.
# ═══════════════════════════════════════════════════════
def _process_bl_group(ref_fields, bl_list, submitted_by, source, filename="", action="clear", comments=""):
    """
    Two-phase processing for a group of BLs sharing one portal_ref_no.

    Phase 1 – validate + duplicate-check ALL entries (no storing yet).
    Phase 2 – build documents and store only after all checks complete.

    This prevents intra-batch false-revalidate: BL-B submitted in the
    same batch as BL-A will NOT see BL-A in the reference index yet,
    so the "same ref, different BL" REVALIDATE rule won't fire between
    siblings in the same batch.
    """
    # ── Phase 1: validate + check (read-only, nothing stored) ────
    phase1 = []
    for i, bl_fields in enumerate(bl_list):
        bl_errors = _validate_bl(bl_fields)
        if bl_errors:
            phase1.append({
                "phase": "error", "index": i,
                "bl_fields": bl_fields, "bl_errors": bl_errors,
            })
            continue

        check = {**ref_fields, **bl_fields}
        dup   = dedup.check_document(check, store)
        phase1.append({
            "phase": "ok", "index": i,
            "bl_fields": bl_fields, "check": check, "dup": dup,
        })

    # Group-level status determination: if ANY BL is duplicate, entire group is duplicate
    group_dup_item = next((item["dup"] for item in phase1 if item["phase"] == "ok" and item["dup"].get("is_duplicate")), None)
    group_reval_item = None if group_dup_item else next((item["dup"] for item in phase1 if item["phase"] == "ok" and item["dup"].get("is_revalidate")), None)

    # ── Phase 2: build docs + store ──────────────────────────────
    results, any_error = [], False
    for item in phase1:
        i         = item["index"]
        bl_fields = item["bl_fields"]

        if item["phase"] == "error":
            any_error = True
            results.append({
                "bl_index":    i,
                "bl_number":   bl_fields.get("bl_number", ""),
                "status":      "validation_error",
                "field_errors": item["bl_errors"],
                "is_duplicate":  False,
                "is_revalidate": False,
                "email_alert_sent": False
            })
            continue

        check  = item["check"]
        dup    = item["dup"]

        if group_dup_item:
            dup = group_dup_item
        elif group_reval_item:
            dup = group_reval_item

        sub_id = f"MAN-{uuid.uuid4().hex[:8].upper()}"
        doc    = _build_doc(sub_id, ref_fields, bl_fields, dup, submitted_by, source, filename)
        
        # Apply action status if specified and not duplicate/rejected
        if action in ("hold", "rejected", "revalidation", "hit", "cleared", "revalidate") and doc["status"] not in ("duplicate_blocked", "rejected"):
            doc["status"] = "revalidate" if action == "revalidation" else action
            if action == "hold":
                doc["hold_since"] = _now()
            if action == "cleared":
                doc["is_revalidate"] = False
                doc["is_duplicate"] = False
        if comments:
            doc["comments"] = comments
            
        doc["current_status"] = compute_status(doc)
            
        store.documents[sub_id] = doc
        _save_doc_to_db(doc)

        if not dup.get("is_duplicate") and not dup.get("is_revalidate"):
            dedup.store_bl(sub_id, check, store)

        _log_dup(sub_id, check, dup, submitted_by)
        _audit(
            "manual_form_submit", sub_id, bl_fields.get("product", ""),
            dup["is_duplicate"], dup.get("is_revalidate", False), submitted_by,
            filename=filename,
            bl_number=bl_fields.get("bl_number", ""), portal_ref_no=ref_fields.get("portal_ref_no", "")    # ← BL number in audit
        )

        results.append({
            "bl_index":          i,
            "submission_id":     sub_id,
            "bl_number":         bl_fields.get("bl_number", ""),
            "is_master":         bool(bl_fields.get("is_master", False)),
            "product":           bl_fields.get("product", ""),
            "is_duplicate":      dup["is_duplicate"],
            "is_revalidate":     dup.get("is_revalidate", False),
            "status":            doc["status"],
            "till_date":         doc["till_date"],
            "current_status":    doc["current_status"],
            "message":           dup["message"],
            "duplicate_details": dup if dup["is_duplicate"] else None,
            "revalidate_details":dup if dup.get("is_revalidate") else None,
            "original_record":   _get_original(dup),
            "email_alert_sent":  dup["is_duplicate"] or dup.get("is_revalidate", False),
        })

    return results, any_error


@app.route("/api/manual/submit_group", methods=["POST"])
def submit_group():
    user, err = _require_auth()
    if err: return err

    body         = request.get_json(force=True) or {}
    ref_fields   = body.get("ref", {})
    bl_list      = body.get("bls", [])
    action       = body.get("action", "clear")
    comments     = body.get("comments", "")
    submitted_by = user["email"]

    ref_errors = _validate_ref(ref_fields)
    if ref_errors:
        return jsonify({"error": "Reference validation failed",
                        "field_errors": ref_errors}), 422
    if not bl_list:
        return jsonify({"error": "At least one BL entry is required."}), 422

    if len(bl_list) > 1:
        masters = [b for b in bl_list if b.get("is_master")]
        if len(masters) == 0:
            return jsonify({"error": "At least one BL must be marked as Master B/L."}), 422
        if len(masters) == len(bl_list):
            return jsonify({"error": "Not all BLs can be Master B/L."}), 422

    results, any_error = _process_bl_group(ref_fields, bl_list, submitted_by, "manual_form", action=action, comments=comments)

    return jsonify({
        "portal_ref_no":  ref_fields.get("portal_ref_no"),
        "screening_date": ref_fields.get("screening_date"),
        "dr_ccy":         ref_fields.get("dr_ccy"),
        "amount":         ref_fields.get("amount"),
        "submitted_by":   submitted_by,
        "total_bls":      len(bl_list),
        "results":        results,
        "has_errors":     any_error,
        # Convenience: flag if any BL in the batch is a duplicate
        "has_duplicates": any(r.get("is_duplicate") for r in results),
    }), (207 if any_error else 200)


# ── SINGLE SUBMIT ─────────────────────────────────────
@app.route("/api/manual/submit", methods=["POST"])
def manual_submit():
    user, err = _require_auth()
    if err: return err
    body         = request.get_json(force=True) or {}
    submitted_by = user["email"]
    action       = body.get("action", "clear")
    comments     = body.get("comments", "")

    # ── Detect payload format ────────────────────────────
    if "ref" in body and "bls" in body:
        # ── NEW FORMAT: {ref:{…}, bls:[{…}, …]} ──────────
        ref_fields = body.get("ref", {})
        bl_list    = body.get("bls", [])

        ref_errors = _validate_ref(ref_fields)
        if ref_errors:
            return jsonify({"error": "Reference validation failed",
                            "field_errors": ref_errors}), 422
        if not bl_list:
            return jsonify({"error": "At least one BL entry is required."}), 422

        # Multiple BLs → two-phase group logic (FIX 2 applied here too)
        if len(bl_list) > 1:
            masters = [b for b in bl_list if b.get("is_master")]
            if len(masters) == 0:
                return jsonify({"error": "At least one BL must be marked as Master B/L."}), 422
            if len(masters) == len(bl_list):
                return jsonify({"error": "Not all BLs can be Master B/L."}), 422

            results, any_error = _process_bl_group(
                ref_fields, bl_list, submitted_by, "manual_form", action=action, comments=comments
            )
            return jsonify({
                "portal_ref_no":  ref_fields.get("portal_ref_no"),
                "screening_date": ref_fields.get("screening_date"),
                "dr_ccy":         ref_fields.get("dr_ccy"),
                "amount":         ref_fields.get("amount"),
                "submitted_by":   submitted_by,
                "total_bls":      len(bl_list),
                "results":        results,
                "has_errors":     any_error,
                "has_duplicates": any(r.get("is_duplicate") for r in results),
            }), (207 if any_error else 200)

        # Single BL in new format
        bl_fields = bl_list[0]
        bl_errors = _validate_bl(bl_fields)
        if bl_errors:
            return jsonify({"error": "Validation failed", "field_errors": bl_errors}), 422

    else:
        # ── OLD FORMAT: {fields:{…}} ──────────────────────
        fields = body.get("fields", {})
        ref_fields = {k: fields.get(k, "") for k in
                      ["screening_date", "dr_ccy", "amount", "portal_ref_no"]}
        bl_fields  = {
            "product":   fields.get("product", "BL"),
            "bl_number": fields.get("bl_number", ""),
            "is_master": fields.get("is_master", True),
        }
        ref_errors = _validate_ref(ref_fields)
        bl_errors  = _validate_bl(bl_fields)
        all_errors = {**ref_errors, **bl_errors}
        if all_errors:
            return jsonify({"error": "Validation failed", "field_errors": all_errors}), 422

    # ── Common processing (single BL, either format) ─────
    check  = {**ref_fields, **bl_fields}
    dup    = dedup.check_document(check, store)
    sub_id = f"MAN-{uuid.uuid4().hex[:8].upper()}"
    doc    = _build_doc(sub_id, ref_fields, bl_fields, dup, submitted_by, "manual_form")
    
    if action == "hold" and doc["status"] not in ("duplicate_blocked", "rejected"):
        doc["status"] = "hold"
        doc["hold_since"] = _now()
    if comments:
        doc["comments"] = comments
        
    doc["current_status"] = compute_status(doc)
    
    store.documents[sub_id] = doc
    _save_doc_to_db(doc)

    if not dup["is_duplicate"] and not dup.get("is_revalidate"):
        dedup.store_bl(sub_id, check, store)
    print(f">>> Single BL: {bl_fields.get('bl_number')} dup={dup['is_duplicate']}")  # ← add

    _log_dup(sub_id, check, dup, submitted_by)
    _audit(
        "manual_form_submit", sub_id, bl_fields.get("product", ""),
        dup["is_duplicate"], dup.get("is_revalidate", False), submitted_by,
        bl_number=bl_fields.get("bl_number", ""), portal_ref_no=ref_fields.get("portal_ref_no","")   # ← BL number in audit
    )

    return jsonify({
        "submission_id":  sub_id,
        "bl_number":      bl_fields.get("bl_number", ""),
        "is_master":      bool(bl_fields.get("is_master", False)),
        "product":        bl_fields.get("product", ""),
        "is_duplicate":   dup["is_duplicate"],
        "is_revalidate":  dup.get("is_revalidate", False),
        "status":         doc["status"],
        "till_date":      doc["till_date"],
        "current_status": doc["current_status"],
        "message":        dup["message"],
        "duplicate_details":  dup if dup["is_duplicate"] else None,
        "revalidate_details": dup if dup.get("is_revalidate") else None,
        "original_record":    _get_original(dup),
        "submitted_by":       submitted_by,
        "email_alert_sent":   dup["is_duplicate"] or dup.get("is_revalidate", False),
        # Include ref fields in response for frontend convenience
        "portal_ref_no":  ref_fields.get("portal_ref_no", ""),
        "screening_date": ref_fields.get("screening_date", ""),
        "dr_ccy":         ref_fields.get("dr_ccy", ""),
        "amount":         ref_fields.get("amount", 0),
    }), (409 if dup["is_duplicate"] else 200)

@app.route("/api/manual/submissions/group_hold", methods=["PATCH"])
def group_hold():
    user, err = _require_auth()
    if err: return err
    body = request.get_json(force=True) or {}
    portal_ref_no = body.get("portal_ref_no")
    if not portal_ref_no:
        return jsonify({"error": "portal_ref_no required"}), 400

    target_ref = str(portal_ref_no).strip().upper()
    docs = [
        d for d in store.documents.values() 
        if (str(d.get("portal_ref_no") or "").strip().upper() == target_ref or 
            str(d.get("reference_group") or "").strip().upper() == target_ref)
        and d.get("status") != "rejected"
    ]
    if not docs: return jsonify({"error": "No clearable docs found"}), 404

    now = _now()
    for doc in docs:
        doc["status"] = "hold"
        doc["hold_since"] = now
        if "comments" in body:
            doc["comments"] = body["comments"]
        doc["current_status"] = compute_status(doc)
        _save_doc_to_db(doc)
        _audit("document_held", doc["id"], doc.get("product",""), doc.get("is_duplicate",False), doc.get("is_revalidate",False), user["email"], bl_number=doc.get("bl_number",""))

    return jsonify({"message": f"{len(docs)} BL(s) put on hold"})

@app.route("/api/manual/submissions/group_clear_user", methods=["PATCH"])
def group_clear_user():
    user, err = _require_auth()
    if err: return err
    body = request.get_json(force=True) or {}
    portal_ref_no = body.get("portal_ref_no")
    comments = str(body.get("comments", "")).strip()
    attachment_b64 = body.get("attachment_base64", "")
    attachment_name = body.get("attachment_filename", "clearance_proof.pdf")

    if not portal_ref_no:
        return jsonify({"error": "portal_ref_no required"}), 400

    target_ref = str(portal_ref_no).strip().upper()
    docs = [
        d for d in store.documents.values() 
        if (str(d.get("portal_ref_no") or "").strip().upper() == target_ref or 
            str(d.get("reference_group") or "").strip().upper() == target_ref)
        and d.get("status") != "rejected"
    ]
    if not docs: return jsonify({"error": "No docs found"}), 404

    is_group_dup = any(d.get("status") == "duplicate_blocked" or d.get("is_duplicate") for d in docs)
    if is_group_dup:
        if not comments:
            return jsonify({"error": "Justification comment is required to clear duplicate records."}), 400
        if not attachment_b64:
            return jsonify({"error": "Supporting proof attachment file is MANDATORY to clear duplicate records."}), 400

    # Save justification attachment if uploaded
    attachment_obj = None
    if attachment_b64:
        try:
            b64_clean = attachment_b64.split(",", 1)[1] if "," in attachment_b64 else attachment_b64
            missing_padding = len(b64_clean) % 4
            if missing_padding: b64_clean += '=' * (4 - missing_padding)
            raw_bytes = base64.b64decode(b64_clean)
            file_hash = hashlib.sha256(raw_bytes).hexdigest()
            ext = os.path.splitext(attachment_name)[1].lower() or ".pdf"
            today_str = datetime.now().strftime("%Y/%m/%d")
            relative_path = f"{today_str}/{file_hash}{ext}"
            full_path = os.path.join(ATTACHMENTS_DIR, relative_path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "wb") as f:
                f.write(raw_bytes)
            attachment_obj = {
                "id": f"ATT-{uuid.uuid4().hex[:6].upper()}",
                "filename": attachment_name,
                "filetype": mimetypes.guess_type(attachment_name)[0] or "application/pdf",
                "size_bytes": len(raw_bytes),
                "file_hash": file_hash,
                "relative_path": relative_path,
                "uploaded_at": _now(),
                "uploaded_by": user["email"],
                "purpose": "duplicate_justification"
            }
        except Exception as e:
            print("Failed to save clearance attachment:", e)

    for doc in docs:
        doc["status"] = "cleared"
        doc["is_duplicate"] = False
        doc["is_revalidate"] = False
        doc["duplicate_info"] = None
        doc["cleared_at"] = _now()
        doc["cleared_by"] = user["email"]
        doc["hold_since"] = None
        if comments:
            doc["comments"] = comments
            doc["justification_comment"] = comments
        if attachment_obj:
            if not isinstance(doc.get("attachments"), list): doc["attachments"] = []
            doc["attachments"].append(attachment_obj)

        doc["current_status"] = compute_status(doc)
        _save_doc_to_db(doc)
        try:
            dedup.store_bl(doc["id"], doc.get("fields") or doc, store)
        except Exception:
            pass
        _audit("document_cleared_from_duplicate" if is_group_dup else "document_cleared_by_user",
               doc["id"], doc.get("product",""), False, False, user["email"],
               bl_number=doc.get("bl_number",""), portal_ref_no=portal_ref_no)

    return jsonify({"message": f"{len(docs)} BL(s) cleared successfully with justification."})

@app.route("/api/manual/submissions/group_comment", methods=["PATCH"])
def group_comment():
    user, err = _require_auth()
    if err: return err
    body = request.get_json(force=True) or {}
    portal_ref_no = body.get("portal_ref_no")
    comments = body.get("comments", "")
    if not portal_ref_no:
        return jsonify({"error": "portal_ref_no required"}), 400
    docs = [d for d in store.documents.values() if d.get("portal_ref_no") == portal_ref_no]
    for doc in docs:
        doc["comments"] = comments
        _save_doc_to_db(doc)
    return jsonify({"message": "Comment updated"})

@app.route("/api/manual/submissions/group_edit_ref", methods=["PATCH"])
def group_edit_ref():
    user, err = _require_auth()
    if err: return err
    body = request.get_json(force=True) or {}
    old_ref_no = body.get("old_ref_no")
    new_ref_no = body.get("new_ref_no")
    if not old_ref_no or not new_ref_no:
        return jsonify({"error": "old_ref_no and new_ref_no required"}), 400
    docs = [d for d in store.documents.values() if d.get("portal_ref_no") == old_ref_no]
    for doc in docs:
        doc["portal_ref_no"] = new_ref_no
        doc["last_edited_by"] = user["email"]
        _save_doc_to_db(doc)
    return jsonify({"message": "Reference number updated"})

@app.route("/api/manual/submissions/group_clear", methods=["PATCH"])
def group_clear():
    user, err = _require_auth()
    if err: return err
    if user.get("role") not in ("admin", "supervisor"):
        return jsonify({"error": "Forbidden"}), 403

    portal_ref_no = (request.get_json(force=True) or {}).get("portal_ref_no")
    if not portal_ref_no:
        return jsonify({"error": "portal_ref_no required"}), 400

    docs = [d for d in store.documents.values() 
            if d.get("portal_ref_no") == portal_ref_no 
            and d.get("status") not in ("duplicate_blocked", "rejected")]
    
    if not docs:
        return jsonify({"error": "No clearable docs found for this ref"}), 404

    now = _now()
    for doc in docs:
        doc["status"]      = "cleared"
        doc["cleared_at"]  = now
        doc["cleared_by"]  = user["email"]
        doc["current_status"] = compute_status(doc)
        _save_doc_to_db(doc)
        _audit("document_cleared", doc["id"], doc.get("product",""),
               doc.get("is_duplicate",False), doc.get("is_revalidate",False),
               user["email"], bl_number=doc.get("bl_number",""))

    return jsonify({"message": f"{len(docs)} BL(s) cleared under {portal_ref_no}", "count": len(docs)})


# ── GET / EDIT / ATTACHMENTS / REJECT ────────────────
@app.route("/api/manual/submissions/<doc_id>")
def get_submission(doc_id):
    user, err = _require_auth()
    if err: return err
    doc = store.documents.get(doc_id)
    if not doc: return jsonify({"error": "Not found"}), 404
    doc["current_status"] = compute_status(doc)
    doc["is_editable"]    = _is_editable(doc)
    return jsonify(doc)

@app.route("/api/manual/submissions/<doc_id>", methods=["PATCH"])
def edit_submission(doc_id):
    user, err = _require_auth()
    if err: return err
    doc = store.documents.get(doc_id)
    if not doc: return jsonify({"error": "Not found"}), 404

    if doc.get("status") == "rejected":
        return jsonify({"error": "Cannot edit a rejected document."}), 403

    if not _is_editable(doc):
        return jsonify({
            "error":    "Record is no longer editable.",
            "reason":   "Edit window closed and record is not in revalidation status.",
            "till_date": doc.get("till_date", ""),
        }), 403

    body   = request.get_json(force=True) or {}
    fields = body.get("fields", {})
    editor = user["email"]

    ref_fields = {k: fields[k] for k in
                  ["screening_date", "dr_ccy", "amount", "portal_ref_no"] if k in fields}
    bl_fields  = {k: fields[k] for k in
                  ["product", "bl_number", "is_master"] if k in fields}

    if ref_fields:
        errs = _validate_ref({**doc, **ref_fields})
        if errs: return jsonify({"error": "Validation failed", "field_errors": errs}), 422

    # Apply updates
    for k, v in {**ref_fields, **bl_fields}.items():
        doc[k] = v
    doc["fields"]         = {**doc.get("fields", {}), **ref_fields, **bl_fields}
    doc["last_edited_by"] = editor
    doc["last_edited_at"] = _now()

    # ── CYCLE RESET: any edit resets to "cleared", restarts 3-day clock ──
    doc["cleared_at"]     = _now()
    doc["status"]         = "cleared"
    doc["current_status"] = compute_status(doc)
    _save_doc_to_db(doc)

    _audit(
        "record_edit", doc_id, doc.get("product", ""),
        doc.get("is_duplicate", False), doc.get("is_revalidate", False), editor,
        bl_number=doc.get("bl_number", ""),   # ← BL number in audit
    )

    return jsonify({
        "doc_id":         doc_id,
        "message":        "Record updated. Status reset to 'cleared'. 3-day cycle restarted.",
        "cleared_at":     doc["cleared_at"],
        "current_status": doc["current_status"],
        "doc":            doc,
    })


# ── FIX 3: REJECT ENDPOINT ────────────────────────────
# Allows supervisors to reject any BL document (typically used when one
# or more BLs in a batch group are flagged as duplicates). Status becomes
# "rejected" permanently — the document is NOT deleted but is blocked
# from further editing or processing.
# Group clear by portal_ref_no


# Re-clearance request by user
@app.route("/api/manual/submissions/<doc_id>/reclearance", methods=["PATCH"])
def request_reclearance(doc_id):
    user, err = _require_auth()
    if err: return err

    doc = store.documents.get(doc_id)
    if not doc: return jsonify({"error": "Not found"}), 404

    cs = compute_status(doc)
    if cs not in ("revalidation_required", "revalidated"):
        return jsonify({"error": "Re-clearance only allowed when status is revalidated or 3 days passed"}), 400

    doc["status"]         = "cleared"
    doc["current_status"] = "cleared"
    doc["cleared_at"]     = _now()
    doc["reclearance_requested_at"] = _now()
    doc["reclearance_requested_by"] = user["email"]

    _save_doc_to_db(doc)
    _audit("document_cleared_by_user", doc_id, doc.get("product",""),
           doc.get("is_duplicate",False), doc.get("is_revalidate",False),
           user["email"], bl_number=doc.get("bl_number",""))

    return jsonify({"message": "Document re-cleared successfully.", "doc_id": doc_id})




@app.route("/api/admin/hold_cases", methods=["GET"])
def hold_cases():
    try:
        user, err = _require_auth()
        if err: return err

        user_role = user.get("role") if isinstance(user, dict) else getattr(user, "role", "")
        user_email = user.get("email") if isinstance(user, dict) else getattr(user, "email", "")

        docs = list(store.documents.values())
        hold_docs = [d for d in docs if isinstance(d, dict) and d.get("status") == "hold"]
        if user_role not in ("admin", "supervisor"):
            hold_docs = [d for d in hold_docs if d.get("uploaded_by") == user_email]

        groups = {}
        for d in hold_docs:
            ref = d.get("portal_ref_no") or "—"
            if ref not in groups:
                groups[ref] = {
                    "portal_ref_no": ref,
                    "uploaded_by": d.get("uploaded_by", ""),
                    "hold_since": d.get("hold_since") or d.get("upload_time") or "",
                    "screening_date": d.get("screening_date") or "",
                    "comments": d.get("comments") or "",
                    "total_hold_cases": 0,
                    "days_on_hold": _calendar_days_since(d.get("hold_since") or d.get("upload_time")),
                    "bls": []
                }
            groups[ref]["total_hold_cases"] += 1
            groups[ref]["bls"].append({
                "id": d.get("id", ""),
                "bl_number": d.get("bl_number", ""),
                "product": d.get("product", ""),
                "status": d.get("status", ""),
                "current_status": compute_status(d),
                "is_master": d.get("is_master", False),
                "hold_since": d.get("hold_since") or "",
                "comments": d.get("comments") or ""
            })

        result = sorted(groups.values(), key=lambda x: str(x.get("hold_since") or ""), reverse=True)
        return jsonify({"total": len(result), "hold_cases": result})
    except Exception as e:
        print("Error in /api/admin/hold_cases:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/check_hold_reminders", methods=["POST", "GET"])
def check_hold_reminders():
    docs = list(store.documents.values())
    hold_docs = [d for d in docs if d.get("status") == "hold"]
    
    import services.notification_service as notif
    
    sent = 0
    notified_refs = set()
    for d in hold_docs:
        ref = d.get("portal_ref_no")
        if ref in notified_refs:
            continue
        days_on_hold = _calendar_days_since(d.get("hold_since") or d.get("upload_time"))
        if days_on_hold >= 7:
            # Send reminder
            notif.send_notification(
                title="Hold Reminder (7+ Days)",
                message=f"Ref No {ref} has been on hold for {days_on_hold} days. Please update its status.",
                doc_id=d["id"], notif_type="hold_reminder", severity="MEDIUM"
            )
            notified_refs.add(ref)
            sent += 1
            
    return jsonify({"message": f"Sent {sent} hold reminders.", "sent": sent})

@app.route("/api/manual/submissions/group_revalidate", methods=["PATCH"])
def group_revalidate():
    user, err = _require_auth()
    if err: return err
    body = request.get_json(force=True) or {}
    portal_ref_no = body.get("portal_ref_no")
    if not portal_ref_no:
        return jsonify({"error": "portal_ref_no required"}), 400

    target_ref = str(portal_ref_no).strip().upper()
    docs = [
        d for d in store.documents.values() 
        if (str(d.get("portal_ref_no") or "").strip().upper() == target_ref or 
            str(d.get("reference_group") or "").strip().upper() == target_ref)
        and d.get("status") != "rejected"
    ]
    if not docs: return jsonify({"error": "No docs found"}), 404

    for doc in docs:
        doc["status"] = "revalidate"
        doc["is_revalidate"] = True
        doc["current_status"] = compute_status(doc)
        _save_doc_to_db(doc)
        _audit("document_revalidated", doc["id"], doc.get("product",""),
               doc.get("is_duplicate",False), True,
               user["email"], bl_number=doc.get("bl_number",""),
               portal_ref_no=portal_ref_no)

    return jsonify({"message": f"{len(docs)} BL(s) marked for revalidation"})

@app.route("/api/manual/submissions/group_reject", methods=["PATCH"])
def group_reject():
    user, err = _require_auth()
    if err: return err

    body = request.get_json(force=True) or {}
    portal_ref_no = body.get("portal_ref_no")
    reason = body.get("reason", "Duplication found").strip()
    if not portal_ref_no: return jsonify({"error": "portal_ref_no required"}), 400

    docs = [d for d in store.documents.values()
            if d.get("portal_ref_no") == portal_ref_no
            and d.get("status") != "rejected"]
    if not docs: return jsonify({"error": "No docs found"}), 404

    for doc in docs:
        doc["status"] = "rejected"
        doc["current_status"] = "rejected"
        doc["rejected_by"] = user["email"]
        doc["rejected_at"] = _now()
        doc["reject_reason"] = reason
        _save_doc_to_db(doc)
        _audit("document_rejected", doc["id"], doc.get("product",""),
               doc.get("is_duplicate",False), doc.get("is_revalidate",False),
               user["email"], bl_number=doc.get("bl_number",""),
               portal_ref_no=portal_ref_no)

    return jsonify({"message": f"{len(docs)} BL(s) rejected under {portal_ref_no}"})

@app.route("/api/manual/submissions/<doc_id>/reject", methods=["PATCH"])
def reject_submission(doc_id):
    user, err = _require_auth()
    if err: return err

    doc = store.documents.get(doc_id)
    if not doc:
        return jsonify({"error": "Not found"}), 404

    if doc.get("status") == "rejected":
        return jsonify({"error": "Document is already rejected."}), 400

    if doc.get("status") == "duplicate_blocked":
        return jsonify({
            "error": "Document is already blocked as a duplicate. Rejection is redundant."
        }), 400

    reason = (request.get_json(force=True) or {}).get("reason", "")

    doc["status"]         = "rejected"
    doc["current_status"] = "rejected"
    doc["rejected_by"]    = user["email"]
    doc["rejected_at"]    = _now()
    doc["reject_reason"]  = reason or "Rejected by supervisor."

    _audit(
        "document_rejected", doc_id, doc.get("product", ""),
        doc.get("is_duplicate", False), doc.get("is_revalidate", False),
        user["email"],
        bl_number=doc.get("bl_number", ""),   # ← BL number in audit
    )

    return jsonify({
        "doc_id":      doc_id,
        "bl_number":   doc.get("bl_number", ""),
        "portal_ref_no": doc.get("portal_ref_no", ""),
        "status":      "rejected",
        "message":     f"Document {doc_id} (BL: {doc.get('bl_number','—')}) has been rejected.",
        "rejected_by": user["email"],
        "rejected_at": doc["rejected_at"],
        "reason":      doc["reject_reason"],
    })



@app.route("/api/manual/submissions/<doc_id>", methods=["DELETE"])
def delete_submission(doc_id):
    user, err = _require_auth()
    if err: return err
    doc = store.documents.get(doc_id)
    if not doc: return jsonify({"error": "Not found"}), 404

    if user.get("role") not in ("admin", "supervisor") and doc.get("uploaded_by") != user["email"]:
        return jsonify({"error": "Forbidden"}), 403

    if not _is_editable(doc) and doc.get("status") != "duplicate_blocked":
        return jsonify({"error": "Cannot delete locked record"}), 403

    import services.notification_service as notif
    notif.send_notification(
        title="Document Deleted",
        message=f"Ref No: {doc.get('portal_ref_no')} - BL No: {doc.get('bl_number')} was deleted by {user['email']}.",
        doc_id=doc_id, notif_type="document_deleted", severity="HIGH"
    )

    _audit("document_deleted", doc_id, doc.get("product", ""), doc.get("is_duplicate", False), doc.get("is_revalidate", False), user["email"], bl_number=doc.get("bl_number", ""))
    
    # Remove from store
    del store.documents[doc_id]
    
    # Remove from DB
    db = SessionLocal()
    try:
        from models import Document
        db_doc = db.query(Document).filter_by(id=doc_id).first()
        if db_doc:
            db.delete(db_doc)
            db.commit()
    except Exception as e:
        print("Error deleting from DB:", e)
    finally:
        db.close()

    return jsonify({"message": f"Document {doc_id} deleted."})

@app.route("/api/manual/submissions/<doc_id>/mark_partial", methods=["PATCH"])
def mark_partial(doc_id):
    user, err = _require_auth()
    if err: return err
    doc = store.documents.get(doc_id)
    if not doc: return jsonify({"error": "Not found"}), 404
    
    if user.get("role") not in ("admin", "supervisor") and doc.get("uploaded_by") != user["email"]:
        return jsonify({"error": "Forbidden"}), 403
        
    doc["is_partial"] = True
    doc["status"] = "hold"
    doc["hold_since"] = _now()
    doc["current_status"] = compute_status(doc)
    
    _save_doc_to_db(doc)
    
    return jsonify({"message": "Marked as partial payment and unblocked.", "doc": doc})

@app.route("/api/manual/submissions/<doc_id>/attachments", methods=["POST"])
def upload_attachment(doc_id):
    user, err = _require_auth()
    if err: return err
    doc = store.documents.get(doc_id)
    if not doc: return jsonify({"error": "Not found"}), 404
    if not _is_editable(doc):
        return jsonify({"error": "Cannot add attachments. Record not editable."}), 403

    uploader = user["email"]
    body = request.get_json(force=True) or {}
    b64   = body.get("file_base64", "")
    fname = body.get("filename", "attachment.png")
    ftype = body.get("filetype", "") or mimetypes.guess_type(fname)[0] or "application/octet-stream"
    if not b64: return jsonify({"error": "No file provided"}), 400

    if "," in b64:
        b64 = b64.split(",", 1)[1]
    b64 = b64.strip()
    missing_padding = len(b64) % 4
    if missing_padding:
        b64 += '=' * (4 - missing_padding)

    try:
        raw_bytes = base64.b64decode(b64)
    except Exception as e:
        return jsonify({"error": f"Invalid base64 payload: {str(e)}"}), 400

    file_hash = hashlib.sha256(raw_bytes).hexdigest()

    ext = os.path.splitext(fname)[1].lower()
    if not ext: ext = ".png"

    today_str = datetime.now().strftime("%Y/%m/%d")
    relative_path = f"{today_str}/{file_hash}{ext}"
    full_path = os.path.join(ATTACHMENTS_DIR, relative_path)

    is_deduplicated = False
    if os.path.exists(full_path):
        is_deduplicated = True
    else:
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(raw_bytes)

    att = {
        "id": f"ATT-{uuid.uuid4().hex[:6].upper()}",
        "filename": fname,
        "filetype": ftype,
        "size_bytes": len(raw_bytes),
        "file_hash": file_hash,
        "relative_path": relative_path,
        "is_deduplicated": is_deduplicated,
        "uploaded_at": _now(),
        "uploaded_by": uploader,
    }

    if not isinstance(doc.get("attachments"), list): doc["attachments"] = []
    doc["attachments"].append(att)
    doc["current_status"] = "attachment_uploaded"
    _save_doc_to_db(doc)

    _audit(
        "attachment_upload", doc_id, doc.get("product", ""),
        doc.get("is_duplicate", False), doc.get("is_revalidate", False),
        uploader, fname,
        bl_number=doc.get("bl_number", ""),
    )

    msg = f"Attachment '{fname}' uploaded (Deduplicated)." if is_deduplicated else f"Attachment '{fname}' uploaded."
    return jsonify({
        "doc_id": doc_id,
        "attachment_id": att["id"],
        "is_deduplicated": is_deduplicated,
        "current_status": doc["current_status"],
        "message": msg,
        "attachments_count": len(doc["attachments"])
    })

@app.route("/api/manual/submissions/<doc_id>/attachments/<att_id>/download", methods=["GET"])
def download_attachment(doc_id, att_id):
    user, err = _require_auth()
    if err: return err
    doc = store.documents.get(doc_id)
    if not doc: return jsonify({"error": "Document not found"}), 404

    attachments = doc.get("attachments", [])
    att = next((a for a in attachments if a.get("id") == att_id), None)
    if not att: return jsonify({"error": "Attachment not found"}), 404

    mime_type = att.get("filetype") or mimetypes.guess_type(att.get("filename", ""))[0] or "application/octet-stream"

    rel_path = att.get("relative_path")
    if rel_path:
        full_path = os.path.join(ATTACHMENTS_DIR, rel_path)
        if os.path.exists(full_path):
            dir_name = os.path.dirname(full_path)
            file_name = os.path.basename(full_path)
            
            if request.headers.get("X-Nginx-Protected") == "true":
                response = make_response()
                response.headers["X-Accel-Redirect"] = f"/protected_files/{rel_path}"
                response.headers["Content-Type"] = mime_type
                response.headers["Content-Disposition"] = f'inline; filename="{att.get("filename", file_name)}"'
                return response

            res = send_from_directory(
                dir_name, file_name,
                mimetype=mime_type,
                download_name=att.get("filename", file_name),
                as_attachment=False
            )
            res.headers["Content-Type"] = mime_type
            res.headers["Content-Disposition"] = f'inline; filename="{att.get("filename", file_name)}"'
            return res

    b64 = att.get("data_b64")
    if b64:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        b64 = b64.strip()
        missing_padding = len(b64) % 4
        if missing_padding:
            b64 += '=' * (4 - missing_padding)
        raw_bytes = base64.b64decode(b64)
        response = make_response(raw_bytes)
        response.headers['Content-Type'] = mime_type
        response.headers['Content-Disposition'] = f'inline; filename="{att.get("filename", "attachment")}"'
        return response

    return jsonify({"error": "File content unavailable"}), 404

@app.route("/api/manual/submissions")
def list_manual_submissions():
    user, err = _require_auth()
    if err: return err
    src  = request.args.get("source", "")
    docs = list(store.documents.values())
    if user.get("role") not in ("admin", "supervisor"):
        docs = [d for d in docs if d.get("uploaded_by") == user["email"]]
    if src: docs = [d for d in docs if d.get("source") == src]
    for d in docs:
        d["current_status"] = compute_status(d)
        d["is_editable"]    = _is_editable(d)
    docs.sort(key=lambda d: d.get("upload_time", ""), reverse=True)
    return jsonify({"total": len(docs), "submissions": docs})

# ── BULK EXCEL ────────────────────────────────────────
@app.route("/api/manual/bulk_submit", methods=["POST"])
def bulk_submit():
    user, err = _require_auth()
    if err: return err
    body = request.get_json(force=True) or {}
    submitted_by = user["email"]
    rows     = body.get("rows", [])
    filename = body.get("filename", "upload.xlsx")
    if not rows: return jsonify({"error": "rows must be non-empty"}), 400
    if len(rows) > 500: return jsonify({"error": "Max 500 rows"}), 400

    results = []
    ok = dup = reval = err_c = skip = 0

    for i, raw in enumerate(rows):
        row = {k.strip().lower().replace(" ", "_"): str(v).strip()
               for k, v in raw.items()}
        if "amount" in row:
            try: row["amount"] = float(str(row["amount"]).replace(",", ""))
            except: row["amount"] = 0.0

        if not any(str(v).strip() for v in row.values()):
            skip += 1
            results.append({"row_index": i+1, "status": "skipped", "message": "Empty row.",
                            "fields": row, "is_duplicate": False, "is_revalidate": False,
                            "email_alert_sent": False})
            continue

        ref_f = {k: row.get(k, "") for k in
                 ["screening_date", "dr_ccy", "amount", "portal_ref_no"]}
        bl_f  = {k: row.get(k, "") for k in ["product", "bl_number"]}
        bl_f["is_master"] = row.get("is_master", "").lower() in ("true", "yes", "1", "master")
        
        ref_errs = _validate_ref(ref_f)
        bl_errs  = _validate_bl(bl_f)
        all_errs = {**ref_errs, **bl_errs}
        if all_errs:
            err_c += 1
            results.append({"row_index": i+1, "status": "validation_error",
                            "message": "Validation: " + "; ".join(f"{k}:{v}" for k, v in all_errs.items()),
                            "field_errors": all_errs, "fields": row,
                            "is_duplicate": False, "is_revalidate": False, "email_alert_sent": False})
            continue

        check = {**ref_f, **bl_f}
        dup_r = dedup.check_document(check, store)
        sid   = f"BULK-{uuid.uuid4().hex[:8].upper()}"
        doc   = _build_doc(sid, ref_f, bl_f, dup_r, submitted_by, "excel_upload", filename)
        store.documents[sid] = doc

        if not dup_r["is_duplicate"] and not dup_r.get("is_revalidate"):
            dedup.store_bl(sid, check, store); ok += 1
        elif dup_r["is_duplicate"]: dup += 1
        else: reval += 1

        _log_dup(sid, check, dup_r, submitted_by)
        _audit(
            "excel_bulk_row", sid, bl_f.get("product", ""),
            dup_r["is_duplicate"], dup_r.get("is_revalidate", False), submitted_by, filename,
            bl_number=bl_f.get("bl_number", ""), portal_ref_no=ref_f.get("portal_ref_no", "")  # ← BL number in audit
        )

        results.append({"row_index": i+1, "submission_id": sid, "status": doc["status"],
                        "till_date": doc["till_date"], "current_status": doc["current_status"],
                        "is_duplicate": dup_r["is_duplicate"],
                        "is_revalidate": dup_r.get("is_revalidate", False),
                        "message": dup_r["message"], "fields": row,
                        "duplicate_details": dup_r if dup_r["is_duplicate"] else None,
                        "revalidate_details": dup_r if dup_r.get("is_revalidate") else None,
                        "original_record": _get_original(dup_r),
                        "email_alert_sent": dup_r["is_duplicate"] or dup_r.get("is_revalidate", False)})

    return jsonify({"total": len(rows), "processed": len(results), "unique": ok,
                    "duplicates": dup, "revalidates": reval, "skipped": skip, "errors": err_c,
                    "submitted_by": submitted_by, "results": results})


# ═══════════════════════════════════════════════════════
#  DASHBOARD
# ═══════════════════════════════════════════════════════
@app.route("/api/health")
def health():
    docs = list(store.documents.values())
    return jsonify({"status": "healthy", "total_documents": len(docs),
                    "total_duplicates": sum(1 for d in docs if d.get("is_duplicate")),
                    "unread_alerts": sum(1 for n in store.notifications if not n.get("read")),
                    "timestamp": _now()})

@app.route("/api/dashboard/metrics")
def dashboard_metrics():
    try:
        user, err = _require_auth()
        if err: return err
        
        user_role = user.get("role", "") if isinstance(user, dict) else getattr(user, "role", "")
        user_email = user.get("email", "") if isinstance(user, dict) else getattr(user, "email", "")
        
        all_docs = [d for d in list(store.documents.values()) if isinstance(d, dict)]
        docs = all_docs if user_role in ("admin", "supervisor") else [d for d in all_docs if d.get("uploaded_by") == user_email]
        
        total = len(docs)
        dups  = [d for d in docs if d.get("is_duplicate")]
        revals= [d for d in docs if d.get("is_revalidate")]
        today = _today()
        td    = [d for d in docs if str(d.get("upload_time") or "").startswith(today)]
        live  = [compute_status(d) for d in docs]
        rejected = [d for d in docs if d.get("status") == "rejected"]
        
        # Recent scans list (show top 10 recent documents)
        recent_source = all_docs if user_role in ("admin", "supervisor") else docs
        sorted_recent = sorted(recent_source, key=lambda x: str(x.get("upload_time") or ""), reverse=True)
        recent_list = []
        for d in sorted_recent[:10]:
            d_copy = dict(d)
            d_copy["current_status"] = compute_status(d)
            d_copy["is_editable"] = _is_editable(d)
            recent_list.append(d_copy)

        logs_list = store.dup_logs
        dup_stats = {
            "total": len(logs_list),
            "exact":           sum(1 for l in logs_list if l.get("duplicate_type") == "EXACT"),
            "fuzzy":           sum(1 for l in logs_list if l.get("duplicate_type") == "FUZZY"),
            "revalidate":      sum(1 for l in logs_list if l.get("duplicate_type") == "REVALIDATE"),
            "pattern":         0,
            "amount_velocity": sum(1 for l in logs_list if l.get("duplicate_type") == "AMOUNT_VELOCITY")
        }
        
        tat_map = {}
        for d in all_docs:
            ub = d.get("uploaded_by") or "unknown"
            tat_map[ub] = tat_map.get(ub, 0) + 1
        tat_list = [{"email": k, "count": v} for k, v in tat_map.items()]
        tat_list.sort(key=lambda x: x["count"], reverse=True)

        return jsonify({
            "total_documents":    total,
            "total_duplicates":   len(dups),
            "total_revalidates":  len(revals),
            "total_rejected":     len(rejected),
            "unique_documents":   total - len(dups),
            "today_uploads":      len(td),
            "unread_alerts":      sum(1 for n in store.notifications if not n.get("read")),
            "pattern_alerts":     0,
            "duplicate_rate":     round(len(dups) / max(total, 1) * 100, 1),
            # Status counts
            "cleared_count":               live.count("cleared"),
            "revalidation_required_count": live.count("revalidation_required") + live.count("revalidated"),
            "attachment_uploaded_count":   live.count("attachment_uploaded"),
            "duplicate_blocked_count":     live.count("duplicate_blocked"),
            "rejected_count":              sum(1 for d in docs if d.get("status") == "rejected"),
            # Legacy aliases
            "pending_count":    live.count("cleared"),
            "expired_count":    live.count("revalidation_required") + live.count("revalidated"),
            "revalidated_count":live.count("revalidated") + live.count("revalidation_required"),
            "recent": recent_list,
            "dup_stats": dup_stats,
            "tat": tat_list,
        })
    except Exception as e:
        print("Error in /api/dashboard/metrics:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/api/dashboard/recent")
def recent():
    user, err = _require_auth()
    if err: return err
    lim  = int(request.args.get("limit", 10))
    docs = list(store.documents.values())
    if user.get("role") not in ("admin", "supervisor"):
        docs = [d for d in docs if d.get("uploaded_by") == user["email"]]
    
    docs = sorted(docs, key=lambda d: d.get("upload_time", ""), reverse=True)
    result = []
    for d in docs[:lim]:
        d["current_status"] = compute_status(d); d["is_editable"] = _is_editable(d)
        result.append(d)
    return jsonify({"recent": result})

@app.route("/api/documents")
def list_docs():
    user, err = _require_auth()
    if err: return err
    docs = list(store.documents.values())
    if user.get("role") not in ("admin", "supervisor"):
        docs = [d for d in docs if d.get("uploaded_by") == user["email"]]
    st   = request.args.get("status", ""); src = request.args.get("source", "")
    lim  = int(request.args.get("limit", 100)); off = int(request.args.get("offset", 0))
    if st:  docs = [d for d in docs if d.get("status") == st]
    if src: docs = [d for d in docs if d.get("source") == src]
    docs.sort(key=lambda d: d.get("upload_time", ""), reverse=True)
    for d in docs: d["current_status"] = compute_status(d); d["is_editable"] = _is_editable(d)
    return jsonify({"total": len(docs), "documents": docs[off:off+lim]})

@app.route("/api/documents/search/query")
def search_docs():
    user, err = _require_auth()
    if err: return err
    q   = request.args.get("q", "").lower().strip(); lim = int(request.args.get("limit", 30))
    results = []
    for doc in store.documents.values():
        if user.get("role") not in ("admin", "supervisor") and doc.get("uploaded_by") != user["email"]:
            continue
        if any(q in str(v).lower() for v in [doc.get("bl_number",""), doc.get("portal_ref_no",""),
               doc.get("id",""), doc.get("uploaded_by",""), doc.get("screening_date",""), doc.get("product","")]):
            doc["current_status"] = compute_status(doc); doc["is_editable"] = _is_editable(doc)
            results.append(doc)
    return jsonify({"query": q, "count": len(results), "results": results[:lim]})

@app.route("/api/duplicates/logs")
def dup_logs():
    user, err = _require_auth()
    if err: return err
    logs = store.dup_logs
    if user.get("role") not in ("admin", "supervisor"):
        logs = [l for l in logs if l.get("uploaded_by") == user["email"]]
    logs = sorted(logs, key=lambda l: l.get("detected_at", ""), reverse=True)
    return jsonify({"total": len(logs), "logs": logs[:int(request.args.get("limit", 100))]})

# ── NOTIFICATIONS ──────────────────────────────────────
@app.route("/api/notifications")
def get_notifications():
    user, err = _require_auth()
    if err: return err
    
    db = SessionLocal()
    try:
        limit = int(request.args.get("limit", 50))
        notifs = db.query(Notification).order_by(Notification.created_at.desc()).limit(limit).all()
        
        unread_count = db.query(Notification).filter(Notification.read == False).count()
        
        formatted = [{
            "id": n.id, "type": n.type, "title": n.title, "message": n.message,
            "doc_id": n.doc_id, "severity": n.severity, 
            "created_at": n.created_at.isoformat() if n.created_at else "", 
            "read": n.read
        } for n in notifs]
        return jsonify({"total": len(formatted), "unread": unread_count, "notifications": formatted})
    finally:
        db.close()

@app.route("/api/notifications/<nid>/read", methods=["PATCH"])
def mark_read(nid):
    user, err = _require_auth()
    if err: return err
    db = SessionLocal()
    try:
        n = db.query(Notification).filter(Notification.id == nid).first()
        if not n: return jsonify({"error": "Not found"}), 404
        n.read = True
        n.read_at = datetime.now()
        db.commit()
        return jsonify({"message": "Marked as read."})
    finally:
        db.close()

@app.route("/api/notifications/mark-all-read", methods=["PATCH"])
def mark_all_read():
    user, err = _require_auth()
    if err: return err
    db = SessionLocal()
    try:
        db.query(Notification).filter(Notification.read == False).update(
            {"read": True, "read_at": datetime.now()}
        )
        db.commit()
        return jsonify({"message": "All marked as read."})
    finally:
        db.close()

@app.route("/api/duplicates/stats")
def dup_stats():
    user, err = _require_auth()
    if err: return err
    logs = store.dup_logs
    if user.get("role") not in ("admin", "supervisor"):
        logs = [l for l in logs if l.get("uploaded_by") == user["email"]]
    return jsonify({"total": len(logs),
        "bl":  sum(1 for l in logs if l.get("document_type") == "BL"),
        "inv": sum(1 for l in logs if l.get("document_type") == "COMMERCIAL INVOICE"),
        "high":   sum(1 for l in logs if l.get("severity") == "HIGH"),
        "medium": sum(1 for l in logs if l.get("severity") == "MEDIUM"),
        "exact":           sum(1 for l in logs if l.get("duplicate_type") == "EXACT"),
        "fuzzy":           sum(1 for l in logs if l.get("duplicate_type") == "FUZZY"),
        "revalidate":      sum(1 for l in logs if l.get("duplicate_type") == "REVALIDATE"),
        "pattern":         0,
        "amount_velocity": sum(1 for l in logs if l.get("duplicate_type") == "AMOUNT_VELOCITY")})



@app.route("/api/reports/summary")
def report_summary():
    user, err = _require_auth()
    if err: return err
    docs  = list(store.documents.values()); total = len(docs)
    dups  = [d for d in docs if d.get("is_duplicate")]
    live  = [compute_status(d) for d in docs]
    
    # Daily trend calculation (default 14 days)
    days  = int(request.args.get("days", 14)); today = datetime.now().date(); daily_data = []
    for i in range(days-1, -1, -1):
        day = (today - timedelta(days=i)).isoformat()
        dd  = [d for d in store.documents.values() if d.get("upload_time", "").startswith(day)]
        daily_data.append({"date": day, "total": len(dd),
            "unique":     sum(1 for d in dd if not d.get("is_duplicate")),
            "duplicates": sum(1 for d in dd if d.get("is_duplicate")),
            "revalidates":sum(1 for d in dd if d.get("is_revalidate")),
            "rejected":   sum(1 for d in dd if d.get("status") == "rejected")})

    # Duplicate stats calculation
    logs = store.dup_logs
    if user.get("role") not in ("admin", "supervisor"):
        logs = [l for l in logs if l.get("uploaded_by") == user["email"]]
    dup_stats_data = {
        "total": len(logs),
        "exact":           sum(1 for l in logs if l.get("duplicate_type") == "EXACT"),
        "fuzzy":           sum(1 for l in logs if l.get("duplicate_type") == "FUZZY"),
        "revalidate":      sum(1 for l in logs if l.get("duplicate_type") == "REVALIDATE"),
        "pattern":         0,
        "amount_velocity": sum(1 for l in logs if l.get("duplicate_type") == "AMOUNT_VELOCITY")
    }

    return jsonify({
        "total_documents": total, "total_duplicates": len(dups),
        "total_unique": total - len(dups),
        "duplicate_rate_pct": round(len(dups)/max(total,1)*100, 1),
        "cleared_count":               live.count("cleared"),
        "revalidation_required_count": live.count("revalidation_required") + live.count("revalidated"),
        "attachment_uploaded_count":   live.count("attachment_uploaded"),
        "duplicate_blocked_count":     live.count("duplicate_blocked"),
        "rejected_count":              sum(1 for d in docs if d.get("status") == "rejected"),
        "pending_count":     live.count("cleared"),
        "expired_count":     live.count("revalidation_required") + live.count("revalidated"),
        "revalidated_count": live.count("revalidated") + live.count("revalidation_required"),
        "daily": {"days": days, "data": daily_data},
        "dup_stats": dup_stats_data
    })

@app.route("/api/reports/daily")
def report_daily():
    user, err = _require_auth()
    if err: return err
    days  = int(request.args.get("days", 14)); today = datetime.now().date(); result = []
    for i in range(days-1, -1, -1):
        day = (today - timedelta(days=i)).isoformat()
        dd  = [d for d in store.documents.values() if d.get("upload_time", "").startswith(day)]
        result.append({"date": day, "total": len(dd),
            "unique":     sum(1 for d in dd if not d.get("is_duplicate")),
            "duplicates": sum(1 for d in dd if d.get("is_duplicate")),
            "revalidates":sum(1 for d in dd if d.get("is_revalidate")),
            "rejected":   sum(1 for d in dd if d.get("status") == "rejected")})
    return jsonify({"days": days, "data": result})

@app.route("/api/reports/audit-log")
def audit_log():
    user, err = _require_auth()
    if err: return err
    db = SessionLocal()
    try:
        limit = int(request.args.get("limit", 100))
        logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).all()
        formatted = [{
            "id": l.id, "action": l.action, "doc_id": l.doc_id, "doc_type": l.doc_type,
            "bl_number": l.bl_number, "is_duplicate": l.is_duplicate, "is_revalidate": l.is_revalidate,
            "timestamp": l.timestamp.isoformat() if l.timestamp else "", "user": l.user_email, "filename": l.filename
        } for l in logs]
        total = db.query(AuditLog).count()
        return jsonify({"total": total, "logs": formatted})
    finally:
        db.close()


@app.route("/api/users", methods=["GET", "POST"])
def manage_users():
    user, err = _require_auth()
    if err: return err
    if user.get("role") not in ("admin", "supervisor"):
        return jsonify({"error": "Forbidden"}), 403
    
    if request.method == "GET":
        return jsonify(auth_svc.get_all_users())
    
    b = request.get_json(force=True) or {}
    success, res = auth_svc.create_user(
        b.get("email", ""), b.get("password", ""), 
        b.get("name", ""), b.get("role", "officer"), 
        b.get("department", "")
    )
    if not success:
        return jsonify({"error": res}), 400
    return jsonify(res)

@app.route("/api/reports/tat")
def employee_tat():
    user, err = _require_auth()
    if err: return err
    if user.get("role") not in ("admin", "supervisor"):
        return jsonify({"error": "Forbidden"}), 403

    from collections import defaultdict
    tat = defaultdict(lambda: {"total":0, "unique":0, "duplicate":0, "revalidate":0})
    for d in store.documents.values():
        ub = d.get("uploaded_by", "system")
        tat[ub]["total"] += 1
        if d.get("is_duplicate"): tat[ub]["duplicate"] += 1
        elif d.get("is_revalidate"): tat[ub]["revalidate"] += 1
        else: tat[ub]["unique"] += 1
    
    # Merge with user info
    users = {u["email"]: u for u in auth_svc.get_all_users()}
    res = []
    for email, stats in tat.items():
        u = users.get(email, {})
        res.append({
            "email": email, "name": u.get("name", "Unknown"),
            "role": u.get("role", "N/A"), "department": u.get("department", "N/A"),
            **stats
        })
    return jsonify({"tat": res})

@app.route("/api/duplicates/documents", methods=["GET"])
def duplicate_documents():
    user, err = _require_auth()
    if err: return err
    
    docs = list(store.documents.values())
    if user.get("role") not in ("admin", "supervisor"):
        docs = [d for d in docs if d.get("uploaded_by") == user["email"]]
    
    # Find ref numbers that have at least one duplicate
    dup_refs = set(d.get("portal_ref_no") for d in docs if d.get("status") == "duplicate_blocked" and d.get("portal_ref_no"))
    
    groups = {}
    for d in docs:
        ref = d.get("portal_ref_no")
        if ref in dup_refs:
            if ref not in groups:
                groups[ref] = {
                    "portal_ref_no": ref,
                    "uploaded_by": d.get("uploaded_by"),
                    "screening_date": d.get("screening_date"),
                    "upload_time": d.get("upload_time"),
                    "bls": []
                }
            d["current_status"] = compute_status(d)
            groups[ref]["bls"].append(d)
            
    result = sorted(groups.values(), key=lambda x: x.get("upload_time", ""), reverse=True)

    # Consolidated stats & logs
    logs = store.dup_logs
    if user.get("role") not in ("admin", "supervisor"):
        logs = [l for l in logs if l.get("uploaded_by") == user["email"]]
    logs_sorted = sorted(logs, key=lambda l: l.get("detected_at", ""), reverse=True)
    
    stats_data = {
        "total": len(logs),
        "bl":  sum(1 for l in logs if l.get("document_type") == "BL"),
        "inv": sum(1 for l in logs if l.get("document_type") == "COMMERCIAL INVOICE"),
        "high":   sum(1 for l in logs if l.get("severity") == "HIGH"),
        "medium": sum(1 for l in logs if l.get("severity") == "MEDIUM"),
        "exact":           sum(1 for l in logs if l.get("duplicate_type") == "EXACT"),
        "fuzzy":           sum(1 for l in logs if l.get("duplicate_type") == "FUZZY"),
        "revalidate":      sum(1 for l in logs if l.get("duplicate_type") == "REVALIDATE"),
        "pattern":         0,
        "amount_velocity": sum(1 for l in logs if l.get("duplicate_type") == "AMOUNT_VELOCITY")
    }

    return jsonify({
        "total": len(result),
        "groups": result,
        "logs": logs_sorted[:100],
        "stats": stats_data
    })


print(">>> Calling _load_docs_from_db at module level")
_load_docs_from_db()

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    """Serve React SPA — any non-API route falls through to index.html."""
    if path.startswith("api/"):
        return jsonify({"error": "API endpoint not found"}), 404
    if path and os.path.exists(os.path.join(FRONTEND_DIR, path)):
        resp = send_from_directory(FRONTEND_DIR, path)
    else:
        resp = send_from_directory(FRONTEND_DIR, "index.html")
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    try:
        app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False, threaded=True)
    except OSError as e:
        print(f"\n[ERROR] Could not bind to port {port}: {e}")
        print(f"Port {port} is already bound by an existing running process or restricted by Windows permissions.")
        print(f"To free port {port} on Windows PowerShell, run:")
        print(f"  Stop-Process -Id (Get-NetTCPConnection -LocalPort {port}).OwningProcess -Force\n")