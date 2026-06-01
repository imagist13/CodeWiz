@echo off
title Hermes Desktop
cd /d "%~dp0"

echo Starting Hermes...
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.10+.
    pause
    exit /b 1
)

REM Install backend dependencies
echo Installing backend dependencies...
pip install -r backend\requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install backend dependencies.
    pause
    exit /b 1
)

REM Install frontend dependencies
echo.
echo Installing frontend dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install frontend dependencies.
    pause
    exit /b 1
)

REM Start development mode
echo.
echo Starting Hermes in development mode...
echo.
echo Backend will run on http://127.0.0.1:1478
echo.
npm run dev

pause
