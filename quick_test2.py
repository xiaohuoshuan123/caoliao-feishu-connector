import pymysql, json, ssl, urllib.request, urllib.error

# Test D1 connection
D1_DB='9b412b46-60bd-4a12-9b4b-fb583595ea4c'
CF_ACCT='ad72c31a4eaccfca28b91e049a1f8e97'
CF_TOKEN=open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()

url='https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query'%(CF_ACCT,D1_DB)
body=json.dumps({'sql':'SELECT 1 as test'}).encode('utf-8')
req=urllib.request.Request(url,data=body,headers={'Authorization':'Bearer '+CF_TOKEN,'Content-Type':'application/json'},method='POST')
ctx=ssl.create_default_context();ctx.check_hostname=False;ctx.verify_mode=ssl.CERT_NONE

with open(r'C:\Users\Administrator\d1_test.log','w',encoding='utf-8') as f:
    f.write('Testing D1...\n')
    try:
        resp=urllib.request.urlopen(req,timeout=30,context=ctx)
        data=json.loads(resp.read().decode('utf-8'))
        f.write('Response: %s\n' % json.dumps(data))
    except Exception as e:
        f.write('Error: %s\n' % str(e))

    # Test MySQL
    f.write('Testing MySQL...\n')
    try:
        conn=pymysql.connect(host='rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',port=3306,user='cli_44608921',password='9507fd52fc87d7cfe3f1e756b725a156',database='cli_44608921',charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,connect_timeout=5)
        cur=conn.cursor()
        cur.execute('SHOW TABLES')
        tables=[list(r.values())[0] for r in cur.fetchall()]
        f.write('Tables: %d\n' % len(tables))
        conn.close()
    except Exception as e:
        f.write('MySQL Error: %s\n' % str(e))

f=open(r'C:\Users\Administrator\d1_test.log','a',encoding='utf-8')
f.write('Done\n')
f.close()
