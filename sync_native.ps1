$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$token = (Get-Content "C:\Users\Administrator\cf-deploy\.token" -Raw).Trim()
$acct = "ad72c31a4eaccfca28b91e049a1f8e97"
$db = "9b412b46-60bd-4a12-9b4b-fb583595ea4c"
$d1url = "https://api.cloudflare.com/client/v4/accounts/$acct/d1/database/$db/query"

function D1-Query($sql) {
    $body = @{sql = $sql; params = @()} | ConvertTo-Json -Compress
    try {
        $r = Invoke-RestMethod -Uri $d1url -Method POST -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        } -Body $body -TimeoutSec 30
        return $r
    } catch {
        $err = $_.Exception.Response
        if ($err) {
            $s = $err.GetResponseStream()
            $rd = New-Object System.IO.StreamReader($s)
            $body = $rd.ReadToEnd()
            return @{success = $false; error = $body; code = $err.StatusCode.value__}
        }
        return @{success = $false; error = $_.Exception.Message}
    }
}

# MySQL connection using Python (since no MySql module in PS)
# Use Python just for MySQL read, D1 write via PS

$mysqlConnStr = "server=rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com;port=3306;uid=cli_44608921;pwd=9507fd52fc87d7cfe3f1e756b725a156;database=cli_44608921;charset=utf8mb4"

# Check if we have Python mysql module
$pyCheck = python -c "import pymysql; print('ok')" 2>&1
if ($pyCheck -notlike "*ok*") {
    Write-Host "ERROR: pymysql not installed" -ForegroundColor Red
    exit 1
}

Write-Host "Getting table list..." -ForegroundColor Cyan
$tables = python -c "
import pymysql
conn=pymysql.connect(host='rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',port=3306,user='cli_44608921',password='9507fd52fc87d7cfe3f1e756b725a156',database='cli_44608921',charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,connect_timeout=5)
cur=conn.cursor()
cur.execute('SHOW TABLES')
for r in cur.fetchall():
    print(list(r.values())[0])
conn.close()
" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR getting tables" -ForegroundColor Red
    Write-Host $tables
    exit 1
}

Write-Host "Tables: $($tables.Count)" -ForegroundColor Green

# Process first 5 tables
$batch = $tables | Select-Object -First 5
foreach ($t in $batch) {
    Write-Host "`nSyncing $t..." -ForegroundColor Cyan
    
    # Get schema
    $schema = python -c "
import pymysql, json
conn=pymysql.connect(host='rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',port=3306,user='cli_44608921',password='9507fd52fc87d7cfe3f1e756b725a156',database='cli_44608921',charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,connect_timeout=5)
cur=conn.cursor()
cur.execute('DESCRIBE `$t')
cols = cur.fetchall()
conn.close()
for c in cols:
    print(json.dumps({'name': c['Field'], 'type': c['Type']}))
" 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR getting schema" -ForegroundColor Red
        continue
    }
    
    # Parse schema
    $colDefs = @()
    $colNames = @()
    foreach ($line in $schema) {
        $c = $line | ConvertFrom-Json
        $colNames += $c.name
        $sqliteType = "TEXT"
        if ($c.type -like "int*" -or $c.type -like "bigint*") { $sqliteType = "INTEGER" }
        elseif ($c.type -like "decimal*" -or $c.type -like "float*" -or $c.type -like "double*") { $sqliteType = "REAL" }
        $colDefs += "[$($c.name)] $sqliteType"
    }
    
    # Create table in D1
    $createSql = "CREATE TABLE [$t] ($($colDefs -join ', '))"
    $r = D1-Query $createSql
    if (-not $r.success) {
        D1-Query "DROP TABLE [$t]" | Out-Null
        Start-Sleep -Milliseconds 500
        $r = D1-Query $createSql
    }
    
    if (-not $r.success) {
        Write-Host "  CREATE FAILED: $($r.error)" -ForegroundColor Red
        continue
    }
    Write-Host "  Created OK" -ForegroundColor Green
    
    # Get row count
    $count = python -c "
import pymysql
conn=pymysql.connect(host='rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',port=3306,user='cli_44608921',password='9507fd52fc87d7cfe3f1e756b725a156',database='cli_44608921',charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,connect_timeout=5)
cur=conn.cursor()
cur.execute('SELECT COUNT(*) as cnt FROM `$t')
print(cur.fetchone()['cnt'])
conn.close()
" 2>&1
    
    Write-Host "  Rows: $count" -ForegroundColor Cyan
    
    # Insert in batches of 50
    $inserted = 0
    $offset = 0
    $batchSize = 50
    
    while ($offset -lt $count) {
        # Get batch from MySQL
        $rowsJson = python -c "
import pymysql, json
conn=pymysql.connect(host='rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',port=3306,user='cli_44608921',password='9507fd52fc87d7cfe3f1e756b725a156',database='cli_44608921',charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,connect_timeout=5)
cur=conn.cursor()
cur.execute('SELECT * FROM `$t` LIMIT $offset, $batchSize')
rows = cur.fetchall()
conn.close()
# Convert to simple format
for row in rows:
    vals = []
    for k, v in row.items():
        if v is None:
            vals.append('NULL')
        elif isinstance(v, (int, float)):
            vals.append(str(v))
        else:
            vals.append(\"'\" + str(v).replace(\"'\", \"''\") + \"'\")
    print('(' + ', '.join(vals) + ')')
" 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR getting rows" -ForegroundColor Red
            break
        }
        
        # Build insert SQL
        $colsSql = ($colNames | ForEach-Object { "[$_]" }) -join ', '
        $insertSql = "INSERT INTO [$t] ($colsSql) VALUES " + ($rowsJson -join ', ')
        
        $r = D1-Query $insertSql
        if (-not $r.success) {
            Write-Host "  INSERT FAIL @ $($offset): $($r.error.Substring(0, [Math]::Min(100, $r.error.Length)))" -ForegroundColor Red
            break
        }
        
        $inserted += $rowsJson.Count
        $offset += $batchSize
    }
    
    Write-Host "  Inserted: $inserted" -ForegroundColor Green
}

Write-Host "`nDone!" -ForegroundColor Cyan
