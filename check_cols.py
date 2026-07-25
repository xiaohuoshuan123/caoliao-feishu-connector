#!/usr/bin/env python3
"""
草料 MySQL → D1 同步（直接读取列名）
"""
import pymysql
import json

DB_CONFIG = {
    'host': 'rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',
    'port': 3306,
    'user': 'cli_44608921',
    'password': '9507fd52fc87d7cfe3f1e756b725a156',
    'database': 'cli_44608921',
    'charset': 'utf8mb4'
}

def main():
    conn = pymysql.connect(**DB_CONFIG, connect_timeout=10, cursorclass=pymysql.cursors.DictCursor)
    cursor = conn.cursor()
    
    # 只查看前5张表的列名
    cursor.execute('SHOW TABLES')
    tables = [list(r.values())[0] for r in cursor.fetchall()][:5]
    
    for table in tables:
        cursor.execute(f'DESCRIBE `{table}`')
        cols = cursor.fetchall()
        print(f'{table}:')
        for c in cols:
            print(f'  {c["Field"]} ({c["Type"]})')
        print()
    
    conn.close()

if __name__ == '__main__':
    main()
