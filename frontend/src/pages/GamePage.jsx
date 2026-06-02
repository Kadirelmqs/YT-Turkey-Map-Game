import { useState, useEffect, useRef, useCallback, useTransition, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast, Toaster } from 'sonner';
import { io } from 'socket.io-client';
import axios from 'axios';
import {
  Settings, Play, Square, RotateCcw, X, Plus, Trash2, DollarSign, MessageSquare, Zap, Flame, Snowflake, TestTube, Users,
} from 'lucide-react';

const GameCanvasLazy = lazy(() => import('../components/game/GameCanvas'));

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const API = `${BACKEND_URL}/game`;

const BALL_TYPES = [
  { id: 'normal', name: 'Sıradan Top', icon: Zap, color: '#00f0ff' },
  { id: 'lightning', name: 'Yıldırım Top', icon: Zap, color: '#fcee0a' },
  { id: 'fire', name: 'Alevli Top', icon: Flame, color: '#ff003c' },
  { id: 'nuke', name: 'Nükleer Felaket', icon: TestTube, color: '#39ff14' },
  { id: 'doom', name: 'Kıyamet Topu', icon: Snowflake, color: '#39ff14' },
];

const ACTION_TYPES = [
  { id: 'new_ball', name: 'Yeni Top Gönder' },
  { id: 'speed_boost', name: 'Hız Artışı' },
  { id: 'hp_heal', name: 'HP Yenileme' },
 // { id: 'territory', name: 'Bölge Ver' },
];
// const [championsList, setChampionsList] = useState({});

// Basit UI Bileşenleri
const Button = ({ children, className = "", ...props }) => (
  <button className={`px-4 py-2 rounded font-bold flex items-center justify-center transition-opacity hover:opacity-80 disabled:opacity-50 ${className}`} {...props}>
    {children}
  </button>
);

const Input = (props) => (
  <input className={`px-3 py-2 rounded outline-none border ${props.className}`} {...props} />
);

