import subprocess, os, time

SQL_DIR = r'C:\Users\Administrator\d1_sql_files'
TOKEN_FILE = r'C:\Users\Administrator\cf-deploy\.token'
TOKEN = open(TOKEN_FILE).read().strip()

data_files = sorted([f for f in os.listdir(SQL_DIR) if '_data_' in f])
total = len(data_files)

print(f'Total: {total} files')

for idx, f in enumerate(data_files):
    fpath = os.path.join(SQL_DIR, f)
    print(f'{idx+1}/{total} {f}...', end=' ', flush=True)
    
    result = subprocess.run(
        f'wrangler d1 execute caoliao-db-cf --file "{fpath}" --remote',
        capture_output=True, text=True, timeout=120,
        env={**os.environ, 'CLOUDFLARE_API_TOKEN': TOKEN},
        shell=True
    )
    
    if result.returncode == 0:
        print('OK')
    else:
        err = (result.stderr or result.stdout or '')[:150]
        print(f'FAIL: {err}')
    
    time.sleep(1)

print('Done!')
