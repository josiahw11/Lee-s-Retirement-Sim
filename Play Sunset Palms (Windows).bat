@echo off
title Sunset Palms
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Download the LTS version from https://nodejs.org, install it, then double-click this file again.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing the game's tools. This takes a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo  Install failed. See the messages above.
    pause
    exit /b 1
  )
)
echo.
echo  Starting Sunset Palms... your browser will open at http://localhost:5173
echo  Leave this window open while you play. Close it to stop the game.
echo.
call npm run play
pause
