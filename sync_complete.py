import pymysql, json, ssl, urllib.request, http.client, time, sys

# Read token
TOKEN = open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()
ACCT = 'ad72c31a4eaccfca28b91e049a1f8e97'
DB = '9b412b46-60bd-4a12-9b4b-fb583595ea4c'
LOG = r'C:\Users\Administrator\sync_d1.log'

# HTTPS connection pool
def get_conn():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return http.client.HTTPSConnection('api.cloudflare.com', context=ctx, timeout=120)

def d1(sql):
    body = json.dumps({'sql': sql}).encode('utf-8')
    for attempt in range(3):
        try:
            c = get_conn()
            c.request('POST', f'/client/v4/accounts/{ACCT}/d1/database/{DB}/query', body=body, headers={
                'Authorization': f'Bearer {TOKEN}',
                'Content-Type': 'application/json'
            })
            resp = c.getresponse()
            data = resp.read().decode('utf-8')
            c.close()
            return json.loads(data)
        except Exception as e:
            time.sleep(3)
            if attempt == 2:
                return {'success': False, 'error': str(e)}

def sqlite_type(v):
    if isinstance(v,int): return 'INTEGER'
    if isinstance(v,float): return 'REAL'
    return 'TEXT'

def sv(v):
    if v is None: return 'NULL'
    if isinstance(v,(int,float)): return str(v)
    return "'"+str(v).replace("'","''")+"'"

# MySQL connect
conn = pymysql.connect(host='rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',port=3306,user='cli_44608921',password='9507fd52fc87d7cfe3f1e756b725a156',database='cli_44608921',charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,connect_timeout=10)
cur = conn.cursor()
cur.execute('SHOW TABLES')
tables = [list(r.values())[0] for r in cur.fetchall()]

with open(LOG,'w',encoding='utf-8') as f:
    f.write(f'{len(tables)} tables total\n')

total_rows = 0
for idx, table in enumerate(tables):
    cur.execute(f'SELECT * FROM `{table}`')
    rows = cur.fetchall()
    if not rows:
        with open(LOG,'a',encoding='utf-8') as f:
            f.write(f'{idx+1}/{len(tables)} {table}: empty\n')
        continue
    
    cols = list(rows[0].keys())
    with open(LOG,'a',encoding='utf-8') as f:
        f.write(f'{idx+1}/{len(tables)} {table} ({len(rows)} rows)...\n')
    
    # Drop + Create
    d1(f'DROP TABLE [{table}]')
    time.sleep(3)
    
    cd = ', '.join([f'[{c}] {sqlite_type(rows[0].get(c))}' for c in cols])
    r = d1(f'CREATE TABLE [{table}] ({cd})')
    if not r.get('success'):
        time.sleep(2)
        r = d1(f'CREATE TABLE [{table}] ({cd})')
    
    if not r.get('success'):
        with open(LOG,'a',encoding='utf-8') as f:
            f.write(f'  CREATE FAIL\n')
        continue
    
    # Insert in batches of 10
    ins = 0
    bs = 10
    for i in range(0, len(rows), bs):
        batch = rows[i:i+bs]
        vals = []
        for row in batch:
            row_vals = [sv(row.get(c)) for c in cols]
            vals.append(f'({", ".join(row_vals)})')
        cs = ', '.join([f'[{c}]' for c in cols])
        insert_sql = f'INSERT INTO [{table}] ({cs}) VALUES {", ".join(vals)}'
        r = d1(insert_sql)
        if not r.get('success'):
            time.sleep(2)
            r = d1(insert_sql)
        if not r.get('success'):
            with open(LOG,'a',encoding='utf-8') as f:
                f.write(f'  INS FAIL @{i}: {str(r.get("error",""))[:100]}\n')
            break
        ins += len(batch)
    
    total_rows += ins
    with open(LOG,'a',encoding='utf-8') as f:
        f.write(f'  OK {ins}\n')

conn.close()
with open(LOG,'a',encoding='utf-8') as f:
    f.write(f'\nTOTAL: {total_rows} rows\n')
