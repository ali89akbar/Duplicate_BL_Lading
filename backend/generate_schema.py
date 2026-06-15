import sys
import os

# Add backend directory to path so we can import models
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import mysql
from models import Base, User, Document, DuplicateLog, Notification, AuditLog

def generate_sql():
    sql_statements = []
    
    for table_name, table in Base.metadata.tables.items():
        create_stmt = CreateTable(table).compile(dialect=mysql.dialect())
        # The compiled statement includes a newline at the end. 
        # Add a semicolon to make it a valid script.
        sql_statements.append(f"{str(create_stmt).strip()};")
        
    with open('schema.sql', 'w') as f:
        f.write("\n\n".join(sql_statements))
        f.write("\n")

if __name__ == "__main__":
    generate_sql()
    print("Schema successfully generated at schema.sql")
