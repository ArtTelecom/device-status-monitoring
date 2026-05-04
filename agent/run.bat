@echo off
REM Запуск агента из исходников (Python должен быть установлен)
cd /d "%~dp0"
python scanner.py
pause
