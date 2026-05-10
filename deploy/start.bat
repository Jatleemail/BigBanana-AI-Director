@echo off
chcp 65001 >nul
title BigBanana AI Director - Production Server

echo.
echo   ============================================
echo     BigBanana AI Director - Production Server
echo   ============================================
echo.
echo   Starting server on port 3000...
echo   Access: http://localhost:3000
echo   External: http://82.156.4.109:3000
echo.
echo   Press Ctrl+C to stop the server
echo   ============================================
echo.

cd /d "%~dp0.."

if not exist "dist\index.html" (
  echo   [ERROR] dist\ not found! Please make sure dist\ is in %~dp0..
  pause
  exit /b 1
)

set HOST=0.0.0.0
set PORT=3000
node server\productionServer.mjs

pause
