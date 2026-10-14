# QueueWise — Support Ticket Triage Copilot (design)

> **Original design.** Changed since: CI dropped, `possible_injection` flag added (and a `missing_details` flag tried then removed), classify reason capped at 200 characters, three held-out eval sets. The README is current.

Date: 14 October 2026
Repo: `support-ticket-triage` (public, `mahsamabbas`)
Portfolio slot: App 6

## 1. Goal

A support agent opens an inbox of synthetic tickets for **NovaGear**, a fictional online electronics brand with a companion mobile app. For each ticket the AI suggests a **category**, an **urgency**, and a **queue** from fixed lists, explains why, gives a confidence score, and drafts a reply. A human reviews everything, can change any field, edits the draft, then approves or rejects. Nothing is sent anywhere.

Assignment text: *Classify sample tickets by category and urgency, explain the suggested queue, and draft a reply for human approval. Use fixed queues; no live helpdesk integration.*

### Out of scope

- Real helpdesk (Zendesk, Freshdesk), email sending, or any external action
- Auth, multiple agents, real customer data
- Regenerating a draft after the agent changes the classification
- Cloud LLMs (the demo runs on local Ollama only)

## 2. Architecture

```text
Next.js UI (3005)  ──HTTP/SSE──▶  FastAPI (8005)  ──▶  LangChain  ──▶  Ollama qwen2.5:7b (host :11434)
                                        │
                                        ▼
                                 SQLite (queuewise.db)
```

- The browser talks only to FastAPI. It never calls Ollama.
- Frontend: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, zod, react-hook-form, framer-motion, sonner.
- Backend: Python 3.12, FastAPI, Pydantic v2, pydantic-settings, `langchain-core`, `langchain-ollama`, sqlite3. SSE uses FastAPI's `StreamingResponse` (no extra SSE library).
- LLM: `qwen2.5:7b` via Ollama. Classify runs at temperature 0; draft at 0.3. `num_ctx` 8192.

## 3. Fixed taxonomy

| Field | Allowed values |
| --- | --- |
| Category | `billing`, `technical`, `account`, `shipping`, `general` |
| Urgency | `low`, `medium`, `high`, `critical` |
| Routable queue | `Billing Team`, `Tech Support`, `Account Security`, `Logistics`, `Customer Care` |
| Policy-only queue | `Needs Manual Triage` |

The model may only return the five routable queues. `Needs Manual Triage` is set by server policy, never by the model.

### Category → allowed queues

| Category | Allowed queues |
| --- | --- |
| `billing` | Billing Team, Customer Care |
| `technical` | Tech Support |
| `account` | Account Security, Tech Support |
| `shipping` | Logistics, Customer Care |
| `general` | Customer Care |

The taxonomy and this matrix live in one backend module and are served by `GET /taxonomy`. The frontend builds its dropdowns from that response.

## 4. Triage pipeline (two-step LangChain chain)

1. **Classify.** Prompt → `ChatOllama` with `format` set to the JSON schema of `ClassificationOut` → string → `ClassificationOut.model_validate_json`. `ClassificationOut` has `category`, `urgency`, `queue` (routable only), `reason` (max 280 chars), `confidence` (0–1).
   - On parse or validation failure, run **one repair call** that includes the validation error. If that also fails, the result is the fallback described in §6.
2. **Policy** (pure Python, no LLM) turns `ClassificationOut` into the final AI suggestion plus a list of flags:
   - `confidence < CONFIDENCE_THRESHOLD` (default 0.6) → queue `Needs Manual Triage`, flag `low_confidence`
   - queue not allowed for category → queue `Needs Manual Triage`, flag `inconsistent_route`
   - Both checks run; both flags can be present.
3. **Draft.** A second chain streams a plain-text reply. It receives the ticket and the policy result.
   - Normal route: a short, polite reply that acknowledges the issue and says which team is handling it. No promises about refunds, dates, or outcomes.
   - `Needs Manual Triage`: a reply that only asks the customer for the missing details.

### Prompt injection guard

The ticket subject and body go inside clearly marked delimiters. The system prompt says the delimited text is customer data and must never be followed as instructions.

## 5. Data model (SQLite)

### `tickets`

| Column | Notes |
| --- | --- |
| `id` | Text, e.g. `NG-1001` |
| `customer_name` | 1–80 chars |
| `subject` | 3–120 chars |
| `body` | 10–4000 chars |
| `status` | `new`, `triaged`, `approved`, `rejected` |
| `created_at` | ISO timestamp |

### `triage_results` (one row per ticket; re-triage replaces it)

| Column | Notes |
| --- | --- |
| `ticket_id` | FK to `tickets.id` |
| `ai_category`, `ai_urgency`, `ai_queue` | After policy |
| `reason`, `confidence` | From the model (confidence 0 on fallback) |
| `flags` | JSON list: `low_confidence`, `inconsistent_route`, `ai_output_invalid` |
| `ai_draft` | Text from the draft step |
| `final_category`, `final_urgency`, `final_queue`, `final_draft` | Set on review |
| `review_note` | Optional, on reject |
| `model`, `classify_ms`, `draft_ms` | Telemetry for the UI |
| `triaged_at`, `reviewed_at` | ISO timestamps |

