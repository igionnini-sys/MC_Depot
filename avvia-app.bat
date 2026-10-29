@echo off
title FinRet
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non trovato. Installalo da https://nodejs.org ^(versione 18 o superiore^).
  pause
  exit /b 1
)

if not exist node_modules (
  echo Prima esecuzione: installazione dipendenze...
  call npm install
  if errorlevel 1 (
    echo Installazione delle dipendenze non riuscita.
    pause
    exit /b 1
  )
)

echo Avvio FinRet su http://localhost:5173 ^(chiudi questa finestra per fermare l'app^)
start "" "http://localhost:5173"
call npm run dev

pause
