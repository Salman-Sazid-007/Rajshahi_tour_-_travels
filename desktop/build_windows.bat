@echo off
REM Build a double-clickable Windows program: dist\RajshahiTours\RajshahiTours.exe
setlocal
cd /d "%~dp0"

python --version >nul 2>&1 || (
  echo Python is not installed or not on PATH. Install Python 3.10+ from https://www.python.org/downloads/
  echo and tick "Add Python to PATH" during setup.
  pause
  exit /b 1
)

python -m pip install --upgrade pip || goto :error
python -m pip install -r requirements.txt pyinstaller || goto :error

if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

pyinstaller rajshahi_tours.spec --noconfirm --clean || goto :error

echo.
echo Done. The program is here:
echo   %CD%\dist\RajshahiTours\RajshahiTours.exe
echo.
echo Copy the whole "RajshahiTours" folder to the office computer.
pause
exit /b 0

:error
echo.
echo Build failed. Scroll up for the error message.
pause
exit /b 1
