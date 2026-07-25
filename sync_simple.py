#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pymysql
import json
import ssl
import urllib.request
import urllib.error
import time
import sys

# Config
DB = {
    'host': 'rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',
    'port': 3306, 'user': 'cli_44608921',
    'password': '9507fd52fc87d7cfe3f1e756b725a156',
    'database': 'cli_44608921', 'charset': 'utf8mb4'
}
D1_DB = '9b412b46-60bd-4a12-9b4b-fb583595ea4c'
CF_ACCT = 'ad72c31a4eaccfca28b91e049a1f8e97'
CF_TOKEN = open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()

def d1(sql):
    url = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCT}/d1/database/{D1_DB}/query'
    body = json.dumps({'sql': sql}).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers={
        'Authorization': f'Bearer {CF_TOKEN}',
        'Content-Type': 'application/json'
    }, method='POST')
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        resp = urllib.request.urlopen(req, timeout=30, context=ctx)
        return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err = e.read().decode('utf-8') if e.fp else str(e)
        return {'success': False, 'error': err}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def sqlite_type(v):
    if isinstance(v, int): return 'INTEGER'
    if isinstance(v, float): return 'REAL'
    return 'TEXT'

def sv(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

print('MySQL -> D1 Sync', flush=True)

conn = pymysql.connect(**DB, cursorclass=pymysql.cursors.DictCursor)
cur = conn.cursor()
cur.execute('SHOW TABLES')
tables = [list(r.values())[0] for r in cur.fetchall()]
print(f'Tables: {len(tables)}', flush=True)

total = 0
for table in tables:
    cur.execute(f'SELECT * FROM `{table}`')
    rows = cur.fetchall()
    if not rows: continue
    cols = list(rows[0].keys())
    print(f'{table} ({len(rows)} rows)...', end=' ', flush=True)
    
    # Create
    cd = ', '.join([f'[{c}] {sqlite_type(rows[0].get(c))}' for c in cols])
    r = d1(f'CREATE TABLE [{table}] ({cd})')
    if not r.get('success'):
        d1(f'DROP TABLE [{table}]')
        time.sleep(0.5)
        r = d1(f'CREATE TABLE [{table}] ({cd})')
        if not r.get('success'):
            print(f'CREATE FAIL: {str(r.get("error",""))[:100]}', flush=True)
            continue
    
    # Insert batches of 50
    ins = 0
    for i in range(0, len(rows), 50):
        batch = rows[i:i+50]
        vl = []
        for row in batch:
            vl.append('(' + ', '.join([sv(row.get(c)) for c in cols]) + ')1')
        cs = ', '.join([f'[{c}]' for c in cols])
        r = d1(f'INSERT INTO [{table}] ({cs}) VALUES ' + ', '.join(vl))
        if not r.get('success'):
            print(f'INS FAIL @{i}: {str(r.get("error",""))[:100]}', flush=True)
            break
        ins += len(batch)
    
    total += ins
    print(f'OK {ins}', flush=True)

conn.close()
print(f'Done! Total: {total} rows', flush=True)
