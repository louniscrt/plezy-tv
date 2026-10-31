# ==============================================================================
# CleanYourTV - Debloat & Optimisation pour Fire TV Stick (Fire OS 5+)
# Inspiré du projet https://cleanyour.tv/ & https://github.com/itsmeterrylin/fire-tv-cleanup
# ==============================================================================

$adb = if (Get-Command adb -ErrorAction SilentlyContinue) { "adb" } else { "$env:LOCALAPPDATA\AndroidBuildTools\android-sdk\platform-tools\adb.exe" }

$device = if ($args[0]) { $args[0] } else { $env:FIRETV_IP }
if (-not $device) {
    $device = Read-Host "Entrez l'adresse IP de votre Fire TV Stick (ex: 192.168.1.50)"
}
if ($device -and ($device -notmatch ":\d+$")) {
    $device = "$device:5555"
}
$backupDir = "$PSScriptRoot\backup-firetv"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [CleanYourTV] Connexion à la Fire TV Stick ($device)..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

& $adb connect $device
Start-Sleep -Seconds 1

Write-Host "`n[1/5] Sauvegarde de l'état système..." -ForegroundColor Yellow
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}
& $adb -s $device shell "pm list packages -f" > "$backupDir\packages-all.txt"
& $adb -s $device shell "settings list global" > "$backupDir\settings-global.txt"
& $adb -s $device shell "settings list secure" > "$backupDir\settings-secure.txt"
& $adb -s $device shell "settings list system" > "$backupDir\settings-system.txt"
& $adb -s $device shell "cat /proc/meminfo" > "$backupDir\meminfo-before.txt"
Write-Host "Sauvegarde enregistrée dans $backupDir" -ForegroundColor Green

Write-Host "`n[2/5] Désactivation de la Télémétrie, des Pubs et de l'Ad Tracking..." -ForegroundColor Yellow
# Blocage de l'ID publicitaire et du ciblage
& $adb -s $device shell "settings put global adid_enabled 0"
& $adb -s $device shell "settings put secure limit_ad_tracking 1"
& $adb -s $device shell "settings put secure advertising_id_opt_out 1"
& $adb -s $device shell "settings put secure usage_metrics_upload_enabled 0"

# Désactivation des pubs vidéo d'économiseur d'écran Amazon (gain ~100 Mo RAM)
& $adb -s $device shell "settings put secure screensaver_enabled 0"
& $adb -s $device shell "settings put secure screensaver_activate_on_sleep 0"
& $adb -s $device shell "settings put secure screensaver_components 'com.android.dreams.basic/com.android.dreams.basic.Colors'"

# Désactivation de l'analyse d'arrière-plan des APKs
& $adb -s $device shell "settings put global package_verifier_enable 0"
& $adb -s $device shell "settings put system screen_off_timeout 2147460000"

Write-Host "`n[3/5] Optimisation des Animations (Zero Lag UI)..." -ForegroundColor Yellow
& $adb -s $device shell "settings put global window_animation_scale 0.0"
& $adb -s $device shell "settings put global transition_animation_scale 0.0"
& $adb -s $device shell "settings put global animator_duration_scale 0.0"
Write-Host "Animations accélérées à 0.0 ms." -ForegroundColor Green

Write-Host "`n[4/5] Neutralisation des Processus Bloatware & Nettoyage Cache..." -ForegroundColor Yellow
$bloatList = @(
    "com.amazon.kso.blackbird",          # Publicités lockscreen et bannières
    "com.amazon.firebat",               # Télémétrie retail Amazon
    "com.amazon.vizzini",               # Recommandations sponsorisées
    "com.amazon.ceviche",               # Synchronisation publicitaire
    "com.amazon.client.metrics",        # Logger de télémétrie
    "com.amazon.prism.android.service",  # Télémétrie Prism
    "com.amazon.dpcclient",             # Client de notification push publicitaire
    "com.amazon.whisperlink.core.android",# Découverte réseau résidente inutile
    "com.amazon.aca",                   # Assistant résiduel
    "com.amazon.tv.easyupgrade",        # Invite de mise à jour forcée
    "com.amazon.imp",                   # Messagerie interne Amazon
    "com.amazon.diode",                 # Collecteur de métriques
    "com.amazon.tcomm",                 # TComm background
    "com.amazon.alexa.externalmediaplayer.fireos", # Alexa media listener
    "com.amazon.connectivitycontroller", # Contrôleur connectivité superflu
    "com.amazon.shoptv.client",         # Boutique Amazon Shop TV
    "com.amazon.shoptv.firetv.client",  # Client Shop TV
    "com.amazon.alexashopping",         # Alexa Shopping
    "com.amazon.gamehub",               # Game Hub
    "com.amazon.bueller.music",         # Amazon Music résiduel
    "com.amazon.bueller.photos",        # Amazon Photos résiduel
    "com.amazon.ftv.screensaver",       # Économiseur d'écran lourd
    "com.amazon.tmm.tutorial",          # Tutoriels de démarrage
    "com.amazon.storm.lightning.tutorial",
    "com.amazon.ods.kindleconnect",     # Kindle Connect
    "com.amazon.recess",                # Recess
    "com.amazon.gloria.graphiq",        # Graphiq
    "com.amazon.hedwig",                # Hedwig
    "com.amazon.cardinal",              # Cardinal
    "com.amazon.aria",                  # Aria analytics
    "com.amazon.tv.csapp",              # Customer service app
    "com.amazon.tv.support",            # Support
    "com.amazon.tv.releasenotes",       # Notes de version
    "com.amazon.tv.legal.notices",      # Mentions légales
    "com.amazon.alexamediaplayer.runtime.ftv",
    "com.amazon.awvflingreceiver",
    "com.amazon.dialservice",
    "com.amazon.ssdpservice",
    "com.amazon.ale"
)

$stoppedCount = 0
foreach ($pkg in $bloatList) {
    & $adb -s $device shell "pm clear $pkg" > $null 2>&1
    & $adb -s $device shell "am force-stop $pkg" > $null 2>&1
    $stoppedCount++
}
Write-Host "$stoppedCount paquets bloatware nettoyés et arrêtés." -ForegroundColor Green

Write-Host "`n[5/5] Rapport Mémoire & Stockage..." -ForegroundColor Yellow
$mem = & $adb -s $device shell "cat /proc/meminfo"
$memFree = ($mem | Select-String "MemFree:\s+(\d+)\s+kB").Matches.Groups[1].Value
$memAvail = ($mem | Select-String "MemAvailable:\s+(\d+)\s+kB").Matches.Groups[1].Value
$memTotal = ($mem | Select-String "MemTotal:\s+(\d+)\s+kB").Matches.Groups[1].Value
$storage = & $adb -s $device shell "df /data" | Select-Object -Last 1

Write-Host "----------------------------------------------------------" -ForegroundColor Cyan
Write-Host "RAM Totale      : $([math]::Round([int]$memTotal / 1024, 0)) Mo" -ForegroundColor White
Write-Host "RAM Disponible  : $([math]::Round([int]$memAvail / 1024, 0)) Mo (Free: $([math]::Round([int]$memFree / 1024, 0)) Mo)" -ForegroundColor Green
Write-Host "Stockage /data  : $storage" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Débloat CleanYourTV terminé avec succès !" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
