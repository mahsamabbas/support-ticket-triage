# QueueWise — Support Ticket Triage Copilot

QueueWise is a support console for **NovaGear**, a fictional electronics brand. A local LLM classifies each synthetic ticket by **category** and **urgency**, picks a **queue** from a fixed list, explains why, gives a **confidence** score, and drafts a reply. A human agent can change any field, edit the draft, then **approve** or **reject**. Nothing is ever sent.

Portfolio app 6 of 10. Scope: classify sample tickets, explain the suggested queue, draft a reply for human approval. Fixed queues, no live helpdesk.

![Inbox](docs/screenshots/inbox.png)

## What it does

- **Two-step LangChain pipeline.** *Classify* returns JSON constrained by a JSON schema and validated by Pydantic (one repair retry). *Draft* streams the reply token by token.
- **Routing policy in code, not in the prompt.** Confidence below 0.6, or a queue that does not serve the category, sends the ticket to `Needs Manual Triage` with a flag. The draft then only asks the customer for details.
- **Live pipeline over SSE.** Both steps animate in the UI with their timings.
- **Human in control.** Category, urgency and queue are editable; Approve is blocked until the route is valid. Every change against the AI suggestion shows as an audit chip.
- **Prompt-injection guard.** Ticket text is fenced as data and the model is told never to follow it.

| Live triage | Manual triage | Approved with overrides |
| --- | --- | --- |
| ![Live](docs/screenshots/triage-live.png) | ![Manual](docs/screenshots/manual-triage.png) | ![Approved](docs/screenshots/approved.png) |

## Architecture

```text
Next.js UI (3005) ──HTTP/SSE──▶ FastAPI (8005) ──▶ LangChain ──▶ Ollama qwen2.5:7b (host :11434)
                                     │
                                     ▼
                              SQLite (queuewise.db)
```

The browser talks only to FastAPI. API types are generated from FastAPI's OpenAPI schema with `openapi-typescript`.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), TanStack Query, zod + react-hook-form, motion, sonner |
| Backend | Python 3.12, FastAPI, Pydantic v2, pydantic-settings, sqlite3 |
| AI | LangChain (`langchain-core`, `langchain-ollama`), Ollama `qwen2.5:7b` (local, no cloud keys) |
| Tests | pytest with LangChain fake chat models, Vitest |
| Delivery | Docker Compose |

## Fixed taxonomy

| Field | Values |
| --- | --- |
| Category | billing, technical, account, shipping, general |
| Urgency | low, medium, high, critical |
| Queue | Billing Team, Tech Support, Account Security, Logistics, Customer Care, *Needs Manual Triage* (policy only) |

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Ollama reachable, model pulled |
| GET | `/taxonomy` | Enums, category → queue matrix, threshold |
| GET | `/tickets?status=&queue=` | Inbox |
| GET | `/tickets/{id}` | One ticket with its triage |
| POST | `/tickets` | Create a ticket |
| POST | `/tickets/{id}/triage` | Run the pipeline (SSE: `step`, `classified`, `draft_token`, `done`, `error`) |
| POST | `/tickets/{id}/review` | Approve or reject with final values |
| GET | `/stats` | KPIs and open counts per queue |

## Run

Prerequisite: [Ollama](https://ollama.com) running on the host.

```bash
ollama serve
ollama pull qwen2.5:7b
```

### Docker

```bash
docker compose up --build
```

UI http://localhost:3005 · API http://localhost:8005/docs

Optional: `cp .env.example .env` to change ports or the model, then `docker compose up --build`.

Reset demo data: `docker compose down -v`

**Linux:** the backend container reaches Ollama through the Docker bridge gateway, but a default Ollama install listens only on 127.0.0.1. Start it with `OLLAMA_HOST=0.0.0.0 ollama serve`, or for the systemd service run `sudo systemctl edit ollama` and add:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
```

Then `sudo systemctl restart ollama`. Your firewall must also allow traffic from the Docker bridge to port 11434. Note that `OLLAMA_HOST=0.0.0.0` exposes the unauthenticated Ollama API on every interface; prefer binding to the Docker bridge IP instead (for example `OLLAMA_HOST=172.17.0.1`), or firewall port 11434 from other networks.

### Local

Prerequisites: Python 3.12, Node 22 and Ollama.

```bash
# backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8005

# frontend (second terminal)
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

### Try it

- Triage NG-1001: a clear billing case, classified with high confidence.
- Triage NG-1009: a vague ticket that goes to `Needs Manual Triage`; the draft asks the customer for details.
- Change a field (for example urgency) and approve to see the audit chips.
- Create a ticket with "Triage immediately" checked.

## Tests

```bash
cd backend && .venv/bin/pytest -q    # 103 passed
cd frontend && npm test              # 50 passed
```

Normal case: a double-charge ticket is classified `billing` / `high` / `Billing Team` and the draft streams and saves.
Failure cases: low confidence, queue that does not fit the category, broken model JSON (repair then fallback), Chinese/Japanese/Korean text in the reason (repair, then manual-triage fallback), model picking the manual queue, empty or oversized tickets, Ollama down (503), draft failing mid-stream, approving twice (409), approving into manual triage or a wrong queue (422).

## Known limitations

- 7B local model: labels and drafts vary between runs.
- Confidence is the model's self-reported score, steered by a rubric and examples in the prompt. It is not a calibrated probability.
- Single agent, no authentication.
- The draft is not regenerated after the agent changes the classification.
- SQLite file storage, no multi-user concurrency.
- Drafts are never sent; there is no helpdesk or email integration.
- Docker reaches Ollama on the host via host.docker.internal; the model is not containerised.
- Python dependencies use minimum versions (`>=`), not a lock file, so Docker builds can pick up newer releases.

## References

- [LangChain Ollama integration](https://docs.langchain.com/oss/python/integrations/chat/ollama)
- [Ollama structured outputs](https://ollama.com/blog/structured-outputs)
- [shadcn/ui](https://ui.shadcn.com) components (copied into `frontend/src/components/ui`)
- Built with Cursor; all code reviewed, run and tested locally.
