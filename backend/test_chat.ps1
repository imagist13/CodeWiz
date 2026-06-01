$headers = @{"Content-Type" = "application/json"}
$body = @{
    username = "赵雷"
    message = "hello"
    new_engine = $true
} | ConvertTo-Json -Compress

$resp = Invoke-WebRequest -Uri "http://127.0.0.1:1478/api/chat" -Method POST -Headers $headers -Body $body -TimeoutSec 15
$resp.StatusCode
$resp.Content | Select-Object -First 200
