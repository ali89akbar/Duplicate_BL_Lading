import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'backend', 'data.db')

def run():
    print(f"Opening DB at {db_path}")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    try:
        cur.execute("ALTER TABLE documents ADD COLUMN is_partial BOOLEAN DEFAULT 0")
        print("Added is_partial to documents.")
    except Exception as e:
        print("Error adding is_partial:", e)
        
    conn.commit()
    conn.close()
    print("Done.")

if __name__ == "__main__":
    run()
