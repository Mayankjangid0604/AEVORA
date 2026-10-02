@echo off
title AEVORA - SAAHVIK Tech
echo.
echo  ================================================
echo   AEVORA - SAAHVIK Tech AI Business System
echo  ================================================
echo.

echo [1/3] Checking Ollama...
ollama list > nul 2>&1
if errorlevel 1 (
  echo ERROR: Ollama not running. Starting it...
  start "Ollama" cmd /k "ollama serve"
  timeout /t 5 /nobreak > nul
) else (
  echo Ollama: OK
)

echo [1b] Checking database (prisma generate + migrate status)...
pushd "%~dp0packages\database"
call npx prisma generate
call npx prisma migrate status > nul 2>&1
if errorlevel 1 (
  echo.
  echo  WARNING: database migrations are pending or the DB is unreachable.
  echo  Run: npm run db:migrate   ^(refuses remote DBs unless ALLOW_REMOTE_MIGRATE=true^)
  echo.
) else (
  echo Database migrations: up to date
)
popd

echo [2/3] Starting API backend...
start "AEVORA API" cmd /k "cd /d %~dp0apps\api && npm run dev"
timeout /t 8 /nobreak > nul

echo [3/4] Starting Web dashboard...
start "AEVORA Web" cmd /k "cd /d %~dp0apps\web && npm run dev"
timeout /t 5 /nobreak > nul

echo [4/4] Starting Desktop app (Electron)...
start "AEVORA Desktop" cmd /k "cd /d %~dp0apps\desktop && npm run electron:dev"
timeout /t 5 /nobreak > nul

echo.
echo  ================================================
echo   AEVORA is starting up...
echo.
echo   Dashboard: http://localhost:3001
echo   API:       http://localhost:13000
echo   Health:    http://localhost:13000/health
echo   Desktop:   Electron App launched
echo.
echo   Login: your Chairman email (set it with node scripts\set-chairman-password.js)
echo  ================================================
echo.
echo Opening Chrome...
timeout /t 8 /nobreak > nul
start chrome http://localhost:3001
