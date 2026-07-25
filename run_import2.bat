@echo off
cd /d C:\Users\Administrator\caoliao-feishu-connector-repo

powershell -Command "$env:CLOUDFLARE_API_TOKEN = (Get-Content 'C:\Users\Administrator\cf-deploy\.token' -Raw).Trim(); Get-ChildItem 'C:\Users\Administrator\d1_sql_files\*_data_*.sql' | ForEach-Object { Write-Host $_.Name; wrangler d1 execute caoliao-db-cf --file $_.FullName --remote }"
