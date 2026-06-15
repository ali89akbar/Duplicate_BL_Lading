from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Replace with your actual MySQL credentials
DATABASE_URL = "mysql+pymysql://root:root@localhost/bl_lading"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
