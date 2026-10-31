@echo off
cd /d "%~dp0"
title Plezy TV (Jellyfin) - Installation Fire TV Stick (API 22)
echo ====================================================================
echo   PLEZY TV (JELLYFIN) - SIDELOADING ADB POUR AMAZON FIRE TV STICK
echo ====================================================================
echo.

set ADB_EXE="%LOCALAPPDATA%\AndroidBuildTools\android-sdk\platform-tools\adb.exe"
if not exist %ADB_EXE% (
    set ADB_EXE=adb
)

set TARGET_APK=%~dp0PlezyTV-FireOS-API22.apk
if not exist "%TARGET_APK%" (
    set TARGET_APK=%~dp0app\build\outputs\apk\debug\app-debug.apk
)

if not exist "%TARGET_APK%" (
    echo [ERREUR] Fichier APK introuvable : %TARGET_APK%
    pause
    exit /b 1
)

echo [OK] APK pret et verifie pour API Level 22 : %TARGET_APK%
echo.
set /p FIRETV_IP="Entrez l'adresse IP de votre Fire TV Stick (ex: 192.168.1.50) : "
if "%FIRETV_IP%"=="" (
    echo [ERREUR] L'adresse IP de la Fire TV est requise.
    pause
    exit /b 1
)

echo.
echo [1/4] Connexion ADB a %FIRETV_IP%:5555...
%ADB_EXE% connect %FIRETV_IP%:5555

echo.
echo [2/4] Arret de l'ancienne instance et mise a jour de Plezy TV...
%ADB_EXE% -s %FIRETV_IP%:5555 shell am force-stop com.plezy.jellyfin
%ADB_EXE% -s %FIRETV_IP%:5555 install -r -d "%TARGET_APK%"

echo.
echo [3/4] Lancement automatique de Plezy TV sur la Fire TV...
%ADB_EXE% -s %FIRETV_IP%:5555 shell am start -n com.plezy.jellyfin/.ui.login.ServerSetupActivity

echo.
echo ====================================================================
echo   Mise a jour terminee sur %FIRETV_IP% !
echo ====================================================================
pause