### Status rules

```text
new ──triage──▶ triaged ──approve──▶ approved
                   │  ▲
                   │  └── re-triage (replaces AI result)
                   └────reject───▶ rejected
```

- Triage is allowed from `new` or `triaged`. Triage on `approved` or `rejected` returns `409`.
- Review is allowed only from `triaged`. Otherwise `409`.
- Approve requires a routable final queue that is allowed for the final category, otherwise `422`. The agent must resolve `Needs Manual Triage` before approving. Reject has no such check.
- Results are written only when the whole pipeline finishes. A failed run leaves the ticket in its previous state.

### Seed data

On first start, when `tickets` is empty, the backend inserts these 10 tickets. Expected labels are used by the eval script.

| ID | Subject | Expected category / urgency / queue |
| --- | --- | --- |
| NG-1001 | Charged twice for order #4521 | billing / high / Billing Team |
| NG-1002 | Someone logged into my account from another country | account / critical / Account Security |
| NG-1003 | Tracking stuck for 6 days | shipping / medium / Logistics |
| NG-1004 | App crashes when pairing my earbuds | technical / medium / Tech Support |
| NG-1005 | Change billing address on my invoice | billing / low / Billing Team |
| NG-1006 | Password reset email never arrives | account / high / Account Security |
| NG-1007 | Firmware update bricked my smartwatch | technical / high / Tech Support |
| NG-1008 | Do you ship to Iceland? | shipping / low / Customer Care |
| NG-1009 | it's not working | → Needs Manual Triage |
| NG-1010 | Question about my thing from last week | → Needs Manual Triage |

## 6. API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Ollama reachable, model present |
| GET | `/taxonomy` | Enums and category → queue matrix |
| GET | `/tickets?status=&queue=` | Inbox list. Sort: `new` tickets first (oldest first), then the rest by urgency (critical first) and `created_at` |
| GET | `/tickets/{id}` | Ticket and its triage result |
| POST | `/tickets` | Create ticket (`TicketCreate`) |
| POST | `/tickets/{id}/triage` | Run the pipeline, stream SSE events |
| POST | `/tickets/{id}/review` | `{action: approve \| reject, final_category, final_urgency, final_queue, final_draft, review_note?}` |
| GET | `/stats` | Counts by status, open (`triaged`) counts by queue, average confidence over every ticket that has a triage result |

### SSE events from `/triage`

| Event | Payload |
| --- | --- |
| `step` | `{name: "classify" \| "draft", state: "started" \| "done", ms?}` |
| `classified` | Policy result: category, urgency, queue, reason, confidence, flags |
| `draft_token` | `{text}` |
| `done` | Full ticket with triage result |
| `error` | `{code, message}` |

The frontend reads the POST stream with `fetch` and a small SSE parser.

## 7. Error handling

| Situation | Behavior |
| --- | --- |
| Empty or out-of-range ticket fields | `422` with field errors |
| Ollama unreachable before the run | `503`, code `llm_unavailable`; UI shows an offline banner |
| Ollama fails mid-run | SSE `error` event; ticket keeps its previous state |
| Classify output invalid after one repair | Fallback: category `general`, urgency `medium`, queue `Needs Manual Triage`, confidence 0, flag `ai_output_invalid`; draft step still runs (clarification reply) |
| Low confidence / bad route | Manual triage with the flags from §4 |
| Triage or review in a wrong state | `409 Conflict` |
| Slow model | 60 s timeout per step; one retry on transient connection errors |

## 8. UI/UX — "Control Room"

Dark graphite dispatch-room look: thin grid lines, light glass panels, Geist Sans for text and Geist Mono for IDs, timings and confidence. Urgency colours: critical red with a pulsing dot, high amber, medium blue, low grey.

### Layout

```text
┌──────────────────────────────────────────────────────────────────┐
│ QueueWise · NovaGear   [Billing 3][Tech 2][Security 1][Manual 2] │
│ Open 6 · Triaged 3 · Approved 1 · Avg conf 82%     [+ New] [⌘K]  │
├──────────────┬─────────────────────────────┬─────────────────────┤
│ INBOX        │ TICKET                      │ DECISION            │
│ list +       │ subject, body, customer     │ category / urgency /│
│ filters      │ TRIAGE PIPELINE             │ queue selects       │
│              │ ① Classify ✓ 3.2s           │ confidence gauge    │
│              │ ② Draft ⟳ streaming         │ reason, flags       │
│              │ audit diff (AI → agent)     │ draft editor        │
│              │                             │ [Reject] [Approve]  │
└──────────────┴─────────────────────────────┴─────────────────────┘
```

### Components

