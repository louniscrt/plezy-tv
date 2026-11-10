$ErrorActionPreference = 'Stop'
try {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { throw 'Node.js 20 ou plus recent est necessaire pour lancer Plezy Web.' }
    $plezyPort = if ($env:PORT) { [int]$env:PORT } else { 8090 }
    $plezyUrl = "http://localhost:$plezyPort"
    function Test-Plezy {
        try {
            $page = Invoke-WebRequest -Uri $plezyUrl -UseBasicParsing -TimeoutSec 2
            if ($page.Content -notmatch '<title>Plezy</title>') { throw "Le port $plezyPort est utilise par une autre application." }
            return $true
        } catch {
            if ($_.Exception.Message -like '*autre application*') { throw }
            return $false
        }
    }
    if (-not (Test-Plezy)) {
        $plezyProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-error.log') -PassThru
        $plezyReady = $false
        for ($plezyAttempt = 0; $plezyAttempt -lt 30; $plezyAttempt++) {
            if ($plezyProcess.HasExited) { throw 'Le serveur Plezy ne peut pas demarrer. Consultez webapp/server-error.log.' }
            if (Test-Plezy) { $plezyReady = $true; break }
            Start-Sleep -Milliseconds 300
        }
        if (-not $plezyReady) { throw 'Le serveur Plezy ne repond pas. Consultez webapp/server-error.log.' }
    }
    Write-Host "Plezy est disponible sur $plezyUrl"
    Start-Process $plezyUrl
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
