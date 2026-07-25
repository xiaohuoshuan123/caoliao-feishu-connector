#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
草料 MySQL -> Cloudflare D1 全量同步脚本
使用 D1 HTTP API 直接导入
"""
import pymysql
import json
import os
import ssl
import urllib.request
import urllib.error
import time

# ====== 配置 ======
DB_CONFIG = {
    'host': 'rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',
    'port': 3306,
    'user': 'cli_44608921',
    'password': '9507fd52fc87d7cfe3f1e756b725a156',
    'database': 'cli_44608921',
    'charset': 'utf8mb4'
}

D1_DATABASE_ID = '9b412b46-60bd-4a12-9b4b-fb583595ea4c'
CLOUDFLARE_ACCOUNT_ID = 'ad72c31a4eaccfca28b91e049a1f8e97'
CLOUDFLARE_API_TOKEN = open(r'C:\Users\Administrator\cf-deploy\.token', encoding='utf-8').read().strip()
# =================

def d1_query(sql, params=None):
    """调用 D1 HTTP API"""
    url = f'https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query'
    body = {'sql': sql}
    if params:
        body['params'] = params
    
    data = json.dumps(body).encode('utf-8')
    headers = {
        'Authorization': f'Bearer {CLOUDFLARE_API_TOKEN}',
        'Content-Type': 'application/json'
    }
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    try:
        resp = urllib.request.urlopen(req, timeout=30, context=ctx)
        return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err = e.read().decode('utf-8') if e.fp else str(e)
        return {'success': False, 'error': err, 'status': e.code}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_sqlite_type(val):
    if isinstance(val, int):
        return 'INTEGER'
    elif isinstance(val, float):
        return 'REAL'
    else:
        return 'TEXT'

def sanitize_value(v):
    if v is None:
        return 'NULL'
    elif isinstance(v, (int, float)):
        return str(v)
    else:
        s = str(v).replace("'", "''")
        return f"'{s}'"

def main():
    print('=' * 60)
    print('MySQL -> Cloudflare D1 同步工具')
    print('=' * 60)
    
    # 1. 连接 MySQL
    conn = pymysql.connect(**DB_CONFIG, connect_timeout=10, cursorclass=pymysql.cursors.DictCursor)
    cur = conn.cursor()
    
    # 2. 获取所有表
    cur.execute('SHOW TABLES')
    tables = [list(r.values())[0] for r in cur.fetchall()]
    print(f'\n发现 {len(tables)} 张表')
    
    # 3. 导出所有表数据
    all_data = {}
    for table in tables:
        print(f'  {table}...', end=' ', flush=True)
        cur.execute(f'SELECT * FROM `{table}`')
        rows = cur.fetchall()
        all_data[table] = rows
        print(f'{len(rows)} 行')
    
    conn.close()
    
    # 4. 导入 D1
    print('\n导入 D1...')
    total = 0
    
    for table, rows in all_data.items():
        if not rows:
            continue
        
        cols = list(rows[0].keys())
        print(f'  {table} ({len(rows)} rows)...', end=' ', flush=True)
        
        # 创建表 (D1 用方括号包裹列名)
        col_defs = []
        for col in cols:
            val = rows[0].get(col)
            sqlite_type = get_sqlite_type(val)
            col_defs.append(f'[{col}] {sqlite_type}')
        
        create_sql = f'CREATE TABLE [{table}] ({", ".join(col_defs)})'
        result = d1_query(create_sql)
        
        if not result.get('success'):
            err = result.get('error', '')
            if 'already exists' in str(err).lower():
                # 表已存在，尝试删除重建
                d1_query(f'DROP TABLE [{table}]')
                result = d1_query(create_sql)
            
            if not result.get('success'):
                print(f'\n    ❌ CREATE 失败: {str(err)[:150]}')
                continue
        
        # 分批插入 (每批50行)
        batch_size = 50
        inserted = 0
        
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i+batch_size]
            vals_list = []
            for row in batch:
                vals = [sanitize_value(row.get(col)) for col in cols]
                vals_list.append(f'({", ".join(vals)})')
            
            cols_sql = ', '.join([f'[{c}]' for c in cols])
            insert_sql = f'INSERT INTO [{table}] ({cols_sql}) VALUES {", ".join(vals_list)}'
            
            result = d1_query(insert_sql)
            if not result.get('success'):
                err = result.get('error', '')
                # 如果是列名问题，尝试用原始列名
                print(f'\n    ⚠️ INSERT 失败 @row {i}: {str(err)[:150]}')
                break
            
            inserted += len(batch)
        
        total += inserted
        print(f'OK {inserted} rows')
    
    print(f'\n✅ 完成！共 {total} 行数据导入 D1')

if __name__ == '__main__':
    main()
