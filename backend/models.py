from sqlalchemy import Column, String, Float, Boolean, JSON, DateTime, Date, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(String(50), primary_key=True)
    email = Column(String(100), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default='officer')
    department = Column(String(100), nullable=False)

class Document(Base):
    __tablename__ = 'documents'
    id = Column(String(50), primary_key=True)
    source = Column(String(50))
    filename = Column(String(255))
    upload_time = Column(DateTime)
    cleared_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    till_date = Column(Date, nullable=True)
    is_duplicate = Column(Boolean, default=False)
    is_revalidate = Column(Boolean, default=False)
    duplicate_info = Column(JSON, nullable=True)
    status = Column(String(50), default='cleared')
    attachments = Column(JSON, default=list)
    uploaded_by = Column(String(100))
    
    # Reference fields
    screening_date = Column(Date, nullable=True)
    dr_ccy = Column(String(10), nullable=True)
    amount = Column(Float, nullable=True)
    portal_ref_no = Column(String(100), nullable=True)
    
    # BL fields
    product = Column(String(50), nullable=True)
    bl_number = Column(String(100), nullable=True)
    is_master = Column(Boolean, default=False)
    
    # All raw fields
    fields = Column(JSON, nullable=True)
    
    # Audit trail
    last_edited_by = Column(String(100), nullable=True)
    last_edited_at = Column(DateTime, nullable=True)
    rejected_by = Column(String(100), nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    reject_reason = Column(Text, nullable=True)
    cleared_by               = Column(String(100), nullable=True)
    reclearance_requested_at = Column(DateTime,    nullable=True)
    reclearance_requested_by = Column(String(100), nullable=True)

class DuplicateLog(Base):
    __tablename__ = 'duplicate_logs'
    id = Column(String(50), primary_key=True)
    doc_id = Column(String(50))
    original_doc_id = Column(String(50), nullable=True)
    document_type = Column(String(50))
    bl_number = Column(String(100), nullable=True)
    matched_on = Column(JSON, default=list)
    matched_values = Column(JSON, default=dict)
    detected_at = Column(DateTime)
    severity = Column(String(50))
    duplicate_type = Column(String(50))
    uploaded_by = Column(String(100))

class Notification(Base):
    __tablename__ = 'notifications'
    id = Column(String(50), primary_key=True)
    type = Column(String(50))
    title = Column(String(255))
    message = Column(Text)
    doc_id = Column(String(50), nullable=True)
    severity = Column(String(50), nullable=True)
    created_at = Column(DateTime)
    read = Column(Boolean, default=False)
    read_at = Column(DateTime, nullable=True)

class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id = Column(String(50), primary_key=True)
    action = Column(String(100))
    doc_id = Column(String(50))
    doc_type = Column(String(50), nullable=True)
    bl_number = Column(String(100), nullable=True)
    is_duplicate = Column(Boolean, default=False)
    is_revalidate = Column(Boolean, default=False)
    timestamp = Column(DateTime)
    user_email = Column(String(100))
    filename = Column(String(255), nullable=True)
    portal_ref_no = Column(String(100), nullable=True)
