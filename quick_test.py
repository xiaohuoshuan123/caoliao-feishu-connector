import pymysql, json, subprocess, os

DB = {
    'host': 'rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',
    'port': 3306, 'user': 'cli_44608921',
    'password': '9507fd52fc87d7cfe3f1e756b725a156',
    'database': 'cli_44608921', 'charset': 'utf8mb4'
}

def d1(sql):
    env = os.environ.copy()
    env['CLOUDFLARE_API_TOKEN'] = open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()
    r = subprocess.run(
        ['wrangler', 'd1', 'execute', 'caoliao-db-cf', '--command', sql, '--remote', '-y'],
        capture_output=True, text=True, timeout=60, env=env,
        cwd=r'C:\Users\Administrator\caoliao-feishu-connector-repo'
    )
    return r.returncode == 0, r.stdout[:500], r.stderr[:500]

conn = pymysql.connect(**DB, cursorclass=pymysql.cursors.DictCursor)
cur = conn.cursor()
cur.execute('SHOW TABLES')
tables = [list(r.values())[0] for r in cur.fetchall()]
print(f'Tables: {len(tables)}')

# Test with one table
table = tables[0]
cur.execute(f'SELECT * FROM `{table}` LIMIT 3')
rows = cur.fetchall()
cols = list(rows[0].keys())
print(f'{table}: {len(cols)} cols')

# Create
col_defs = []
for c in cols:
    v = rows[0].get(c)
    t = 'INTEGER' if isinstance(v, int) else ('REAL' if isinstance(v, float) else 'TEXT')
    col_defs.append(f'[{c}] {t}')
create = f'CREATE TABLE [{table}] ({", ".join(col_defs)})'
print(f'Creating...', end=' ')
ok, o, e = d1(create)
print('OK' if ok else f'FAIL: {e[:100]}')

# Insert
if ok:
    for row in rows:
        vals = []
        for c in cols:
            v = row[c]
            vals.append(f"'{str(v).replace(chr(39),chr(39)+chr(39))}'" if v is not None else 'NULL')
        ins = f"INSERT INTO [{table}] VALUES ({','.join(vals)})"
        ok, o, e = d1(ins)
        if not ok:
            print(f'Insert fail: {e[:100]}')
            break
    print('Insert OK')

conn.close()
