@echo off
setlocal

set "SCRIPTS=%~dp0dev-scripts"

echo.
echo  ============================================
echo    SecondSet   Development Launcher
echo  ============================================
echo.
echo    Coordinator  ^>  http://localhost:3000
echo    Web App      ^>  http://localhost:3002
echo    Expo Metro   ^>  http://localhost:8081
echo.
echo  ============================================
echo.

REM Use Windows Terminal tabs if available, otherwise open separate CMD windows
where wt >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo  Windows Terminal detected - opening all tabs in one window...
    echo.
    start wt --title "Coordinator" cmd /k "%SCRIPTS%\start-coordinator.bat" ; new-tab --title "Web App" cmd /k "%SCRIPTS%\start-webapp.bat" ; new-tab --title "Mobile (Expo)" cmd /k "%SCRIPTS%\start-mobile.bat"
) else (
    echo  Opening 3 separate windows (install Windows Terminal for tabs)...
    echo.
    echo  [1/3] Starting Coordinator...
    start "SecondSet Coordinator" cmd /k "%SCRIPTS%\start-coordinator.bat"
    timeout /t 4 /nobreak >nul

    echo  [2/3] Starting Web App...
    start "SecondSet Web App" cmd /k "%SCRIPTS%\start-webapp.bat"
    timeout /t 2 /nobreak >nul

    echo  [3/3] Starting Mobile (Expo)...
    start "SecondSet Mobile" cmd /k "%SCRIPTS%\start-mobile.bat"
)

echo.
echo  All services launching. This window will close in 5 seconds.
echo  Run stop-dev.bat to shut everything down.
echo.
timeout /t 5 /nobreak >nul
