#!/bin/sh
# LAO War Genesis: starts a local web server in this folder and opens the game (macOS / Linux).
# Run: sh start_game.sh   (Ctrl+C stops the server)
cd "$(dirname "$0")" || exit 1
PORT=8790
URL="http://localhost:$PORT/"
PY=$(command -v python3 || command -v python)
if [ -z "$PY" ]; then echo "Python 3 was not found."; exit 1; fi
( sleep 1; if command -v open >/dev/null; then open "$URL"; elif command -v xdg-open >/dev/null; then xdg-open "$URL"; fi ) &
echo "LAO War Genesis - $URL  (Ctrl+C to stop)"
exec "$PY" -m http.server "$PORT" --bind 127.0.0.1
