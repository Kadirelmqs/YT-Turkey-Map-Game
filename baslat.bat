@echo off
title MAP-YT-LIVE Baslatici
echo.
echo === OYUN BASLATILIYOR ===
echo.

if not exist "venv\Scripts\activate.bat" (
    echo HATA: Sanal ortam bulunamadi! Lutfen once 'kurulum.bat' dosyasini calistirin.
    pause
    exit /b
)

echo Backend sunucusu baslatiliyor...
start "MAP-YT-LIVE Backend" cmd /k "call venv\Scripts\activate && cd backend && uvicorn server:app --host 0.0.0.0 --port 8000"
echo Frontend arayuzu baslatiliyor...
start "MAP-YT-LIVE Frontend" cmd /c "cd frontend && npm run dev"

echo.
echo Sistem basariyla calistirildi.
echo Acilan yeni pencereleri (Backend ve Frontend) acik birakin.
echo Tarayicinizda oyun sekmesi otomatik acilacaktir.
echo Kapatmak icin tum siyah pencereleri carpiktan kapatabilirsiniz.
pause