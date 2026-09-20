<#
    make-dev-cert.ps1 - regenerate the Apache dev certificate for CITELMS.

    WHY THIS EXISTS
    ---------------
    getUserMedia (camera/mic for the online class), service workers and
    crypto.randomUUID() are all gated on a SECURE CONTEXT. Plain http:// on a
    LAN/hotspot IP is not one, so the online class dies with "Camera and
    microphone need a secure connection" - see the guard in
    app/js/components/online-class-player.js.

    XAMPP ships a certificate that is CN=localhost, has no subjectAltName at
    all, and EXPIRED IN 2019. Every modern browser hard-rejects it. This script
    replaces it with a self-signed cert that actually covers the addresses this
    machine is reachable on, so https:// works from the phone.

    The hotspot hands out a different IP on every reconnect, so RE-RUN THIS
    after reconnecting. It picks up the current addresses automatically.

    USAGE
    -----
        powershell -ExecutionPolicy Bypass -File tools\make-dev-cert.ps1

    Then restart Apache (XAMPP Control Panel -> Stop, Start) and open
    https://<ip>/CITELMS/ on the phone. You still get a one-time
    "Your connection is not private" warning because nothing trusts a
    self-signed CA - tap Advanced -> Proceed. That is enough to make the
    origin a secure context and the camera works.
#>

$ErrorActionPreference = 'Stop'

$ApacheRoot = 'C:\xamppfinal\apache'
$OpenSsl    = Join-Path $ApacheRoot 'bin\openssl.exe'
$CrtPath    = Join-Path $ApacheRoot 'conf\ssl.crt\server.crt'
$KeyPath    = Join-Path $ApacheRoot 'conf\ssl.key\server.key'
$CnfPath    = Join-Path $ApacheRoot 'conf\openssl.cnf'

if (-not (Test-Path $OpenSsl)) { $OpenSsl = 'openssl' }

# ---- Collect every address this box answers on -------------------------
# Loopback and the real adapters both go in, so one cert covers desktop
# testing and phone testing without regenerating between them.
$names = [System.Collections.Generic.List[string]]::new()
$names.Add('DNS:localhost')
$names.Add("DNS:$env:COMPUTERNAME")
$names.Add('IP:127.0.0.1')

$ips = Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
       Select-Object -ExpandProperty IPAddress -Unique

foreach ($ip in $ips) { $names.Add("IP:$ip") }

$san = ($names -join ',')
Write-Host "Certificate will cover:" -ForegroundColor Cyan
foreach ($n in $names) { Write-Host "   $n" }

# ---- Back up whatever is there now -------------------------------------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($f in @($CrtPath, $KeyPath)) {
    if (Test-Path $f) {
        Copy-Item $f "$f.bak-$stamp"
        Write-Host "Backed up $f -> $f.bak-$stamp" -ForegroundColor DarkGray
    }
}

# ---- Generate -----------------------------------------------------------
# 398 days, not the 825 openssl would happily allow: iOS/Safari reject any
# leaf certificate with a longer lifetime outright, and a cert the phone
# refuses is the whole problem we are solving.
$args = @(
    'req', '-x509', '-nodes',
    '-newkey', 'rsa:2048',
    '-keyout', $KeyPath,
    '-out',    $CrtPath,
    '-days',   '398',
    '-subj',   '/C=PH/O=CITELMS Development/CN=CITELMS Dev',
    '-addext', "subjectAltName=$san",
    '-addext', 'basicConstraints=critical,CA:FALSE',
    '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment',
    '-addext', 'extendedKeyUsage=serverAuth'
)

if (Test-Path $CnfPath) { $env:OPENSSL_CONF = $CnfPath }

& $OpenSsl @args
if ($LASTEXITCODE -ne 0) { throw "openssl failed with exit code $LASTEXITCODE" }

Write-Host ''
Write-Host 'New certificate written.' -ForegroundColor Green
& $OpenSsl x509 -in $CrtPath -noout -subject -dates -ext subjectAltName

Write-Host ''
Write-Host 'NEXT: restart Apache (XAMPP Control Panel -> Stop, then Start).' -ForegroundColor Yellow
foreach ($ip in $ips) {
    Write-Host "  then open  https://$ip/CITELMS/  on the phone" -ForegroundColor Yellow
}
