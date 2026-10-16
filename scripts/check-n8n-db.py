import sqlite3
import json

db_path = r'C:\Users\mayan\.n8n\database.sqlite'

try:
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    print('Tables count:', len(tables))

    api_key_tables = [t for t in tables if 'api' in t.lower() or 'key' in t.lower()]
    print('Key tables:', api_key_tables)

    for t in api_key_tables:
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info({t})").fetchall()]
        print(f"Schema of {t}:", cols)
        rows = cur.execute(f"SELECT * FROM {t}").fetchall()
        print(f"Row count of {t}:", len(rows))
        for r in rows:
            print("Row:", r)

    if 'workflow_entity' in tables:
        wfs = cur.execute("SELECT id, name, active FROM workflow_entity").fetchall()
        print("Workflows:", wfs)

    if 'user' in tables:
        users = cur.execute("SELECT id, email, firstName, lastName FROM user").fetchall()
        print("Users:", users)

except Exception as e:
    print("Error querying n8n db:", e)
