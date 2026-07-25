$ErrorActionPreference = 'Continue'
$token = (Get-Content "C:\Users\Administrator\cf-deploy\.token" -Raw).Trim()
$env:CLOUDFLARE_API_TOKEN = $token

$sqlDir = 'C:\Users\Administrator\d1_sql_files'
$files = Get-ChildItem $sqlDir -Filter '*_data_*.sql' | Sort-Object Name

$total = $files.Count
$idx = 0
foreach ($f in $files) {
    $idx++
    Write-Progress -Activity "Importing D1" -Status "$idx / $total : $($f.Name)" -PercentComplete (($idx / $total) * 100)
    Write-Host "[$idx/$total] $($f.Name)... " -NoNewline
    $output = wrangler d1 execute caoliao-db-cf --file $f.FullName --remote 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK" -ForegroundColor Green
    } else {
        Write-Host "FAIL: $($output | Select-Object -First 1)" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 500
}

Write-Host "`nAll done!" -ForegroundColor Cyan
