#!/bin/bash
# LaunchAgent から呼ばれる実行ラッパー
# PATH を正しく通す（macOS LaunchAgent はデフォルトの PATH が限定的なため）

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Python 実行ファイルを自動検出（homebrew / system）
PYTHON=""
for py in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
    if [ -x "$py" ]; then
        PYTHON="$py"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "[ERROR] python3 が見つかりません" >&2
    exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 起動: $PYTHON $SCRIPT_DIR/morning_report.py"
"$PYTHON" "$SCRIPT_DIR/morning_report.py"
