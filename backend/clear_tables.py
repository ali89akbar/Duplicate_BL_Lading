import sys
import os

from db import SessionLocal
from models import User, Document, DuplicateLog, Notification, AuditLog

def clear_data():
    db = SessionLocal()
    try:
        num_docs = db.query(Document).delete()
        num_dups = db.query(DuplicateLog).delete()
        num_notifs = db.query(Notification).delete()
        num_audits = db.query(AuditLog).delete()
        db.commit()
        
        user_count = db.query(User).count()
        print(f"Cleared Data Summary:")
        print(f" - Documents deleted: {num_docs}")
        print(f" - Duplicate Logs deleted: {num_dups}")
        print(f" - Notifications deleted: {num_notifs}")
        print(f" - Audit Logs deleted: {num_audits}")
        print(f" - Users Preserved: {user_count}")
    except Exception as e:
        db.rollback()
        print(f"Error clearing tables: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clear_data()
