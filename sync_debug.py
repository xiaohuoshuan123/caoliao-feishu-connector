import pymysql, json, ssl, urllib.request, time, sys

TABLE = 'base_auth_msg'

conn = pymysql.connect(host='rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',port=3306,user='cli_44608921',password='9507fd52fc87d7cfe3f1e756b725a156',database='cli_44608921',charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,connect_timeout=10)
cur=conn.cursor()
cur.execute(f'SELECT * FROM `{TABLE}`')
rows=cur.fetchall()
log = open(r'C:\Users\Administrator\sync_detailed.log','w',encoding='utf-8')
log.write(f'Rows: {len(rows)}\n')

cols=list(rows[0].keys())
token=open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()
acct='ad72c31a4eaccfca28b91e049a1f8e97'
db='9b412b46-60bd-4a12-9b4b-fb583595ea4c'
d1url=f'https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database/{db}/query'

def d1(sql):
    body=json.dumps({'sql':sql}).encode('utf-8')
    req=urllib.request.Request(d1url,data=body,headers={'Authorization':f'Bearer {token}','Content-Type':'application/json'},method='POST')
    ctx=ssl.create_default_context();ctx.check_hostname=False;ctx.verify_mode=ssl.CERT_NONE
    try:
        resp=urllib.request.urlopen(req,timeout=60,context=ctx)
        return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return {'success':False,'error':e.read().decode('utf-8',errors='replace') if e.fp else str(e)}
    except Exception as e:
        return {'success':False,'error':str(e)}

cd=', '.join([f'[{c}] {"INTEGER" if isinstance(rows[0].get(c),int) else "REAL" if isinstance(rows[0].get(c),float) else "TEXT"}' for c in cols])
log.write(f'Cols: {cols}\n')
log.write(f'SQL: CREATE TABLE [{TABLE}] ({cd})\n')

r=d1(f'CREATE TABLE [{TABLE}] ({cd})')
log.write(f'Create: success={r.get("success")}, error={str(r.get("error",""))[:300]}\n')

if not r.get('success'):
    d1(f'DROP TABLE [{TABLE}]')
    time.sleep(0.3)
    r=d1(f'CREATE TABLE [{TABLE}] ({cd})')
    log.write(f'Retry: success={r.get("success")}, error={str(r.get("error",""))[:300]}\n')

if not r.get('success'):
    conn.close(); log.close(); sys.exit(1)

ins=0
for i in range(0,len(rows),50):
    b=rows[i:i+50]
    vl=[]
    for row in b:
        vals=[]
        for c in cols:
            v=row.get(c)
            if v is None: vals.append('NULL')
            elif isinstance(v,(int,float)): vals.append(str(v))
            else: vals.append("'")+str(v).replace("'","''")+"'"
        vl.append('(' + ', '.join(vals) + ')')
    cs=', '.join([f'[{c}]' for c in cols])
    r=d1('INSERT INTO [{TABLE}] ({cs}) VALUES ' + ', '.join(vl))
    if not r.get('success'):
        log.write(f'Ins fail @ {i}: {str(r.get("error",""))[:300]}\n')
        break
    ins+=len(b)

log.write(f'Inserted: {ins}\n')
conn.close(); log.close()
