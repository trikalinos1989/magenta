"""
FONI MOU local AI — FastAPI on 127.0.0.1:8765

Endpoints:
  GET  /health
  POST /stems     multipart "audio"  → vocals + instrumental (Demucs CPU)
  POST /convert   multipart source_vocal, reference_audio, optional pitch

Imports cleanly even before models are downloaded (heavy work is lazy).
"""

from __future__ import annotations

import asyncio
import base64
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import vc

app = FastAPI(
    title="FONI MOU Local AI",
    version="0.1.0",
    description="CPU-first local Demucs + Seed-VC (or MVP) voice conversion for FONI MOU",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT = Path(__file__).resolve().parent
JOBS = ROOT / "jobs"
JOBS.mkdir(parents=True, exist_ok=True)


def _file_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


@app.get("/health")
def health():
    device = vc.detect_device()
    seedvc = vc.seedvc_ready()
    if seedvc:
        vc_mode = "seed-vc"
        quality_note = (
            "Demucs stems are real (CPU). Voice convert uses Seed-VC when ready "
            "(neural VC; very slow on CPU/AMD, no CUDA). "
            "FONI_VC_BACKEND=auto|seedvc|mvp. AMD RX 7900 XT: no CUDA."
        )
    else:
        vc_mode = "mvp-pitch"
        quality_note = (
            "Demucs stems are real (CPU). Voice convert is MVP pitch+envelope "
            "(Seed-VC not detected under ./seed-vc). "
            "Clone Plachtaa/seed-vc into local-ai/seed-vc and create .venv. "
            "AMD RX 7900 XT: no CUDA."
        )
    return {
        "ok": True,
        "device": device,
        "demucs_ready": vc.demucs_ready(),
        "vc_ready": vc.vc_ready(),
        "seedvc_ready": seedvc,
        "vc_mode": vc_mode,
        "seed_vc_root": str(vc.seedvc_root()),
        "quality_note": quality_note,
    }


@app.post("/stems")
async def stems(audio: UploadFile = File(...)):
    """
    Separate vocals / instrumental with Demucs htdemucs (two-stems style).
    First run downloads model weights (~80MB–300MB depending on model).
    Returns JSON with base64 WAV payloads + paths under local-ai/jobs/.
    """
    if not vc.demucs_ready():
        raise HTTPException(
            status_code=503,
            detail="demucs δεν είναι εγκατεστημένο. pip install -r requirements.txt",
        )

    job_id = uuid.uuid4().hex[:12]
    job_dir = JOBS / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(audio.filename or "audio.wav").suffix or ".wav"
    in_path = job_dir / f"input{suffix}"
    try:
        data = await audio.read()
        if not data:
            raise HTTPException(status_code=400, detail="Κενό αρχείο ήχου.")
        in_path.write_bytes(data)

        result = await asyncio.to_thread(vc.separate_stems_demucs, in_path, job_dir)
        vocals_path = Path(result["vocals_path"])
        instrumental_path = Path(result["instrumental_path"])

        return JSONResponse(
            {
                "ok": True,
                "job_id": job_id,
                "vocals_path": str(vocals_path),
                "instrumental_path": str(instrumental_path),
                "vocals_b64": _file_b64(vocals_path),
                "instrumental_b64": _file_b64(instrumental_path),
                "format": "wav",
                "sample_rate": result.get("sample_rate"),
                "mode": result.get("mode"),
                "device": result.get("device"),
                "model": result.get("model"),
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Demucs απέτυχε: {e}") from e


@app.post("/convert")
async def convert(
    source_vocal: UploadFile = File(...),
    reference_audio: UploadFile = File(...),
    pitch: Optional[float] = Form(0),
):
    """
    Local voice conversion (MVP on CPU by default).
    Returns converted WAV as base64 + path.
    """
    if not vc.vc_ready():
        raise HTTPException(
            status_code=503,
            detail="VC deps λείπουν (librosa/soundfile). pip install -r requirements.txt",
        )

    job_id = uuid.uuid4().hex[:12]
    job_dir = JOBS / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    src_path = job_dir / "source_vocal.wav"
    ref_path = job_dir / "reference.wav"
    out_path = job_dir / "converted_vocal.wav"

    try:
        src_bytes = await source_vocal.read()
        ref_bytes = await reference_audio.read()
        if not src_bytes or not ref_bytes:
            raise HTTPException(status_code=400, detail="Κενά αρχεία εισόδου.")
        src_path.write_bytes(src_bytes)
        ref_path.write_bytes(ref_bytes)

        pitch_val = float(pitch or 0)
        result = await asyncio.to_thread(
            vc.convert,
            src_path,
            ref_path,
            out_path,
            pitch_val,
        )
        converted = Path(result["path"])
        return JSONResponse(
            {
                "ok": True,
                "job_id": job_id,
                "converted_path": str(converted),
                "converted_b64": _file_b64(converted),
                "format": "wav",
                "sample_rate": result.get("sample_rate"),
                "mode": result.get("mode"),
                "device": result.get("device"),
                "provider": (
                    "local-seedvc"
                    if str(result.get("mode") or "").startswith("seed")
                    else "local-mvp"
                ),
                "quality_note": result.get("quality_note"),
                "pitch_semitones": pitch_val,
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Convert απέτυχε: {e}") from e


@app.on_event("startup")
def _startup():
    vc.ensure_models_dir()
    # Lightweight stub marker only — no huge downloads on boot.
    try:
        vc.ensure_open_vc_stub()
    except Exception:
        pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8765, reload=False)
