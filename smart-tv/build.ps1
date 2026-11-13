param([switch]$Offline)

$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$toolDir = Join-Path $env:LOCALAPPDATA 'AndroidBuildTools'
$env:JAVA_HOME = Join-Path $toolDir 'jdk17'
$env:ANDROID_HOME = Join-Path $toolDir 'android-sdk'
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE '.gradle'
$env:TEMP = Join-Path $projectDir '.tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$sdkPath = $env:ANDROID_HOME.Replace('\','/')
Set-Content -LiteralPath (Join-Path $projectDir 'local.properties') -Value "sdk.dir=$sdkPath" -Encoding ascii
Push-Location $projectDir
try {
    $version = [regex]::Match((Get-Content 'app/build.gradle' -Raw), "versionName '([^']+)'").Groups[1].Value
    if (!$version) { throw 'Version Android introuvable.' }
    foreach ($scriptName in @('seerr-session.js','refresh.js','seerr-pairing.js')) {
        Copy-Item -LiteralPath (Join-Path $projectDir "../webapp/public/$scriptName") -Destination (Join-Path $projectDir "app/src/main/assets/$scriptName")
    }
    Copy-Item -LiteralPath (Join-Path $projectDir '../webapp/public/vendor/qrcode.js') -Destination (Join-Path $projectDir 'app/src/main/assets/qrcode.js')
    Copy-Item -LiteralPath (Join-Path $projectDir '../webapp/public/vendor/qrcode.LICENSE.txt') -Destination (Join-Path $projectDir 'app/src/main/assets/qrcode.LICENSE.txt')
    $gradleArgs = @('assembleDebug', 'lintDebug', '--no-daemon')
    if ($Offline) { $gradleArgs += '--offline' }
    & (Join-Path $toolDir 'gradle-8.4/bin/gradle.bat') @gradleArgs
    if ($LASTEXITCODE -ne 0) { throw 'La compilation ou la vérification Android a échoué.' }
    New-Item -ItemType Directory -Force -Path (Join-Path $projectDir 'dist') | Out-Null
    $apk = Join-Path $projectDir "dist/Plezy-TV-$version.apk"
    Copy-Item -LiteralPath (Join-Path $projectDir 'app/build/outputs/apk/debug/app-debug.apk') -Destination $apk
    Get-FileHash -LiteralPath $apk -Algorithm SHA256
} finally { Pop-Location }
