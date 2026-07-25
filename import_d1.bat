@echo off
chcp 65001 >nul 2>&1
cd /d C:\Users\Administrator\caoliao-feishu-connector-repo

echo Generating SQL files...
python gen_sql_files.py

echo.
echo Importing via wrangler...
set CF_API_TOKEN=
for /f "tokens=*" %%a in (C:\Users\Administrator\cf-deploy\.token) do set CF_API_TOKEN=%%a

set SQL_DIR=C:\Users\Administrator\d1_sql_files
for %%f in (%SQL_DIR%\*_schema.sql) do (
    echo Schema: %%~nxf
    wrangler d1 execute caoliao-db-cf --file="%%f" --remote 2>&1
    timeout /t 3 /nobreak >nul
)

for %%f in (%SQL_DIR%\*_data_*.sql) do (
    echo Data: %%~nxf
    wrangler d1 execute caoliao-db-cf --file="%%f" --remote 2>&1
    timeout /t 2 /nobreak >nul
)

echo Done!
