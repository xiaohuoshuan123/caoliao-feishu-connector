import os

SQL_DIR = r'C:\Users\Administrator\d1_sql_files'
TOKEN = open(r'C:\Users\Administrator\cf-deploy\.token').read().strip()

data_files = sorted([f for f in os.listdir(SQL_DIR) if '_data_' in f])

bat_path = r'C:\Users\Administrator\caoliao-feishu-connector-repo\full_import.bat'
with open(bat_path, 'w') as bat:
    bat.write('@echo off\n')
    bat.write('set CLOUDFLARE_API_TOKEN={}\n'.format(TOKEN))
    bat.write('cd /d C:\\Users\\Administrator\\caoliao-feishu-connector-repo\n')
    for f in data_files:
        fpath = SQL_DIR + '\\' + f
        bat.write('echo Importing {}\n'.format(f))
        bat.write('cmd /c "wrangler d1 execute caoliao-db-cf --file {} --remote"\n'.format(fpath))
        bat.write('timeout /t 2 /nobreak >nul\n')
    bat.write('echo DONE!\n')

print('bat file written:', bat_path)
