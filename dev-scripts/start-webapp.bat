@echo off
title SecondSet Web App - Port 3002
cd /d "%~dp0..\SecondSet\SecondSet\secondset"
echo.
echo  ----------------------------------------
echo    Web Application
echo    URL: http://localhost:3002
echo    Login: admin@acme.com / password123
echo  ----------------------------------------
echo.
npm run dev
pause
