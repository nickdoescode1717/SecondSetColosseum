@echo off
title SecondSet Mobile Signer - Expo
cd /d "%~dp0..\secondset-mobile-signer\mobile-signer"
echo.
echo  ----------------------------------------
echo    Mobile Signer - Expo Dev Server
echo    Metro: http://localhost:8081
echo.
echo    i = iOS Simulator
echo    a = Android Emulator
echo    w = Web browser
echo  ----------------------------------------
echo.
npm start
pause
