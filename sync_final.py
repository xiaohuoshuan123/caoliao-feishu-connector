import pymysql, json, ssl, urllib.request, urllib.error, time, re

# MySQL config
DB_HOST = 'rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com'
DB_PORT = 3306
DB_USER = 'cli_44608921'
DB_PASS = '9507fd52fc87d7cfe3f1e756b725a156'
DB_NAME = 'cli_44608921'

# D1 config
D1_DB = '9b412b46-60bd-4a12-9b4b-fb583595ea4c'
CF_ACCT = 'ad72c31a4eaccfca28b91e049a1f8e97'
CF_TOKEN = open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()

def d1(sql):
    url = 'https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query' % (CF_ACCT, D1_DB)
    body = json.dumps({'sql': sql}).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers={
        'Authorization': 'Bearer ' + CF_TOKEN,
        'Content-Type': 'application/json'
    }, method='POST')
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        resp = urllib.request.urlopen(req, timeout=60, context=ctx)
        return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err = ''
        if e.fp:
            err = e.read().decode('utf-8', errors='replace')
        return {'success': False, 'error': err, 'code': e.code}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def safe_col(name):
    # Replace non-alphanumeric with underscore
    s = re.sub(r'[^\w]', '_', name)
    if not s:
        s = 'col'
    return s

def sqlite_type(v):
    if isinstance(v, int):
        return 'INTEGER'
    if isinstance(v, float):
        return 'REAL'
    return 'TEXT'

def sv(v):
    if v is None:
        return 'NULL'
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).replace("'", "''")
    return "'" + s + "'"

print('Connecting MySQL...', flush=True)
conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
                       database=DB_NAME, charset='utf8mb4',
                       cursorclass=pymysql.cursors.DictCursor, connect_timeout=10)
cur = conn.cursor()
cur.execute('SHOW TABLES')
tables = [list(r.values())[0] for r in cur.fetchall()]
print('Found %d tables' % len(tables), flush=True)

total = 0
for idx, table in enumerate(tables):
    cur.execute('SELECT * FROM `%s`' % table)
    rows = cur.fetchall()
    if not rows:
        print('%d/%d %s: empty' % (idx+1, len(tables), table), flush=True)
        continue
    cols = list(rows[0].keys())
    
    print('%d/%d %s (%d rows)...' % (idx+1, len(tables), table, len(rows)), end=' ', flush=True)
    
    # Create table
    col_defs = ', '.join(['[%s] %s' % (c, sqlite_type(rows[0].get(c))) for c in cols])
    r = d1('CREATE TABLE [%s] (%s)' % (table, col_defs))
    if not r.get('success'):
        d1('DROP TABLE [%s]' % table)
        time.sleep(0.3)
        r = d1('CREATE TABLE [%s] (%s)' % (table, col_defs))
        if not r.get('success'):
            print('CREATE FAIL', flush=True)
            continue
    
    # Insert batches of 100
    ins = 0
    bs = 100
    for i in range(0, len(rows), bs):
        batch = rows[i:i+bs]
        vals_list = []
        for row in batch:
            vals = [sv(row.get(c)) for c in cols]
            vals_list.append('(' + ', '.join(vals) + ')')
        cols_sql = ', '.join(['[%s]' % c for c in cols])
        ins_sql = 'INSERT INTO [%s] (%s) VALUES %s' % (table, cols_sql, ', '.join(vals_list))
        r = d1(ins_sql)
        if not r.get('success'):
            err = str(r.get('error', ''))[:80]
            print('INS FAIL @%d: %s' % (i, err), flush=True)
            break
        ins += len(batch)
    
    total += ins
    print('OK %d' % ins, flush=True)

conn.close()
print('Done! Total: %d rows' % total, flush=True)
