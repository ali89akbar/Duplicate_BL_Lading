import re
from difflib import SequenceMatcher
from datetime import datetime, timedelta, date

FUZZY_BL_THRESHOLD  = 0.97
AMOUNT_WINDOW_DAYS  = 30
PATTERN_THRESHOLD   = 3


#  UTILITIES

def _norm(text):
    if not text: return ""
    t = re.sub(r"[^\w\s]", "", str(text).upper().strip())
    return re.sub(r"\s+", " ", t)


def _sim(a, b):
    na, nb = _norm(a), _norm(b)
    if not na or not nb: return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def _working_days_since(iso_ts: str) -> int:
    try:
        start: date = datetime.fromisoformat(str(iso_ts)).date()
        today: date = datetime.now().date()
        if today <= start:
            return 0
        count = 0
        cur = start
        while cur < today:
            if cur.weekday() < 5:   # 0=Mon … 4=Fri
                count += 1
            cur += timedelta(days=1)
        return count
    except Exception:
        return 9999   # safe: treat as very old record


def _result(is_dup, confidence, dup_type, severity,
            matched_on, matched_values, orig_doc_id, message, extra=None):
    return {
        "is_duplicate":    is_dup,
        "is_revalidate":   dup_type == "REVALIDATE",
        "confidence":      confidence,
        "duplicate_type":  dup_type,
        "severity":        severity,
        "matched_on":      matched_on,
        "matched_values":  matched_values,
        "original_doc_id": orig_doc_id,
        "message":         message,
        "extra":           extra or {},
    }


def _unique():
    return _result(False, 100.0, "NONE", "NONE", [], {}, None,
                   "Document is unique and can be processed. "
                   "No duplicate or revalidate condition found.")


#  MAIN CHECK

