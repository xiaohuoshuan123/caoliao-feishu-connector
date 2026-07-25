import sys, traceback

try:
    import pymysql
    print('pymysql imported OK')
    
    conn = pymysql.connect(
        host='rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',
        port=3306, user='cli_44608921',
        password='9507fd52fc87d7cfe3f1e756b725a156',
        database='cli_44608921', charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor, connect_timeout=5
    )
    print('MySQL connected OK')
    
    cur = conn.cursor()
    cur.execute('SHOW TABLES')
    tables = [list(r.values())[0] for r in cur.fetchall()]
    print('Tables: %d' % len(tables))
    for t in tables[:3]:
        print('  %s' % t)
    
    # Try one query
    cur.execute('SELECT * FROM `%s` LIMIT 2' % tables[0])
    rows = cur.fetchall()
    print('Sample query OK: %d rows' % len(rows))
    
    conn.close()
    print('ALL OK')
    
except Exception as e:
    print('ERROR: %s' % str(e))
    traceback.print_exc()
