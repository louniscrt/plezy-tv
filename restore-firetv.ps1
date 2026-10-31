# ==============================================================================
# CleanYourTV - Script de Restauration des Paramètres Fire TV Stick
# ==============================================================================

$adb = if (Get-Command adb -ErrorAction SilentlyContinue) { "adb" } else { "$env:LOCALAPPDATA\AndroidBuildTools\android-sdk\platform-tools\adb.exe" }

$device = if ($args[0]) { $args[0] } else { $env:FIRETV_IP }
if (-not $device) {
    $device = Read-Host "Entrez l'adresse IP de votre Fire TV Stick (ex: 192.168.1.50)"
}
if ($device -and ($device -notmatch ":\d+$")) {
    $device = "$device:5555"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [CleanYourTV] Restauration des réglages d'origine..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

& $adb connect $device
Start-Sleep -Seconds 1

Write-Host "Restauration des animations système..." -ForegroundColor Yellow
& $adb -s $device shell "settings put global window_animation_scale 1.0"
& $adb -s $device shell "settings put global transition_animation_scale 1.0"
& $adb -s $device shell "settings put global animator_duration_scale 1.0"

Write-Host "Restauration des réglages d'écran de veille..." -ForegroundColor Yellow
& $adb -s $device shell "settings put secure screensaver_enabled 1"
& $adb -s $device shell "settings put secure screensaver_activate_on_sleep 1"

Write-Host "Restauration des services d'accessibilité..." -ForegroundColor Yellow
& $adb -s $device shell "settings put secure enabled_accessibility_services ''"
& $adb -s $device shell "settings put secure accessibility_enabled 0"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Restauration terminée avec succès." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
