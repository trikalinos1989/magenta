"""
FONI MOU — local voice conversion (CPU / AMD-friendly MVP)

HONEST QUALITY NOTE
-------------------
True zero-shot singing VC (Seed-VC / RVC) needs large checkpoints and prefers
CUDA GPUs. This PC has an AMD Radeon RX 7900 XT (no CUDA). DirectML is optional
later; the default path is **CPU torch**.

What this module does today (labeled in API as mode="mvp-pitch"):
  1. Load source vocal + reference audio
  2. Optional pitch shift (semitones) via librosa
  3. Light spectral-envelope hint from the reference (NOT RVC / FreeVC quality)
  4. Write WAV

What it does NOT claim:
  - Full speaker identity transfer like Seed-VC / FreeVC / trained RVC
  - Real-time performance on CPU

Optional upgrade path:
  - Place Seed-VC or RVC weights under ./models/ and set FONI_VC_BACKEND=seedvc
    once you install those deps. Until then, convert() stays on the MVP path.
"""

from __future__ import annotations

import os
import urllib.request
from pathlib import Path
from typing import Any, Optional

import numpy as np

# Lazy-ish: soundfile/librosa imported at module level — required for MVP.
# demucs / heavy torch models are NOT imported here so `import vc` stays light.
import soundfile as sf

ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
JOBS_DIR = ROOT / "jobs"

# Placeholder URL for a future small open checkpoint (not auto-used as fake VC).
# When a real small CPU-friendly checkpoint is chosen, point this at it.
OPEN_VC_CHECKPOINT_STUB_URL: Optional[str] = None
OPEN_VC_CHECKPOINT_NAME = "open_vc_stub.txt"


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


def ensure_models_dir() -> Path:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    return MODELS_DIR


def ensure_open_vc_stub() -> dict[str, Any]:
    """
    Stub: documents where a future open VC checkpoint would live.
    Does NOT download huge weights or invent fake conversion success.
    If OPEN_VC_CHECKPOINT_STUB_URL is set, downloads a tiny marker file.
    """
    ensure_models_dir()
    marker = MODELS_DIR / OPEN_VC_CHECKPOINT_NAME
    info: dict[str, Any] = {
        "path": str(marker),
        "downloaded": False,
        "note": (
            "No full RVC/Seed-VC weights bundled. "
            "MVP convert uses pitch + light envelope transfer on CPU. "
            "For Seed-VC: clone https://github.com/Plachtaa/seed-vc and install separately."
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
            "FONI MOU VC stub — place Seed-VC / RVC checkpoints in this folder.\n"
            "Set FONI_VC_BACKEND=seedvc when those deps are installed.\n",
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
    # Average reference spectrum (mean over time), broadcast
    ref_env = np.mean(R, axis=1, keepdims=True) + 1e-8
    src_env = np.mean(mag, axis=1, keepdims=True) + 1e-8
    # Ratio to nudge source envelope toward reference shape
    ratio = (ref_env / src_env) ** blend
    mag2 = mag * ratio
    # Peak normalize to avoid clipping from envelope boost
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

    # Cap reference used for envelope to ~30s to keep CPU work bounded
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
            "identity transfer is approximate until a neural VC backend is installed."
        ),
    }


def convert(
    source_path: str | Path,
    reference_path: str | Path,
    out_path: str | Path,
    pitch_semitones: float = 0.0,
) -> dict[str, Any]:
    """
    Entry point. Tries optional backends; falls back to MVP.
    Set FONI_VC_BACKEND=mvp to force MVP.
    """
    backend = (os.environ.get("FONI_VC_BACKEND") or "auto").strip().lower()

    if backend in ("seedvc", "seed-vc", "auto"):
        try:
            return _try_seedvc(source_path, reference_path, out_path, pitch_semitones)
        except Exception:
            if backend in ("seedvc", "seed-vc"):
                raise
            # auto → fall through to MVP
            pass

    return convert_mvp(source_path, reference_path, out_path, pitch_semitones)


def _try_seedvc(
    source_path: str | Path,
    reference_path: str | Path,
    out_path: str | Path,
    pitch_semitones: float,
) -> dict[str, Any]:
    """
    Optional Seed-VC hook. Only succeeds if the user installed seed-vc locally
    and exposed an inference entry. Not shipped by default (heavy + GPU-oriented).
    """
    seed_root = os.environ.get("SEED_VC_ROOT")
    if not seed_root or not Path(seed_root).is_dir():
        raise RuntimeError("SEED_VC_ROOT not set or missing")

    # Intentionally minimal: do not silently fake success.
    raise RuntimeError(
        "Seed-VC optional backend not wired in this MVP build. "
        "Use MVP mode or install Seed-VC and extend _try_seedvc."
    )


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
