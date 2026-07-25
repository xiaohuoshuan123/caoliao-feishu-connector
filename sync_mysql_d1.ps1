$ErrorActionPreference = 'SilentlyContinue'
$OutputEncoding = [System.Text.Encoding]::UTF8

# D1 API
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

# MySQL connection
$mysqlConnStr = "server=rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com;port=3306;uid=cli_44608921;pwd=9507fd52fc87d7cfe3f1e756b725a156;database=cli_44608921;charset=utf8mb4"
$conn = New-Object MySql.Data.MySqlClient.MySqlConnection($mysqlConnStr)

Write-Host "Opening MySQL..." -ForegroundColor Cyan
$conn.Open()

# Get tables
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SHOW TABLES"
$rd = $cmd.ExecuteReader()
$tables = @()
while ($rd.Read()) { $tables += $rd.GetString(0) }
$rd.Close()
Write-Host "Found $($tables.Count) tables" -ForegroundColor Green

$t = tables[0]
Write-Host "`nSyncing $t..." -ForegroundColor Cyan

# Get rows
$cmd2 = $conn.CreateCommand()
$cmd2.CommandText = "SELECT * FROM `$t`"
$rd2 = $cmd2.ExecuteReader()

# Get column names
$cols = @()
for ($i = 0; $i -lt $rd2.FieldCount; $i++) { $cols += $rd2.GetName($i) }

# Create table
$colDefs = @()
for ($i = 0; $i -lt $rd2.FieldCount; $i++) {
    $colName = $rd2.GetName($i)
    $colType = $rd2.GetDataTypeName($i)
    $sqliteType = "TEXT"
    if ($colType -like "int*" -or $colType -like "bigint*") { $sqliteType = "INTEGER" }
    elseif ($colType -like "decimal*" -or $colType -like "float*" -or $colType -like "double*" -or $colType -like "numeric*") { $sqliteType = "REAL" }
    $colDefs += "[$colName] $sqliteType"
}

$createSql = "CREATE TABLE [$t] ($($colDefs -join ', '))"
Write-Host "Creating..." -ForegroundColor Yellow
$r = D1-Query $createSql
if (-not $r.success) {
    D1-Query "DROP TABLE [$t]" | Out-Null
    Start-Sleep -Milliseconds 500
    $r = D1-Query $createSql
}
if (-not $r.success) {
    Write-Host "CREATE FAILED: $($r.error)" -ForegroundColor Red
    $conn.Close()
    exit 1
}
Write-Host "Created OK" -ForegroundColor Green

# Read all rows
$rows = @()
while ($rd2.Read()) {
    $row = @{}
    for ($i = 0; $i -lt $rd2.FieldCount; $i++) {
        $row[$cols[$i]] = $rd2.GetValue($i)
    }
    $rows += @{row = $row}
}
$rd2.Close()

Write-Host "Read $($rows.Count) rows" -ForegroundColor Green

# Insert in batches of 50
$batchSize = 50
$inserted = 0
for ($i = 0; $i -lt $rows.Count; $i += $batchSize) {
    $batch = $rows[$i..([Math]::Min($i + $batchSize - 1, $rows.Count - 1))]
    if ($batch.Count -eq 0) { continue }
    
    $valsList = @()
    foreach ($b in $batch) {
        $vals = @()
        foreach ($c in $cols) {
            $v = $b.row[$c]
            if ($v -is [DBNull] -or $v -eq $null) { $vals += "NULL" }
            elseif ($v -is [int] -or $v -is [long] -or $v -is [decimal] -or $v -is [double] -or $v -is [float]) { $vals += "$v" }
            else { $vals += "'" + ($v -replace "'", "''") + "'" }
        }
        $valsList += "(" + ($vals -join ', ') + ")"
    }
    
    $colsSql = ($cols | ForEach-Object { "[$_]" }) -join ', '
    $insertSql = "INSERT INTO [$t] ($colsSql) VALUES " + ($valsList -join ', ')
    
    $r = D1-Query $insertSql
    if (-not $r.success) {
        Write-Host "INSERT FAIL @ $($i): $($r.error.Substring(0, [Math]::Min(100, $r.error.Length)))" -ForegroundColor Red
        break
    }
    $inserted += $batch.Count
}

Write-Host "Inserted: $inserted rows" -ForegroundColor Green

$conn.Close()
Write-Host "`nDone!" -ForegroundColor Cyan
