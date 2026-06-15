
import random
from datetime import datetime, timedelta, date
#  TIME HELPERS
def _expires(upload_time_iso: str) -> str:
    try:
        dt = datetime.fromisoformat(upload_time_iso)
    except Exception:
        dt = datetime.now()
    return (dt + timedelta(days=3)).isoformat()
 
 
def _calendar_days_since(iso_ts: str) -> int:
    try:
        start = datetime.fromisoformat(str(iso_ts)).date()
        today = datetime.now().date()
        return max((today - start).days, 0)
    except Exception:
        return 9999
 
 
CYCLE_DAYS = 3
 
 
def _current_status(doc: dict) -> str:
    base = doc.get("status", "cleared")
    if base == "duplicate_blocked":
        return "duplicate_blocked"
    if base == "pending_approval":
        return "pending_approval"
    if base == "rejected":
        return "rejected"
    if base == "reclearance_requested":
        return "reclearance_requested"
    if base in ("cleared", "validated", "revalidate"):
        cleared_at = doc.get("cleared_at")
        if not cleared_at and base == "revalidate":
            return "revalidation_required"
        ref_ts  = cleared_at or doc.get("upload_time", "")
        days_in = _calendar_days_since(ref_ts)
        if days_in >= CYCLE_DAYS:
            return "revalidation_required"
        if doc.get("attachments"):
            return "attachment_uploaded"
        return "cleared"
    if base == "revalidation_required":
        cleared_at = doc.get("cleared_at")
        if cleared_at and _calendar_days_since(cleared_at) < CYCLE_DAYS:
            return "cleared"
        return "revalidation_required"
    return base


def _working_days_since(iso_ts: str) -> int:
    """Mon–Fri working days elapsed since iso_ts."""
    try:
        start: date = datetime.fromisoformat(str(iso_ts)).date()
        today: date = datetime.now().date()
        if today <= start:
            return 0
        count = 0
        cur   = start
        while cur < today:
            if cur.weekday() < 5:
                count += 1
            cur += timedelta(days=1)
        return count
    except Exception:
        return 9999


