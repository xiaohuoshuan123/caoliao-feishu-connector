@echo off
setlocal enabledelayedexpansion

set TOKEN=
for /f "tokens=*" %%a in (C:\Users\Administrator\cf-deploy\.token) do set TOKEN=%%a
set SQL_DIR=C:\Users\Administrator\d1_sql_files

echo Starting import at %time%

for %%f in (%SQL_DIR%\*_data_*.sql) do (
    echo Importing %%~nxf
    cmd /c "wrangler d1 execute caoliao-db-cf --file "%%f" --remote"
    timeout /t 2 /nobreak >nul
)

echo Done at %time%
