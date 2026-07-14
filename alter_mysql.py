import sys
import os

# Add backend to path so we can import db
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from db import engine
from sqlalchemy import text

def run():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE documents ADD COLUMN is_partial BOOLEAN DEFAULT 0;"))
            conn.commit()
            print("Successfully added is_partial.")
        except Exception as e:
            print("Error adding is_partial:", e)

if __name__ == "__main__":
    run()
