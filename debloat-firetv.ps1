# ==============================================================================
# Script de Debloat & Optimisation RAM pour Amazon Fire TV Stick (Fire OS 5+)
# ==============================================================================

$adb = if (Get-Command adb -ErrorAction SilentlyContinue) { "adb" } else { "$env:LOCALAPPDATA\AndroidBuildTools\android-sdk\platform-tools\adb.exe" }

$device = if ($args[0]) { $args[0] } else { $env:FIRETV_IP }
if (-not $device) {
    $device = Read-Host "Entrez l'adresse IP de votre Fire TV Stick (ex: 192.168.1.50)"
}
if ($device -and ($device -notmatch ":\d+$")) {
    $device = "$device:5555"
}

& $adb connect $device

Write-Host "=== RAM AVANT DEBLOAT ===" -ForegroundColor Cyan
& $adb -s $device shell "cat /proc/meminfo" | Select-Object -First 6

$bloatPackages = @(
    "com.amazon.ftv.screensaver",
    "com.amazon.avod",
    "com.amazon.venezia",
    "com.amazon.kso.blackbird",
    "com.amazon.alexashopping",
    "com.amazon.shoptv.client",
    "com.amazon.shoptv.firetv.client",
    "com.amazon.ftvads.deeplinking",
    "com.amazon.imdb.tv.android.app",
    "com.imdb.livingroom.firetv",
    "com.amazon.minitv.android.app",
    "com.amazon.gamehub",
    "com.amazon.bueller.music",
    "com.amazon.bueller.photos",
    "com.amazon.tahoe",
    "com.amazon.kor.demo",
    "com.amazon.tmm.tutorial",
    "com.amazon.storm.lightning.tutorial",
    "com.amazon.ods.kindleconnect",
    "com.amazon.recess",
    "com.amazon.gloria.graphiq",
    "com.amazon.hedwig",
    "com.amazon.logan",
    "com.amazon.malcolm",
    "com.amazon.naatyam",
    "com.amazon.cardinal",
    "com.amazon.ceviche",
    "com.amazon.aria",
    "com.amazon.hybridadidservice",
    "com.amazon.client.metrics",
    "com.amazon.device.metrics",
    "com.amazon.tv.fw.metrics",
    "com.amazon.dp.logger",
    "com.amazon.device.crashmanager",
    "com.amazon.device.logmanager",
    "com.amazon.perfcollection",
    "com.amazon.tv.csapp",
    "com.amazon.tv.support",
    "com.amazon.tv.releasenotes",
    "com.amazon.tv.legal.notices",
    "com.amazon.whisperlink.core.android",
    "com.amazon.whisperjoin.middleware.np",
    "com.amazon.whisperplay.service.install",
    "com.amazon.prism.android.service",
    "com.amazon.alexamediaplayer.runtime.ftv",
    "com.amazon.alexa.externalmediaplayer.fireos",
    "com.amazon.vizzini",
    "com.amazon.awvflingreceiver",
    "com.amazon.dialservice",
    "com.amazon.ssdpservice",
    "com.amazon.aca",
    "com.amazon.ale",
    "tv.molotov.app"
)

foreach ($pkg in $bloatPackages) {
    Write-Host "Nettoyage & arrêt : $pkg" -ForegroundColor Yellow
    & $adb -s $device shell "pm uninstall $pkg" > $null 2>&1
    & $adb -s $device shell "pm clear $pkg" > $null 2>&1
    & $adb -s $device shell "am force-stop $pkg" > $null 2>&1
}

Write-Host "Optimisation des animations et désactivation de l'économiseur Amazon (109 Mo RAM)..." -ForegroundColor Green
& $adb -s $device shell "settings put global window_animation_scale 0.0"
& $adb -s $device shell "settings put global transition_animation_scale 0.0"
& $adb -s $device shell "settings put global animator_duration_scale 0.0"
& $adb -s $device shell "settings put secure screensaver_enabled 0"
& $adb -s $device shell "settings put system screen_off_timeout 2147460000"
& $adb -s $device shell "pm trim-caches 999G"

Write-Host "=== RAM APRES DEBLOAT ===" -ForegroundColor Cyan
& $adb -s $device shell "cat /proc/meminfo" | Select-Object -First 6
Write-Host "=== STOCKAGE /DATA APRES DEBLOAT ===" -ForegroundColor Cyan
& $adb -s $device shell "df /data"
