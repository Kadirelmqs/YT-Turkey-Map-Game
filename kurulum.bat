@echo off
title Proje Kurulumu
echo.
echo === MAP-YT-LIVE KURULUMU BASLIYOR ===
echo.

echo [1/3] Python sanal ortami (venv) olusturuluyor...
python -m venv venv
if %errorlevel% neq 0 (
    echo HATA: Python kurulu degil veya sistem PATH degiskenine eklenmemis!
    pause
    exit /b
)

echo.
echo [2/3] Backend (Python) gereksinimleri yukleniyor...
call venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r backend\requirements.txt

echo.
echo [3/3] Frontend (React) gereksinimleri yukleniyor...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo HATA: Node.js (npm) kurulu degil veya sistem PATH degiskenine eklenmemis!
    pause
    exit /b
)
cd ..

echo.
echo === KURULUM BASARIYLA TAMAMLANDI ===
echo Artik 'baslat.bat' dosyasini calistirarak oyunu acabilirsin.
pause