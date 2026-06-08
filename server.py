import hashlib
import json
import mimetypes
import os
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DEFAULT_DATA_ROOT = Path("/var/data") if Path("/var/data").exists() else BASE_DIR
DATA_ROOT = Path(os.environ.get("DATA_ROOT", DEFAULT_DATA_ROOT))
UPLOAD_DIR = DATA_ROOT / "uploads"
DATA_DIR = DATA_ROOT / "data"
DB_PATH = DATA_DIR / "inventory.sqlite"

ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_PASSWORD_HASH = os.environ.get(
    "ADMIN_PASSWORD_HASH",
    "1a1006a80a55d9fade473a5689808f222b7f1b5e799d920beed2d5d686ba6b7e",
)
SESSION_COOKIE = "spot_inventory_session"
SESSIONS = {}

SEED_ITEMS = [
    ("實木邊桌", "家具", "available", 1200, "九成新，桌面有輕微使用痕跡，適合沙發旁或床邊。", "https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=900&q=80", "2026-06-01"),
    ("小型空氣清淨機", "家電", "reserved", 1800, "功能正常，濾網需自行更換，外殼乾淨無明顯刮痕。", "https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=900&q=80", "2026-06-02"),
    ("陶瓷餐盤組", "生活", "available", 600, "一組四入，少用無缺角，適合日常餐桌搭配。", "https://images.unsplash.com/photo-1603199506016-b9a594b593c0?auto=format&fit=crop&w=900&q=80", "2026-06-03"),
    ("藍牙鍵盤", "數位", "available", 750, "按鍵正常，支援多裝置切換，附原盒不含電池。", "https://images.unsplash.com/photo-1584727638096-042c45049ebe?auto=format&fit=crop&w=900&q=80", "2026-06-04"),
    ("復古落地燈", "家具", "sold", 1500, "燈罩保存良好，已售出，保留作為參考款式。", "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80", "2026-05-28"),
    ("手沖咖啡壺", "生活", "available", 480, "使用次數少，壺身乾淨，適合入門手沖使用。", "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=900&q=80", "2026-06-05"),
]


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('available', 'reserved', 'sold')),
                price INTEGER NOT NULL CHECK(price >= 0),
                condition TEXT NOT NULL,
                image_url TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        count = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
        if count == 0:
            conn.executemany(
                """
                INSERT INTO items (id, name, category, status, price, condition, image_url, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [(str(uuid.uuid4()), *item) for item in SEED_ITEMS],
            )


def item_from_row(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "status": row["status"],
        "price": row["price"],
        "condition": row["condition"],
        "image": row["image_url"],
        "createdAt": row["created_at"],
    }


def password_matches(value):
    actual = hashlib.sha256(value.encode("utf-8")).hexdigest()
    if secrets.compare_digest(actual, ADMIN_PASSWORD_HASH):
        return True
    if ADMIN_PASSWORD:
        expected = hashlib.sha256(ADMIN_PASSWORD.encode("utf-8")).hexdigest()
        return secrets.compare_digest(actual, expected)
    return False


def username_matches(value):
    return value == ADMIN_USER or value == "admin"


class InventoryHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}")

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/items":
            self.handle_get_items()
        elif parsed.path == "/api/me":
            self.json_response({"authenticated": self.is_authenticated()})
        elif parsed.path.startswith("/uploads/"):
            self.serve_file(UPLOAD_DIR, parsed.path.removeprefix("/uploads/"))
        else:
            path = "index.html" if parsed.path in ("", "/") else parsed.path.lstrip("/")
            self.serve_file(PUBLIC_DIR, path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/login":
            self.handle_login()
        elif parsed.path == "/api/logout":
            self.handle_logout()
        elif parsed.path == "/api/items":
            self.require_auth(self.handle_create_item)
        elif parsed.path == "/api/upload":
            self.require_auth(self.handle_upload)
        else:
            self.not_found()

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/items/"):
            item_id = parsed.path.rsplit("/", 1)[-1]
            self.require_auth(lambda: self.handle_update_item(item_id))
        else:
            self.not_found()

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/items/"):
            item_id = parsed.path.rsplit("/", 1)[-1]
            self.require_auth(lambda: self.handle_delete_item(item_id))
        else:
            self.not_found()

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def json_response(self, payload, status=200, headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if headers:
            for key, value in headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def error_response(self, message, status=400):
        self.json_response({"error": message}, status)

    def not_found(self):
        self.error_response("找不到資源", 404)

    def serve_file(self, root, relative_path):
        target = (root / relative_path).resolve()
        root = root.resolve()
        if not str(target).startswith(str(root)) or not target.exists() or not target.is_file():
            self.not_found()
            return

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def get_session_id(self):
        raw = self.headers.get("Cookie", "")
        jar = cookies.SimpleCookie(raw)
        morsel = jar.get(SESSION_COOKIE)
        return morsel.value if morsel else ""

    def is_authenticated(self):
        session_id = self.get_session_id()
        return bool(session_id and session_id in SESSIONS)

    def require_auth(self, callback):
        if not self.is_authenticated():
            self.error_response("請先登入後台", 401)
            return
        callback()

    def handle_get_items(self):
        with db() as conn:
            rows = conn.execute("SELECT * FROM items ORDER BY created_at DESC, rowid DESC").fetchall()
        self.json_response({"items": [item_from_row(row) for row in rows]})

    def validate_item(self, data):
        required = ["name", "category", "status", "price", "image"]
        if any(not str(data.get(key, "")).strip() for key in required):
            raise ValueError("請填寫完整商品資料")
        if data["status"] not in ("available", "reserved", "sold"):
            raise ValueError("商品狀態不正確")
        price = int(data["price"])
        if price < 0:
            raise ValueError("價格不可小於 0")
        return {
            "name": str(data["name"]).strip(),
            "category": str(data["category"]).strip(),
            "status": data["status"],
            "price": price,
            "condition": str(data["condition"]).strip(),
            "image": str(data["image"]).strip(),
        }

    def handle_create_item(self):
        try:
            item = self.validate_item(self.read_json())
        except (ValueError, json.JSONDecodeError) as error:
            self.error_response(str(error))
            return

        item_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).date().isoformat()
        with db() as conn:
            conn.execute(
                """
                INSERT INTO items (id, name, category, status, price, condition, image_url, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (item_id, item["name"], item["category"], item["status"], item["price"], item["condition"], item["image"], created_at),
            )
        self.json_response({"id": item_id, "createdAt": created_at}, 201)

    def handle_update_item(self, item_id):
        try:
            item = self.validate_item(self.read_json())
        except (ValueError, json.JSONDecodeError) as error:
            self.error_response(str(error))
            return

        with db() as conn:
            cursor = conn.execute(
                """
                UPDATE items
                SET name = ?, category = ?, status = ?, price = ?, condition = ?, image_url = ?
                WHERE id = ?
                """,
                (item["name"], item["category"], item["status"], item["price"], item["condition"], item["image"], item_id),
            )
        if cursor.rowcount == 0:
            self.not_found()
            return
        self.json_response({"ok": True})

    def handle_delete_item(self, item_id):
        with db() as conn:
            cursor = conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
        if cursor.rowcount == 0:
            self.not_found()
            return
        self.json_response({"ok": True})

    def handle_login(self):
        try:
            data = self.read_json()
        except json.JSONDecodeError:
            self.error_response("登入資料格式錯誤")
            return

        if not username_matches(data.get("username")) or not password_matches(data.get("password", "")):
            self.error_response("帳號或密碼錯誤", 401)
            return

        session_id = secrets.token_urlsafe(32)
        SESSIONS[session_id] = {"username": ADMIN_USER}
        header = f"{SESSION_COOKIE}={session_id}; Path=/; HttpOnly; SameSite=Lax"
        self.json_response({"authenticated": True}, headers={"Set-Cookie": header})

    def handle_logout(self):
        session_id = self.get_session_id()
        if session_id in SESSIONS:
            del SESSIONS[session_id]
        header = f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
        self.json_response({"authenticated": False}, headers={"Set-Cookie": header})

    def handle_upload(self):
        content_type = self.headers.get("Content-Type", "")
        boundary_marker = "boundary="
        if "multipart/form-data" not in content_type or boundary_marker not in content_type:
            self.error_response("上傳格式錯誤")
            return

        boundary = content_type.split(boundary_marker, 1)[1].strip().strip('"')
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        file_part = self.extract_upload_part(body, boundary)
        if file_part is None:
            self.error_response("請選擇圖片")
            return

        filename, file_bytes = file_part
        ext = Path(filename).suffix.lower()
        if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
            self.error_response("圖片格式僅支援 jpg、png、webp、gif")
            return

        filename = f"{uuid.uuid4().hex}{ext}"
        target = UPLOAD_DIR / filename
        with target.open("wb") as output:
            output.write(file_bytes)
        self.json_response({"url": f"/uploads/{filename}"}, 201)

    def extract_upload_part(self, body, boundary):
        marker = f"--{boundary}".encode("utf-8")
        for raw_part in body.split(marker):
            part = raw_part.strip(b"\r\n")
            if not part or part == b"--" or b"\r\n\r\n" not in part:
                continue

            header_bytes, file_bytes = part.split(b"\r\n\r\n", 1)
            headers = header_bytes.decode("utf-8", errors="ignore")
            if 'name="image"' not in headers or 'filename="' not in headers:
                continue

            filename = headers.split('filename="', 1)[1].split('"', 1)[0]
            return filename, file_bytes.rstrip(b"\r\n")
        return None


def main():
    init_database()
    default_host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    host = os.environ.get("HOST", default_host).strip()
    if host not in ("127.0.0.1", "0.0.0.0", "localhost"):
        host = "0.0.0.0"
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), InventoryHandler)
    print(f"現貨庫存網站已啟動：http://{host}:{port}")
    print(f"後台帳號：{ADMIN_USER}；預設密碼：{ADMIN_PASSWORD}")
    server.serve_forever()


if __name__ == "__main__":
    main()
