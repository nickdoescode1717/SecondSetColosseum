@echo off
echo.
echo  Stopping SecondSet dev services...
echo.

echo  [1/3] Killing Coordinator (port 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  [2/3] Killing Web App (port 3002)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3002 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  [3/3] Killing Expo Metro (port 8081)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8081 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo  Done. All SecondSet dev services stopped.
echo.
timeout /t 3 /nobreak >nul
