import pymysql, os

DB = {'host':'rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com','port':3306,'user':'cli_44608921','password':'9507fd52fc87d7cfe3f1e756b725a156','database':'cli_44608921','charset':'utf8mb4'}
OUT = r'C:\Users\Administrator\d1_small_batches'
os.makedirs(OUT, exist_ok=True)

conn = pymysql.connect(**DB, cursorclass=pymysql.cursors.DictCursor, connect_timeout=10)
cur = conn.cursor()

for table in ['code_task_log', 'table_d19']:
    cur.execute(f'SELECT * FROM `{table}`')
    rows = cur.fetchall()
    if not rows: continue
    cols = list(rows[0].keys())
    
    # Schema
    with open(f'{OUT}\\{table}_schema.sql', 'w') as f:
        cd = ', '.join([f'[{c}] {"INTEGER" if isinstance(rows[0].get(c),int) else "REAL" if isinstance(rows[0].get(c),float) else "TEXT"}' for c in cols])
        f.write(f'CREATE TABLE [{table}] ({cd});\n')
    
    # Data in batches of 10
    for idx, i in enumerate(range(0, len(rows), 10)):
        batch = rows[i:i+10]
        with open(f'{OUT}\\{table}_data_{idx}.sql', 'w') as f:
            for row in batch:
                vals = []
                for c in cols:
                    v = row.get(c)
                    if v is None: vals.append('NULL')
                    elif isinstance(v,(int,float)): vals.append(str(v))
                    else: vals.append(f"'{str(v).replace(chr(39),chr(39)+chr(39))}'")
                cs = ', '.join([f'[{c}]' for c in cols])
                f.write(f'INSERT INTO [{table}] ({cs}) VALUES ({", ".join(vals)});\n')

conn.close()
print('Done')
