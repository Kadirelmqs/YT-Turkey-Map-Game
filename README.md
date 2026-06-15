# MAP-YT-LIVE (YouTube Türkiye Haritası Oyunu)

MAP-YT-LIVE, YouTube canlı yayınlarındaki izleyici etkileşimlerini (mesajlar ve bağışlar) gerçek zamanlı olarak Türkiye haritası üzerindeki bir strateji oyununa dönüştüren etkileşimli bir web uygulamasıdır.

İzleyiciler sohbete yazdıklarında haritada bir top olarak belirir, birbirleriyle savaşır, illeri ele geçirir ve bağış (superchat) yaparak evrimleşip güçlenirler. Tur sonunda en çok ili elinde tutan kişi şampiyon olur.

##  Sistem Mimarisi

Proje iki ana bileşenden oluşmaktadır:

1.  **Backend (Python):** YouTube canlı sohbetinden verileri anlık olarak çeker ve Socket.IO üzerinden oyuna aktarır.
2.  **Frontend (React & Phaser.js):** Oyunu tarayıcı üzerinde görselleştirir, harita çizimini ve animasyonları yönetir.

---

## ⚙️ Kurulum Gereksinimleri


Kendi bilgisayarınızda (sunucu olarak) oyunu çalıştırabilmeniz için aşağıdaki yazılımların sisteminizde yüklü olması **zorunludur**:

Eğer terminal üzerinden kolayca kurmak istiyorsanız:

Windows arama çubuğuna **"cmd"** yazıp komut satırını açın ve aşağıdaki komutları sırasıyla kopyalayıp yapıştırarak Enter'a basın:

## 1. Python Kurulumu Komutu:

winget install -e --id Python.Python.3.12

## 2. Node.js Kurulumu Komutu:

winget install -e --id OpenJS.NodeJS.LTS



Python ve Node.js i web sitelerinden manuel indirip kurmak için
(Eğer yukardaki komutlarla kurulum gerçekleştirdiyseniz buna gerek yoktur.)
1.  **Python (v3.10 veya üzeri):**
    * [python.org/downloads](https://www.python.org/downloads/) adresinden indirebilirsiniz.
    * **ÖNEMLİ NOT:** Windows'a kurarken ilk ekrandaki **"Add python.exe to PATH"** kutucuğunu kesinlikle işaretlemelisiniz!
2.  **Node.js (v20 veya üzeri):**
    * [nodejs.org](https://nodejs.org/en/) adresinden LTS (Önerilen) sürümünü indirip kurun.

---

## 🚀 Hızlı Kurulum ve Başlatma (Windows İçin)

Eğer komut satırı ile uğraşmak istemiyorsanız, indirdiğiniz klasörün içindeki otomasyon dosyalarını kullanabilirsiniz.

1.  Projeyi ZIP olarak indirin ve klasöre çıkartın.
2.  Klasör içindeki **`kurulum.bat`** dosyasına çift tıklayın. (Bu işlem bilgisayarınıza gerekli tüm kütüphaneleri otomatik olarak indirip kuracaktır).
    * *Windows "Akıllı Uygulama Denetimi" uyarısı verirse: Dosyaya sağ tıklayın -> Özellikler -> "Engellemeyi Kaldır" kutucuğunu işaretleyip "Tamam"a basın.*
3.  Kurulum bittikten sonra oyunu açmak için **`baslat.bat`** dosyasına çift tıklayın.

`baslat.bat` dosyası arka planda iki adet siyah terminal penceresi açacaktır. Bu pencereleri kapatmayın; tarayıcınız otomatik olarak oyun ekranını açacaktır.

-----------------------------------

## 💻 Manuel Kurulum (Geliştiriciler ve Linux/Mac Kullanıcıları İçin)

Projenin bağımlılıklarını kendiniz kurmak isterseniz aşağıdaki adımları terminal (CMD/PowerShell/Bash) üzerinden sırasıyla uygulayın.

### 1. Backend Kurulumu

Python için izole bir sanal ortam oluşturun ve gerekli kütüphaneleri kurun:

```bash
# Proje ana dizinine girin
cd MAP-YT-LIVE

# Sanal ortam oluşturun
python -m venv venv

# Sanal ortamı aktifleştirin
# Windows CMD için:
venv\Scripts\activate.bat

# Windows PowerShell için:
.\venv\Scripts\Activate.ps1

# Linux/Mac için:
source venv/bin/activate

# Gerekli kütüphaneleri yükleyin
cd backend
pip install -r requirements.txt


2. Frontend Kurulumu
# Proje ana dizininden frontend klasörüne geçin
cd frontend
npm install

------------------------------
3. Oyunu Başlatma
Kurulum tamamlandıktan sonra oyun dosyasında iki ayrı terminal penceresi açmanız gerekir.

Terminal 1 (Backend):
# Sanal ortamın (venv) aktif olduğundan emin olun
cd backend
uvicorn server:app --host 0.0.0.0 --port 8000


Terminal 2 (Frontend):
cd frontend
npm run dev
--------------------------------------------
(Frontend komutunu çalıştırdığınızda terminalde http://localhost:5173 benzeri bir adres belirecektir. Bu adrese tıklayarak veya tarayıcınıza kopyalayarak oyuna giriş yapabilirsiniz.)