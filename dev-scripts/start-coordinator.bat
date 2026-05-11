@echo off
title SecondSet Coordinator - Port 3000
cd /d "%~dp0..\secondset-mobile-signer\coordinator"
echo.
echo  ----------------------------------------
echo    Coordinator Service
echo    URL:    http://localhost:3000
echo    Health: http://localhost:3000/health
echo    WS:     ws://localhost:3000/ws
echo  ----------------------------------------
echo.
npm run dev
pause
