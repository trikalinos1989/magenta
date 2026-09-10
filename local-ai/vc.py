"""
FONI MOU — local voice conversion (CPU / AMD-friendly)

Backends (FONI_VC_BACKEND):
  auto   — try Seed-VC if installed beside this file (./seed-vc + .venv), else MVP
  seedvc — require Seed-VC; raise a clear Greek error if missing/fails
  mvp    — force MVP pitch+envelope path

Seed-VC layout (Windows PC example):
  local-ai/seed-vc/          (clone of Plachtaa/seed-vc)
  local-ai/seed-vc/.venv/    (its own venv)
  Override with SEED_VC_ROOT.

HONEST QUALITY NOTE
-------------------
True zero-shot singing VC (Seed-VC) needs large checkpoints and prefers CUDA.
This PC has an AMD Radeon RX 7900 XT (no CUDA). Seed-VC on CPU is real but VERY slow.
MVP path (mode="mvp-pitch") is pitch + light spectral envelope — not neural VC.

Demucs stem separation uses the Separator API (demucs 4.x) — unchanged.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import urllib.request
from pathlib import Path
from typing import Any, Optional

import numpy as np

# Lazy-ish: soundfile/librosa imported at module level — required for MVP.
# demucs / Seed-VC / heavy torch models are NOT imported here so `import vc` stays light.
import soundfile as sf

ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
JOBS_DIR = ROOT / "jobs"

# Placeholder URL for a future small open checkpoint (not auto-used as fake VC).
OPEN_VC_CHECKPOINT_STUB_URL: Optional[str] = None
OPEN_VC_CHECKPOINT_NAME = "open_vc_stub.txt"

# Seed-VC defaults (singing-oriented)
SEEDVC_DIFFUSION_STEPS = int(os.environ.get("SEED_VC_DIFFUSION_STEPS") or "25")
SEEDVC_TIMEOUT_SEC = int(os.environ.get("SEED_VC_TIMEOUT_SEC") or "7200")  # CPU can be hours


def detect_device() -> str:
    """Return a human-readable device string. Never assumes CUDA."""
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        # Optional DirectML for AMD Windows (torch-directml) — if present later.
        try:
            import torch_directml  # type: ignore

            return "directml"
        except Exception:
            pass
        return "cpu"
    except Exception:
        return "cpu"


def vc_ready() -> bool:
    """MVP path is ready if librosa + soundfile + numpy work."""
    try:
        import librosa  # noqa: F401

        return True
    except Exception:
        return False


def demucs_ready() -> bool:
    try:
        import demucs  # noqa: F401

        return True
    except Exception:
        return False


def seedvc_root() -> Path:
    """SEED_VC_ROOT env, else ./seed-vc beside this file."""
    env = (os.environ.get("SEED_VC_ROOT") or "").strip()
    if env:
        return Path(env).expanduser().resolve()
    return (ROOT / "seed-vc").resolve()


def seedvc_python(seed_root: Optional[Path] = None) -> Path:
    """
    Prefer the Seed-VC venv interpreter:
      Windows: SEED_VC_ROOT/.venv/Scripts/python.exe
      Unix:    SEED_VC_ROOT/.venv/bin/python
    """
    root = seed_root or seedvc_root()
    win = root / ".venv" / "Scripts" / "python.exe"
    unix = root / ".venv" / "bin" / "python"
    if win.is_file():
        return win
    if unix.is_file():
        return unix
    # Some unix venvs use python3 only
    unix3 = root / ".venv" / "bin" / "python3"
    if unix3.is_file():
        return unix3
    raise RuntimeError(
        f"Δεν βρέθηκε python στο Seed-VC venv υπό {root / '.venv'} "
        "(αναμένεται Scripts/python.exe ή bin/python)."
    )


def seedvc_ready() -> bool:
    """True when seed-vc checkout + venv + inference.py are present."""
    root = seedvc_root()
    if not root.is_dir():
        return False
    if not (root / "inference.py").is_file():
        return False
    try:
        seedvc_python(root)
        return True
    except Exception:
        return False


def ensure_models_dir() -> Path:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    return MODELS_DIR


def ensure_open_vc_stub() -> dict[str, Any]:
    """
    Stub: documents where a future open VC checkpoint would live.
    Does NOT download huge weights or invent fake conversion success.
    """
    ensure_models_dir()
    marker = MODELS_DIR / OPEN_VC_CHECKPOINT_NAME
    info: dict[str, Any] = {
        "path": str(marker),
        "downloaded": False,
        "note": (
            "Prefer Seed-VC under ./seed-vc (see README). "
            "MVP convert uses pitch + light envelope when Seed-VC is absent. "
            "Clone: https://github.com/Plachtaa/seed-vc"
        ),
    }
    if marker.exists():
        info["downloaded"] = True
        return info
    if OPEN_VC_CHECKPOINT_STUB_URL:
        try:
            urllib.request.urlretrieve(OPEN_VC_CHECKPOINT_STUB_URL, marker)
            info["downloaded"] = True
        except Exception as e:
            info["error"] = str(e)
    else:
        marker.write_text(
            "FONI MOU VC stub — prefer Seed-VC at ../seed-vc (or SEED_VC_ROOT).\n"
            "FONI_VC_BACKEND=auto tries Seed-VC first, then MVP.\n"
            "FONI_VC_BACKEND=seedvc requires Seed-VC.\n",
            encoding="utf-8",
        )
        info["downloaded"] = True
        info["stub_only"] = True
    return info


def _load_mono(path: str | Path, target_sr: int = 44100) -> tuple[np.ndarray, int]:
    import librosa

    y, sr = librosa.load(str(path), sr=target_sr, mono=True)
    return y.astype(np.float32), sr


def _spectral_envelope_hint(
    source: np.ndarray, reference: np.ndarray, sr: int, blend: float = 0.35
) -> np.ndarray:
    """
    Very light STFT magnitude blend toward the reference average spectrum.
    This is a TIMBRE HINT only — not neural voice conversion.
    """
    import librosa

    n_fft = 2048
    hop = 512
    S = librosa.stft(source, n_fft=n_fft, hop_length=hop)
    mag, phase = np.abs(S), np.angle(S)
    R = np.abs(librosa.stft(reference, n_fft=n_fft, hop_length=hop))
    ref_env = np.mean(R, axis=1, keepdims=True) + 1e-8
    src_env = np.mean(mag, axis=1, keepdims=True) + 1e-8
    ratio = (ref_env / src_env) ** blend
    mag2 = mag * ratio
    out = librosa.istft(mag2 * np.exp(1j * phase), hop_length=hop, length=len(source))
    peak = np.max(np.abs(out)) + 1e-8
    if peak > 0.99:
        out = out * (0.99 / peak)
    return out.astype(np.float32)


def convert_mvp(
    source_path: str | Path,
    reference_path: str | Path,
    out_path: str | Path,
    pitch_semitones: float = 0.0,
) -> dict[str, Any]:
    """
    CPU MVP voice conversion path.
    Real audio I/O + pitch + light envelope — clearly not Seed-VC/RVC quality.
    """
    import librosa

    ensure_models_dir()
    ensure_open_vc_stub()

    src, sr = _load_mono(source_path)
    ref, _ = _load_mono(reference_path, target_sr=sr)

    if abs(pitch_semitones) > 0.01:
        src = librosa.effects.pitch_shift(
            y=src, sr=sr, n_steps=float(pitch_semitones)
        ).astype(np.float32)

    max_ref = sr * 30
    if len(ref) > max_ref:
        ref = ref[:max_ref]

    converted = _spectral_envelope_hint(src, ref, sr, blend=0.35)

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out_path), converted, sr, subtype="PCM_16")

    return {
        "path": str(out_path),
        "sample_rate": sr,
        "mode": "mvp-pitch",
        "device": detect_device(),
        "pitch_semitones": pitch_semitones,
        "quality_note": (
            "MVP local convert (CPU): pitch shift + light spectral envelope from reference. "
            "NOT Seed-VC / FreeVC / RVC quality. Stems from Demucs are real; "
            "identity transfer is approximate until Seed-VC is installed under ./seed-vc."
        ),
    }


def convert(
    source_path: str | Path,
    reference_path: str | Path,
    out_path: str | Path,
    pitch_semitones: float = 0.0,
) -> dict[str, Any]:
    """
    Entry point.

    FONI_VC_BACKEND:
      auto   (default) — Seed-VC if ready, else MVP
      seedvc / seed-vc — Seed-VC only; Greek error on failure
      mvp              — force MVP
    """
    backend = (os.environ.get("FONI_VC_BACKEND") or "auto").strip().lower()

    if backend in ("mvp", "mvp-pitch"):
        return convert_mvp(source_path, reference_path, out_path, pitch_semitones)

    if backend in ("seedvc", "seed-vc", "auto"):
        try:
            return _try_seedvc(source_path, reference_path, out_path, pitch_semitones)
        except Exception as e:
            if backend in ("seedvc", "seed-vc"):
                raise RuntimeError(
                    "Το Seed-VC απέτυχε ή δεν είναι έτοιμο. "
                    "Βεβαιωθείτε ότι υπάρχει ο φάκελος seed-vc δίπλα στο vc.py "
                    "(ή SEED_VC_ROOT), με .venv και inference.py. "
                    f"Λεπτομέρειες: {e}"
                ) from e
            # auto → fall through to MVP
            pass

    return convert_mvp(source_path, reference_path, out_path, pitch_semitones)


def _find_newest_wav(outdir: Path, after_mtime: float) -> Optional[Path]:
    """Pick the newest .wav written at/after after_mtime (Seed-VC names vary)."""
    candidates = list(outdir.glob("*.wav")) + list(outdir.glob("**/*.wav"))
    # Prefer files created/updated during this run
    fresh = [p for p in candidates if p.is_file() and p.stat().st_mtime >= after_mtime - 1.0]
    pool = fresh or [p for p in candidates if p.is_file()]
    if not pool:
        return None
    return max(pool, key=lambda p: p.stat().st_mtime)


def _try_seedvc(
    source_path: str | Path,
    reference_path: str | Path,
    out_path: str | Path,
    pitch_semitones: float,
) -> dict[str, Any]:
    """
    Run Plachtaa/seed-vc inference.py via its own venv (subprocess).
    Does NOT fake success — requires a real wav written under --output.
    """
    import time

    root = seedvc_root()
    if not root.is_dir():
        raise RuntimeError(f"SEED_VC_ROOT / ./seed-vc λείπει: {root}")

    inference = root / "inference.py"
    if not inference.is_file():
        raise RuntimeError(f"Λείπει το inference.py στο {root}")

    py = seedvc_python(root)

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Seed-VC --output is a DIRECTORY (not a file path)
    outdir = out_path.parent / f"seedvc_out_{out_path.stem}"
    if outdir.exists():
        shutil.rmtree(outdir, ignore_errors=True)
    outdir.mkdir(parents=True, exist_ok=True)

    src = Path(source_path).resolve()
    ref = Path(reference_path).resolve()
    if not src.is_file():
        raise RuntimeError(f"Source λείπει: {src}")
    if not ref.is_file():
        raise RuntimeError(f"Reference λείπει: {ref}")

    semi = int(round(float(pitch_semitones)))
    # Singing: f0-condition True. CPU: fp16 False (CUDA fp16 often breaks on CPU).
    device = detect_device()
    use_fp16 = device == "cuda"

    # Prefer Seed-VC inference.py CLI (see Plachtaa/seed-vc README).
    # Optional helper: local-ai/run_seedvc_infer.py for manual/CLI quirks.
    cmd = [
        str(py),
        str(inference.name),  # run relative to cwd=SEED_VC_ROOT
        "--source",
        str(src),
        "--target",
        str(ref),
        "--output",
        str(outdir.resolve()),
        "--diffusion-steps",
        str(SEEDVC_DIFFUSION_STEPS),
        "--f0-condition",
        "True",
        "--semi-tone-shift",
        str(semi),
        "--fp16",
        "True" if use_fp16 else "False",
    ]

    t0 = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=SEEDVC_TIMEOUT_SEC,
            env=os.environ.copy(),
        )
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(
            f"Seed-VC timeout μετά από {SEEDVC_TIMEOUT_SEC}s (CPU είναι πολύ αργό). "
            f"stdout={((e.stdout or '')[-500:])!r}"
        ) from e

    stdout_tail = (proc.stdout or "")[-4000:]
    stderr_tail = (proc.stderr or "")[-4000:]

    if proc.returncode != 0:
        raise RuntimeError(
            f"Seed-VC exit {proc.returncode}. stderr:\n{stderr_tail}\nstdout:\n{stdout_tail}"
        )

    produced = _find_newest_wav(outdir, after_mtime=t0)
    if produced is None:
        raise RuntimeError(
            "Το Seed-VC τελείωσε χωρίς αρχείο .wav στο output. "
            f"stderr:\n{stderr_tail}\nstdout:\n{stdout_tail}"
        )

    shutil.copy2(produced, out_path)

    # Best-effort sample rate
    sample_rate: Optional[int] = None
    try:
        info = sf.info(str(out_path))
        sample_rate = int(info.samplerate)
    except Exception:
        sample_rate = None

    return {
        "path": str(out_path),
        "sample_rate": sample_rate,
        "mode": "seed-vc",
        "device": device,
        "pitch_semitones": pitch_semitones,
        "seed_vc_root": str(root),
        "seed_vc_wav": str(produced),
        "diffusion_steps": SEEDVC_DIFFUSION_STEPS,
        "stdout_tail": stdout_tail,
        "stderr_tail": stderr_tail,
        "quality_note": (
            "Seed-VC (Plachtaa) neural voice conversion with f0-condition for singing. "
            "On CPU / AMD (no CUDA) this is REAL but VERY slow — minutes per clip is normal. "
            "First run downloads HuggingFace checkpoints into seed-vc/checkpoints. "
            "Not real-time. Demucs stems remain separate."
        ),
    }


def separate_stems_demucs(
    audio_path: str | Path,
    out_dir: str | Path,
    model_name: str = "htdemucs",
) -> dict[str, Any]:
    """
    Real Demucs two-stems (vocals / instrumental) on CPU (or CUDA if present).
    Uses demucs 4.x Separator API (load_track was removed).
    Downloads pretrained weights on first run.
    """
    from demucs.audio import save_audio
    from demucs.separate import Separator

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    device_str = detect_device()
    # AMD / no CUDA → force cpu (DirectML not wired into Demucs yet)
    device = "cuda" if device_str == "cuda" else "cpu"

    separator = Separator(
        model=model_name,
        device=device,
        shifts=1,
        overlap=0.25,
        split=True,
        progress=False,
    )

    _orig, stems = separator.separate_audio_file(Path(audio_path))
    # stems: dict[str, Tensor] e.g. drums/bass/other/vocals

    if "vocals" not in stems:
        raise RuntimeError(f"Demucs stems missing vocals: {list(stems.keys())}")

    vocals = stems["vocals"]
    instrumental = sum(wav for name, wav in stems.items() if name != "vocals")

    vocals_path = out_dir / "vocals.wav"
    instrumental_path = out_dir / "instrumental.wav"
    sr = separator.samplerate
    save_audio(vocals.cpu(), str(vocals_path), sr)
    save_audio(instrumental.cpu(), str(instrumental_path), sr)

    return {
        "vocals_path": str(vocals_path),
        "instrumental_path": str(instrumental_path),
        "sample_rate": sr,
        "model": model_name,
        "device": device_str,
        "mode": "demucs-two-stems",
        "stem_names": list(stems.keys()),
    }
