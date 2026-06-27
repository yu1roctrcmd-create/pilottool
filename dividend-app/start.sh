#!/bin/bash
# 配当管理アプリ起動スクリプト

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🐷 配当管理アプリを起動します..."

# バックエンド起動
echo "📡 バックエンド起動中 (port 3001)..."
cd "$SCRIPT_DIR/backend"
node server.js &
BACKEND_PID=$!

sleep 2

# フロントエンド起動
echo "🖥  フロントエンド起動中 (port 5173)..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ 起動完了！"
echo "   → http://localhost:5173 をブラウザで開いてください"
echo ""
echo "終了するには Ctrl+C を押してください"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '停止しました'" EXIT
wait
