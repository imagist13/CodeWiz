import asyncio
import re
import uuid
from typing import Optional

from aibot import WSClient, WSClientOptions

from app.db.database import get_wecom_config, get_connection
from app.services.wecom_binding import decrypt_secret
from app.services.wecom_session_bridge import get_or_create_session
from app.services.agent import AgentService
from app.services.event_bus import EventBus

agent_service = AgentService()


def _strip_think(text: str) -> str:
    text = re.sub(r"<think>[\s\S]*?</think>", "", text)
    text = re.sub(r"<thinking>[\s\S]*?</thinking>", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


class _UserConnection:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.client: Optional[WSClient] = None
        self.running = False
        self.recent_msgids: set[str] = set()

    def is_duplicate(self, msgid: str) -> bool:
        if not msgid:
            return False
        if msgid in self.recent_msgids:
            return True
        self.recent_msgids.add(msgid)
        if len(self.recent_msgids) > 200:
            self.recent_msgids.clear()
            self.recent_msgids.add(msgid)
        return False


class WeComWSManager:
    def __init__(self):
        self._connections: dict[str, _UserConnection] = {}

    async def start(self, user_id: str) -> bool:
        if not user_id:
            return False

        existing = self._connections.get(user_id)
        if existing and existing.running and existing.client and existing.client.is_connected:
            print(f"[WeCom] WebSocket already connected for user {user_id[:8]}")
            return True

        if existing:
            self.stop(user_id)
            await asyncio.sleep(0.3)

        cfg = get_wecom_config(user_id)
        if not cfg or not cfg.get("bot_id") or not cfg.get("secret_encrypted"):
            return False

        try:
            secret = decrypt_secret(cfg["secret_encrypted"])
        except Exception as e:
            print(f"[WeCom] Failed to decrypt secret for user {user_id[:8]}: {e}")
            return False

        conn = _UserConnection(user_id)
        options = WSClientOptions(
            bot_id=cfg["bot_id"],
            secret=secret,
        )
        conn.client = WSClient(options)
        self._setup_handlers(conn)

        try:
            await conn.client.connect()
            conn.running = True
            self._connections[user_id] = conn
            print(f"[WeCom] WebSocket connected for user {user_id[:8]} bot {cfg['bot_id'][:4]}****")
            return True
        except Exception as e:
            print(f"[WeCom] WebSocket connection failed for user {user_id[:8]}: {e}")
            return False

    def stop(self, user_id: Optional[str] = None) -> None:
        if user_id is None:
            for uid in list(self._connections.keys()):
                self.stop(uid)
            return

        conn = self._connections.pop(user_id, None)
        if conn and conn.client:
            try:
                conn.client.disconnect()
            except Exception:
                pass
            conn.running = False

    async def start_all(self) -> int:
        db = get_connection()
        cursor = db.cursor()
        cursor.execute("SELECT user_id FROM wecom_config WHERE bot_id IS NOT NULL AND secret_encrypted IS NOT NULL")
        rows = cursor.fetchall()
        db.close()

        count = 0
        for row in rows:
            uid = row["user_id"]
            if await self.start(uid):
                count += 1
        return count

    def _setup_handlers(self, conn: _UserConnection) -> None:
        conn.client.on("message.text", lambda frame: self._on_text_message(conn, frame))
        conn.client.on("error", lambda err: print(f"[WeCom][{conn.user_id[:8]}] WS error: {err}"))
        conn.client.on("disconnected", lambda reason: print(f"[WeCom][{conn.user_id[:8]}] WS disconnected: {reason}"))

    async def _on_text_message(self, conn: _UserConnection, frame: dict) -> None:
        body = frame.get("body", {})
        msgtype = body.get("msgtype", "")

        if msgtype != "text":
            return

        msgid = body.get("msgid", "")
        if conn.is_duplicate(msgid):
            print(f"[WeCom][{conn.user_id[:8]}] Duplicate message skipped: msgid={msgid}")
            return

        text_data = body.get("text", {})
        content = text_data.get("content", "") if isinstance(text_data, dict) else ""

        from_data = body.get("from", {})
        from_user = ""
        if isinstance(from_data, dict):
            from_user = from_data.get("userid", "")

        chattype = body.get("chattype", "single")
        roomid = body.get("roomid", "")

        print(f"[WeCom][{conn.user_id[:8]}] Received: from={from_user}, chattype={chattype}, roomid={roomid}, content={content[:50]}")

        if not content:
            return

        wecom_id = roomid or from_user or "unknown"
        session_id = get_or_create_session(wecom_id, chattype, user_id=conn.user_id)

        stream_id = uuid.uuid4().hex

        if conn.client:
            try:
                await conn.client.reply_stream(
                    frame,
                    stream_id=stream_id,
                    content="🤖 正在思考中...",
                    finish=False,
                )
            except Exception as e:
                print(f"[WeCom][{conn.user_id[:8]}] Failed to send thinking indicator: {e}")

        event_bus = EventBus()
        collected = []

        async def collector():
            async for event in event_bus.subscribe():
                if event.type == "message_chunk":
                    collected.append(event.data.get("chunk", ""))

        collector_task = asyncio.create_task(collector())

        try:
            await agent_service.run(session_id, content, event_bus)
        except Exception as e:
            print(f"[WeCom][{conn.user_id[:8]}] Agent error: {e}")
        finally:
            event_bus.close()
            try:
                await collector_task
            except Exception:
                pass

        reply = "".join(collected)
        if not reply:
            reply = "抱歉，处理出现了问题，请稍后重试。"

        reply = _strip_think(reply)
        if not reply:
            reply = "抱歉，暂时没有可用的回复。"

        if conn.client:
            try:
                await conn.client.reply_stream(
                    frame,
                    stream_id=stream_id,
                    content=reply,
                    finish=True,
                )
            except Exception as e:
                print(f"[WeCom][{conn.user_id[:8]}] Failed to send reply: {e}")


wecom_ws_manager = WeComWSManager()