const Select = ({ value, onChange, options, placeholder, className = "" }) => (
  <select value={value} onChange={onChange} className={`px-3 py-2 rounded outline-none border ${className}`}>
    <option value="" disabled>{placeholder}</option>
    {options.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
  </select>
);

const GamePage = () => {
  const socketRef = useRef(null);
  const gameRef = useRef(null);
  const giftRulesRef = useRef([]);
  const likeRulesRef = useRef([]);
  const userLikesPoolRef = useRef({});
  const likeTimersRef = useRef({});
  const [isPending, startTransition] = useTransition();

  const [videoId, setVideoId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isGameRunning, setIsGameRunning] = useState(false);

  const [showSettings, setShowSettings] = useState(true);
  const [activeTab, setActiveTab] = useState('gifts');
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testUsername, setTestUsername] = useState('test_izleyici');
  const [showPlayerManagement, setShowPlayerManagement] = useState(false);

  // Varsayılan kuralları yeni sisteme uyarladık
  const [giftRules, setGiftRules] = useState([
    { id: 'def_gift', gift_id: '10', gift_name: '10 Birim ve Üzeri', action_type: 'new_ball', ball_type: 'fire', value: 1, duration: 15, description: '15sn Alevli Top Yapar' }
  ]);
  
  const [likeRules, setLikeRules] = useState([
    { id: 'def_like', like_count: 1, action_type: 'new_ball', ball_type: 'normal', value: 2, duration: 3, description: 'Yoksa Top Atar, Varsa 3sn Hız/Hasar Verir' }
  ]);
  // ...

  // const [newGiftRule, setNewGiftRule] = useState({
  //   gift_id: '', gift_name: '', action_type: 'new_ball', ball_type: 'normal', value: 2, duration: 5, description: '',
  // });

  // const [newLikeRule, setNewLikeRule] = useState({
  //   like_count: 50, action_type: 'new_ball', ball_type: 'normal', value: 2, duration: 5, description: '',
  // });
  const [gameSettings, setGameSettings] = useState({ 
    default_hp: 100, 
    round_duration: 5,
    req_normal: 1,   // x: Normal top için gereken yorum
    req_fire: 3,     // y: Alevli top için gereken toplam yorum
    dur_fire: 10,    // a: Alevli kalma süresi (sn) - Uzun
    req_nuke: 5,     // z: Nuke için gereken toplam yorum
    dur_nuke: 5,      // b: Nuke kalma süresi (sn) - Kısa
    sc_fire: 10,   // Anında alevli olmak için gereken bağış
    sc_nuke: 50,   // Anında nükleer olmak için gereken bağış
    sc_heal: 100   // Toprak iyileştirme + nükleer için gereken bağış
  });
  const [activePlayers, setActivePlayers] = useState([]);

  useEffect(() => { giftRulesRef.current = giftRules; }, [giftRules]);
  useEffect(() => { likeRulesRef.current = likeRules; }, [likeRules]);

  const [newGiftRule, setNewGiftRule] = useState({
    gift_id: '', gift_name: '', action_type: 'new_ball', ball_type: 'normal', value: 1, duration: 0, description: '',
  });

  const [newLikeRule, setNewLikeRule] = useState({
    like_count: 50, action_type: 'new_ball', ball_type: 'normal', value: 1, duration: 0, description: '',
  });

  useEffect(() => {
    if (!showPlayerManagement || !gameRef.current) return;
    const interval = setInterval(() => {
      setActivePlayers(gameRef.current?.getPlayers() || []);
    }, 2000);
    return () => clearInterval(interval);
  }, [showPlayerManagement]);

  const handlePlayerColorChange = (username, newColor) => gameRef.current?.changePlayerColor(username, newColor);
  const handlePlayerEliminate = (username) => {
    gameRef.current?.eliminatePlayer(username);
    toast.success(`${username} oyundan atıldı! 🗑️`);
  };

  // const handleTikTokEvent = useCallback((event) => {
  //   if (!gameRef.current) return;

  //   startTransition(() => {
  //     if (event.type === 'gift') {
  //       const amount = event.count || 0;
  //       const rules = [...giftRulesRef.current].sort((a, b) => parseFloat(b.gift_id) - parseFloat(a.gift_id));
  //       const rule = rules.find((r) => amount >= parseFloat(r.gift_id));

  //       if (rule) {
  //         gameRef.current.handleGiftEvent(event, rule);
  //         toast.success(`💎 ${event.username} ${amount} değerinde bağış yaptı!`);
  //       }
  //     } else if (event.type === 'like') {
  //       try {
  //         const { username, like_count } = event;
  //         const rules = [...likeRulesRef.current].sort((a, b) => b.like_count - a.like_count);
  //         if (rules.length === 0) return;

  //         const incomingCount = like_count || 1;
  //         userLikesPoolRef.current[username] = (userLikesPoolRef.current[username] || 0) + incomingCount;
          
  //         if (likeTimersRef.current[username]) clearTimeout(likeTimersRef.current[username]);

  //         likeTimersRef.current[username] = setTimeout(() => {
  //           let finalPool = userLikesPoolRef.current[username];
  //           let triggeredAny = false;

  //           for (let rule of rules) {
  //             const activePlayers = gameRef.current?.getPlayers() || [];
  //             const hasActiveBall = activePlayers.some(p => p.username === username);

  //             if (rule.action_type === 'new_ball' && rule.ball_type === 'normal' && hasActiveBall) continue;

  //             if (finalPool >= rule.like_count) {
  //               const triggerCount = Math.floor(finalPool / rule.like_count);
  //               for(let i=0; i < triggerCount; i++) gameRef.current.handleLikeEvent(event, rule);
  //               finalPool -= (triggerCount * rule.like_count);
  //               userLikesPoolRef.current[username] = finalPool;
  //               triggeredAny = true;
  //             }
  //           }
  //           if (triggeredAny) toast.success(`💬 ${username} sohbet görevini tamamladı!`);
  //         }, 200);
  //       } catch (error) { console.error('Sohbet işleme hatası:', error); }
  //     }
  //   });
  // }, []);

  const handleTikTokEvent = useCallback((event) => {
    if (!gameRef.current) return;
    startTransition(() => {
      if (event.type === 'gift') {
        gameRef.current.handleGiftEvent(event);
      } else if (event.type === 'like') {
        // Eski karmaşık biriktirme havuzunu çöpe attık. Doğrudan motora gönderiyoruz.
        gameRef.current.handleLikeEvent(event);
      }
    });
  }, []);
  const handleStartGame = async () => {
    if (!videoId) return toast.error("Lütfen bir YouTube Video ID girin.");
    
    try {
      if (socketRef.current) socketRef.current.disconnect();

      // Backend'i tetikle (F5 atıldıysa zaten çalışıyordur ve 200 OK döner)
      await axios.post(`${API}/${videoId}/start`);

      const newSocket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });
      socketRef.current = newSocket;

      // Soket bağlandığı AN arayüzü bağlı durumuna geçiriyoruz! (Kilitlenmeyi çözer)
      newSocket.on('connect', () => {
        newSocket.emit('join_room', { video_id: videoId });
        toast.success('YouTube Canlı Yayınına Bağlanıldı! ✅');
        setIsConnected(true);
        setIsGameRunning(true);
        
        if (gameRef.current && gameRef.current.forceStartRound) {
          gameRef.current.forceStartRound();
        }
      });

      newSocket.on('tiktok_error', (data) => {
        toast.error(data.message);
        setIsGameRunning(false);
        setIsConnected(false);
        newSocket.disconnect();
      });

      newSocket.on('tiktok_gift', (data) => handleTikTokEvent({ type: 'gift', ...data }));
      newSocket.on('tiktok_like', (data) => handleTikTokEvent({ type: 'like', ...data }));
      newSocket.on('champion_declared', (data) => toast.success(`🏆 Şampiyon: ${data.username}!`, { duration: 5000 }));

    } catch (err) { 
      toast.error(err.response?.data?.detail || "Bağlantı başlatılamadı."); 
    }
  };

  const handleStopGame = async () => {
    if (!videoId) return;
    try {
      await axios.post(`${API}/${videoId}/stop`);
      if (socketRef.current) socketRef.current.disconnect();
      setIsGameRunning(false);
      setIsConnected(false);
      toast.success('Oyun durduruldu! ⏸️');
    } catch (err) { toast.error("Oyun durdurulamadı"); }
  };

  const handleResetGame = () => {
    gameRef.current?.resetGame();
    setIsGameRunning(false);
    toast.success('Oyun sıfırlandı! Yeni tur başlıyor 🔄');
  };

  const handleAddGiftRule = () => {
    if (!newGiftRule.gift_id) return toast.error('Lütfen bir miktar girin');
    const rule = {
      id: Math.random().toString(36).substring(7), ...newGiftRule,
      gift_name: `${newGiftRule.gift_id} Tutar ve Üzeri`,
      value: newGiftRule.action_type === 'speed_boost' ? Math.round(parseFloat(newGiftRule.value) * 100) : newGiftRule.value
    };
    setGiftRules([...giftRules, rule]);
    setNewGiftRule({ gift_id: '', gift_name: '', action_type: 'new_ball', ball_type: 'normal', value: 1, duration: 0, description: '' });
    toast.success('Bağış kuralı eklendi');
  };

  const handleAddLikeRule = () => {
    if (!newLikeRule.like_count) return toast.error('Geçerli bir mesaj sayısı girin');
    const rule = {
      id: Math.random().toString(36).substring(7), ...newLikeRule,
      value: newLikeRule.action_type === 'speed_boost' ? Math.round(parseFloat(newLikeRule.value) * 100) : newLikeRule.value
    };
    setLikeRules([...likeRules, rule]);
    setNewLikeRule({ like_count: 50, action_type: 'new_ball', ball_type: 'normal', value: 1, duration: 0, description: '' });
    toast.success('Sohbet kuralı eklendi');
  };

  const handleUpdateSettings = () => {
    if (socketRef.current) socketRef.current.emit('game_settings_update', { settings: gameSettings });
    toast.success('Ayarlar kaydedildi ve oyuna uygulandı');
  };

  const sendTestGift = (amount) => {
    if (!isGameRunning) return toast.error('Önce oyunu başlatın!');
    handleTikTokEvent({ 
      type: 'gift', 
      username: testUsername, 
      profile_picture: `https://ui-avatars.com/api/?name=${testUsername}&background=random&color=fff&size=128`,
      count: parseFloat(amount), 
      gift_id: `SC_TEST`, 
      gift_name: `SuperChat ${amount}` 
    });
  };

  const sendTestLikes = (count) => {
    if (!isGameRunning) return toast.error('Önce oyunu başlatın!');
    handleTikTokEvent({ 
      type: 'like', 
      username: testUsername, 
      profile_picture: `https://ui-avatars.com/api/?name=${testUsername}&background=random&color=fff&size=128`,
      like_count: count 
    });
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden font-sans" data-testid="game-page">
      <Toaster theme="dark" position="top-center" />
      
      {/* Üst Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-gray-900 border-b border-gray-700 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Input type="text" placeholder="YouTube Video ID (örn: dQw4w9WgXcQ)" value={videoId} onChange={(e) => setVideoId(e.target.value)} className="w-64 bg-black border-gray-600 text-white" />
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className={`text-sm ${isConnected ? 'text-green-500' : 'text-red-500'}`}>{isConnected ? 'Bağlı' : 'Bağlı Değil'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowSettings(true)} className="bg-gray-800 text-white border border-gray-600"><Settings className="w-4 h-4 mr-2" /> Kurallar</Button>
          {isGameRunning ? (
            <Button onClick={handleStopGame} className="bg-red-600 text-white"><Square className="w-4 h-4 mr-2" /> Durdur</Button>
          ) : (
            <Button onClick={handleStartGame} className="bg-green-600 text-white"><Play className="w-4 h-4 mr-2" /> Başlat</Button>
          )}
          {/* <Button onClick={handleResetGame} className="bg-blue-600 text-white"><RotateCcw className="w-4 h-4" /></Button> */}
        </div>
      </header>

      {/* Aktif Kurallar
      {(giftRules.length > 0 || likeRules.length > 0) && (
        <div className="fixed top-20 left-4 z-30 flex flex-wrap gap-2 max-w-md">
          {giftRules.slice(0, 3).map((rule) => (
            <div key={rule.id} className="bg-cyan-900/50 border border-cyan-500 px-3 py-1 text-xs rounded-full flex items-center gap-2">
              <DollarSign className="w-3 h-3 text-cyan-300" />
              <span className="text-cyan-300 font-bold">{rule.gift_id} Tutar:</span>
              <span>{rule.description || ACTION_TYPES.find((a) => a.id === rule.action_type)?.name}</span>
            </div>
          ))}
          {likeRules.slice(0, 3).map((rule) => (
            <div key={rule.id} className="bg-pink-900/50 border border-pink-500 px-3 py-1 text-xs rounded-full flex items-center gap-2">
              <MessageSquare className="w-3 h-3 text-pink-300" />
              <span className="text-pink-300 font-bold">{rule.like_count} Mesaj:</span>
              <span>{rule.description || ACTION_TYPES.find((a) => a.id === rule.action_type)?.name}</span>
            </div>
          ))}
        </div>
      )} */}

      <main className="pt-16 pb-4 h-screen">
        <div className="relative w-full h-full">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-black" />}>
            <GameCanvasLazy ref={gameRef} broadcasterId={videoId} isRunning={isGameRunning} settings={gameSettings} socket={socketRef.current} />
          </Suspense>
        </div>
      </main>

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
            <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
                <h2 className="text-lg font-bold text-white">Oyun Kuralları ve Ayarları</h2>
                <Button onClick={() => setShowSettings(false)} className="bg-transparent text-gray-400 hover:text-white p-2"><X className="w-5 h-5" /></Button>
              </div>

              <div className="p-4">
                <div className="flex gap-2 mb-4">
                  <Button onClick={() => setActiveTab('gifts')} className={`flex-1 ${activeTab === 'gifts' ? 'bg-cyan-600' : 'bg-gray-800'}`}>SuperChat Kuralları</Button>
                  <Button onClick={() => setActiveTab('likes')} className={`flex-1 ${activeTab === 'likes' ? 'bg-pink-600' : 'bg-gray-800'}`}>Yorum Kuralları</Button>
                  <Button onClick={() => setActiveTab('general')} className={`flex-1 ${activeTab === 'general' ? 'bg-green-600' : 'bg-gray-800'}`}>Genel Ayarlar</Button>
                </div>

                <div className="h-[50vh] overflow-y-auto pr-2">
                  {/* {activeTab === 'gifts' && (
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-800 rounded border border-gray-700 space-y-3">
                        <h4 className="text-sm font-bold text-cyan-400">Yeni Bağış (SuperChat) Kuralı</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <Input type="number" placeholder="Min. Bağış Miktarı (Örn: 50)" value={newGiftRule.gift_id} onChange={(e) => setNewGiftRule({ ...newGiftRule, gift_id: e.target.value })} className="bg-black border-gray-700" />
                          <Select value={newGiftRule.action_type} onChange={(e) => setNewGiftRule({ ...newGiftRule, action_type: e.target.value })} options={ACTION_TYPES} placeholder="Eylem Seç..." className="bg-black border-gray-700" />
                          
                          {newGiftRule.action_type === 'new_ball' && (
                            <Select value={newGiftRule.ball_type} onChange={(e) => setNewGiftRule({ ...newGiftRule, ball_type: e.target.value })} options={BALL_TYPES} placeholder="Top Türü Seç..." className="bg-black border-gray-700 col-span-2" />
                          )}
                          
                          {newGiftRule.action_type === 'hp_heal' && (
                            <Input type="number" min="1" placeholder="Yenilenecek Can Miktarı" value={newGiftRule.value} onChange={(e) => setNewGiftRule({ ...newGiftRule, value: parseInt(e.target.value) || 1 })} className="bg-black border-gray-700 col-span-2" />
                          )}

                          {['new_ball', 'speed_boost'].includes(newGiftRule.action_type) && (
                            <Input type="number" min="0" placeholder="Etki Süresi (Saniye, Sınırsız: 0)" value={newGiftRule.duration} onChange={(e) => setNewGiftRule({ ...newGiftRule, duration: parseInt(e.target.value) || 0 })} className="bg-black border-gray-700 col-span-2" />
                          )}
                          
                          <Input placeholder="Açıklama (opsiyonel)" value={newGiftRule.description} onChange={(e) => setNewGiftRule({ ...newGiftRule, description: e.target.value })} className="bg-black border-gray-700 col-span-2" />
                        </div>
                        <Button onClick={handleAddGiftRule} className="w-full bg-cyan-600 text-white"><Plus className="w-4 h-4 mr-2" /> Ekle</Button>
                      </div>

                      <div className="space-y-2">
                        {giftRules.map((rule) => (
                          <div key={rule.id} className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700">
                            <div>
                              <p className="text-sm text-cyan-400 font-bold">{rule.gift_id} Tutar ve Üzeri</p>
                              <p className="text-xs text-gray-400">{ACTION_TYPES.find(a => a.id === rule.action_type)?.name} {rule.ball_type !== 'normal' && `(${BALL_TYPES.find(b=>b.id === rule.ball_type)?.name})`}</p>
                            </div>
                            <Button onClick={() => setGiftRules(giftRules.filter(r => r.id !== rule.id))} className="bg-red-900/50 text-red-400 p-2"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )} */}
                  {activeTab === 'gifts' && (
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-800 rounded border border-gray-700 space-y-4">
                        <h4 className="text-sm font-bold text-cyan-400">SuperChat (Bağış) Kuralları</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2 col-span-2 p-3 bg-gray-900 border border-orange-700 rounded">
                            <label className="text-sm font-bold text-orange-500">1. Seviye: Anında Alevli Top</label>
                            <div className="flex items-center gap-2">
                              <Input type="number" min="1" value={gameSettings.sc_fire} onChange={(e) => setGameSettings({ ...gameSettings, sc_fire: parseInt(e.target.value) || 10 })} className="w-24 bg-black border-gray-600" />
                              <span className="text-sm text-gray-400">Birim bağış yapanın topu anında Alevli olur.</span>
                            </div>
                          </div>

                          <div className="space-y-2 col-span-2 p-3 bg-gray-900 border border-green-700 rounded">
                            <label className="text-sm font-bold text-green-500">2. Seviye: Anında Nükleer</label>
                            <div className="flex items-center gap-2">
                              <Input type="number" min="2" value={gameSettings.sc_nuke} onChange={(e) => setGameSettings({ ...gameSettings, sc_nuke: parseInt(e.target.value) || 50 })} className="w-24 bg-black border-gray-600" />
                              <span className="text-sm text-gray-400">Birim bağış yapanın topu anında Nükleer olur.</span>
                            </div>
                          </div>

                          <div className="space-y-2 col-span-2 p-3 bg-gray-900 border border-pink-700 rounded">
                            <label className="text-sm font-bold text-pink-500">3. Seviye: Şifa + Nükleer</label>
                            <div className="flex items-center gap-2">
                              <Input type="number" min="3" value={gameSettings.sc_heal} onChange={(e) => setGameSettings({ ...gameSettings, sc_heal: parseInt(e.target.value) || 100 })} className="w-24 bg-black border-gray-600" />
                              <span className="text-sm text-gray-400">Birim bağış yapanın tüm toprakları iyileşir ve topu Nükleer olur.</span>
                            </div>
                          </div>
                        </div>

                        <Button onClick={handleUpdateSettings} className="w-full bg-cyan-600 text-white mt-4">Ayarları Kaydet ve Uygula</Button>
                      </div>
                    </div>
                  )}
                  {/* {activeTab === 'likes' && (
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-800 rounded border border-gray-700 space-y-3">
                        <h4 className="text-sm font-bold text-pink-400">Yeni Sohbet Mesaj Kuralı</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <Input type="number" placeholder="Hedef Mesaj Sayısı (Örn: 20)" value={newLikeRule.like_count} onChange={(e) => setNewLikeRule({ ...newLikeRule, like_count: parseInt(e.target.value) || 1 })} className="bg-black border-gray-700" />
                          <Select value={newLikeRule.action_type} onChange={(e) => setNewLikeRule({ ...newLikeRule, action_type: e.target.value })} options={ACTION_TYPES} placeholder="Eylem Seç..." className="bg-black border-gray-700" />
                          
                          {newLikeRule.action_type === 'new_ball' && (
                            <Select value={newLikeRule.ball_type} onChange={(e) => setNewLikeRule({ ...newLikeRule, ball_type: e.target.value })} options={BALL_TYPES} placeholder="Top Türü Seç..." className="bg-black border-gray-700 col-span-2" />
                          )}
                          
                          {newLikeRule.action_type === 'hp_heal' && (
                            <Input type="number" min="1" placeholder="Yenilenecek Can Miktarı" value={newLikeRule.value} onChange={(e) => setNewLikeRule({ ...newLikeRule, value: parseInt(e.target.value) || 1 })} className="bg-black border-gray-700 col-span-2" />
                          )}

                          {['new_ball', 'speed_boost'].includes(newLikeRule.action_type) && (
                            <Input type="number" min="0" placeholder="Etki Süresi (Saniye, Sınırsız: 0)" value={newLikeRule.duration} onChange={(e) => setNewLikeRule({ ...newLikeRule, duration: parseInt(e.target.value) || 0 })} className="bg-black border-gray-700 col-span-2" />
                          )}
                          
                          <Input placeholder="Açıklama (opsiyonel)" value={newLikeRule.description} onChange={(e) => setNewLikeRule({ ...newLikeRule, description: e.target.value })} className="bg-black border-gray-700 col-span-2" />
                        </div>
                        <Button onClick={handleAddLikeRule} className="w-full bg-pink-600 text-white"><Plus className="w-4 h-4 mr-2" /> Ekle</Button>
                      </div>

                      <div className="space-y-2">
                        {likeRules.map((rule) => (
                          <div key={rule.id} className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700">
                            <div>
                              <p className="text-sm text-pink-400 font-bold">{rule.like_count} Mesaj Atıldığında</p>
                              <p className="text-xs text-gray-400">{ACTION_TYPES.find(a => a.id === rule.action_type)?.name} {rule.ball_type !== 'normal' && `(${BALL_TYPES.find(b=>b.id === rule.ball_type)?.name})`}</p>
                            </div>
                            <Button onClick={() => setLikeRules(likeRules.filter(r => r.id !== rule.id))} className="bg-red-900/50 text-red-400 p-2"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )} */
                  
                  }

                  {activeTab === 'likes' && (
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-800 rounded border border-gray-700 space-y-4">
                        <h4 className="text-sm font-bold text-pink-400">Top Evrimi (Sohbet Kuralları)</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2 col-span-2 p-3 bg-gray-900 border border-gray-700 rounded">
                            <label className="text-sm font-bold text-cyan-400">1. Seviye: Oyuna Giriş</label>
                            <div className="flex items-center gap-2">
                              <Input type="number" min="1" value={gameSettings.req_normal} onChange={(e) => setGameSettings({ ...gameSettings, req_normal: parseInt(e.target.value) || 1 })} className="w-20 bg-black border-gray-600" />
                              <span className="text-sm text-gray-400">Yorumda sıradan topla haritaya iner.</span>
                            </div>
                          </div>

                          <div className="space-y-2 col-span-2 p-3 bg-gray-900 border border-orange-700 rounded">
                            <label className="text-sm font-bold text-orange-500">2. Seviye: Alevli Top</label>
                            <div className="flex items-center gap-2">
                              <Input type="number" min="2" value={gameSettings.req_fire} onChange={(e) => setGameSettings({ ...gameSettings, req_fire: parseInt(e.target.value) || 3 })} className="w-20 bg-black border-gray-600" />
                              <span className="text-sm text-gray-400">Yoruma ulaşırsa Alevli olur. Süre:</span>
                              <Input type="number" min="5" value={gameSettings.dur_fire} onChange={(e) => setGameSettings({ ...gameSettings, dur_fire: parseInt(e.target.value) || 20 })} className="w-20 bg-black border-gray-600" />
                              <span className="text-sm text-gray-400">saniye.</span>
                            </div>
                          </div>

                          <div className="space-y-2 col-span-2 p-3 bg-gray-900 border border-green-700 rounded">
                            <label className="text-sm font-bold text-green-500">3. Seviye: Nükleer Felaket</label>
                            <div className="flex items-center gap-2">
                              <Input type="number" min="3" value={gameSettings.req_nuke} onChange={(e) => setGameSettings({ ...gameSettings, req_nuke: parseInt(e.target.value) || 5 })} className="w-20 bg-black border-gray-600" />
                              <span className="text-sm text-gray-400">Yoruma ulaşırsa Nuke olur. Süre:</span>
                              <Input type="number" min="2" value={gameSettings.dur_nuke} onChange={(e) => setGameSettings({ ...gameSettings, dur_nuke: parseInt(e.target.value) || 8 })} className="w-20 bg-black border-gray-600" />
                              <span className="text-sm text-gray-400">saniye.</span>
                            </div>
                          </div>
                        </div>

                        <Button onClick={handleUpdateSettings} className="w-full bg-pink-600 text-white mt-4">Ayarları Kaydet ve Uygula</Button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'general' && (
                    <div className="p-4 bg-gray-800 rounded border border-gray-700 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs text-gray-400">Yapay Zeka Yörünge Yumuşatma (Sub-pixel)</label>
                          <Input 
                            type="number" 
                            min="1" 
                            max="120" 
                            placeholder="Örn: 60" 
                            value={gameSettings.ai_smoothing || 60} 
                            onChange={(e) => setGameSettings({ ...gameSettings, ai_smoothing: parseInt(e.target.value) || 60 })} 
                            className="bg-black border-gray-700" 
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-gray-400">Tur Süresi (Dk)</label>
                          <Input type="number" value={gameSettings.round_duration} onChange={(e) => setGameSettings({ ...gameSettings, round_duration: parseInt(e.target.value) || 5 })} className="bg-black border-gray-700" />
                        </div>
                      </div>
                      <Button onClick={handleUpdateSettings} className="w-full bg-green-600 text-white">Ayarları Kaydet ve Uygula</Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-4 left-4 z-50">
        <Button onClick={() => setShowPlayerManagement(!showPlayerManagement)} className="bg-purple-600 text-white shadow-lg">
          <Users className="w-4 h-4 mr-2" /> Oyuncular
        </Button>
      </div>

      <AnimatePresence>
        {showPlayerManagement && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-16 left-4 z-50 w-80 bg-gray-900 border border-gray-700 rounded-lg p-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-purple-400">Canlı Oyuncu Yönetimi</h3>
              <Button onClick={() => setShowPlayerManagement(false)} className="bg-transparent text-gray-400 p-1"><X className="w-4 h-4" /></Button>
            </div>
            <div className="h-64 overflow-y-auto pr-2 space-y-2">
              {activePlayers.map((player) => (
                <div key={player.username} className="flex justify-between p-2 bg-gray-800 rounded border border-gray-700">
                  <div className="flex items-center gap-2">
                    <input type="color" value={player.color} onChange={(e) => handlePlayerColorChange(player.username, e.target.value)} className="w-6 h-6 cursor-pointer border-0 rounded bg-transparent" />
                    <p className="text-sm text-white truncate w-24">{player.username}</p>
                  </div>
                  <Button onClick={() => handlePlayerEliminate(player.username)} className="bg-red-900/50 text-red-400 p-1"><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-4 right-4 z-50"> 
        <Button onClick={() => setShowTestPanel(!showTestPanel)} className="bg-green-600 text-white shadow-lg">
          <TestTube className="w-4 h-4 mr-2" /> Test Paneli
        </Button>
      </div>

      <AnimatePresence>
        {showTestPanel && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-16 right-4 z-50 w-64 bg-gray-900 border border-gray-700 rounded-lg p-4 shadow-xl">
            <div className="flex justify-between mb-4">
              <h3 className="text-sm font-bold text-green-400">Sistem Testi</h3>
              <Button onClick={() => setShowTestPanel(false)} className="bg-transparent text-gray-400 p-1"><X className="w-4 h-4" /></Button>
            </div>
            <Input value={testUsername} onChange={(e) => setTestUsername(e.target.value)} placeholder="Kullanıcı Adı" className="mb-4 bg-black border-gray-700" />
            <div className="space-y-2">
              <Button onClick={() => sendTestLikes(1)} className="w-full bg-pink-900/50 text-pink-400 border border-pink-500/50">+1 Yorum Gönder</Button>
              <Button onClick={() => sendTestGift(50)} className="w-full bg-cyan-900/50 text-cyan-400 border border-cyan-500/50">Bağış Gönder (50)</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GamePage;