#!/usr/bin/env python3
"""
Optional thin wrapper around Plachtaa/seed-vc inference.py.

FONI MOU normally calls inference.py directly from vc._try_seedvc.
Use this script for manual runs or if you need a stable arg surface:

  seed-vc/.venv/Scripts/python.exe ..\\run_seedvc_infer.py ^
    --seed-root . --source src.wav --target ref.wav --output .\\out ^
    --f0-condition True --semi-tone-shift 0 --diffusion-steps 25

cwd for inference is always --seed-root (default: ./seed-vc beside this file).
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def _venv_python(seed_root: Path) -> Path:
    win = seed_root / ".venv" / "Scripts" / "python.exe"
    unix = seed_root / ".venv" / "bin" / "python"
    unix3 = seed_root / ".venv" / "bin" / "python3"
    if win.is_file():
        return win
    if unix.is_file():
        return unix
    if unix3.is_file():
        return unix3
    raise SystemExit(f"No seed-vc venv python under {seed_root / '.venv'}")


def main() -> int:
    here = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description="FONI MOU Seed-VC inference wrapper")
    p.add_argument(
        "--seed-root",
        type=str,
        default=str(here / "seed-vc"),
        help="Path to Plachtaa/seed-vc checkout (default: ./seed-vc)",
    )
    p.add_argument("--source", required=True, help="Source vocal WAV")
    p.add_argument("--target", required=True, help="Reference voice WAV")
    p.add_argument("--output", required=True, help="Output DIRECTORY (Seed-VC convention)")
    p.add_argument("--diffusion-steps", type=int, default=25)
    p.add_argument("--f0-condition", type=str, default="True")
    p.add_argument("--semi-tone-shift", type=int, default=0)
    p.add_argument("--fp16", type=str, default="False")
    p.add_argument("--length-adjust", type=float, default=1.0)
    p.add_argument("--inference-cfg-rate", type=float, default=0.7)
    args = p.parse_args()

    seed_root = Path(args.seed_root).expanduser().resolve()
    inference = seed_root / "inference.py"
    if not inference.is_file():
        raise SystemExit(f"Missing inference.py in {seed_root}")

    py = _venv_python(seed_root)
    outdir = Path(args.output).expanduser().resolve()
    outdir.mkdir(parents=True, exist_ok=True)

    cmd = [
        str(py),
        "inference.py",
        "--source",
        str(Path(args.source).resolve()),
        "--target",
        str(Path(args.target).resolve()),
        "--output",
        str(outdir),
        "--diffusion-steps",
        str(args.diffusion_steps),
        "--f0-condition",
        str(args.f0_condition),
        "--semi-tone-shift",
        str(args.semi_tone_shift),
        "--fp16",
        str(args.fp16),
        "--length-adjust",
        str(args.length_adjust),
        "--inference-cfg-rate",
        str(args.inference_cfg_rate),
    ]
    print("Running:", " ".join(cmd), flush=True)
    print("cwd:", seed_root, flush=True)
    proc = subprocess.run(cmd, cwd=str(seed_root))
    return int(proc.returncode)


if __name__ == "__main__":
    sys.exit(main())
