import os, time

SQL_DIR = r'C:\Users\Administrator\d1_sql_files'
TOKEN = open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()

data_files = sorted([f for f in os.listdir(SQL_DIR) if '_data_' in f])
total = len(data_files)

for idx, f in enumerate(data_files):
    fpath = os.path.join(SQL_DIR, f)
    print('[{}/{}] {}'.format(idx+1, total, f))
    cmd = 'cmd /c "set CLOUDFLARE_API_TOKEN={} && wrangler d1 execute caoliao-db-cf --file {} --remote"'.format(TOKEN, fpath)
    ret = os.system(cmd)
    if ret != 0:
        print('  FAILED')
    time.sleep(1)

print('Done!')
