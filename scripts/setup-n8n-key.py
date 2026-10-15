import sqlite3
import json
import uuid
import secrets
from datetime import datetime

db_path = r'C:\Users\mayan\.n8n\database.sqlite'

con = sqlite3.connect(db_path)
cur = con.cursor()

user = cur.execute("SELECT id, email, roleSlug FROM user WHERE id='2f9ee451-a116-49cb-8a97-f183e7d4beba'").fetchone()
print("Found user:", user)

# Check existing api keys
existing = cur.execute("SELECT id, label, apiKey, audience FROM user_api_keys WHERE userId='2f9ee451-a116-49cb-8a97-f183e7d4beba'").fetchall()
print("Existing keys count:", len(existing))

if not existing:
    key_id = secrets.token_hex(8)
    api_key_secret = "n8n_api_" + secrets.token_hex(24)
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

    # Get owner scopes
    owner_scopes = [
        "user:read","user:list","user:create","user:changeRole","user:delete",
        "project:create","project:update","project:delete","project:list","project:export","project:manageMembers",
        "tag:create","tag:read","tag:update","tag:delete","tag:list",
        "workflow:create","workflow:read","workflow:update","workflow:delete","workflow:export","workflow:import","workflow:list","workflow:move","workflow:activate","workflow:deactivate",
        "execution:delete","execution:read","execution:retry","execution:stop","execution:list",
        "credential:create","credential:update","credential:move","credential:delete","credential:list"
    ]

    cur.execute("""
        INSERT INTO user_api_keys (id, userId, label, apiKey, createdAt, updatedAt, scopes, audience, lastUsedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    """, (key_id, user[0], "Aevora Primary", api_key_secret, now_str, now_str, json.dumps(owner_scopes), "public-api"))

    con.commit()
    print("Inserted new API key successfully!")
    print(f"KEY_GENERATED: id={key_id}, length={len(api_key_secret)}, prefix={api_key_secret[:12]}...")
else:
    print(f"Found existing key: id={existing[0][0]}, prefix={existing[0][2][:12]}...")
