import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import Phaser from "phaser";
import { IL_PATHS } from "./turkey_map_data";

// 🛡️ CORS Proxy for TikTok profile pictures
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

const USER_COLORS = [
  "#00f0ff",
  "#ff003c",
  "#39ff14",
  "#fcee0a",
  "#ff6b35",
  "#9b59b6",
  "#3498db",
  "#e74c3c",
  "#2ecc71",
  "#f39c12",
];

// YouTube resim 429 hatasını önlemek için yerel avatar üretici
const generateFallbackAvatar = (username, color) => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color || "#39ff14";
  ctx.fillRect(0, 0, 128, 128);
  ctx.font = "bold 64px Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((username || "U").charAt(0).toUpperCase(), 64, 64);
  return canvas.toDataURL("image/png");
};

const GameCanvas = forwardRef(
  ({ broadcasterId, isRunning, settings, socket }, ref) => {
    const gameContainerRef = useRef(null);
    const gameRef = useRef(null);
    const sceneRef = useRef(null);

    useImperativeHandle(ref, () => ({
      handleGiftEvent: (event, rule) => {
        if (sceneRef.current) sceneRef.current.handleGiftEvent(event, rule);
      },
      handleLikeEvent: (event, rule) => {
        if (sceneRef.current) sceneRef.current.handleLikeEvent(event, rule);
      },
      handleFollowEvent: (event) => {
        if (sceneRef.current) sceneRef.current.handleFollowEvent(event);
      },
      resetGame: () => {
        if (sceneRef.current) sceneRef.current.resetGame();
      },
        forceStartRound: () => {
        if (sceneRef.current) sceneRef.current.startRoundNow();
      },
      changePlayerColor: (username, color) => {
        if (sceneRef.current) sceneRef.current.changeUserColor(username, color);
      },
      eliminatePlayer: (username) => {
        if (sceneRef.current) sceneRef.current.eliminateUser(username);
      },
      getPlayers: () => {
        return sceneRef.current?.getActivePlayers() || [];
      },
    }));

    // 1. GÜNCELLEYİCİ: Soket veya ayarlar değiştiğinde oyunu kapatmadan içine aktarır
    useEffect(() => {
      if (gameRef.current) {
        const scene = gameRef.current.scene.keys.MainScene;
        if (scene) {
          scene.socket = socket;
          scene.settings = settings;
          scene.broadcasterId = broadcasterId;
          
          if (settings) {
            scene.defaultHP = settings.default_hp || 10;
            scene.roundDurationMs = (settings.round_duration || 5) * 60 * 1000;
          }
        }
      }
    }, [socket, settings, broadcasterId]);

    // 2. BAŞLATICı: Sadece sayfa açıldığında BİR KERE çalışıp haritayı çizer
    useEffect(() => {
      if (!gameContainerRef.current || gameRef.current) return;

      class MainScene extends Phaser.Scene {
        constructor() {
          super({ key: "MainScene" });
          this.provinces = new Map();
          this.users = new Map();
          this.balls = [];
          this.defaultHP = 100;
          this.roundDurationMs = 5 * 60 * 1000;
          this.hitCtx = null;
          this.mapScale = 1;
          this.mapOffset = { x: 0, y: 0 };
          this.mapTexture = null;
          this.needsMapRedraw = false;
          this.leaderboardTexts = [];
          this.leaderboardTimer = 0;
          this.rewardedFollowers = new Set();
          this.roundDurationMs = (settings?.round_duration || 5) * 60 * 1000;
          this.timeRemaining = this.roundDurationMs;
          this.isRoundEnding = false;
          this.hasRoundStarted = false;
          this.lastChampion = null;
          this.timerText = null;
          this.lastChampion = null;
          this.timerText = null;
          this.championsList = {}; // BİRİNCİ EKLEME: Şampiyon hafızası
        }
        

        init(data) {
          console.log("🚀 MainScene init() çağrıldı, gelen data:", data);
          if (!data) {
            console.warn("⚠️ Init data boş! Varsayılanlar kullanılacak");
            this.socket = null;
            this.settings = null;
            return;
          }
          this.socket = data.socket;
          this.settings = data.settings;
          console.log("✅ Socket alındı:", !!this.socket);
          console.log("✅ Settings alındı:", this.settings);
          if (this.settings) {
            this.defaultHP = this.settings.default_hp || 10;
            this.roundDurationMs =
              (this.settings.round_duration || 5) * 60 * 1000;
            console.log("🎮 Ayarlar uygulandı: defaultHP=" + this.defaultHP + ", roundDurationMs=" + this.roundDurationMs);
          }
        }

        create() {
          // if (!this.socket) {
          //   console.error("❌ HATA: Soket bağlantısı sahneye ulaşmadı!");
          //   console.error("   - this.socket:", this.socket);
          //   console.error("   - this.settings:", this.settings);
          //   console.error("   - gameRef:", gameRef.current);
          //   return;
          // }
          console.log("✅ create() başlatılıyor - Socket bağlı!", this.socket);

          // this.socket.on("game_settings_update", (data) => {
          //   const newSettings = data.settings;
          //   console.log("🔄 Ayarlar Canlı Güncellendi:", newSettings);
          //   this.settings = newSettings;
          //   if (newSettings.default_hp) {
          //     this.defaultHP = newSettings.default_hp;
          //     console.log("📊 Canlı: defaultHP güncellendi =", this.defaultHP);
          //   }
          //   if (newSettings.round_duration) {
          //     this.roundDurationMs = newSettings.round_duration * 60 * 1000;
          //     if (!this.hasRoundStarted) {
          //       this.timeRemaining = this.roundDurationMs;
          //     }
          //   }
          // });

          this.cameras.main.setBackgroundColor(0x020204);
          const g = this.make.graphics({ x: 0, y: 0, add: false });
          g.fillStyle(0xffffff);
          g.fillCircle(8, 8, 8);
          g.generateTexture("flameParticle", 16, 16);
          const hitCanvas = document.createElement("canvas");
          hitCanvas.width = this.scale.width;
          hitCanvas.height = this.scale.height;
          this.hitCtx = hitCanvas.getContext("2d");
          const baseW = 1000,
            baseH = 500;
          this.mapScale =
            Math.min(this.scale.width / baseW, this.scale.height / baseH) *
            0.95;
          this.mapOffset.x = (this.scale.width - baseW * this.mapScale) / 2;
          this.mapOffset.y = (this.scale.height - baseH * this.mapScale) / 2;
          this.initProvinces();
          
          this.mapTexture = this.textures.createCanvas(
            "turkeyMap",
            this.scale.width,
            this.scale.height,
          );
          
          // DİKKAT: Resmi 'this.mapImage' değişkenine atıyoruz ki boyutlandırabilelim
          this.mapImage = this.add.image(
            this.scale.width / 2,
            this.scale.height / 2,
            "turkeyMap",
          );
          
          this.redrawMap();
          this.createLeaderboard();
          sceneRef.current = this;
          this.createTimerUI();

          // DİNAMİK YENİDEN BOYUTLANDIRMA (RESIZE) DİNLEYİCİSİ
          this.scale.on('resize', (gameSize) => {
            const width = gameSize.width;
            const height = gameSize.height;

            // Harita ölçeğini yeni ekrana göre tekrar hesapla
            this.mapScale = Math.min(width / baseW, height / baseH) * 0.95;
            this.mapOffset.x = (width - baseW * this.mapScale) / 2;
            this.mapOffset.y = (height - baseH * this.mapScale) / 2;

            // Tıklama algılayıcıyı (hitCtx) güncelle
            this.hitCtx.canvas.width = width;
            this.hitCtx.canvas.height = height;

            // Harita resmini ve texture'ını tamamen yeni ekrana uyarla
            if (this.mapImage) {
               this.mapImage.setPosition(width / 2, height / 2);
            }
            if (this.mapTexture) {
               this.mapTexture.destroy();
            }
            this.mapTexture = this.textures.createCanvas("turkeyMap", width, height);
            if (this.mapImage) this.mapImage.setTexture("turkeyMap");

            this.redrawMap();
          });
        }

        createLeaderboard() {
          const boxWidth = 280;
          const boxHeight = 220;
          
          // Sadece Şampiyonlar listesini tutan Container
          this.leaderboardContainer = this.add.container(0, 0).setDepth(50);
          this.leaderboardTexts = [];

          const bg = this.add.graphics();
          bg.fillStyle(0x0a0a14, 0.9);
          bg.fillRoundedRect(0, 0, boxWidth, boxHeight, 12);
          bg.lineStyle(2, 0xffd700, 0.8); // Altın sarısı çerçeve
          bg.strokeRoundedRect(0, 0, boxWidth, boxHeight, 12);

          const title = this.add.text(boxWidth / 2, 22, "🏆 ŞAMPİYONLAR", {
              fontFamily: "Inter, sans-serif",
              fontSize: "18px",
              fontStyle: "900",
              color: "#FFD700",
              shadow: { offsetX: 0, offsetY: 2, color: "#000000", blur: 4, fill: true },
            }).setOrigin(0.5);

          bg.lineStyle(1, 0xffffff, 0.15);
          bg.beginPath();
          bg.moveTo(20, 45);
          bg.lineTo(boxWidth - 20, 45);
          bg.strokePath();

          this.leaderboardContainer.add([bg, title]);

          for (let i = 0; i < 5; i++) {
            const txt = this.add.text(20, 60 + i * 30, "", {
                fontFamily: "Inter, sans-serif",
                fontSize: "16px",
                fontStyle: "bold",
                color: "#ffffff",
                shadow: { offsetX: 1, offsetY: 1, color: "#000000", blur: 2, fill: true },
              });
            this.leaderboardTexts.push(txt);
            this.leaderboardContainer.add(txt);
          }
        }

        // İKİNCİ EKLEME: Skorları büyükten küçüğe sıralayan ve güncelleyen motor
        updateLeaderboardDisplay() {
          const sortedChampions = Object.entries(this.championsList)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5); // Sadece top 5'i göster

          this.leaderboardTexts.forEach(txt => txt.setText(""));

          sortedChampions.forEach(([username, wins], index) => {
            let prefix = "🏅";
            if (index === 0) prefix = "🥇";
            if (index === 1) prefix = "🥈";
            if (index === 2) prefix = "🥉";

            // Örn: 🥇 KADİR - 3 Galibiyet
            this.leaderboardTexts[index].setText(`${prefix} ${username.toUpperCase()} - ${wins} Win`);
          });
        }

        createTimerUI() {
          const s = this.settings || {};
          const duration = s.round_duration || 5;

          // Sayacı da Container içine alıyoruz
          this.timerContainer = this.add.container(0, 0).setDepth(50);

          const bg = this.add.graphics();
          bg.fillStyle(0x0a0a14, 0.9);
          bg.fillRoundedRect(-75, -20, 150, 40, 8); // Merkezden (-75) başlar
          bg.lineStyle(2, 0x39ff14, 0.5);
          bg.strokeRoundedRect(-75, -20, 150, 40, 8);

          this.timerText = this.add
            .text(0, 0, `${duration.toString().padStart(2, "0")}:00`, {
              fontFamily: "Inter, monospace",
              fontSize: "24px",
              fontStyle: "bold",
              color: "#39ff14",
              shadow: { offsetX: 0, offsetY: 0, color: "#39ff14", blur: 10, fill: true },
            })
            .setOrigin(0.5); // Metni kutunun tam merkezine hizala

          this.timerContainer.add([bg, this.timerText]);
        }

        endRound() {
          this.isRoundEnding = true;
          let maxScore = 0;
          let winnerUsername = null;
          const scores = {};
          this.provinces.forEach((p) => {
            if (p.owner) scores[p.owner] = (scores[p.owner] || 0) + 1;
          });
          for (const [user, score] of Object.entries(scores)) {
            if (score > maxScore) {
              maxScore = score;
              winnerUsername = user;
            }
          }
          if (winnerUsername) {
            // ÜÇÜNCÜ EKLEME: Şampiyonu listeye ekle ve tabloyu güncelle
            this.championsList[winnerUsername] = (this.championsList[winnerUsername] || 0) + 1;
            this.updateLeaderboardDisplay();
            const winnerUser = this.users.get(winnerUsername);
            this.lastChampion = {
              username: winnerUsername,
              profilePicture:
                winnerUser?.profilePicture ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${winnerUsername}`,
            };
            if (socket && broadcasterId) {
              socket.emit("champion_declared", {
                broadcaster_id: broadcasterId,
                username: winnerUsername,
                profile_picture: this.lastChampion.profilePicture,
              });
            }
            // Eski maskeyi iptal edip, hazır kesilmiş yuvarlak dokuyu kullanıyoruz
            const circleKey = `circle_${winnerUsername}`;
            const finalKey = this.textures.exists(circleKey) ? circleKey : `profile_${winnerUsername}`;
            
            let champContainer = null;
            let auraParticles = null;
            let animTargets = [];
            const centerX = this.scale.width / 2;
            const centerY = this.scale.height / 2;
            const textY = centerY + 120;
            const imageY = centerY - 40;
            const radius = 100;

            if (this.textures.exists(finalKey)) {
              auraParticles = this.add.particles(centerX, imageY, "flameParticle", {
                speed: { min: 100, max: 200 },
                angle: { min: 0, max: 360 },
                scale: { start: 2.5, end: 0 },
                alpha: { start: 0.6, end: 0 },
                blendMode: "ADD",
                lifespan: 1500,
                tint: [0xffd700, 0xffaa00, 0xffffff],
                frequency: 30
              }).setDepth(99);

              // 1. Resmi ve Çerçeveyi birbirine kilitleyecek Container'ı oluşturuyoruz
              champContainer = this.add.container(centerX, imageY).setDepth(101);

              // 2. Resim ve Çerçeve artık Container'ın 0,0 merkezine göre çiziliyor
              const champImage = this.add.image(0, 0, finalKey)
                .setDisplaySize(radius * 2, radius * 2);

              const champBorder = this.add.graphics();
              champBorder.lineStyle(8, 0xffd700, 1); // Çerçeveyi biraz kalınlaştırdık (8)
              champBorder.strokeCircle(0, 0, radius + 2); // Resmin kenarını tam kapatması için +2

              // 3. İkisini de Container'a ekliyoruz (Çerçeve üstte kalacak şekilde)
              champContainer.add([champImage, champBorder]);

              // 4. Animasyon hedefine sadece Container'ı veriyoruz
              animTargets.push(champContainer);
            }

            const txt = this.add
              .text(
                centerX,
                textY,
                `👑 TUR BİTTİ! 👑\nŞAMPİYON: ${winnerUsername.toUpperCase()}`,
                {
                  fontFamily: "Inter, sans-serif",
                  fontSize: "48px",
                  fontStyle: "900",
                  align: "center",
                  color: "#FFD700",
                  stroke: "#000000",
                  strokeThickness: 8,
                  shadow: { offsetX: 0, offsetY: 0, color: "#FFAA00", blur: 25, fill: true },
                },
              )
              .setOrigin(0.5)
              .setDepth(100);

            animTargets.push(txt);

            this.tweens.add({
              targets: animTargets,
              scale: 1.15,
              duration: 1000,
              yoyo: true,
              repeat: 4,
              onComplete: () => {
                if (txt) txt.destroy();
                if (champContainer) champContainer.destroy(); // Container silinince içindekiler de silinir
                if (auraParticles) auraParticles.destroy();
                this.startNewRound();
              }
            });
          } else {
            this.startNewRound();
          }
        }
        startRoundNow() {
          this.hasRoundStarted = true;
          this.isRoundEnding = false;
          this.timeRemaining = this.roundDurationMs;
        }
        startNewRound() {
          this.resetGame();
          this.hasRoundStarted = false;
          this.isRoundEnding = false;
          
          if (this.lastChampion) {
            const champ = this.getOrCreateUser(
              this.lastChampion.username,
              this.lastChampion.profilePicture,
            );
            champ.color = "#FFD700";
            this.giveTerritory(champ);
            if (champ.ball) {
              champ.ball.sprite.lineStyle(4, 0xffd700, 1);
              this.showFloatingText(
                champ.ball.x,
                champ.ball.y,
                `👑 KRAL DÖNDÜ!`,
                "#FFD700",
              );
            }
          }

          // DÜZELTME 2: Oyunun donup kalmaması için yeni turu anında otomatik başlatıyoruz.
          this.startRoundNow();
        }

        initProvinces() {
          const hpValue = this.settings?.default_hp || this.defaultHP;
          Object.entries(IL_PATHS).forEach(([id, pathString]) => {
            this.provinces.set(id, {
              id: id,
              path2D: new Path2D(pathString),
              hp: hpValue,
              maxHP: hpValue,
              owner: null,
              color: null,
              centerX: null,
              centerY: null,
            });
          });
        }

        redrawMap() {
          const ctx = this.mapTexture.context;
          ctx.clearRect(0, 0, this.scale.width, this.scale.height);
          ctx.save();
          ctx.translate(this.mapOffset.x, this.mapOffset.y);
          ctx.scale(this.mapScale, this.mapScale);
          this.provinces.forEach((province) => {
            const hpPercent = Math.max(0.1, province.hp / province.maxHP);
            if (province.owner && province.color) {
              ctx.globalAlpha = 0.4 + 0.6 * hpPercent;
              ctx.fillStyle = province.color;
            } else {
              ctx.globalAlpha = 1.0;
              ctx.fillStyle = "rgba(26, 26, 46, 0.7)";
            }
            ctx.fill(province.path2D);
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = "rgba(0, 240, 255, 0.3)";
            ctx.lineWidth = 1.5 / this.mapScale;
            ctx.stroke(province.path2D);
          });
          ctx.restore();
          this.mapTexture.refresh();
        }

        getProvinceAt(x, y) {
          if (!this.hitCtx) return null;
          const localX = (x - this.mapOffset.x) / this.mapScale;
          const localY = (y - this.mapOffset.y) / this.mapScale;
          for (const [id, province] of this.provinces.entries()) {
            if (this.hitCtx.isPointInPath(province.path2D, localX, localY)) {
              return id;
            }
          }
          return null;
        }

        isBoundary(x, y) {
          if (this.getProvinceAt(x, y)) return false;
          const localX = (x - this.mapOffset.x) / this.mapScale;
          const localY = (y - this.mapOffset.y) / this.mapScale;
          if (localX < 10 || localX > 990 || localY < 10 || localY > 490)
            return true;
          const isMarmaraSea =
            localX > 155 && localX < 324 && localY > 128 && localY < 180;
          return !isMarmaraSea;
        }

        getOrCreateUser(username, profilePicture) {
          let user = this.users.get(username);
          if (!user) {
            const colorIdx = this.users.size % USER_COLORS.length;
            const userColor = USER_COLORS[colorIdx];
            
            // Eğer resim gelmediyse veya google/ui-avatars kaynaklıysa doğrudan yerel avatar üret
            let finalPic = profilePicture;
            if (!finalPic || finalPic.includes("googleusercontent.com") || finalPic.includes("ui-avatars")) {
              finalPic = generateFallbackAvatar(username, userColor);
            }

            user = {
              username,
              profilePicture: finalPic,
              color: userColor,
              ball: null,
            };
            this.users.set(username, user);
          }
          return user;
        }

        spawnUserBall(user) {
          if (user.ball) return;
        
          let x, y;
          let provId = null;
          let attempts = 0;
          do {
            x = this.mapOffset.x + Math.random() * (1000 * this.mapScale);
            y = this.mapOffset.y + Math.random() * (500 * this.mapScale);
            provId = this.getProvinceAt(x, y);
            attempts++;
          } while (
            (!provId || this.provinces.get(provId).owner !== null) &&
            attempts < 1500
          );
          if (!provId) {
            do {
              x = this.mapOffset.x + Math.random() * (1000 * this.mapScale);
              y = this.mapOffset.y + Math.random() * (500 * this.mapScale);
              provId = this.getProvinceAt(x, y);
            } while (!provId);
          }
          const angle = Math.random() * Math.PI * 2;
          const radius = 40;
          const ball = {
            x,
            y,
            vx: Math.cos(angle) * 40,
            vy: Math.sin(angle) * 40,
            baseSpeed: 40,
            speed: 40,
            baseDPS: 20,
            damagePerSecond: 20,
            
            // FSM (Evrim) Değişkenleri Eklendi
            currentState: 'normal',
            comboCount: 0,
            stateTimer: 0,

            activeBuff: null,
            buffTimer: 0,
            nitroTimer: 0,
            particles: null,
            nitroParticles: null,
            radius,
            baseRadius: radius,
            username: user.username,
            color: user.color,
            profilePicture: user.profilePicture,
            damageTimer: 0,
            visualDamageAcc: 0,
            visualTextTimer: 0,
            sprite: this.add.graphics().setDepth(12),
            profileImage: null,
            mask: null,
            infoText: this.add
              .text(x, y + 25, "", {
                fontFamily: "Inter, sans-serif",
                fontSize: "11px",
                fontStyle: "bold",
                fill: "#ffffff",
                stroke: "#000000",
                strokeThickness: 3,
                align: "center",
              })
              .setOrigin(0.5)
              .setDepth(20),
            nameText: this.add
              .text(x, y + radius + 10, user.username, {
                fontFamily: "Arial, sans-serif",
                fontSize: "14px",
                fontStyle: "bold",
                fill: "#ffffff",
                stroke: "#000000",
                strokeThickness: 4,
                align: "center",
              })
              .setOrigin(0.5)
              .setDepth(21),
          };
          if (provId) {
            const targetProvince = this.provinces.get(provId);
            const previousOwner = targetProvince.owner;
            targetProvince.owner = user.username;
            targetProvince.color = user.color;
            targetProvince.maxHP = 500;
            targetProvince.hp = targetProvince.maxHP;
            targetProvince.centerX = x;
            targetProvince.centerY = y;
            this.redrawMap();
            this.showFloatingText(x, y, `🪂 İNDİRME!`, "#39ff14");
            if (previousOwner && previousOwner !== user.username) {
              let hasLand = false;
              for (const p of this.provinces.values()) {
                if (p.owner === previousOwner) {
                  hasLand = true;
                  break;
                }
              }
              if (!hasLand) {
                this.eliminateUser(previousOwner);
              }
            }
          }
          const imgKey = `profile_${user.username}`;
          if (!this.textures.exists(imgKey)) {
            this.load.crossOrigin = "anonymous";
            this.load.image(imgKey, ball.profilePicture);
            
            this.load.once("complete", () => {
              // Eğer yükleme sonrası doku oluşmadıysa (429 vb. hata aldıysa), varsayılan oluştur
              if (!this.textures.exists(imgKey)) {
                  console.warn(`Resim engellendi, varsayılan atanıyor: ${user.username}`);
                  const base64 = generateFallbackAvatar(user.username, user.color);
                  const img = new Image();
                  img.src = base64;
                  img.onload = () => {
                      this.textures.addImage(imgKey, img);
                      this.setupBallImage(ball, imgKey);
                  };
              } else {
                  this.setupBallImage(ball, imgKey);
              }
            });
            this.load.start();
          } else {
            this.setupBallImage(ball, imgKey);
          }
          user.ball = ball;
          this.balls.push(ball);
        }

        // setupBallImage(ball, imgKey) {
        //   if (ball.isDestroyed) return;
          
        //   ball.profileImage = this.add
        //     .image(ball.x, ball.y, imgKey)
        //     .setDisplaySize(ball.radius * 2, ball.radius * 2)
        //     .setDepth(11);
          
        //   // Bug'ı aşmak için maskeyi add ile ekleyip Alpha(0) ile görünmez yapıyoruz
        //   ball.maskGraphics = this.add.graphics();
        //   ball.maskGraphics.fillStyle(0xffffff);
        //   ball.maskGraphics.fillCircle(0, 0, ball.radius);
        //   ball.maskGraphics.setAlpha(0); 
          
        //   const mask = new Phaser.Display.Masks.GeometryMask(this, ball.maskGraphics);
        //   ball.profileImage.setMask(mask);
        // }
        // applyAction(ball, actionType, ballType, value, username, ruleDuration) {
        //   if (actionType === "speed_boost") {
        //     const durationMs =
        //       ruleDuration === 0 ? Infinity : (ruleDuration || 3) * 1000;
        //     if (!ball.nitroTimer || ball.nitroTimer === Infinity)
        //       ball.nitroTimer = 0;
        //     ball.nitroTimer += durationMs;
        //     const boostFactor = value ? parseInt(value) : 2;
        //     ball.nitroFactor = Math.max(ball.nitroFactor || 1.0, boostFactor);
        //     this.showFloatingText(
        //       ball.x,
        //       ball.y,
        //       `⚡ X${boostFactor} GÜÇ!`,
        //       "#00ffff",
        //     );
        //     if (!ball.nitroParticles) {
        //       ball.nitroParticles = this.add
        //         .particles(ball.x, ball.y, "flameParticle", {
        //           speed: { min: -60, max: 60 },
        //           scale: { start: 1.5, end: 0 },
        //           alpha: { start: 0.7, end: 0 },
        //           blendMode: "ADD",
        //           lifespan: 500,
        //           tint: [0x00ffff, 0xffffff],
        //           frequency: 15,
        //         })
        //         .setDepth(8);
        //     }
        //     ball.nitroParticles.start();
        //     return;
        //   }
        //   if (actionType === "new_ball" && ballType) {
        //     const durationMs =
        //       ruleDuration === 0 ? Infinity : (ruleDuration || 15) * 1000;
        //     if (ball.activeBuff === ballType) {
        //       if (ball.buffTimer !== Infinity) {
        //         ball.buffTimer += durationMs;
        //       }
        //       return;
        //     }
        //     if (ball.particles) {
        //       ball.particles.destroy();
        //       ball.particles = null;
        //     }
        //     ball.activeBuff = ballType;
        //     ball.buffTimer = durationMs;
        //     let announceText = "";
        //     let announceColor = "";
        //     let shadowColor = "";
        //     const scaleMult = ball.radius / 14;
        //     switch (ballType) {
        //       case "nuke":
        //         ball.speed = ball.baseSpeed * 10;
        //         ball.damagePerSecond = ball.baseDPS * 1000;
        //         ball.radius = ball.baseRadius * 1.4;
        //         announceText = `☢️ NÜKLEER FELAKET: ${username.toUpperCase()} ☢️`;
        //         announceColor = "#39ff14";
        //         shadowColor = "#006600";
        //         ball.particles = this.add
        //           .particles(ball.x, ball.y, "flameParticle", {
        //             speed: { min: -80 * scaleMult, max: 80 * scaleMult },
        //             angle: { min: 0, max: 360 },
        //             scale: { start: 3.5 * scaleMult, end: 0 },
        //             alpha: { start: 1, end: 0 },
        //             blendMode: "ADD",
        //             lifespan: 800,
        //             tint: [0x39ff14, 0xccff00, 0x006600],
        //             frequency: 8,
        //           })
        //           .setDepth(9);
        //         if (ball.sprite) {
        //           this.tweens.add({
        //             targets: ball.sprite,
        //             scale: 1.2,
        //             duration: 300,
        //             yoyo: true,
        //           });
        //         }
        //         if (ball.profileImage) {
        //           this.tweens.add({
        //             targets: ball.profileImage,
        //             scale: 1.2,
        //             duration: 300,
        //             yoyo: true,
        //           });
        //         }
        //         this.cameras.main.shake(1500, 0.005);
        //         break;
        //       case "fire":
        //         ball.speed = ball.baseSpeed * 4;
        //         ball.damagePerSecond = ball.baseDPS * 100;
        //         announceText = `🔥 ${username.toUpperCase()} ORTALIĞI YAKIYOR! 🔥`;
        //         announceColor = "#ffaa00";
        //         shadowColor = "#ff0000";
        //         ball.particles = this.add
        //           .particles(ball.x, ball.y, "flameParticle", {
        //             speed: { min: -80 * scaleMult, max: 80 * scaleMult },
        //             angle: { min: 0, max: 360 },
        //             scale: { start: 3.5 * scaleMult, end: 0 },
        //             alpha: { start: 1, end: 0 },
        //             blendMode: "ADD",
        //             lifespan: 800,
        //             tint: [0xffff00, 0xff6600, 0xff0000],
        //             frequency: 10,
        //           })
        //           .setDepth(9);
        //         break;
        //       case "lightning":
        //         ball.speed = ball.baseSpeed * 3.5;
        //         ball.damagePerSecond = ball.baseDPS * 8;
        //         announceText = `⚡ ${username.toUpperCase()} YILDIRIM GİBİ ÇARPTI! ⚡`;
        //         announceColor = "#00ffff";
        //         shadowColor = "#0000ff";
        //         ball.particles = this.add
        //           .particles(ball.x, ball.y, "flameParticle", {
        //             speed: { min: -200 * scaleMult, max: 200 * scaleMult },
        //             angle: { min: 0, max: 360 },
        //             scale: { start: 1.5 * scaleMult, end: 0 },
        //             alpha: { start: 1, end: 0 },
        //             blendMode: "ADD",
        //             lifespan: 150,
        //             tint: [0x00ffff, 0xffffff, 0xfcee0a],
        //             frequency: 5,
        //           })
        //           .setDepth(9);
        //         break;
        //       case "doom":
        //         ball.speed = 0;
        //         ball.radius = ball.baseRadius * 2;
        //         ball.x = this.mapOffset.x + 500 * this.mapScale;
        //         ball.y = this.mapOffset.y + 250 * this.mapScale;
        //         announceText = `☄️ KIYAMET: ${username.toUpperCase()} TÜM HARİTAYI ELE GEÇİRDİ! ☄️`;
        //         announceColor = "#ff0000";
        //         shadowColor = "#4a0000";
        //         const shockwave = this.add.graphics().setDepth(8);
        //         shockwave.lineStyle(8, 0xffffff, 1);
        //         shockwave.strokeCircle(ball.x, ball.y, 10);
        //         this.tweens.add({
        //           targets: shockwave,
        //           scale: 25,
        //           alpha: 0,
        //           duration: 1500,
        //           ease: "Cubic.easeOut",
        //           onComplete: () => shockwave.destroy(),
        //         });
        //         this.cameras.main.shake(1000, 0.02);
        //         this.provinces.forEach((p) => {
        //           p.owner = username;
        //           p.color = ball.color;
        //           p.maxHP = 500;
        //           p.hp = 500;
        //         });
        //         this.redrawMap();
        //         const usersToEliminate = [];
        //         this.balls.forEach((b) => {
        //           if (b.username !== username)
        //             usersToEliminate.push(b.username);
        //         });
        //         usersToEliminate.forEach((u) => this.eliminateUser(u));
        //         ball.particles = this.add
        //           .particles(ball.x, ball.y, "flameParticle", {
        //             speed: { min: -400 * scaleMult, max: 400 * scaleMult },
        //             angle: { min: 0, max: 360 },
        //             scale: { start: 10 * scaleMult, end: 0 },
        //             alpha: { start: 0.8, end: 0 },
        //             blendMode: "ADD",
        //             lifespan: 2000,
        //             tint: [0xff0000, 0xff8800],
        //             frequency: 5,
        //           })
        //           .setDepth(9);
        //         break;
        //       default:
        //         ball.activeBuff = null;
        //         ball.speed = ball.baseSpeed;
        //         ball.damagePerSecond = ball.baseDPS;
        //         break;
        //     }
        //     if (announceText) {
        //       const txt = this.add
        //         .text(this.scale.width / 2, 100, announceText, {
        //           fontFamily: "Inter, sans-serif",
        //           fontSize: "48px",
        //           fontStyle: "900",
        //           color: announceColor,
        //           stroke: "#ffffff",
        //           strokeThickness: 6,
        //           shadow: {
        //             offsetX: 0,
        //             offsetY: 0,
        //             color: shadowColor,
        //             blur: 25,
        //             fill: true,
        //           },
        //         })
        //         .setOrigin(0.5)
        //         .setDepth(100);
        //       this.tweens.add({
        //         targets: txt,
        //         y: 50,
        //         alpha: 0,
        //         duration: 3500,
        //         ease: "Power2",
        //         onComplete: () => txt.destroy(),
        //       });
        //     }
        //   }
        // }

        // handleLikeEvent(event, rule) {
        //   const { username, profile_picture } = event;
        //   const user = this.getOrCreateUser(username, profile_picture);
        //   if (
        //     !user.ball &&
        //     (rule.action_type === "new_ball" ||
        //       rule.action_type === "speed_boost")
        //   ) {
        //     this.spawnUserBall(user);
        //   }
        //   if (user.ball && rule) {
        //     this.applyAction(
        //       user.ball,
        //       rule.action_type,
        //       rule.ball_type,
        //       rule.value,
        //       username,
        //       rule.duration,
        //     );
        //   }
        // }
          setupBallImage(ball, imgKey) {
          if (ball.isDestroyed) return;

          // 1. Resmi HTML Canvas ile kalıcı olarak yuvarlak kesiyoruz (Maske ve köşe hatalarını bitirir)
          const srcImg = this.textures.get(imgKey).getSourceImage();
          const canvas = document.createElement("canvas");
          canvas.width = 128;
          canvas.height = 128;
          const ctx = canvas.getContext("2d");
          
          ctx.beginPath();
          ctx.arc(64, 64, 64, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(srcImg, 0, 0, 128, 128);

          const circleKey = "circle_" + ball.username;
          if (this.textures.exists(circleKey)) {
            this.textures.remove(circleKey);
          }
          this.textures.addImage(circleKey, canvas);

          ball.profileImage = this.add.image(ball.x, ball.y, circleKey);

          // 2. Her topa benzersiz bir sabit derinlik atıyoruz (Çerçeve ve resimlerin birbirine girmesini engeller)
          const baseLayer = 10 + (this.users.size * 5);
          ball.profileImage.setDepth(baseLayer);
          if (ball.sprite) ball.sprite.setDepth(baseLayer + 1);
          if (ball.infoText) ball.infoText.setDepth(baseLayer + 2);
          if (ball.nameText) ball.nameText.setDepth(baseLayer + 3);

          // 3. Eski hatalı maskeyi yok ediyoruz
          if (ball.maskGraphics) {
            ball.maskGraphics.destroy();
            ball.maskGraphics = null;
          }
        }
          morphBall(ball, targetState) {
          const s = this.settings || {};
          const durFire = (s.dur_fire || 20) * 1000;
          const durNuke = (s.dur_nuke || 8) * 1000;
          const scaleMult = ball.baseRadius / 14;

          // Eski efektleri temizle
          if (ball.particles) { ball.particles.destroy(); ball.particles = null; }

          ball.currentState = targetState;

          if (targetState === 'normal') {
            ball.speed = ball.baseSpeed;
            ball.damagePerSecond = ball.baseDPS;
            ball.radius = ball.baseRadius;
            ball.comboCount = 0;
            ball.stateTimer = 0;
          } 
          else if (targetState === 'fire') {
            ball.speed = ball.baseSpeed * 2.5;
            ball.damagePerSecond = ball.baseDPS * 5;
            ball.radius = ball.baseRadius * 1.2;
            ball.stateTimer = durFire;
            ball.comboCount = 0;
            
            ball.particles = this.add.particles(ball.x, ball.y, "flameParticle", {
              speed: { min: -100 * scaleMult, max: 100 * scaleMult },
              scale: { start: 2 * scaleMult, end: 0 },
              alpha: { start: 1, end: 0 },
              blendMode: "ADD",
              lifespan: 600,
              tint: [0xffff00, 0xff6600, 0xff0000],
              frequency: 15,
            }).setDepth(9);
            
            this.showFloatingText(ball.x, ball.y, "🔥 ALEVLENDİ!", "#ffaa00");
          } 
          else if (targetState === 'nuke') {
            ball.speed = ball.baseSpeed * 4;
            ball.damagePerSecond = ball.baseDPS * 20;
            ball.radius = ball.baseRadius * 1.5;
            ball.stateTimer = durNuke;
            ball.comboCount = 0;

            ball.particles = this.add.particles(ball.x, ball.y, "flameParticle", {
              speed: { min: -200 * scaleMult, max: 200 * scaleMult },
              scale: { start: 3.5 * scaleMult, end: 0 },
              alpha: { start: 1, end: 0 },
              blendMode: "ADD",
              lifespan: 800,
              tint: [0x39ff14, 0xccff00, 0x006600],
              frequency: 8,
            }).setDepth(9);

            this.cameras.main.shake(500, 0.005);
            this.showFloatingText(ball.x, ball.y, "☢️ NÜKLEER!", "#39ff14");
          }
        }
        //   handleLikeEvent(event, rule) {
        //   const { username, profile_picture } = event;
        //   const user = this.getOrCreateUser(username, profile_picture);
          
        //   // 1. Durum: Kullanıcının topu sahada yoksa, önce topu haritaya indir.
        //   if (!user.ball) {
        //     this.spawnUserBall(user);
        //     return;
        //   }
          
        //   // 2. Durum: Kullanıcının topu sahadaysa kuralları akıllıca uygula.
        //   if (user.ball && rule) {
        //     // Eğer gelen kural normal top üretmekse, bunu otomatik olarak HIZ/HASAR buff'ına çeviririz!
        //     if (rule.action_type === 'new_ball' && rule.ball_type === 'normal') {
        //       this.applyAction(user.ball, 'speed_boost', 'normal', rule.value || 2, username, rule.duration || 3);
        //     } else {
        //       // Özel bir top türüyse dönüştür veya can bas.
        //       this.applyAction(user.ball, rule.action_type, rule.ball_type, rule.value, username, rule.duration);
        //     }
        //   }
        // }
        handleLikeEvent(event) {
          const { username, profile_picture } = event;
          const user = this.getOrCreateUser(username, profile_picture);
          const s = this.settings || {};
          
          const reqNormal = s.req_normal || 1;
          const reqFire = s.req_fire || 3;
          const reqNuke = s.req_nuke || 5;

          // 1. Oyuncunun topu yoksa, oyuna girme sayacını artır
          if (!user.ball) {
            user.comboCount = (user.comboCount || 0) + 1;
            if (user.comboCount >= reqNormal) {
              this.spawnUserBall(user);
              // Top sahaya inerken durumlarını başlatıyoruz
              user.ball.comboCount = 0;
              user.ball.currentState = 'normal';
              user.ball.stateTimer = 0;
              user.comboCount = 0; 
            }
            return;
          }

          // 2. Oyuncunun topu varsa evrim sayacını artır
          const b = user.ball;
          b.comboCount = (b.comboCount || 0) + 1;

          if (b.currentState === 'normal') {
            if (b.comboCount >= reqFire) {
              this.morphBall(b, 'fire');
            }
          } 
          else if (b.currentState === 'fire') {
            if (b.comboCount >= reqNuke) {
              this.morphBall(b, 'nuke');
            }
          } 
          else if (b.currentState === 'nuke') {
            if (b.comboCount >= reqNuke) {
              b.stateTimer = (s.dur_nuke || 8) * 1000;
              b.comboCount = 0;
              this.showFloatingText(b.x, b.y, "🔄 SÜRE YENİLENDİ!", "#39ff14");
            }
          }
        }
        giveTerritory(user) {
          if (!user.ball) {
            this.spawnUserBall(user);
            return;
          }
          let targetProv = null;
          let minDist = Infinity;
          this.provinces.forEach((p) => {
            if (p.owner !== user.username && p.centerX !== null) {
              const dist = Phaser.Math.Distance.Between(
                user.ball.x,
                user.ball.y,
                p.centerX,
                p.centerY,
              );
              if (dist < minDist) {
                minDist = dist;
                targetProv = p;
              }
            }
          });
          if (targetProv) {
            const previousOwner = targetProv.owner;
            targetProv.owner = user.username;
            targetProv.color = user.color;
            targetProv.maxHP = 500;
            targetProv.hp = 500;
            this.redrawMap();
            this.showFloatingText(
              targetProv.centerX,
              targetProv.centerY,
              `🗺️ BÖLGE ALINDI!`,
              "#39ff14",
            );
            if (previousOwner) {
              let hasLand = false;
              for (const p of this.provinces.values()) {
                if (p.owner === previousOwner) {
                  hasLand = true;
                  break;
                }
              }
              if (!hasLand) this.eliminateUser(previousOwner);
            }
          }
        }

        handleGiftEvent(event) {
          const { username, profile_picture, count } = event;
          const user = this.getOrCreateUser(username, profile_picture);
          const s = this.settings || {};

          const scFire = s.sc_fire || 10;
          const scNuke = s.sc_nuke || 50;
          const scHeal = s.sc_heal || 100;
          
          const donationAmount = parseFloat(count) || 0;

          // 1. Oyuncunun topu yoksa önce oyuna dahil et
          if (!user.ball) {
            this.spawnUserBall(user);
            user.ball.currentState = 'normal';
            user.ball.comboCount = 0;
            user.ball.stateTimer = 0;
          }

          const b = user.ball;

          // 2. Bağış miktarına göre en yüksek ayrıcalığı tanımla
          if (donationAmount >= scHeal) {
            this.morphBall(b, 'nuke');
            let healedCount = 0;
            this.provinces.forEach(p => {
              if (p.owner === username) {
                p.hp = p.maxHP;
                healedCount++;
              }
            });
            this.showFloatingText(b.x, b.y, `💖 ${healedCount} BÖLGE İYİLEŞTİ!`, "#ff007f");
          } 
          else if (donationAmount >= scNuke) {
            this.morphBall(b, 'nuke');
          } 
          else if (donationAmount >= scFire) {
            // Zaten nükleerse alevliye düşürmemek için kontrol
            if (b.currentState === 'nuke') {
              b.stateTimer = (s.dur_nuke || 8) * 1000;
              this.showFloatingText(b.x, b.y, "🔄 SÜRE YENİLENDİ!", "#39ff14");
            } else {
              this.morphBall(b, 'fire');
            }
          } 
          else {
            // Küçük bağışlar için
            this.showFloatingText(b.x, b.y, "💸 DESTEK GELDİ!", "#00ffff");
          }
        }

        handleFollowEvent(event) {
          const { username, profile_picture } = event;
          if (this.rewardedFollowers.has(username)) {
            return;
          }
          this.rewardedFollowers.add(username);
          const user = this.getOrCreateUser(username, profile_picture);
          this.giveTerritory(user);
          const txt = this.add
            .text(
              this.scale.width / 2,
              this.scale.height / 2,
              `🎁 ${username.toUpperCase()} TAKİP ETTİ\nBÖLGE KAZANDI! 🎁`,
              {
                fontFamily: "Inter, sans-serif",
                fontSize: "36px",
                fontStyle: "900",
                align: "center",
                color: user.color,
                stroke: "#ffffff",
                strokeThickness: 6,
                shadow: {
                  offsetX: 0,
                  offsetY: 0,
                  color: "#000000",
                  blur: 15,
                  fill: true,
                },
              },
            )
            .setOrigin(0.5)
            .setDepth(100);
          this.tweens.add({
            targets: txt,
            y: txt.y - 100,
            alpha: 0,
            duration: 4000,
            ease: "Power2",
            onComplete: () => txt.destroy(),
          });
        }

        showFloatingText(x, y, textStr, colorStr = "#ff4444") {
          const text = this.add
            .text(x, y - 15, textStr, {
              fontFamily: "Arial",
              fontSize: "18px",
              fontStyle: "bold",
              color: colorStr,
              stroke: "#000000",
              strokeThickness: 4,
            })
            .setOrigin(0.5)
            .setDepth(25);
          this.tweens.add({
            targets: text,
            y: y - 50,
            alpha: 0,
            duration: 800,
            ease: "Power1",
            onComplete: () => text.destroy(),
          });
        }

        eliminateUser(username) {
          const ballIndex = this.balls.findIndex(
            (b) => b.username === username,
          );
          if (ballIndex > -1) {
            const b = this.balls[ballIndex];
            b.isDestroyed = true;
            const txt = this.add
              .text(
                this.scale.width / 2,
                this.scale.height / 2,
                `${username.toUpperCase()} YOK EDİLDİ!`,
                {
                  fontFamily: "Inter, sans-serif",
                  fontSize: "48px",
                  fontStyle: "bold",
                  color: "#ff003c",
                  stroke: "#ffffff",
                  strokeThickness: 6,
                },
              )
              .setOrigin(0.5)
              .setDepth(100);
            this.tweens.add({
              targets: txt,
              scale: 1.5,
              alpha: 0,
              duration: 3000,
              ease: "Power2",
              onComplete: () => txt.destroy(),
            });
            const circle = this.add.graphics().setDepth(99);
            circle.lineStyle(4, 0xff003c, 1);
            circle.strokeCircle(b.x, b.y, 20);
            this.tweens.add({
              targets: circle,
              scale: 4,
              alpha: 0,
              duration: 800,
              onComplete: () => circle.destroy(),
            });
            if (b.sprite) b.sprite.destroy();
            if (b.profileImage) b.profileImage.destroy();
            if (b.maskGraphics) b.maskGraphics.destroy();
            if (b.infoText) b.infoText.destroy();
            if (b.particles) b.particles.destroy();
            if (b.nitroParticles) b.nitroParticles.destroy();
            if (b.nameText) b.nameText.destroy();
            this.balls.splice(ballIndex, 1);
          }
          this.provinces.forEach((p) => {
            if (p.owner === username) {
              p.owner = null;
              p.color = null;
              const defaultHpValue = this.settings?.default_hp || this.defaultHP;
              p.hp = defaultHpValue;
              p.maxHP = defaultHpValue;
            }
          });
          this.redrawMap();
          this.users.delete(username);
          console.log(`🗑️ ${username} oyundan tamamen silindi - İller iade edildi, yönetim panelinden kaldırıldı`);
        }

        resetGame() {
          this.balls.forEach((b) => {
            b.isDestroyed = true;
            if (b.sprite) b.sprite.destroy();
            if (b.profileImage) b.profileImage.destroy();
            if (b.maskGraphics) b.maskGraphics.destroy();
            if (b.infoText) b.infoText.destroy();
            if (b.particles) b.particles.destroy();
            if (b.nitroParticles) b.nitroParticles.destroy();
            if (b.nameText) b.nameText.destroy();
          });
          this.balls = [];
          this.users.clear();
          this.provinces.forEach((p) => {
            const defaultHpValue = this.settings?.default_hp || this.defaultHP;
            p.hp = defaultHpValue;
            p.maxHP = defaultHpValue;
            p.owner = null;
            p.color = null;
          });
          this.redrawMap();
          
          // DÜZELTME 1: Tablodaki yazıları boşaltmak yerine, güncel şampiyonlarla tekrar çiziyoruz!
          if (this.updateLeaderboardDisplay) {
            this.updateLeaderboardDisplay();
          }
          
          this.timeRemaining = this.roundDurationMs;
          this.hasRoundStarted = false;
          console.log('✅ Timer sıfırlandı - Yeni tur başlamaya hazır');
        }



        changeUserColor(username, newColor) {
          const user = this.users.get(username);
          if (!user) {
            console.warn(`❌ Kullanıcı bulunamadı: ${username}`);
            return;
          }
          user.color = newColor;
          this.provinces.forEach((province) => {
            if (province.owner === username) {
              province.color = newColor;
            }
          });
          const ballIndex = this.balls.findIndex((b) => b.username === username);
          if (ballIndex > -1) {
            this.balls[ballIndex].color = newColor;
          }
          this.redrawMap();
          console.log(`🎨 ${username} rengi değiştirildi: ${newColor}`);
        }

        getActivePlayers() {
          const players = [];
          this.users.forEach((user, username) => {
            let provinceCount = 0;
            this.provinces.forEach((province) => {
              if (province.owner === username) {
                provinceCount++;
              }
            });
            players.push({
              username,
              color: user.color,
              provinceCount,
            });
          });
          return players;
        }

        update(time, delta) {
          const dt = delta / 1000;
         // --- UI MIHNATIS HİZALAMA MOTORU ---
          const screenW = this.scale.width;
          const screenH = this.scale.height;

          // Sayaç (Timer) her zaman üst orta kısımda
          if (this.timerContainer) {
            this.timerContainer.x = screenW / 2;
            this.timerContainer.y = 65;
          }

          // Şampiyonlar kutusunu EN SOLA (dikeyde ortaya) alıyoruz
          if (this.leaderboardContainer) {
            const boxWidth = 280;
            const boxHeight = 220;
            
            // X: Sol kenardan 20 piksel boşluk.
            // Y: Ekranın dikeyde tam ortası.
            this.leaderboardContainer.x = 20;
            this.leaderboardContainer.y = (screenH - boxHeight) / 2;
          }
          // -----------------------------------
          this.needsMapRedraw = false;
          if (this.hasRoundStarted && !this.isRoundEnding) {
            this.timeRemaining -= delta;
            if (this.timeRemaining <= 0) {
              this.timeRemaining = 0;
              this.endRound();
            }
          }
          let displayTime = this.hasRoundStarted
            ? this.timeRemaining
            : (this.settings?.round_duration || 5) * 60 * 1000;
          const mins = Math.floor(displayTime / 60000);
          const secs = Math.floor((displayTime % 60000) / 1000);
          if (this.timerText) {
            this.timerText.setText(
              `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`,
            );
          }
          if (this.isRoundEnding) return;
          this.balls.forEach((ball) => {
            // if (ball.activeBuff) {
            //   ball.buffTimer -= delta;
            //   if (ball.particles) {
            //     ball.particles.setPosition(ball.x, ball.y);
            //   }
            //   if (ball.buffTimer <= 0) {
            //     ball.activeBuff = null;
            //     ball.damagePerSecond = ball.baseDPS;
            //     ball.speed = ball.baseSpeed;
            //     ball.radius = ball.baseRadius; // Yarıçapı normale döndür
                
            //     // Tween ile büyütülmüş görselleri eski haline getir
            //     if (ball.sprite) ball.sprite.setScale(1);
            //     if (ball.profileImage) ball.profileImage.setScale(1);
                
            //     if (ball.particles) {
            //       ball.particles.destroy();
            //       ball.particles = null;
            //     }
            //   }
            // }
            // SÜRE VE DOWNGRADE KONTROLÜ
            if (ball.currentState !== 'normal' && ball.stateTimer > 0) {
              ball.stateTimer -= delta;
              
              if (ball.particles) {
                ball.particles.setPosition(ball.x, ball.y);
              }
              
              if (ball.stateTimer <= 0) {
                if (ball.currentState === 'nuke') {
                  // Nuke süresi biterse Alevli'ye düşer
                  this.morphBall(ball, 'fire');
                  this.showFloatingText(ball.x, ball.y, "⬇️ ALEVLİYE DÜŞTÜ", "#ffaa00");
                } else if (ball.currentState === 'fire') {
                  // Alevli süresi biterse Sıradan'a düşer
                  this.morphBall(ball, 'normal');
                  this.showFloatingText(ball.x, ball.y, "🧊 GÜÇ SIFIRLANDI", "#ffffff");
                }
              }
            }
            const currentProvId = this.getProvinceAt(ball.x, ball.y);
            let currentProvince = null;
            if (currentProvId) {
              currentProvince = this.provinces.get(currentProvId);
              if (currentProvince.centerX === null) {
                currentProvince.centerX = ball.x;
                currentProvince.centerY = ball.y;
              }
            }
            let targetX = null;
            let targetY = null;
            let pullStrength = 0;
            if (ball.activeBuff === "doom") {
              let closestTarget = null;
              let minDist = Infinity;
              this.provinces.forEach((p) => {
                if (p.owner !== ball.username && p.centerX !== null) {
                  const dist = Phaser.Math.Distance.Between(
                    ball.x,
                    ball.y,
                    p.centerX,
                    p.centerY,
                  );
                  if (dist < minDist) {
                    minDist = dist;
                    closestTarget = p;
                  }
                }
              });
              if (closestTarget) {
                targetX = closestTarget.centerX;
                targetY = closestTarget.centerY;
                pullStrength = 0.85;
              } else {
                targetX = this.mapOffset.x + 500 * this.mapScale;
                targetY = this.mapOffset.y + 250 * this.mapScale;
                pullStrength = 0.05;
              }
            } else if (currentProvince) {
              if (currentProvince.owner === ball.username) {
                let closestEnemy = null;
                let minDist = Infinity;
                this.provinces.forEach((p) => {
                  if (p.owner !== ball.username && p.centerX !== null) {
                    const dist = Phaser.Math.Distance.Between(
                      ball.x,
                      ball.y,
                      p.centerX,
                      p.centerY,
                    );
                    if (dist < minDist) {
                      minDist = dist;
                      closestEnemy = p;
                    }
                  }
                });
                if (closestEnemy) {
                  targetX = closestEnemy.centerX;
                  targetY = closestEnemy.centerY;
                  pullStrength = 0.1;
                }
              } else {
                let empireX = 0;
                let empireY = 0;
                let empireCount = 0;
                this.provinces.forEach((p) => {
                  if (p.owner === ball.username && p.centerX !== null) {
                    empireX += p.centerX;
                    empireY += p.centerY;
                    empireCount++;
                  }
                });
                if (empireCount > 0) {
                  targetX = empireX / empireCount;
                  targetY = empireY / empireCount;
                  pullStrength = 0.04;
                }
              }
            } else {
              const localX = (ball.x - this.mapOffset.x) / this.mapScale;
              const localY = (ball.y - this.mapOffset.y) / this.mapScale;
              const inMarmara =
                localX > 155 && localX < 324 && localY > 128 && localY < 180;
              if (!inMarmara) {
                let closestLand = null;
                let minDist = Infinity;
                this.provinces.forEach((p) => {
                  if (p.centerX !== null) {
                    const dist = Phaser.Math.Distance.Between(
                      ball.x,
                      ball.y,
                      p.centerX,
                      p.centerY,
                    );
                    if (dist < minDist) {
                      minDist = dist;
                      closestLand = p;
                    }
                  }
                });
                if (closestLand) {
                  targetX = closestLand.centerX;
                  targetY = closestLand.centerY;
                  pullStrength = 0.3;
                }
              }
            }
            if (targetX !== null && targetY !== null) {
              const angleToTarget = Math.atan2(
                targetY - ball.y,
                targetX - ball.x,
              );
              ball.vx += Math.cos(angleToTarget) * (ball.speed * pullStrength);
              ball.vy += Math.sin(angleToTarget) * (ball.speed * pullStrength);
            }
            let finalSpeed = ball.speed;
            let currentDPS = ball.damagePerSecond;
            if (ball.nitroTimer > 0) {
              if (ball.nitroTimer !== Infinity) ball.nitroTimer -= delta;
              const factor = ball.nitroFactor || 2.0;
              finalSpeed = ball.speed * factor;
              currentDPS = ball.damagePerSecond * factor;
              if (ball.nitroParticles)
                ball.nitroParticles.setPosition(ball.x, ball.y);
              if (ball.nitroTimer <= 0) {
                if (ball.nitroParticles) ball.nitroParticles.stop();
                ball.nitroFactor = 1.0;
              }
            }
            const currentVel = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
            if (currentVel > 0) {
              ball.vx = (ball.vx / currentVel) * finalSpeed;
              ball.vy = (ball.vy / currentVel) * finalSpeed;
            }
            let hitBoundary = false;
            if (this.isBoundary(ball.x + ball.vx * dt, ball.y)) {
              ball.vx *= -1;
              hitBoundary = true;
            } else {
              ball.x += ball.vx * dt;
            }
            if (this.isBoundary(ball.x, ball.y + ball.vy * dt)) {
              ball.vy *= -1;
              hitBoundary = true;
            } else {
              ball.y += ball.vy * dt;
            }
            if (
              !hitBoundary &&
              this.isBoundary(ball.x + ball.vx * dt, ball.y + ball.vy * dt)
            ) {
              ball.vx *= -1;
              ball.vy *= -1;
              hitBoundary = true;
            }
            if (hitBoundary) {
              let currentAngle = Math.atan2(ball.vy, ball.vx);
              currentAngle += (Math.random() - 0.5) * 0.5;
              ball.vx = Math.cos(currentAngle) * ball.speed;
              ball.vy = Math.sin(currentAngle) * ball.speed;
              const mapCenterX = this.mapOffset.x + 500 * this.mapScale;
              const mapCenterY = this.mapOffset.y + 250 * this.mapScale;
              const rescueAngle = Math.atan2(
                mapCenterY - ball.y,
                mapCenterX - ball.x,
              );
              ball.x += Math.cos(rescueAngle) * 2;
              ball.y += Math.sin(rescueAngle) * 2;
            }
            ball.sprite.clear();
            const strokeColor = ball.isBuffed
              ? 0xff8800
              : Phaser.Display.Color.HexStringToColor(ball.color).color;
            const strokeWidth = ball.isBuffed ? 5 : 3;
            ball.sprite.lineStyle(strokeWidth, strokeColor, 1);
            ball.sprite.strokeCircle(ball.x, ball.y, ball.radius + 2);
            // RESMİ VE MASKEYİ GÜNCEL YARIÇAPA GÖRE KUSURSUZ ŞEKİLLENDİRİR
            if (ball.profileImage) {
              ball.profileImage.setPosition(ball.x, ball.y);
              ball.profileImage.setDisplaySize(ball.radius * 2, ball.radius * 2);
            }
            
            // if (ball.maskGraphics) {
            //   ball.maskGraphics.clear();
            //   ball.maskGraphics.fillStyle(0xffffff);
            //   ball.maskGraphics.fillCircle(ball.x, ball.y, ball.radius);
            // }
            if (ball.nameText) {
              ball.nameText.setPosition(ball.x, ball.y + ball.radius + 12);
            }
            if (currentProvince) {
              ball.infoText?.setText(currentProvince.id);
              ball.infoText?.setPosition(ball.x, ball.y + 20);
              const hpPercent = Math.max(
                0,
                currentProvince.hp / currentProvince.maxHP,
              );
              const barWidth = 40;
              const barHeight = 6;
              const barX = ball.x - barWidth / 2;
              const barY = ball.y + 30;
              ball.sprite.fillStyle(0x000000, 0.8);
              ball.sprite.fillRect(barX, barY, barWidth, barHeight);
              let barColor = 0x2ecc71;
              if (hpPercent < 0.5) barColor = 0xf1c40f;
              if (hpPercent < 0.25) barColor = 0xe74c3c;
              ball.sprite.fillStyle(barColor, 1);
              ball.sprite.fillRect(barX, barY, barWidth * hpPercent, barHeight);
              ball.sprite.lineStyle(1, 0xffffff, 0.5);
              ball.sprite.strokeRect(barX, barY, barWidth, barHeight);
              const TICK_RATE = 100;
              ball.damageTimer += delta;
              ball.visualTextTimer += delta;

              // // HASAR VERME VE ELE GEÇİRME KODU
              // if (ball.damageTimer >= TICK_RATE) {
              //   if (currentProvince.owner !== ball.username) {
              //     // Başkasının (veya boş) toprağına hasar vur
              //     const dps = ball.damagePerSecond * (TICK_RATE / 1000);
              //     currentProvince.hp -= dps;
                  
              //     // Can sıfırlandıysa toprağı ele geçir
              //     if (currentProvince.hp <= 0) {
              //       currentProvince.owner = ball.username;
              //       currentProvince.color = ball.color;
              //       currentProvince.maxHP = 500;
              //       currentProvince.hp = 500;
              //       this.redrawMap(); // Haritayı yeni renkle güncelle
              //     }
              //   } else {
              //     // Kendi toprağındaysa ve canı azaldıysa iyileştir
              //     if (currentProvince.hp < currentProvince.maxHP) {
              //       currentProvince.hp = Math.min(currentProvince.maxHP, currentProvince.hp + (ball.damagePerSecond * (TICK_RATE / 1000)));
              //     }
              //   }
              //   ball.damageTimer = 0;
              // }
              // HASAR VERME VE ELE GEÇİRME KODU
              if (ball.damageTimer >= TICK_RATE) {
                if (currentProvince.owner !== ball.username) {
                  const dps = ball.damagePerSecond * (TICK_RATE / 1000);
                  currentProvince.hp -= dps;
                  
                  if (currentProvince.hp <= 0) {
                    // 1. Eski sahibin kim olduğunu kenara not al
                    const previousOwner = currentProvince.owner;
                    
                    // 2. Toprağı yeni sahibine ver
                    currentProvince.owner = ball.username;
                    currentProvince.color = ball.color;
                    currentProvince.maxHP = 500;
                    currentProvince.hp = 500;
                    this.redrawMap(); 

                    // 3. Eski sahibin başka toprağı kaldı mı kontrol et, kalmadıysa oyundan at
                    if (previousOwner && previousOwner !== ball.username) {
                      let hasLand = false;
                      for (const p of this.provinces.values()) {
                        if (p.owner === previousOwner) {
                          hasLand = true;
                          break;
                        }
                      }
                      if (!hasLand) {
                        this.eliminateUser(previousOwner);
                      }
                    }
                  }
                } else {
                  if (currentProvince.hp < currentProvince.maxHP) {
                    currentProvince.hp = Math.min(currentProvince.maxHP, currentProvince.hp + (ball.damagePerSecond * (TICK_RATE / 1000)));
                  }
                }
                ball.damageTimer = 0;

                // RESMİ VE MASKEYİ GÜNCEL YARIÇAPA GÖRE KUSURSUZ ŞEKİLLENDİRİR
            if (ball.profileImage) {
              ball.profileImage.setPosition(ball.x, ball.y);
              ball.profileImage.setDisplaySize(ball.radius * 2, ball.radius * 2);
            }
            
            if (ball.maskGraphics) {
              ball.maskGraphics.clear();
              ball.maskGraphics.fillStyle(0xffffff);
              // Yarıçaptan 1 piksel küçük keserek kare köşeleri tamamen siliyoruz
              ball.maskGraphics.fillCircle(ball.x, ball.y, ball.radius - 1);
            }
              }


            }
          });
        }
      }

      const config = {
        type: Phaser.AUTO,
        parent: gameContainerRef.current,
        width: window.innerWidth,
        height: window.innerHeight,
        physics: {
          default: "arcade",
          arcade: { debug: false },
        },
        scene: MainScene,
        render: { pixelArt: false, antialias: true },
      };

      const game = new Phaser.Game(config);
      gameRef.current = game;

      // Eksik olan veri aktarım satırı:
      game.scene.start("MainScene", { socket: socket, settings: settings });

      const handleResize = () => {
        if (gameRef.current) {
          gameRef.current.scale.resize(window.innerWidth, window.innerHeight);
        }
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        if (game) game.destroy(true); 
        gameRef.current = null;
      };
    }, []); // <--- DİKKAT: İçi tamamen BOŞ bir dizi olacak!
    return (
      <div
        ref={gameContainerRef}
        id="game-container"
        className="w-full h-full"
        data-testid="game-canvas"
      />
    );
  }
);

GameCanvas.displayName = "GameCanvas";

export default GameCanvas;