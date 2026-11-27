@echo off
setlocal
where python >nul 2>&1
if not errorlevel 1 (
  python "%~dp0preview.py"
) else (
  py "%~dp0preview.py"
)
if errorlevel 1 pause
