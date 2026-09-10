# FONI MOU · Η Φωνή Μου

Voice-conversion cover studio for Greek musicians.

**EL:** Pipeline cover με τοπική AI (CPU/AMD) ή Replicate — όχι Suno / text-to-music.
**EN:** Song → isolate vocals → convert to your cloned voice → remix with instrumental → download. Prefer local FastAPI on Windows.

---

## English

### What it does

1. Upload your voice samples (consent required)
2. Upload a song (or public audio URL)
3. Stem separation with **Demucs** on Replicate
4. Zero-shot voice conversion with **FreeVC** (reference audio)
5. Optional fallback: **zsxkib/realistic-voice-cloning** only if you provide your own custom RVC `.zip` URL
6. Mix + loudness normalize with local **ffmpeg** → WAV + MP3

No auth, payments, or social login in v1. No celebrity voice packs. No YouTube scrape. No dummy audio if `REPLICATE_API_TOKEN` is missing.

### Replicate models chosen

| Step | Model | Notes |
|------|-------|--------|
| Stem split | [`ryan5453/demucs`](https://replicate.com/ryan5453/demucs) | `htdemucs`, WAV out. Version pin with owner/name fallback. |
| Voice conversion (default) | [`jagilley/free-vc`](https://replicate.com/jagilley/free-vc) | Zero-shot: `source_audio` + `reference_audio`. Best public reference-audio VC on Replicate for this MVP. |
| Voice conversion (fallback) | [`zsxkib/realistic-voice-cloning`](https://replicate.com/zsxkib/realistic-voice-cloning) | Only when `customRvcModelUrl` is set (your trained RVC zip). |

Quality for singing depends heavily on **clean, dry vocals**. FreeVC is speech-oriented zero-shot VC — results on singing vary. For stronger singing SVC, train/provide your own RVC model URL.

### Setup (hybrid: local AI preferred)

```bash
cd foni-mou
cp .env.example .env.local
# LOCAL_AI_URL=http://127.0.0.1:8765
# AI_PROVIDER=auto   # local if healthy, else Replicate
# optional cloud: REPLICATE_API_TOKEN=r8_...
npm install

# Terminal A — Local AI (Windows: local-ai\\start.bat)
npm run local-ai

# Terminal B — Next.js
npm run dev:local
```

Open http://localhost:3000 — Settings shows Local AI online/offline.

Requires `ffmpeg` / `ffprobe` on PATH (override with `FFMPEG_PATH` / `FFPROBE_PATH`).
See `local-ai/README.md` for AMD/CPU torch install (no CUDA).

### Scripts

- `npm run dev` — Next.js only
- `npm run local-ai` — FastAPI on 127.0.0.1:8765
- `npm run dev:local` — Next.js with reminder to start Local AI
- `npm run build` — production build
- `npm start` — start production server
- `npm run lint` — ESLint

### Costs & limits (approximate)

- Demucs: ~$0.02–0.05 per run (depends on length / GPU)
- FreeVC: ~$0.04 per run
- Custom RVC cover: ~$0.04+ and several minutes
- Voice samples: 1–8 files, ≤25MB each, ~30–180s total recommended
- Song: ≤40MB or public HTTP(S) URL
- Jobs live in memory (lost on restart); audio under `/tmp/foni-mou` (or `FONI_MOU_DATA_DIR`)

### Honest empty states

Uploading reference samples does **not** train a local model. There is no “training complete” message for reference-only upload.

---

## Ελληνικά

### Τι κάνει

Τραγούδι → απομόνωση φωνής (Demucs) → μετατροπή στη φωνή σας (FreeVC / προαιρετικό RVC) → μίξη με οργανικό (ffmpeg) → λήψη WAV/MP3.

### Ρύθμιση

1. Προτιμώμενα: `local-ai\start.bat` (Windows) — τοπική AI χωρίς cloud
2. `cp .env.example .env.local` → `LOCAL_AI_URL` + `AI_PROVIDER=auto`
3. Προαιρετικά token από https://replicate.com/account/api-tokens για cloud fallback
4. `npm install && npm run dev:local`
5. Χωρίς τοπική AI και χωρίς token — **δεν** παράγονται ψεύτικοι ήχοι

### Συμβουλές ποιότητας

- Ήσυχο δωμάτιο, χωρίς reverb
- Τραγούδι καλύτερο από ομιλία
- Χαμηλές + υψηλές νότες
- 30–180s συνολικά δείγματα
- Καθαρά dry vocals = καλύτερο αποτέλεσμα

### Νομική / ηθική

Κλωνάρετε **μόνο** τη δική σας φωνή ή φωνή με γραπτή άδεια. Η εφαρμογή αποθηκεύει `consentAt` σε κάθε job.

### Γνωστά όρια

- In-memory ουρά (ένα process) — όχι multi-instance production queue
- FreeVC δεν είναι ειδικό singing model· για καλύτερο singing χρησιμοποιήστε δικό σας RVC zip
- Αρχεία στο `/tmp` μπορεί να καθαριστούν από το OS
- Δεν υπάρχει λογαριασμός χρήστη / πληρωμές στο v1
