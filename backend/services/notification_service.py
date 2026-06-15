"""
notification_service.py — Email alert simulation.
Production: replace _dispatch() with smtplib / SendGrid / AWS SES call.
"""

from datetime import datetime
import uuid
from db import SessionLocal
from models import Notification

RECIPIENTS = ["remittance.supervisor@bank.com", "compliance@bank.com"]

def _add(ntype, severity, message, doc_id, subject, body):
    db = SessionLocal()
    try:
        new_notif = Notification(
            id=f"NOTIF-{uuid.uuid4().hex[:6].upper()}",
            type=ntype,
            severity=severity,
            message=message,
            doc_id=doc_id,
            title=subject,
            created_at=datetime.now(),
            read=False
        )
        db.add(new_notif)
        db.commit()
        print(f"\n  📧 [{ntype}] {subject}")
    except Exception as e:
        print("Failed to save notification:", e)
    finally:
        db.close()


def send_duplicate_alert(doc_id, doc_type, dup_info, uploaded_by="system"):
    severity = dup_info.get("severity", "HIGH")
    dup_type = dup_info.get("duplicate_type", "EXACT")
    matched  = ", ".join(dup_info.get("matched_on", []))
    message  = dup_info.get("message", "Duplicate document detected.")
    subject  = f"[{severity}] DUPLICATE ALERT — {doc_type.upper()} | {doc_id}"
    body = (
        f"DUPLICATE DETECTION ALERT  |  {datetime.now():%Y-%m-%d %H:%M:%S}\n"
        f"{'─'*55}\n"
        f"Type       : {dup_type}\n"
        f"Document   : {doc_type.upper()} / {doc_id}\n"
        f"Uploaded By: {uploaded_by}\n"
        f"Severity   : {severity}\n"
        f"Matched On : {matched}\n"
        f"Message    : {message}\n"
        f"Original   : {dup_info.get('original_doc_id', 'N/A')}\n"
        f"{'─'*55}\n"
        f"ACTION: Document BLOCKED. Supervisor review required.\n"
        f"Recipients : {', '.join(RECIPIENTS)}"
    )
    _add("DUPLICATE_ALERT", severity, message, doc_id, subject, body)


def send_ocr_failure(doc_id, filename, error, low_fields):
    subject = f"[WARNING] OCR Issue — {filename} / {doc_id}"
    message = f"OCR processing issue on {filename}: {error}"
    body = (
        f"OCR PROCESSING ALERT  |  {datetime.now():%Y-%m-%d %H:%M:%S}\n"
        f"File    : {filename}\nDoc ID  : {doc_id}\n"
        f"Issue   : {error}\nLow Conf: {', '.join(low_fields) or 'None'}\n"
        f"ACTION: Manual review required before processing."
    )
    _add("OCR_FAILURE", "MEDIUM", message, doc_id, subject, body)


def send_pattern_alert(bene, freight, count, invoices):
    subject = f"[HIGH RISK] Pattern Alert — {bene} + {freight}"
    message = f"Pattern: {bene} + {freight} appear together {count}× (threshold {PATTERN_THRESHOLD})"
    body = (
        f"RISK PATTERN ALERT  |  {datetime.now():%Y-%m-%d %H:%M:%S}\n"
        f"Beneficiary  : {bene}\nFreight Co.  : {freight}\n"
        f"Co-occurrence: {count} times\nMatching     : {', '.join(invoices)}\n"
        f"ACTION: Escalate to Compliance Officer. STR may be required."
    )
    _add("PATTERN_ALERT", "HIGH", message, None, subject, body)


PATTERN_THRESHOLD = 3


def send_revalidate_alert(doc_id: str, doc_type: str, reval_info: dict, submitted_by: str = "system"):
    """Send revalidate status alert — document not blocked but reference already used."""
    ref_no      = reval_info.get("matched_values", {}).get("reference_no", "N/A")
    orig_doc_id = reval_info.get("original_doc_id", "N/A")
    orig_bl_inv = reval_info.get("extra", {}).get("original_bl") or reval_info.get("extra", {}).get("original_invoice", "N/A")
    orig_date   = reval_info.get("extra", {}).get("original_date", "N/A")
    message     = reval_info.get("message", "Revalidate condition detected.")
    subject     = f"[REVALIDATE] REFERENCE REUSE ALERT — {doc_type.upper()} | {doc_id}"
    body = (
        f"REVALIDATE STATUS ALERT  |  {datetime.now():%Y-%m-%d %H:%M:%S}\n"
        f"{'─'*60}\n"
        f"Type           : REVALIDATE (document NOT blocked)\n"
        f"Document       : {doc_type.upper()} / {doc_id}\n"
        f"Submitted By   : {submitted_by}\n"
        f"Severity       : MEDIUM\n"
        f"Reference No.  : {ref_no}\n"
        f"Original Doc   : {orig_doc_id} (B/L or Invoice: {orig_bl_inv}, Date: {orig_date})\n"
        f"{'─'*60}\n"
        f"MESSAGE:\n{message}\n"
        f"{'─'*60}\n"
        f"ACTION REQUIRED:\n"
        f"  • Document is NOT blocked — it can be processed\n"
        f"  • However, supervisor review and sign-off is required\n"
        f"  • Verify this is a legitimate amendment/re-shipment/correction\n"
        f"  • Document the reason for reference reuse before final approval\n"
        f"{'─'*60}\n"
        f"Recipients: {', '.join(RECIPIENTS)}"
    )
    _add("REVALIDATE_ALERT", "MEDIUM", message, doc_id, subject, body)
