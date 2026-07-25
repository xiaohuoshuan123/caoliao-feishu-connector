$ErrorActionPreference = 'Continue'
$token = (Get-Content "C:\Users\Administrator\cf-deploy\.token" -Raw).Trim()
$accountId = "ad72c31a4eaccfca28b91e049a1f8e97"
$dbId = "9b412b46-60bd-4a12-9b4b-fb583595ea4c"
$url = "https://api.cloudflare.com/client/v4/accounts/$accountId/d1/database/$dbId/query"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

function D1-Query($sql) {
    $body = @{sql = $sql; params = @()} | ConvertTo-Json -Compress -Depth 10
    try {
        $resp = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body -TimeoutSec 30
        return $resp
    } catch {
        $errResp = $_.Exception.Response
        if ($errResp) {
            $stream = $errResp.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errBody = $reader.ReadToEnd()
            Write-Host "ERROR ($($errResp.StatusCode)): $errBody" -ForegroundColor Red
        } else {
            Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
        return $null
    }
}

# 1. Get all tables from MySQL
Write-Host "Connecting to MySQL..." -ForegroundColor Cyan
$conn = New-Object MySql.Data.MySqlClient.MySqlConnection("server=rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com;port=3306;uid=cli_44608921;pwd=9507fd52fc87d7cfe3f1e756b725a156;database=cli_44608921;charset=utf8mb4")
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SHOW TABLES"
$reader = $cmd.ExecuteReader()
$tables = @()
while ($reader.Read()) {
    $tables += $reader.GetString(0)
}
$reader.Close()
$conn.Close()
Write-Host "Found $($tables.Count) tables" -ForegroundColor Green

foreach ($table in $tables) {
    Write-Host "`nTable: $table" -ForegroundColor Cyan
    
    # Get schema
    $conn.Open()
    $cmd2 = $conn.CreateCommand()
    $cmd2.CommandText = "DESCRIBE `$table"
    $reader2 = $cmd2.ExecuteReader()
    $cols = @()
    while ($reader2.Read()) {
        $colName = $reader2.GetString(0)
        $colType = $reader2.GetString(1)
        $sqliteType = "TEXT"
        if ($colType -like "int*") { $sqliteType = "INTEGER" }
        elseif ($colType -like "decimal*" -or $colType -like "float*" -or $colType -like "double*") { $sqliteType = "REAL" }
        $cols += "[$colName] $sqliteType"
    }
    $reader2.Close()
    $conn.Close()
    
    # Create table in D1
    $createSql = "CREATE TABLE IF NOT EXISTS [$table] ($($cols -join ', '))"
    Write-Host "  Creating..." -ForegroundColor Yellow
    $result = D1-Query $createSql
    if ($result -and $result.success) {
        Write-Host "  Created OK" -ForegroundColor Green
    } else {
        Write-Host "  Create failed, trying drop+recreate..." -ForegroundColor Yellow
        D1-Query "DROP TABLE [$table]" | Out-Null
        Start-Sleep -Milliseconds 500
        $result = D1-Query $createSql
        if (-not $result -or -not $result.success) {
            Write-Host "  FAILED to create, skipping!" -ForegroundColor Red
            continue
        }
    }
    
    # Get row count
    $conn.Open()
    $cmd3 = $conn.CreateCommand()
    $cmd3.CommandText = "SELECT COUNT(*) FROM `$table"
    $count = $cmd3.ExecuteScalar()
    $conn.Close()
    Write-Host "  Rows: $count" -ForegroundColor Cyan
    
    if ($count -eq 0) { continue }
    
    # Insert in batches
    $batchSize = 50
    $offset = 0
    $inserted = 0
    
    while ($offset -lt $count) {
        $conn.Open()
        $cmd4 = $conn.CreateCommand()
        $cmd4.CommandText = "SELECT * FROM `$table` LIMIT $offset, $batchSize"
        $reader4 = $cmd4.ExecuteReader()
        
        $batch = @()
        $colNames = @()
        for ($i = 0; $i -lt $reader4.FieldCount; $i++) {
            $colNames += $reader4.GetName($i)
        }
        
        while ($reader4.Read()) {
            $vals = @()
            for ($i = 0; $i -lt $reader4.FieldCount; $i++) {
                $val = $reader4.GetValue($i)
                if ($val -is [DBNull]) { $vals += "NULL" }
                elseif ($val -is [int] -or $val -is [long] -or $val -is [decimal] -or $val -is [double]) { $vals += "$val" }
                else { $vals += "'" + ($val -replace "'", "''") + "'" }
            }
            $batch += "(" + ($vals -join ', ') + ")"
        }
        $reader4.Close()
        $conn.Close()
        
        if ($batch.Count -eq 0) { break }
        
        $colsSql = ($colNames | ForEach-Object { "[$_]" }) -join ', '
        $insertSql = "INSERT INTO [$table] ($colsSql) VALUES " + ($batch -join ', ')
        
        $insResult = D1-Query $insertSql
        if ($insResult -and $insResult.success) {
            $inserted += $batch.Count
        } else {
            Write-Host "  Insert failed at offset $offset" -ForegroundColor Red
            break
        }
        
        $offset += $batchSize
    }
    
    Write-Host "  Inserted: $inserted rows" -ForegroundColor Green
}

Write-Host "`nDone!" -ForegroundColor Cyan
