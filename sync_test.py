import pymysql, json, ssl, urllib.request, urllib.error, time

DB = {'host':'rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com','port':3306,'user':'cli_44608921','password':'9507fd52fc87d7cfe3f1e756b725a156','database':'cli_44608921','charset':'utf8mb4'}
D1_DB='9b412b46-60bd-4a12-9b4b-fb583595ea4c'
CF_ACCT='ad72c31a4eaccfca28b91e049a1f8e97'
CF_TOKEN=open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()

def d1(sql):
    url=f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCT}/d1/database/{D1_DB}/query'
    body=json.dumps({'sql':sql}).encode('utf-8')
    req=urllib.request.Request(url,data=body,headers={'Authorization':f'Bearer {CF_TOKEN}','Content-Type':'application/json'},method='POST')
    ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
    try:
        resp=urllib.request.urlopen(req,timeout=30,context=ctx)
        return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return {'success':False,'error':e.read().decode('utf-8') if e.fp else str(e)}
    except Exception as e:
        return {'success':False,'error':str(e)}

# Test D1 connection first
print('Testing D1...',flush=True)
r=d1('SELECT 1 as test')
print(f'D1 test: {r}',flush=True)

# Get tables
print('MySQL connect...',flush=True)
conn=pymysql.connect(**DB,cursorclass=pymysql.cursors.DictCursor,connect_timeout=5)
cur=conn.cursor()
cur.execute('SHOW TABLES')
tables=[list(r.values())[0] for r in cur.fetchall()]
print(f'MySQL tables: {len(tables)}',flush=True)

# Sync first table only as test
if tables:
    t = tables[0]
    print(f'Syncing {t}...', flush=True)
    cur.execute(f'SELECT * FROM `{t}`')
    rows = cur.fetchall()
    if rows:
        cols = list(rows[0].keys())
        cd = ', '.join([f'[{c}] {"INTEGER" if isinstance(rows[0].get(c),int) else "REAL" if isinstance(rows[0].get(c),float) else "TEXT"}' for c in cols])
        print(f'  Creating ({len(cols)} cols)...', flush=True)
        r = d1(f'CREATE TABLE [{t}] ({cd})')
        if not r.get('success'):
            d1(f'DROP TABLE [{t}]')
            time.sleep(0.5)
            r = d1(f'CREATE TABLE [{t}] ({cd})')
        print(f'  Create: {"OK" if r.get("success") else "FAIL: "+str(r.get("error",""))[:100]}', flush=True)
        
        if r.get('success'):
            # Insert 2 rows
            for i in range(min(2,len(rows))):
                row = rows[i]
                vals = []
                for c in cols:
                    v = row.get(c)
                    if v is None: vals.append('NULL')
                    elif isinstance(v,(int,float)): vals.append(str(v))
                    else: vals.append("'"+str(v).replace("'","''")+"'")
                cs=', '.join([f'[{c}]' for c in cols])
                r=d1(f'INSERT INTO [{t}] ({cs}) VALUES ({",".join(vals)})')
                print(f'  Row {i}: {"OK" if r.get("success") else "FAIL: "+str(r.get("error",""))[:80]}', flush=True)

conn.close()
print('Test done', flush=True)
