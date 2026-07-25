import pymysql, json, ssl, urllib.request, urllib.error, time

DB = {'host':'rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com','port':3306,'user':'cli_44608921','password':'9507fd52fc87d7cfe3f1e756b725a156','database':'cli_44608921','charset':'utf8mb4'}
D1_DB='9b412b46-60bd-4a12-9b4b-fb583595ea4c'
CF_ACCT='ad72c31a4eaccfca28b91e049a1f8e97'
CF_TOKEN=open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()

def d1(sql):
    url='https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query'%(CF_ACCT,D1_DB)
    body=json.dumps({'sql':sql}).encode('utf-8')
    req=urllib.request.Request(url,data=body,headers={'Authorization':'Bearer '+CF_TOKEN,'Content-Type':'application/json'},method='POST')
    ctx=ssl.create_default_context();ctx.check_hostname=False;ctx.verify_mode=ssl.CERT_NONE
    try:
        resp=urllib.request.urlopen(req,timeout=60,context=ctx)
        return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return {'success':False,'error':e.read().decode('utf-8',errors='replace') if e.fp else str(e)}
    except Exception as e:
        return {'success':False,'error':str(e)}

def sqlite_type(v):
    if isinstance(v,int): return 'INTEGER'
    if isinstance(v,float): return 'REAL'
    return 'TEXT'

def sv(v):
    if v is None: return 'NULL'
    if isinstance(v,(int,float)): return str(v)
    return "'"+str(v).replace("'","''")+"'"

LOG = r'C:\Users\Administrator\sync_progress.txt'
with open(LOG, 'w', encoding='utf-8') as f:
    f.write('MySQL to D1 Sync\n')

conn=pymysql.connect(**DB,cursorclass=pymysql.cursors.DictCursor,connect_timeout=5)
cur=conn.cursor()
cur.execute('SHOW TABLES')
tables=[list(r.values())[0] for r in cur.fetchall()]

for idx,table in enumerate(tables):
    cur.execute('SELECT * FROM `%s`' % table)
    rows=cur.fetchall()
    if not rows:
        with open(LOG,'a',encoding='utf-8') as f:
            f.write('%d/%d %s: empty\n' % (idx+1,len(tables),table))
        continue
    cols=list(rows[0].keys())
    with open(LOG,'a',encoding='utf-8') as f:
        f.write('%d/%d %s (%d rows)...\n' % (idx+1,len(tables),table,len(rows)))
    
    cd=', '.join(['[%s] %s' % (c,sqlite_type(rows[0].get(c))) for c in cols])
    r=d1('CREATE TABLE [%s] (%s)' % (table,cd))
    if not r.get('success'):
        d1('DROP TABLE [%s]' % table)
        time.sleep(0.3)
        r=d1('CREATE TABLE [%s] (%s)' % (table,cd))
        if not r.get('success'):
            with open(LOG,'a',encoding='utf-8') as f:
                f.write('  CREATE FAIL\n')
            continue
    
    ins=0
    for i in range(0,len(rows),50):
        b=rows[i:i+50]
        vl=[]
        for row in b:
            vals=[sv(row.get(c)) for c in cols]
            vl.append('('+', '.join(vals)+')')
        cs=', '.join(['[%s]' % c for c in cols])
        r=d1('INSERT INTO [%s] (%s) VALUES %s' % (table,cs,', '.join(vl)))
        if not r.get('success'):
            with open(LOG,'a',encoding='utf-8') as f:
                f.write('  INS FAIL @%d\n' % i)
            break
        ins+=len(b)
    with open(LOG,'a',encoding='utf-8') as f:
        f.write('  OK %d\n' % ins)

conn.close()
with open(LOG,'a',encoding='utf-8') as f:
    f.write('DONE\n')
