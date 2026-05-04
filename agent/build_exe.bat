@echo off
REM Сборка одного .exe из scanner.py через PyInstaller
REM Запускать из папки agent\ в обычной cmd

echo === Установка зависимостей ===
pip install pyinstaller pysnmp==4.4.12

echo.
echo === Сборка scanner.exe ===
pyinstaller --onefile --name scanner --console scanner.py

echo.
echo === Готово ===
echo Файл: dist\scanner.exe
echo Скопируй scanner.exe и config.ini в любую папку и запусти.
pause
