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
:run
node server.js
if %errorlevel%==2 goto stop
echo.
echo Global Watch stopped unexpectedly (see data\server.log). Restarting in 5 seconds... close this window to stop.
timeout /t 5 /nobreak >nul
goto run
:stop
pause