def check_document(fields, store):
    """
    Universal checker for BL and Commercial Invoice.
    Uses: bl_number + portal_ref_no for all logic.
    """
    bl_no  = str(fields.get("bl_number",     "")).strip()
    ref_no = str(fields.get("portal_ref_no", "")).strip()
    amount = fields.get("amount")

    # ── STEP 1: Exact BL match ───────────────────────────────────
    if bl_no and bl_no in store.bls:
        ex     = store.bls[bl_no]
        ex_ref = str(ex.get("portal_ref_no", "")).strip()
        ex_id  = ex.get("id", "—")

        # ── Sub-case A: Same BL + Same Ref ──────────────────────
        if ref_no and ex_ref and ref_no == ex_ref:
            orig_upload = ex.get("upload_time") or ex.get("created_at", "")
            wd_since    = _working_days_since(orig_upload)

            # Within 3 working days → DUPLICATE (new rule)
            if wd_since <= 3:
                return _result(
                    True, 100.0, "EXACT", "HIGH",
                    ["bl_number", "portal_ref_no"],
                    {
                        "bl_number":         bl_no,
                        "portal_ref_no":     ref_no,
                        "working_days_since": wd_since,
                        "match_reason": (
                            "BL Number and Portal Ref No. both match "
                            "an existing record submitted within 3 working days"
                        ),
                    },
                    ex_id,
                    f"DUPLICATE BLOCKED: BL '{bl_no}' with Portal Ref '{ref_no}' "
                    f"was already submitted {wd_since} working day(s) ago "
                    f"(Doc: {ex_id}, screened {ex.get('screening_date','—')}, "
                    f"vessel: {ex.get('vessel_name','—')}). "
                    f"Same BL + Ref within 3 working days is treated as a duplicate.",
                    {
                        "original_doc_id":       ex_id,
                        "original_date":         ex.get("screening_date"),
                        "original_vessel":       ex.get("vessel_name"),
                        "original_shipping_co":  ex.get("shipping_company"),
                        "working_days_since":    wd_since,
                        "rule_applied":          "Same BL + Ref within 3 working days = DUPLICATE",
                    }
                )

            # Older than 3 working days → REVALIDATE
            return _result(
                False, 100.0, "REVALIDATE", "MEDIUM",
                ["bl_number", "portal_ref_no"],
                {
                    "bl_number":          bl_no,
                    "portal_ref_no":      ref_no,
                    "working_days_since": wd_since,
                    "match_reason": (
                        "BL Number and Portal Ref No. both match — "
                        "original submission is older than 3 working days"
                    ),
                },
                ex_id,
                f"REVALIDATE STATUS: BL '{bl_no}' and Portal Ref '{ref_no}' "
                f"match existing record {ex_id} (submitted {wd_since} working days ago, "
                f"screened {ex.get('screening_date','—')}, "
                f"vessel: {ex.get('vessel_name','—')}). "
                f"Document is NOT blocked — supervisor review and sign-off required.",
                {
                    "original_bl":           bl_no,
                    "original_portal_ref":   ex_ref,
                    "original_doc_id":       ex_id,
                    "original_date":         ex.get("screening_date"),
                    "original_vessel":       ex.get("vessel_name"),
                    "original_shipping_co":  ex.get("shipping_company"),
                    "working_days_since":    wd_since,
                    "rule_applied":          "Same BL + Ref older than 3 working days = REVALIDATE",
                    "action_required": (
                        "Supervisor review required. Verify this is a legitimate "
                        "re-submission, amendment, or correction."
                    ),
                    "reason": (
                        "Same BL Number and Reference No. on a new submission "
                        "older than 3 working days indicates possible amendment "
                        "or re-presentation."
                    ),
                }
            )

        # ── Sub-case B: Same BL + Different (or missing) Ref → DUPLICATE ──
        return _result(
            True, 100.0, "EXACT", "HIGH",
            ["bl_number"],
            {"bl_number": bl_no},
            ex_id,
            f"DUPLICATE BLOCKED: BL Number '{bl_no}' was already processed "
            f"on {ex.get('screening_date','—')}, "
            f"vessel: {ex.get('vessel_name','—')}, "
            f"shipping: {ex.get('shipping_company','—')}. "
            f"Portal Ref does not match — this is a duplicate submission.",
            {
                "original_vessel":       ex.get("vessel_name"),
                "original_date":         ex.get("screening_date"),
                "original_shipping_co":  ex.get("shipping_company"),
                "original_portal_ref":   ex_ref or "not provided",
                "submitted_portal_ref":  ref_no or "not provided",
            }
        )

    # ── STEP 2: Fuzzy BL match (OCR errors: 0↔O, 1↔I, B↔8) ─────
    for stored_bl, ex in store.bls.items():
        if bl_no:
            s = _sim(bl_no, stored_bl)
            if s >= FUZZY_BL_THRESHOLD:
                return _result(
                    True, round(s * 100, 1), "FUZZY", "HIGH",
                    ["bl_number (fuzzy)"],
                    {"submitted": bl_no, "existing": stored_bl,
                     "similarity": f"{s * 100:.1f}%"},
                    ex.get("id"),
                    f"PROBABLE DUPLICATE: BL '{bl_no}' is {s * 100:.1f}% similar to "
                    f"existing '{stored_bl}'. Likely OCR substitution error (0/O, 1/I, B/8).",
                    {"note": "Common OCR errors: 0/O, 1/I, B/8"},
                )

    # ── STEP 3: Same portal_ref_no, different BL → REVALIDATE ───
    if ref_no and ref_no in store.references:
        for ex in store.references[ref_no]:
            ex_bl = str(ex.get("bl_number", "")).strip()
            if ex_bl and ex_bl != bl_no:
                return _result(
                    False, 100.0, "REVALIDATE", "MEDIUM",
                    ["portal_ref_no"],
                    {
                        "portal_ref_no":   ref_no,
                        "new_bl":          bl_no,
                        "original_bl":     ex_bl,
                        "original_doc_id": ex.get("id"),
                        "match_reason":    "Different BL under same Portal Ref No.",
                    },
                    ex.get("id"),
                    f"REVALIDATE STATUS: Portal Ref '{ref_no}' was previously used with "
                    f"BL '{ex_bl}' (Doc: {ex.get('id','—')}). "
                    f"This BL '{bl_no}' is different — document is NOT blocked but "
                    f"supervisor review is required.",
                    {
                        "original_bl":          ex_bl,
                        "original_doc_id":       ex.get("id"),
                        "original_date":         ex.get("screening_date"),
                        "original_vessel":       ex.get("vessel_name"),
                        "action_required":       "Supervisor review required before final processing.",
                        "reason": (
                            "Portal Reference reuse with different BL indicates "
                            "possible amendment, re-shipment, or correction."
                        ),
                    }
                )

  
    return _unique()


# Backwards compatibility aliases
def check_bl(fields, store):      return check_document(fields, store)
def check_invoice(fields, store): return check_document(fields, store)


#  INDEX NEW RECORDS

def store_bl(doc_id, fields, store):
    bl_no  = str(fields.get("bl_number",     "")).strip()
    ref_no = str(fields.get("portal_ref_no", "")).strip()
    rec    = {**fields, "id": doc_id, "created_at": datetime.now().isoformat()}
    if bl_no:
        store.bls[bl_no] = store.documents.get(doc_id, rec)
    if ref_no:
        store.references.setdefault(ref_no, []).append(
            store.documents.get(doc_id, rec)
        )


def store_invoice(doc_id, fields, store):
    store_bl(doc_id, fields, store)