#  STORE
class Store:
    def __init__(self):
        self.documents    = {}
        self.bls          = {}       # bl_number → record
        self.invoices     = {}
        self.references   = {}       # portal_ref_no → [list of records]
        self.dup_logs     = []
        self.notifications= []
        self.audit_logs   = []
        self._seed()
 
    def _seed(self):
        now = datetime.now()
 
        # New schema:
        # screening_date, product, bl_number, master_bl (bool), dr_ccy, amount, portal_ref_no
        # NO vessel_name, NO shipping_company
 
        seeds = [
            # (doc_id, bl_no, is_master, product, ccy, amount, ref_no, scr_date, days_ago)
            ("DOC-BL-0001","HBLPK240001",True, "BL","USD",3500.00,"REF-TXN-2024-0011","2024-11-15",90),
            ("DOC-BL-0002","HBLPK240002",True, "BL","USD",2800.00,"REF-TXN-2024-0022","2024-11-20",80),
            ("DOC-BL-0003","HBLPK240003",False,"BL","USD",1950.00,"REF-TXN-2024-0033","2024-12-01",60),
            ("DOC-BL-0004","HBLPK240004",True, "BL","EUR",4200.00,"REF-TXN-2024-0044","2024-12-10",50),
            ("DOC-BL-0005","HBLPK240005",True, "BL","GBP",3100.00,"REF-TXN-2025-0055","2025-01-08",10),
            ("DOC-INV-0001","INV-PK-2024-8801",True, "COMMERCIAL INVOICE","USD",3500.00,"REF-TXN-2024-0011","2024-11-16",90),
            ("DOC-INV-0002","INV-PK-2024-8802",False,"COMMERCIAL INVOICE","USD",2800.00,"REF-TXN-2024-0022","2024-11-21",80),
        ]
 
        for (doc_id,bl_no,is_master,product,ccy,amount,ref_no,scr_date,days_ago) in seeds:
            ts = (now - timedelta(days=days_ago)).isoformat()
            fields = {
                "product":        product,
                "bl_number":      bl_no,
                "is_master":      is_master,
                "dr_ccy":         ccy,
                "amount":         amount,
                "portal_ref_no":  ref_no,
                "screening_date": scr_date,
            }
            doc = {
                "id":doc_id, "type": "bill_of_lading" if product=="BL" else "invoice",
                "filename": f"{product[:2]}_{bl_no}.pdf",
                "upload_time": ts, "cleared_at": ts,
                "expires_at": _expires(ts),
                "ocr_confidence": round(random.uniform(88,98),1),
                "is_duplicate": False, "is_revalidate": False,
                "status": "cleared", "processing_time_ms": random.randint(2100,4800),
                "fields": fields, "uploaded_by": "ops.team@bank.com",
                "source": "upload", "attachments": [], "reference_group": ref_no,
                # top-level for fast access
                "product": product, "bl_number": bl_no, "is_master": is_master,
                "dr_ccy": ccy, "amount": amount,
                "portal_ref_no": ref_no, "screening_date": scr_date,
            }
            doc["current_status"] = _current_status(doc)
            doc["till_date"]      = doc["expires_at"][:10]
            self.documents[doc_id] = doc
            rec = {**fields, "id": doc_id, "upload_time": ts, "created_at": ts}
            self.bls[bl_no] = rec
            if ref_no: self.references.setdefault(ref_no,[]).append(rec)
 
        # Pre-seeded REVALIDATE
        ts_reval = (now - timedelta(hours=5)).isoformat()
        reval_fields = {
            "product":"BL","bl_number":"HBLPK240001","is_master":True,
            "dr_ccy":"USD","amount":3500.00,
            "portal_ref_no":"REF-TXN-2024-0011","screening_date":"2024-11-15",
        }
        reval_doc = {
            "id":"DOC-BL-REVAL-001","type":"bill_of_lading",
            "filename":"BL_HBLPK240001_AMENDED.pdf",
            "upload_time":ts_reval,"cleared_at":None,"expires_at":_expires(ts_reval),
            "ocr_confidence":93.5,"is_duplicate":False,"is_revalidate":True,
            "status":"revalidate","processing_time_ms":2100,"fields":reval_fields,
            "uploaded_by":"trade.ops@bank.com","source":"manual_form","attachments":[],
            "reference_group":"REF-TXN-2024-0011",**reval_fields,
        }
        reval_doc["current_status"] = _current_status(reval_doc)
        reval_doc["till_date"]      = reval_doc["expires_at"][:10]
        self.documents["DOC-BL-REVAL-001"] = reval_doc
 
        # Pre-seeded DUPLICATE
        ts_dup = (now - timedelta(hours=8)).isoformat()
        dup_fields = {
            "product":"BL","bl_number":"HBLPK240001","is_master":False,
            "dr_ccy":"USD","amount":3500.00,
            "portal_ref_no":"REF-DIFF-9999","screening_date":"2024-11-15",
        }
        dup_doc = {
            "id":"DOC-BL-DUP-001","type":"bill_of_lading",
            "filename":"BL_HBLPK240001_RESUBMIT.pdf",
            "upload_time":ts_dup,"cleared_at":None,"expires_at":_expires(ts_dup),
            "ocr_confidence":91.2,"is_duplicate":True,"is_revalidate":False,
            "status":"duplicate_blocked","processing_time_ms":2340,"fields":dup_fields,
            "uploaded_by":"remittance.officer@bank.com","source":"upload","attachments":[],
            "reference_group":"REF-DIFF-9999",**dup_fields,
        }
        dup_doc["current_status"] = _current_status(dup_doc)
        dup_doc["till_date"]      = dup_doc["expires_at"][:10]
        self.documents["DOC-BL-DUP-001"] = dup_doc
 
        self.dup_logs = [
            {"id":"DUP-LOG-0001","doc_id":"DOC-BL-DUP-001","original_doc_id":"DOC-BL-0001",
             "document_type":"BL","matched_on":["bl_number"],
             "matched_values":{"bl_number":"HBLPK240001"},"detected_at":ts_dup,
             "severity":"HIGH","duplicate_type":"EXACT","uploaded_by":"remittance.officer@bank.com"},
            {"id":"REVAL-LOG-0001","doc_id":"DOC-BL-REVAL-001","original_doc_id":"DOC-BL-0001",
             "document_type":"BL","matched_on":["bl_number","portal_ref_no"],
             "matched_values":{"bl_number":"HBLPK240001","portal_ref_no":"REF-TXN-2024-0011"},
             "detected_at":ts_reval,"severity":"MEDIUM","duplicate_type":"REVALIDATE",
             "uploaded_by":"trade.ops@bank.com"},
        ]
        self.notifications = [
            {"id":"NOTIF-0001","type":"DUPLICATE_ALERT","severity":"HIGH",
             "message":"Duplicate BL: HBLPK240001 resubmitted with different Reference No.",
             "doc_id":"DOC-BL-DUP-001","created_at":ts_dup,"read":False},
            {"id":"NOTIF-0003","type":"REVALIDATE_ALERT","severity":"MEDIUM",
             "message":"Revalidate: BL HBLPK240001 + Ref REF-TXN-2024-0011 — original >3 working days.",
             "doc_id":"DOC-BL-REVAL-001","created_at":ts_reval,"read":False},
        ]
        self.audit_logs = [
            {"action":"document_upload","doc_id":"DOC-BL-0001","doc_type":"BL",
             "is_duplicate":False,"timestamp":(now-timedelta(days=90)).isoformat(),
             "user":"ops.team@bank.com","filename":"BL_HBLPK240001.pdf","bl_number":"HBLPK240001"},
        ]
 
 
store = Store()
make_expires_at = _expires
compute_status  = _current_status
 