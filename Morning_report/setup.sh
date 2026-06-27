#!/bin/bash
# =====================================================
#  morning_report セットアップスクリプト
#  実行方法: bash setup.sh
# =====================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.yuichiromori.morningreport"
PLIST_SRC="$SCRIPT_DIR/$PLIST_NAME.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo "======================================"
echo " 毎朝の市場レポート　セットアップ"
echo "======================================"
echo ""

# 1. Python パッケージのインストール
echo "【ステップ1】依存パッケージをインストール中..."
pip3 install yfinance matplotlib pytz numpy --quiet
echo "  ✅ インストール完了"
echo ""

# 2. config.json の設定確認
echo "【ステップ2】Gmail App Password の設定"
echo ""
echo "  以下の手順で App Password を取得してください："
echo "  ① https://myaccount.google.com/security を開く"
echo "  ② 「2段階認証プロセス」を有効にする（未設定の場合）"
echo "  ③ 「アプリ パスワード」→「アプリを選択: その他」"
echo "  ④ 名前に「市場レポート」と入力 → 「生成」"
echo "  ⑤ 表示された 16文字のパスワードをコピー"
echo ""
echo "  設定ファイルを開いて YOUR_GMAIL と xxxx を書き換えてください："
echo "  → $SCRIPT_DIR/config.json"
echo ""
read -p "  config.json の設定が完了したら Enter を押してください..."
echo ""

# 3. テスト送信
echo "【ステップ3】テスト送信を実行します..."
PYTHON=""
for py in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
    if [ -x "$py" ]; then PYTHON="$py"; break; fi
done

if [ -z "$PYTHON" ]; then
    echo "  ❌ python3 が見つかりません"
    exit 1
fi

"$PYTHON" "$SCRIPT_DIR/morning_report.py"
if [ $? -eq 0 ]; then
    echo "  ✅ テスト送信成功！メールを確認してください"
else
    echo "  ❌ テスト送信に失敗しました。config.json を確認してください"
    exit 1
fi
echo ""

# 4. LaunchAgent の登録（毎朝7時自動実行）
echo "【ステップ4】LaunchAgent を登録（毎朝7時自動実行）..."
chmod +x "$SCRIPT_DIR/run.sh"

mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DST"

# 既存のエージェントをアンロード（エラーは無視）
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load -w "$PLIST_DST"

echo "  ✅ LaunchAgent 登録完了"
echo ""
echo "======================================"
echo " セットアップ完了！"
echo " 毎朝 7:00 に自動でレポートが届きます"
echo "======================================"
echo ""
echo "  停止方法: launchctl unload $PLIST_DST"
echo "  再開方法: launchctl load -w $PLIST_DST"
echo "  手動実行: python3 $SCRIPT_DIR/morning_report.py"
echo ""
