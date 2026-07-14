from db import engine
from sqlalchemy import text

with engine.connect() as con:
    try:
        con.execute(text('ALTER TABLE documents ADD COLUMN hold_since DATETIME;'))
    except Exception as e:
        print(e)
    try:
        con.execute(text('ALTER TABLE documents ADD COLUMN comments TEXT;'))
    except Exception as e:
        print(e)
    con.commit()
print("Done")
