import pymysql, json, sys

TABLE = 'base_auth_msg'
LOG = r'C:\Users\Administrator\sync_detailed.log'

conn = pymysql.connect(host='rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',port=3306,user='cli_44608921',password='9507fd52fc87d7cfe3f1e756b725a156',database='cli_44608921',charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,connect_timeout=10)
cur=conn.cursor()
cur.execute(f'SELECT * FROM `{TABLE}`')
rows=cur.fetchall()

with open(LOG,'w',encoding='utf-8') as log:
    log.write(f'Rows: {len(rows)}\n')
    
    if not rows:
        log.write('Empty table\n')
        conn.close()
        sys.exit(0)
    
    cols=list(rows[0].keys())
    log.write(f'Cols: {cols}\n')
    
    # Write schema as JSON
    schema = []
    for c in cols:
        v = rows[0].get(c)
        t = 'INTEGER' if isinstance(v,int) else 'REAL' if isinstance(v,float) else 'TEXT'
        schema.append({'name': c, 'type': t})
    
    with open(r'C:\Users\Administrator\schema.json','w',encoding='utf-8') as f:
        json.dump(schema, f, ensure_ascii=False)
    
    # Write all rows as JSON lines
    with open(r'C:\Users\Administrator\rows.jsonl','w',encoding='utf-8') as f:
        for row in rows:
            # Convert datetime and other non-serializable types
            clean = {}
            for k, v in row.items():
                if v is None:
                    clean[k] = None
                elif isinstance(v, (int, float)):
                    clean[k] = v
                else:
                    clean[k] = str(v)
            f.write(json.dumps(clean, ensure_ascii=False) + '\n')
    
    log.write(f'Written {len(rows)} rows to rows.jsonl\n')

conn.close()
with open(LOG,'a',encoding='utf-8') as log:
    log.write('MySQL export done\n')
