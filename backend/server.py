import asyncio
import pytchat
import socketio
import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
fastapi_app = FastAPI()

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_listeners = {}

def clean_text(text):
    if not text:
        return ""
    cleaned = text.lower()
    cleaned = re.sub(r'[.,&\-\'()\[\]/]', ' ', cleaned)
    return re.sub(r'\s+', ' ', cleaned).strip()

async def youtube_chat_listener(video_id: str):
    try:
        chat = pytchat.create(video_id=video_id)
        if not chat.is_alive():
            raise ValueError("Yayın canlı değil")
    except Exception as e:
        print(f"❌ Hata: {video_id} ID'li yayın bulunamadı veya canlı değil.")
        await asyncio.sleep(1) # Soketin odaya girmesi için zorunlu bekleme
        await sio.emit('tiktok_error', {'message': 'Yayın bulunamadı veya canlı değil! Geçerli bir ID girin.'}, room=video_id)
        if video_id in active_listeners:
            del active_listeners[video_id]
        return

    # Backend soket bağını kurana kadar 1 saniye bekle (Race condition engeli)
    await asyncio.sleep(1)
    await sio.emit('tiktok_connected', {'username': video_id}, room=video_id)

    while chat.is_alive() and active_listeners.get(video_id):
        try:
            for c in chat.get().sync_items():
                if c.amountValue > 0:
                    payload = {
                        'gift_id': str(c.amountValue),
                        'gift_name': f"SuperChat {c.amountString}",
                        'username': c.author.name,
                        'profile_picture': c.author.imageUrl,
                        'count': float(c.amountValue),
                        'timestamp': datetime.now(timezone.utc).isoformat()
                    }
                    await sio.emit('tiktok_gift', payload, room=video_id)
                    print(f"💎 [SUPERCHAT] {c.author.name} -> {c.amountString}")
                else:
                    msg = clean_text(c.message)
                    words = msg.split()
                    trigger_words = ["me", "ben", "oyna", "katil", "join"]
                    
                    if any(word in words for word in trigger_words):
                        payload = {
                            'username': c.author.name,
                            'profile_picture': c.author.imageUrl,
                            'message': c.message,
                            'like_count': 1,
                            'timestamp': datetime.now(timezone.utc).isoformat()
                        }
                        await sio.emit('tiktok_like', payload, room=video_id)
                        print(f"💬 [SOHBET TETİKLENDİ] {c.author.name}: {c.message}")
            # Chat'i çok hızlı okumamak için kısa bir uyku
            await asyncio.sleep(0.1)
        except Exception as e:
            print(f"Sohbet okuma hatası: {e}")
            break
            
    print(f"🛑 {video_id} için yayın dinlemesi sonlandı.")
    if video_id in active_listeners:
        del active_listeners[video_id]

@fastapi_app.post("/game/{video_id}/start")
async def start_game(video_id: str):
    if video_id not in active_listeners:
        active_listeners[video_id] = True
        asyncio.create_task(youtube_chat_listener(video_id))
    return {"status": "started", "video_id": video_id}

@fastapi_app.post("/game/{video_id}/stop")
async def stop_game(video_id: str):
    if video_id in active_listeners:
        active_listeners[video_id] = False
        del active_listeners[video_id]
    return {"status": "stopped", "video_id": video_id}

@sio.on('join_room')
async def on_join(sid, data):
    video_id = data.get('video_id')
    if video_id:
        await sio.enter_room(sid, video_id) # Eksik olan await eklendi

app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)