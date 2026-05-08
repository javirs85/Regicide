@echo off
setlocal

set "ROOT=%~dp0"
set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"

cd /d "%ROOT%"
if errorlevel 1 exit /b 1

echo Building web app...
call npm.cmd run build
if errorlevel 1 exit /b %errorlevel%

echo Syncing Capacitor Android project...
call npx.cmd cap sync android
if errorlevel 1 exit /b %errorlevel%

echo Building Android debug APK...
cd /d "%ROOT%android"
if errorlevel 1 exit /b 1
call gradlew.bat assembleDebug --console=plain
if errorlevel 1 exit /b %errorlevel%

if not exist "%ADB%" (
  echo adb.exe was not found at "%ADB%".
  echo APK built at "%ROOT%android\app\build\outputs\apk\debug\app-debug.apk"
  exit /b 1
)

echo Installing APK on connected Android device...
"%ADB%" install -r "%ROOT%android\app\build\outputs\apk\debug\app-debug.apk"
if errorlevel 1 exit /b %errorlevel%

echo Launching Regicide on connected Android device...
"%ADB%" shell monkey -p com.javirs85.regicide -c android.intent.category.LAUNCHER 1
if errorlevel 1 exit /b %errorlevel%

echo Done. Regicide debug APK was installed.
