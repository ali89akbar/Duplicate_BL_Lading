"""
ocr_service.py — Simulates AWS Textract extraction.
Production: replace _extract_bl() / _extract_invoice() with real API calls.
"""

import os
import random
import time
from datetime import date, timedelta

ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif"}

_SHIPPERS   = ["Textile Mills Ltd, Faisalabad", "Sports Goods Export Co, Sialkot",
                "Rice Exporters Pakistan, Lahore", "Leather Goods Corp, Multan",
                "Cotton Traders Alliance, Karachi", "Surgical Instruments Co, Sialkot"]
_CONSIGNEES = ["European Clothing GmbH, Hamburg", "SportWorld USA Inc, New York",
                "Gulf Foods Trading LLC, Dubai", "Italian Fashion House SRL, Milan",
                "MediSupply UK Ltd, London"]
_NOTIFY     = ["Deutsche Bank AG, Frankfurt", "Citibank N.A., New York",
                "Emirates NBD, Dubai", "HSBC Bank plc, London", "BNP Paribas SA, Paris"]
_FREIGHT    = ["Maersk Pakistan (Pvt) Ltd", "MSC Pakistan", "COSCO Shipping Pakistan",
                "Evergreen Marine Pakistan", "Hapag-Lloyd Pakistan", "CMA CGM Pakistan"]
_BENES      = ["Textile Mills Ltd", "Sports Goods Export Co", "Rice Exporters Pakistan",
                "Leather Goods Corp", "Cotton Traders Alliance", "Surgical Instruments Co"]
_PORTS_PK   = ["Karachi", "Port Qasim", "Gwadar"]
_PORTS_DEST = ["Hamburg", "Rotterdam", "Antwerp", "Jebel Ali", "Port Newark",
                "Felixstowe", "Genoa", "Singapore", "Shanghai"]
_VESSELS    = ["MSC ADRIANA", "MAERSK MADRID", "EVER GIVEN", "COSCO BEIJING",
                "MSC PAMELA", "HAPAG EXCELLENCE", "ONE CRANE"]
_DESCS      = ["Sea Freight Charges — Export Shipment",
                "Ocean Freight + THC — Full Container Load",
                "FCL Ocean Freight — Export Karachi",
                "LCL Freight + Origin Charges"]


def _r(lst):    return random.choice(lst)
def _c(lo=72, hi=98): return round(random.uniform(lo, hi), 1)

def _hbl():
    return f"HBL{_r(['PK','KHI','LHE'])}{random.randint(2024,2025)}{random.randint(10000,99999)}"

def _mbl():
    return f"{_r(['MSC','MAEU','HLCU','ONEY','COSU','EVGR'])}{random.randint(100000000,999999999)}"

def _inv_no():
    return f"INV-PK-{random.randint(2024,2025)}-{random.randint(1000,9999)}"

def _container():
    return f"{_r(['MSCU','TCKU','HLXU','CAIU','CSNU'])}{random.randint(1000000,9999999)}"

def _voyage():
    return f"{_r(_VESSELS)} / {random.randint(1,200):03d}{_r(['E','W'])}"

def _date_str():
    base = date(2024, 1, 1)
    return (base + timedelta(days=random.randint(0, 450))).strftime("%Y-%m-%d")


def validate_file(filename):
    """Returns (ok: bool, error_msg: str)."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        return False, f"Unsupported format '{ext}'. Allowed: {', '.join(ALLOWED_EXT)}"
    return True, ""


def classify(filename, content):
    """Returns 'bill_of_lading' | 'invoice' | 'unknown'."""
    fn = (filename or "").lower()
    if any(k in fn for k in ["bl", "bill", "lading", "mbl", "hbl", "b_l"]):
        return "bill_of_lading"
    if any(k in fn for k in ["inv", "invoice", "invc"]):
        return "invoice"
    snippet = content[:512].decode("utf-8", errors="ignore").lower()
    if any(k in snippet for k in ["bill of lading", "shipper", "consignee", "b/l"]):
        return "bill_of_lading"
    if any(k in snippet for k in ["invoice", "beneficiary", "freight charge"]):
        return "invoice"
    return random.choice(["bill_of_lading", "invoice"])


def extract(filename, content):
    """Main OCR entry point. Returns structured extraction result."""
    t0 = time.time()
    doc_type = classify(filename, content)

    if doc_type == "bill_of_lading":
        raw = _extract_bl()
    elif doc_type == "invoice":
        raw = _extract_invoice()
    else:
        return {
            "document_type": "unknown", "fields": {},
            "fields_with_confidence": {}, "overall_confidence": 0.0,
            "processing_time_ms": 0, "requires_manual_review": True,
            "low_confidence_fields": [], "ocr_engine": "aws_textract_simulated",
            "error": "Document type could not be classified.",
        }

    fwc = {}
    for field, value in raw.items():
        if field in ("house_bl_number", "master_bl_number",
                     "invoice_number", "transaction_amount"):
            conf = _c(88, 99)
        else:
            conf = _c(72, 97)
        fwc[field] = {"value": value, "confidence": conf,
                      "requires_review": conf < 70}

    low_conf = [k for k, v in fwc.items() if v["confidence"] < 70]
    overall  = round(sum(v["confidence"] for v in fwc.values()) / len(fwc), 1)
    elapsed  = int((time.time() - t0) * 1000) + random.randint(1200, 3500)

    return {
        "document_type": doc_type, "fields": raw,
        "fields_with_confidence": fwc, "overall_confidence": overall,
        "processing_time_ms": elapsed,
        "requires_manual_review": bool(low_conf),
        "low_confidence_fields": low_conf,
        "ocr_engine": "aws_textract_simulated",
    }


def _extract_bl():
    return {
        "house_bl_number":    _hbl(),
        "master_bl_number":   _mbl(),
        "shipper":            _r(_SHIPPERS),
        "consignee":          _r(_CONSIGNEES),
        "notify_party":       _r(_NOTIFY),
        "date":               _date_str(),
        "vessel_voyage":      _voyage(),
        "port_of_loading":    _r(_PORTS_PK),
        "port_of_discharge":  _r(_PORTS_DEST),
        "container_no":       _container(),
    }


def _extract_invoice():
    return {
        "invoice_number":       _inv_no(),
        "freight_company_name": _r(_FREIGHT),
        "beneficiary_name":     _r(_BENES),
        "transaction_date":     _date_str(),
        "transaction_amount":   round(random.uniform(500, 15000), 2),
        "currency":             _r(["USD", "USD", "USD", "EUR", "GBP"]),
        "description":          _r(_DESCS),
    }
