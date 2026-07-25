import pymysql, json, ssl, urllib.request, time, sys

TABLE = sys.argv[1] if len(sys.argv) > 1 else 'base_auth_msg'
LOG = r'C:\Users\Administrator\sync_d1.log'

conn = pymysql.connect(host='rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',port=3306,user='cli_44608921',password='9507fd52fc87d7cfe3f1e756b725a156',database='cli_44608921',charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,connect_timeout=10)
cur=conn.cursor()
cur.execute(f'SELECT * FROM `{TABLE}`')
rows=cur.fetchall()

with open(LOG,'a',encoding='utf-8') as log:
    log.write(f'Table: {TABLE}, Rows: {len(rows)}\n')

if not rows:
    conn.close()
    sys.exit(0)

cols=list(rows[0].keys())

token = open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()
acct = 'ad72c31a4eaccfca28b91e049a1f8e97'
db = '9b412b46-60bd-4a12-9b4b-fb583595ea4c'
d1url = f'https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database/{db}/query'

# No SSL verification for speed
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def d1(sql):
    body = json.dumps({'sql': sql}).encode('utf-8')
    req = urllib.request.Request(d1url, data=body, headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }, method='POST')
    try:
        resp = urllib.request.urlopen(req, timeout=120, context=ctx)
        return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return {'success': False, 'error': e.read().decode('utf-8', errors='replace') if e.fp else str(e)}
    except Exception as e:
        return {'success': False, 'error': str(e)}

col_defs = []
for c in cols:
    v = rows[0].get(c)
    t = 'INTEGER' if isinstance(v,int) else 'REAL' if isinstance(v,float) else 'TEXT'
    col_defs.append(f'[{c}] {t}')

create_sql = f'CREATE TABLE [{TABLE}] ({", ".join(col_defs)})'

d1(f'DROP TABLE [{TABLE}]')
time.sleep(2)

r = d1(create_sql)
with open(LOG,'a',encoding='utf-8') as log:
    log.write(f'Create: success={r.get("success")}\n')

if not r.get('success'):
    conn.close()
    sys.exit(1)

# Insert with small batches (25) and retry
ins = 0
bs = 25
for i in range(0, len(rows), bs):
    batch = rows[i:i+bs]
    vals = []
    for row in batch:
        row_vals = []
        for c in cols:
            v = row.get(c)
            if v is None: row_vals.append('NULL')
            elif isinstance(v,(int,float)): row_vals.append(str(v))
            else:
                s = str(v).replace("'", "''")
                row_vals.append(f"'{s}'")
        vals.append(f'({", ".join(row_vals)})')
    
    cs = ', '.join([f'[{c}]' for c in cols])
    insert_sql = f'INSERT INTO [{TABLE}] ({cs}) VALUES {", ".join(vals)}'
    
    max_retry = 3
    for retry in range(max_retry):
        r = d1(insert_sql)
        if r.get('success'):
            break
        time.sleep(2)
    
    if not r.get('success'):
        with open(LOG,'a',encoding='utf-8') as log:
            log.write(f'Insert fail @ {i}: {str(r.get("error",""))[:150]}\n')
        break
    ins += len(batch)

with open(LOG,'a',encoding='utf-8') as log:
    log.write(f'Inserted: {ins}\n')

conn.close()
with open(LOG,'a',encoding='utf-8') as log:
    log.write('DONE\n')
