#!/bin/bash
# BEAM Light Wallet - Windows Launcher (for WSL/Git Bash)
# Developed by @vsnation
#
# For native Windows: use build/windows/install.bat
# This script is for WSL or Git Bash environments on Windows

cd "$(dirname "$0")"

if command -v cmd.exe &>/dev/null; then
    cmd.exe /c "build\\windows\\install.bat"
elif [ -f "build/windows/install.bat" ]; then
    echo "Please run build/windows/install.bat from Windows Command Prompt or PowerShell"
    echo "Or use start.sh if running in WSL with Python3 available"
else
    exec ./start.sh "$@"
fi
