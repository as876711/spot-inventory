# 現貨庫存網站

這是可部署到 Render 的後台版，包含 SQLite 商品資料庫、登入後台、圖片上傳，以及所有訪客共用同一份商品庫存。

## 本機啟動

```powershell
cd C:\Users\郭育佑\Documents\Codex\2026-06-06\new-chat-3\outputs\現貨庫存-app
C:\Users\郭育佑\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe server.py
```

打開：

```text
http://127.0.0.1:8000
```

預設後台：

```text
帳號：admin
密碼：admin123
```

## Render 部署

建議使用 `render.yaml` 建立 Blueprint。Render 會建立一個 Python Web Service 和一顆 1GB persistent disk。

Render 需要填或確認：

```text
Service name: spot-inventory
Runtime: Python
Build command: pip install -r requirements.txt
Start command: python server.py
Plan: Starter
Disk name: inventory-data
Disk mount path: /var/data
Disk size: 1GB
```

Environment variables：

```text
HOST=0.0.0.0
DATA_ROOT=/var/data
ADMIN_USER=admin
ADMIN_PASSWORD=請換成你的正式強密碼
```

Render 會自動提供 `PORT`，不用自己填。

## 重要檔案

```text
server.py                 後端、API、登入、上傳、SQLite
public/index.html         前台與後台頁面
public/app.js             前台互動與 API 串接
public/styles.css         網站樣式
render.yaml               Render Blueprint
requirements.txt          Python 依賴，目前無第三方套件
```

## 資料保存

本機預設：

```text
data/inventory.sqlite
uploads/
```

Render 上會存到 persistent disk：

```text
/var/data/data/inventory.sqlite
/var/data/uploads/
```

正式上線前請把 `public/app.js` 裡的 `lineUrl` 改成你的 LINE 連結，並定期備份 SQLite 和 uploads。
