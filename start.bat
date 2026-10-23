@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo.
  echo First run: a settings file called .env has opened in Notepad.
  echo Replace "your-serpapi-key" and "your-luminal-key" with your keys, save, close Notepad.
  echo.
  notepad .env
)
echo Starting Global Watch at http://localhost:8787  (close this window to stop it)
start "" http://localhost:8787
node server.js
pause
