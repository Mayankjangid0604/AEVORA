import sqlite3
import os
import secrets

# 1. Fetch n8n API key from database.sqlite
con = sqlite3.connect(r'C:\Users\mayan\.n8n\database.sqlite')
row = con.cursor().execute("SELECT apiKey FROM user_api_keys WHERE label='Aevora Primary' LIMIT 1").fetchone()
if not row:
    raise RuntimeError("n8n API key not found in sqlite!")
n8n_api_key = row[0]

# 2. Generate random 32-char hex integration key if not already generated
integration_key = secrets.token_hex(16) # 32 hex chars

def update_env(file_path):
    if not os.path.exists(file_path):
        return
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    keys_to_set = {
        'N8N_API_URL': 'http://localhost:5678',
        'N8N_API_KEY': n8n_api_key,
        'INTEGRATION_API_KEY': integration_key,
    }

    # Also fix DATABASE_URL in apps/api/.env if it points to 5432
    if 'apps' in file_path and 'api' in file_path:
        with open('.env', 'r', encoding='utf-8') as rf:
            for l in rf:
                if l.startswith('DATABASE_URL='):
                    keys_to_set['DATABASE_URL'] = l.split('=', 1)[1].strip().strip('"').strip("'")
                    break

    found_keys = set()
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startsWith('#') if hasattr(stripped, 'startsWith') else (stripped and not stripped.startswith('#')):
            eq = stripped.find('=')
            if eq != -1:
                k = stripped[:eq].strip()
                if k in keys_to_set:
                    new_lines.append(f'{k}="{keys_to_set[k]}"\n')
                    found_keys.add(k)
                    continue
        new_lines.append(line)

    for k, v in keys_to_set.items():
        if k not in found_keys:
            new_lines.append(f'{k}="{v}"\n')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    print(f"Updated {file_path} safely. Keys updated/added: {list(keys_to_set.keys())}")

update_env('.env')
update_env('apps/api/.env')
