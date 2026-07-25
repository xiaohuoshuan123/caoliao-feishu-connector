import os, time, subprocess

SQL_DIR = r'C:\Users\Administrator\d1_sql_files'
TOKEN = open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()
LOG = r'C:\Users\Administrator\import_log.txt'

# Get all data files
data_files = sorted([f for f in os.listdir(SQL_DIR) if '_data_' in f])
total = len(data_files)

with open(LOG, 'w') as log:
    log.write('Starting import of {} files\n'.format(total))

for idx, f in enumerate(data_files):
    fpath = os.path.join(SQL_DIR, f)
    with open(LOG, 'a') as log:
        log.write('[{}/{}] {}\n'.format(idx+1, total, f))
    
    # Run wrangler directly (not via cmd)
    try:
        result = subprocess.run(
            ['wrangler', 'd1', 'execute', 'caoliao-db-cf', '--file', fpath, '--remote'],
            capture_output=True, text=True, timeout=120,
            env={**os.environ, 'CLOUDFLARE_API_TOKEN': TOKEN}
        )
        with open(LOG, 'a') as log:
            if result.returncode == 0:
                log.write('  OK\n')
            else:
                err = (result.stderr or result.stdout or '')[:200]
                log.write('  FAIL: {}\n'.format(err))
    except Exception as e:
        with open(LOG, 'a') as log:
            log.write('  ERROR: {}\n'.format(str(e)))
    
    if (idx+1) % 10 == 0:
        time.sleep(2)
    else:
        time.sleep(1)

with open(LOG, 'a') as log:
    log.write('DONE\n')
print('All done!')
