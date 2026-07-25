import pymysql, json, os

DB = {'host':'rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com','port':3306,'user':'cli_44608921','password':'9507fd52fc87d7cfe3f1e756b725a156','database':'cli_44608921','charset':'utf8mb4'}
OUT_DIR = r'C:\Users\Administrator\d1_sql_files'

os.makedirs(OUT_DIR, exist_ok=True)

conn = pymysql.connect(**DB, cursorclass=pymysql.cursors.DictCursor, connect_timeout=10)
cur = conn.cursor()
cur.execute('SHOW TABLES')
tables = [list(r.values())[0] for r in cur.fetchall()]

# Tables that need retrying (failed or incomplete)
retry_tables = [
    'base_project', 'base_table_data', 'base_task', 'code_state',
    'code_state_log', 'code_task_log', 'cycle_task_entity_task',
    'table_d16', 'table_d19', 'table_d22', 'table_d23', 'table_d24',
    'table_d27', 'table_d29', 'table_d3', 'table_d30', 'table_d32',
    'table_d34', 'table_d6', 'table_relation', 'template_codeinfo_d10',
    'template_codeinfo_d12', 'template_codeinfo_d14', 'template_codeinfo_d15',
    'template_codeinfo_d25', 'template_codeinfo_d28'
]

for table in tables:
    if table not in retry_tables:
        continue
    
    cur.execute(f'SELECT * FROM `{table}`')
    rows = cur.fetchall()
    if not rows:
        continue
    
    cols = list(rows[0].keys())
    
    # Write schema file
    schema_file = os.path.join(OUT_DIR, f'{table}_schema.sql')
    with open(schema_file, 'w', encoding='utf-8') as f:
        col_defs = []
        for c in cols:
            v = rows[0].get(c)
            t = 'INTEGER' if isinstance(v, int) else 'REAL' if isinstance(v, float) else 'TEXT'
            col_defs.append(f'[{c}] {t}')
        f.write(f'DROP TABLE IF EXISTS [{table}];\n')
        f.write(f'CREATE TABLE [{table}] ({", ".join(col_defs)});\n')
    
    # Write data in batches of 20 rows per file
    batch_size = 20
    for batch_idx, i in enumerate(range(0, len(rows), batch_size)):
        batch = rows[i:i+batch_size]
        data_file = os.path.join(OUT_DIR, f'{table}_data_{batch_idx}.sql')
        with open(data_file, 'w', encoding='utf-8') as f:
            for row in batch:
                vals = []
                for c in cols:
                    v = row.get(c)
                    if v is None: vals.append('NULL')
                    elif isinstance(v, (int, float)): vals.append(str(v))
                    else: vals.append("'" + str(v).replace("'", "''") + "'")
                cs = ', '.join([f'[{c}]' for c in cols])
                f.write(f'INSERT INTO [{table}] ({cs}) VALUES ({", ".join(vals)});\n')

conn.close()
print('SQL files generated')
