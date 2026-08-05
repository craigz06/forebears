#!/bin/bash
# Double-click launcher: starts the local server this project needs
# (view/*.html pages fetch() JSON and fail under file://) and opens the
# browser to the landing page. Closing this Terminal window stops the
# server.
cd "$(dirname "$0")"
python3 -m http.server 8765 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null" EXIT
sleep 1
open http://localhost:8765/index.html
wait $SERVER_PID
