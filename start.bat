@echo off
title AEVORA - SAAHVIK Tech
echo.
echo  ================================================
echo   AEVORA - SAAHVIK Tech AI Business System (API Backend)
echo  ================================================
echo.

echo [1/2] Checking Ollama...
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

echo [2/2] Starting API backend...
start "AEVORA API" cmd /k "cd /d %~dp0apps\api && npm run dev"
timeout /t 5 /nobreak > nul

echo.
echo  ================================================
echo   AEVORA Backend is starting up...
echo.
echo   API:       http://localhost:13000
echo   Health:    http://localhost:13000/health
echo.
echo   Login: your Chairman email (set it with node scripts\set-chairman-password.js)
echo  ================================================
echo.
