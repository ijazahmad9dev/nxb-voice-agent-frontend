# NXB Voice Agent

A LiveKit-based voice agent for Nextbridge (NXB) with a web frontend. The agent
answers questions using company knowledge (via a local FAISS knowledge base
built from PDFs) and falls back to a web search scoped to Nextbridge when it
doesn't have an answer internally.

## Architecture

```
┌──────────────────┐      joins room       ┌─────────────────────┐
│  nxb-voice-       │ ────────────────────► │   LiveKit Cloud      │
│  frontend         │                        │   (room + signaling)│
│  (Next.js)        │ ◄──────────────────── │                      │
└─────────┬─────────┘      audio/data        └──────────┬───────────┘
          │ GET /token                                   │ dispatches job
          ▼                                               ▼
┌──────────────────┐                          ┌─────────────────────┐
│  nxb-voice-agent  │                          │  nxb-voice-agent     │
│  ingest_api.py     │                          │  agent.py (worker)   │
│  (FastAPI:8000)   │                          │  retrieve_company_info│
│  - /token          │                          │  web_search_nxb       │
│  - /ingest          │                          └─────────┬───────────┘
└─────────┬─────────┘                                       │
          │ builds                                           │ queries
          ▼                                                   ▼
   data/faiss_index/  ◄─────────────────────────────  services/kb_client.py
   (FAISS + metadata, built from PDFs in data/)
```

## Stack

- **LiveKit Agents SDK** (Python) — real-time voice pipeline
- **LiveKit Inference** — STT/LLM/TTS, no separate provider keys needed
- **sentence-transformers + FAISS** — local knowledge base retrieval (no external API)
- **Tavily** — web search, scoped to Nextbridge/NXB, used as fallback
- **FastAPI** — ingestion endpoint (`/ingest`) + token endpoint (`/token`)
- **Next.js + LiveKit Components React** — frontend voice UI
- **uv** — Python dependency management

---

## Backend setup (`nxb-voice-agent/`)

### Prerequisites

- Python 3.12 (a clean system/uv-managed interpreter — **not** a Conda-based
  one; Conda Python builds have caused library-loading issues in this project)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- A [LiveKit Cloud](https://cloud.livekit.io/) account — get `LIVEKIT_URL`,
  `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- A [Tavily](https://tavily.com) API key (free tier available)
- **PortAudio** installed at the OS level, for local console testing:
  ```bash
  sudo apt install portaudio19-dev
  ```

### Install

```bash
cd nxb-voice-agent
uv venv --python 3.12.3      # use a clean, non-Conda Python
uv sync
uv run agent.py download-files   # downloads VAD / turn-detector model files
```

### `.env`

Create a `.env` file in `nxb-voice-agent/`:

```ini
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

TAVILY_API_KEY=tvly-your-tavily-key
```

### 1. Build the knowledge base

Put your source PDFs in `data/`, then run the ingestion API:

```bash
uv run uvicorn ingest_api:app --reload --port 8000
```

In another terminal:

```bash
curl -X POST http://localhost:8000/ingest
```

This chunks the PDFs, embeds them locally (sentence-transformers,
`all-MiniLM-L6-v2`), and builds `data/faiss_index/` (index + metadata).
Re-run `/ingest` any time the source PDFs change — it rebuilds the index
from scratch.

Keep this FastAPI server (`ingest_api.py`) running — it also serves the
`/token` endpoint the frontend needs (see below).

### 2. Run the voice agent worker

```bash
uv run agent.py dev
```

This registers a worker with LiveKit Cloud and waits for jobs (i.e. someone
joining the room). Leave this running alongside the FastAPI server above.

For quick local testing without a frontend (talks through your mic/speakers
directly, no LiveKit room needed):

```bash
uv run agent.py console
```

### How the agent decides what to say

1. `retrieve_company_info` — always tried first, searches the local FAISS
   knowledge base built from your PDFs
2. `web_search_nxb` — used only if retrieval finds nothing relevant; scopes
   the query to Nextbridge/NXB via Tavily
3. If neither returns anything useful, the agent says so honestly rather
   than guessing

See `prompts.py` for the exact instructions given to the agent.

---

## Frontend setup (`nxb-voice-frontend/`)

### Prerequisites

- Node.js 18+
- The backend's FastAPI server (`ingest_api.py`) running on port 8000 for
  the `/token` endpoint
- The agent worker (`agent.py dev`) running so it can pick up jobs

### Install

```bash
cd nxb-voice-frontend
npm install
```

### `.env.local`

```ini
NEXT_PUBLIC_LIVEKIT_TOKEN_ENDPOINT=http://localhost:8000/token
```

### Run

```bash
npm run dev
```

Open `http://localhost:3000`, click **"Talk to Nextbridge"**. This:
1. Calls `/token` on the backend to get a LiveKit access token
2. Joins a LiveKit room
3. The agent worker picks up the job automatically and joins the same room
4. You get a live mic UI with voice-activity visualization

---

## Running everything together

Four processes, each in its own terminal:

```bash
# 1 — knowledge base + token API
cd nxb-voice-agent
uv run uvicorn ingest_api:app --reload --port 8000

# 2 — voice agent worker
cd nxb-voice-agent
uv run agent.py dev

# 3 — frontend
cd nxb-voice-frontend
npm run dev
```

Then open `http://localhost:3000`.

---

## Project structure

```
nxb-voice-agent/
├── .env                     # LiveKit + Tavily credentials (not committed)
├── agent.py                  # entrypoint — session setup, Assistant class,
│                              #   retrieve_company_info + web_search_nxb tools
├── prompts.py                # system instructions + welcome message
├── ingest_api.py              # FastAPI: POST /ingest, GET /token
├── services/
│   ├── pdf_loader.py           # PDF loading + chunking
│   ├── embeddings.py           # local sentence-transformers embedding wrapper
│   ├── vector_store.py         # FAISS index wrapper
│   └── kb_client.py            # retrieval client used by agent.py (lazy-loaded)
├── data/
│   ├── *.pdf                   # source PDFs
│   └── faiss_index/             # generated: index.faiss + metadata.json
└── pyproject.toml / uv.lock

nxb-voice-frontend/
├── app/
│   └── page.tsx               # voice UI — connect button, visualizer, controls
├── .env.local                 # token endpoint URL
└── package.json
```