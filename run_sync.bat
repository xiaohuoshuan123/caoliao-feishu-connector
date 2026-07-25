@echo off
cd /d C:\Users\Administrator\caoliao-feishu-connector-repo
python -c "
import sys, os, json, time
import pymysql
import ssl
import urllib.request
import urllib.error

# Read token
token = open(r'C:\Users\Administrator\cf-deploy\.token', 'r').strip()

# Connect MySQL
conn = pymysql.connect(
    host='rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',
    port=3306, user='cli_44608921',
    password='9507fd52fc87d7cfe3f1e756b725a156',
    database='cli_44608921', charset='utf8mb4',
    cursorclass=pymysql.cursors.DictCursor, connect_timeout=10
)

# D1 API
acct = 'ad72c31a4eaccfca28b91e049a1f8e97'
db = '9b412b46-60bd-4a12-9b4b-fb583595ea4c'
d1url = f'https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database/{db}/query'

def d1(sql):
    body = json.dumps({'sql': sql}).encode('utf-8')
    req = urllib.request.Request(d1url, data=body, headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }, method='POST')
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        resp = urllib.request.urlopen(req, timeout=60, context=ctx)
        return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err = e.read().decode('utf-8', errors='replace') if e.fp else str(e)
        return {'success': False, 'error': err}
    except Exception as e:
        return {'success': False, 'error': str(e)}

# Log file
log = open(r'C:\Users\Administrator\sync_log.txt', 'w')
log.write('Starting...\n')

# Get tables
cur = conn.cursor()
cur.execute('SHOW TABLES')
tables = [list(r.values())[0] for r in cur.fetchall()]
log.write(f'Found {len(tables)} tables\n')

for idx, table in enumerate(tables):
    log.write(f'{idx+1}/{len(tables)} {table}...\n')
    log.flush()
    
    cur.execute(f'SELECT * FROM `{table}`')
    rows = cur.fetchall()
    if not rows:
        log.write('  empty\n')
        continue
    
    cols = list(rows[0].keys())
    
    # Create table
    col_defs = []
    for c in cols:
        v = rows[0].get(c)
        t = 'INTEGER' if isinstance(v, int) else 'REAL' if isinstance(v, float) else 'TEXT'
        col_defs.append(f'[{c}] {t}')
    
    r = d1(f'CREATE TABLE [{table}] ({', '.join(col_defs)})')
    if not r.get('success'):
        d1(f'DROP TABLE [{table}]')
        time.sleep(0.5)
        r = d1(f'CREATE TABLE [{table}] ({', '.join(col_defs)})')
    
    if not r.get('success'):
        log.write(f'  CREATE FAIL\n')
        continue
    
    # Insert batches
    ins = 0
    for i in range(0, len(rows), 50):
        batch = rows[i:i+50]
        vals = []
        for row in batch:
            row_vals = []
            for c in cols:
                v = row.get(c)
                if v is None: row_vals.append('NULL')
                elif isinstance(v, (int, float)): row_vals.append(str(v))
                else: row_vals.append(f\"'{str(v).replace(chr(39), chr(39)+chr(39))}'\")
            vals.append(f'({\", \".join(row_vals)})')
        
        cs = ', '.join([f'[{c}]' for c in cols])
        r = d1(f'INSERT INTO [{table}] ({cs}) VALUES {\", \".join(vals)}')
        if not r.get('success'):
            log.write(f'  INS FAIL @ {i}\n')
            break
        ins += len(batch)
    
    log.write(f'  OK {ins}\n')

conn.close()
log.write('DONE\n')
log.close()
print('ALL DONE')
" 2>&1
