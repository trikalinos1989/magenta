# FONI MOU Local AI · Τοπική AI υπηρεσία

**EL:** Τοπικό FastAPI backend (CPU / AMD) αντί για Replicate cloud.  
**EN:** Local FastAPI backend (CPU / AMD) replacing Replicate cloud calls.

Listens on **`http://127.0.0.1:8765`** only (loopback).

---

## English

### Hardware expectations (MYDEVICE)

| Component | Notes |
|-----------|--------|
| CPU | AMD Ryzen 5 5600X — Demucs works, but slowly |
| RAM | 16 GB — keep other apps light during stem split |
| GPU | AMD Radeon RX 7900 XT — **no CUDA**. Default = CPU torch. Optional later: `torch-directml` |
| Disk | First Demucs run downloads ~80–300 MB weights into the demucs cache |

**Do not install CUDA builds of PyTorch** on this machine.

### Windows first run

```bat
cd local-ai
start.bat
```

Or manually:

```bat
cd local-ai
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install --upgrade pip
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8765
```

Then in another terminal (repo root):

```bat
npm run dev
```

Or combined helper from package.json:

```bat
npm run dev:local
```

(starts local AI in background then Next.js — see scripts).

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | `{ ok, device, demucs_ready, vc_ready }` |
| POST | `/stems` | multipart field `audio` → vocals + instrumental (base64 WAV) |
| POST | `/convert` | `source_vocal`, `reference_audio`, optional `pitch` → converted WAV |

### Voice conversion quality (honest)

- **Stems (Demucs):** real neural separation on CPU.
- **Convert (default):** MVP labeled `mvp-pitch` — librosa pitch shift + light spectral envelope from your reference. **Not** FreeVC / Seed-VC / RVC quality.
- Full Seed-VC is optional and heavy; prefers NVIDIA. Not required for this MVP.
- We never invent fake “success” audio without running the pipeline.

### Ports

| Service | Default |
|---------|---------|
| Local AI | `127.0.0.1:8765` |
| Next.js | `http://localhost:3000` |

Env for Next.js (`.env.local`):

```
LOCAL_AI_URL=http://127.0.0.1:8765
AI_PROVIDER=local
# AI_PROVIDER=replicate  # force cloud
# AI_PROVIDER=auto       # local if /health ok, else replicate
```

---

## Ελληνικά

### Υλικό (MYDEVICE)

- Ryzen 5 5600X + 16GB RAM — δουλεύει σε **CPU**
- RX 7900 XT — **χωρίς CUDA**. Μην εγκαταστήσετε PyTorch CUDA.
- Πρώτη εκτέλεση Demucs: κατεβάζει βάρη μοντέλου (~80–300MB)

### Εκκίνηση Windows

1. Διπλό κλικ / τρέξτε `local-ai\start.bat`
2. Σε άλλο παράθυρο: `npm run dev` από τη ρίζα του project
3. Άνοιγμα http://localhost:3000 → Ρυθμίσεις: κατάσταση Local AI

### Ποιότητα

- Ο διαχωρισμός φωνής/οργανικού (Demucs) είναι **πραγματικός**.
- Η τοπική μετατροπή φωνής είναι **MVP** (pitch + ελαφρύ envelope) — όχι ποιότητα RVC/FreeVC.
- Χωρίς μοντέλα / χωρίς server → καθαρό σφάλμα, **όχι** ψεύτικα αρχεία ήχου.

### Αντιμετώπιση προβλημάτων

- `demucs_ready: false` → `pip install -r requirements.txt` μέσα στο `.venv`
- Πολύ αργό στο CPU → φυσιολογικό για τραγούδια >3 λεπτά· δοκιμάστε μικρότερο απόσπασμα
- Port 8765 κατειλημμένο → κλείστε άλλη διαδικασία ή αλλάξτε port + `LOCAL_AI_URL`