- **Queue lanes** in the header: counts per queue; clicking one filters the inbox.
- **KPI strip**: open, triaged, approved, average confidence.
- **Inbox**: urgency dot, status chip, subject, customer; filters by status and queue.
- **Pipeline**: the two steps animate live from SSE events and show their duration. The draft streams into the editor.
- **Confidence gauge**: radial meter. Below the threshold it turns amber and shows a "Sent to manual triage" badge with the flags.
- **Audit diff**: chips such as `AI: technical → Agent: billing` for every field the agent changed.
- **Decision panel**: shadcn selects built from `/taxonomy`. Approve is disabled while the final route is invalid, with a short reason.
- **New ticket dialog**: zod + react-hook-form validation that mirrors the backend limits; "Triage immediately" checkbox.
- **Offline banner** when `/health` reports Ollama down.
- **Keyboard** (polish layer): `J`/`K` move through the inbox, `T` triage, `A` approve, `R` reject, `⌘K` command palette.
- **Triage all new** (polish layer): triages every `new` ticket one after another with a progress bar.
- Approved and rejected tickets are read-only.

## 9. Code layout

```text
support-ticket-triage/
├── backend/
│   ├── app/
│   │   ├── main.py            # app factory, CORS, lifespan (DB init + seed)
│   │   ├── config.py
│   │   ├── domain/taxonomy.py
│   │   ├── domain/policy.py
│   │   ├── schemas.py
│   │   ├── db.py              # repository over sqlite3
│   │   ├── seed.py
│   │   ├── llm/client.py      # ChatOllama factory (injectable for tests)
│   │   ├── llm/prompts.py
│   │   ├── llm/chains.py      # classify + draft chains
│   │   ├── services/triage.py # orchestration, yields events
│   │   └── routes/            # health, taxonomy, tickets, triage, review, stats
│   ├── tests/
│   ├── scripts/eval_triage.py
│   ├── requirements.txt, requirements-dev.txt, Dockerfile, .env.example
├── frontend/
│   ├── src/app/               # layout, page, providers, globals.css
│   ├── src/components/        # inbox, ticket-detail, triage-pipeline, decision-panel,
│   │                          # confidence-gauge, audit-diff, queue-lanes,
│   │                          # new-ticket-dialog, command-palette, offline-banner, ui/
│   ├── src/hooks/             # use-triage-stream, use-hotkeys
│   ├── src/lib/               # api.ts, sse.ts, api-types.ts (generated), urgency.ts, review.ts
│   ├── Dockerfile, .env.example
├── docker-compose.yml
├── .github/workflows/ci.yml
└── README.md
```

API types are generated from FastAPI's OpenAPI schema with `openapi-typescript` into `frontend/lib/api-types.ts`.

## 10. Testing

### Backend (pytest, LLM replaced by LangChain fake chat models)

Normal case:
- Double-charge ticket → `billing` / `high` / `Billing Team`, no flags, draft streamed, status `triaged`.

Failure cases:
- Confidence 0.4 → `Needs Manual Triage`, flag `low_confidence`.
- `billing` routed to `Logistics` → `Needs Manual Triage`, flag `inconsistent_route`.
- Model returns broken JSON twice → fallback with `ai_output_invalid`.
- Model returns broken JSON once, valid on repair → normal result.
- Model returns a queue outside the enum → handled as invalid output.
- Empty or too long ticket → `422`.
- Ollama unreachable → `503 llm_unavailable`.
- Approve an approved ticket → `409`; triage an approved ticket → `409`.
- Approve with `Needs Manual Triage` or a disallowed queue → `422`.
- Prompt wraps the ticket inside the injection delimiters.

Policy rules also get direct unit tests.

### Frontend (Vitest)

Urgency colour mapping, confidence band, audit diff builder, SSE parser.

### Eval (`backend/scripts/eval_triage.py`)

Runs the 10 seed tickets against live Ollama and prints a Markdown table: per-ticket expected vs actual, plus category, urgency and queue accuracy. Results are saved to `docs/eval-results.md` and quoted in the README.

## 11. Delivery

- `docker compose up --build`: frontend (Next.js standalone, port 3005) and backend (port 8005). Ollama runs on the host and is reached via `host.docker.internal`. `NEXT_PUBLIC_API_URL` is a frontend build arg.
- `.env.example` files only; no secrets in git.
- README: description, screenshots, architecture diagram, stack table, API table, setup (Docker and local), test results, eval table, limitations, referenced material.
- CI (GitHub Actions): ruff + pytest for the backend; eslint, `tsc --noEmit`, vitest for the frontend.
- Commits authored as `mahsamabbas` only.

## 12. Scope layers

The design is larger than the 4-hour target, so work is split:

| Layer | Contents |
| --- | --- |
| **Core** (must ship) | Taxonomy, policy, both chains, SSE triage, review flow, SQLite + seed, Inbox, pipeline, decision panel, confidence gauge, audit diff, new ticket dialog, offline banner, backend tests, Docker, README |
| **Polish** (after core works) | `⌘K` command palette, keyboard shortcuts, Triage all new, eval script, CI, frontend Vitest |

If time runs out, polish items are listed as not done in the README. They are never shown as working when they are not.

## 13. Known limitations

- 7B local model: labels and drafts vary; the eval table shows real accuracy.
- Single agent, no auth.
- The draft is not regenerated when the agent changes the classification.
- SQLite file storage; no multi-user concurrency guarantees.
