@echo off
REM FONI MOU — start local AI on Windows (127.0.0.1:8765)
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [FONI MOU] Creating venv...
  py -3.11 -m venv .venv 2>nul || py -3.10 -m venv .venv 2>nul || python -m venv .venv
  call .venv\Scripts\activate.bat
  echo [FONI MOU] Installing torch CPU wheels...
  pip install --upgrade pip
  pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate.bat
)

echo [FONI MOU] Local AI listening on http://127.0.0.1:8765
echo [FONI MOU] AMD / CPU mode — first Demucs run downloads model weights (~80MB+).
uvicorn server:app --host 127.0.0.1 --port 8765
