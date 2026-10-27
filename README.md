# Mailora – Explainable Email Deliverability Intelligence

> **"Every Address Has a Story. Discover the Signals."**
>
> **Mailora** is an explainable email deliverability intelligence platform grounded in evidence. It analyzes technical mail routing, DNS configurations, and recipient signals to provide transparent, auditable classifications for email addresses without ever sending messages.

---

## 1. Problem Statement & Mission

Traditional email validation tools operate as black boxes, often returning binary "valid" or "invalid" judgements without technical justification. In reality, internet mail delivery is nuanced:
* Mailbox existence **cannot always be verified conclusively** without attempting actual message transmission.
* Many enterprise and privacy-oriented mail servers deploy **greylisting**, **silent acceptance**, or **catch-all configurations** that accept all recipients during the initial SMTP handshake.
* Outbound SMTP port 25 connections are frequently blocked or restricted by hosting providers and ISPs.

**Mailora** rejects opaque scorecards. Instead, it inspects multi-layered technical signals—RFC syntax conformity, authoritative DNS records (MX/A/AAAA), null MX suppression, and optional non-intrusive SMTP recipient probes—and presents a granular **Evidence Ledger** with stated limitations and caveats.

> [!IMPORTANT]
> **What Mailora Cannot Prove**: Mailora estimates deliverability exclusively from technical infrastructure evidence. It **never guarantees final inbox placement or message delivery**. Mail delivery ultimately depends on sender IP reputation, recipient spam filters, domain authentication (SPF/DKIM/DMARC), rate limits, and internal corporate mailbox policies.

---

## 2. What the Deployed Version Can and Cannot Check

> [!WARNING]
> **Ethical Usage & Testing Policy**:
> **Do not send messages to addresses you do not own or are not explicitly authorized to test.**
> Mailora is built with a strict zero-message architecture: it **never** transmits message bodies, issues the SMTP `DATA` command, or delivers test emails to mailboxes. All deliverability intelligence is derived solely from non-intrusive protocol handshakes and public domain infrastructure.

### What the Deployed Version CAN Check
* **RFC 5321 / RFC 5322 Syntax Validity**: Grammatical conformity, ASCII / IDNA internationalized domain decoding, local-part bounds (<= 64 chars), and normalized forms.
* **Authoritative DNS Mail Routing**: Real-time resolution of authoritative Mail Exchange (MX) resource records, priority ordering, and target hostname validity.
* **Implicit MX Fallback (RFC 5321 § 5.1)**: Fallback A and AAAA record routing when a domain deliberately lacks dedicated MX records.
* **Null MX Suppression (RFC 7505)**: Explicit detection of domains declaring they do not accept email via a priority 0 dot record (`.`).
* **Non-Existent Domains (NXDOMAIN)**: Authoritative identification of non-existent domains distinguished from temporary resolver timeouts.
* **Technical Mail Provider Classification**: Infrastructure provider inference (Google Workspace, Microsoft 365, Proton, Yahoo, iCloud, Zoho, Fastmail) from authoritative MX patterns, defaulting custom domains to `"Custom / Unknown Provider"`.
* **Optional SMTP Recipient Probing (When Supported by Host)**: Envelope recipient handshake (`MAIL FROM` / `RCPT TO` / `RSET`) to test for explicit recipient rejections (`550`) or mailbox acceptance (`250`).

### What the Deployed Version CANNOT Check
* **Guaranteed Inbox Delivery**: Mailora evaluates technical routing infrastructure. It **cannot guarantee final inbox placement**, as message delivery depends on sender IP reputation, message content, spam filter scoring, and SPF/DKIM/DMARC authentication.
* **Mailbox Existence on Catch-All Domains**: Mail servers configured with catch-all routing accept all recipient addresses indiscriminately during the SMTP handshake. Mailora flags catch-all limitations in the Evidence Ledger but cannot distinguish whether an individual mailbox is actively read.
* **Mailbox Existence Behind Greylisting / Silent Drops**: Security gateways that return temporary deferrals (SMTP `451` / `421`) or accept envelopes and silently drop undeliverable messages post-session cannot be definitively verified without transmitting actual mail. Mailora safely classifies these as `unknown` / `inconclusive`.
* **Direct SMTP Mailbox Probing on Standard Cloud Hosts (Port 25 Egress Blocks)**: Major cloud hosting platforms (such as Render, AWS, Vercel, Google Cloud, DigitalOcean) block outbound TCP port 25 to prevent spam. In these deployed environments, Mailora keeps SMTP disabled by default and evaluates syntax and authoritative DNS routing. When SMTP is enabled on hosts with blocked egress, Mailora safely reports `unknown` with check status `unavailable`, rather than guessing or falsifying a bounce.
* **Personal Identity or Personal Demographics**: Mailora analyzes technical dataset composition only. It **cannot and will never infer** age, gender, ethnicity, income, location, or personal identity from email addresses.

---

## 3. Core Features & Application Workspaces


### Application Routes & Workspaces

Mailora is structured as a multi-page single-page application (SPA) with dedicated workspaces accessible via the persistent workspace shell:

| Route | Workspace | Purpose |
| :--- | :--- | :--- |
| `/` | **Landing Page** | Public SaaS homepage detailing methodology, zero-persistence privacy guarantees, and interactive demo fixtures. |
| `/app` | **Overview Dashboard** | Real-time deliverability intelligence hub displaying genuine aggregate metrics, verdict distribution visualizer, recent activity ledger, and quick links. |
| `/app/analyze` | **Analyze Emails** | Dedicated verification engine supporting manual address entry, sample test fixtures, and secure document file upload with candidate extraction. |
| `/app/exports` | **Export Center** | Dedicated CSV report generator featuring report preview, custom column selection, download history, and formula injection mitigation (CWE-1236). |
| `/app/analytics` | **Analytics** | Technical dataset composition telemetry: domain rankings, email provider infrastructure breakdown, DNS routing outcomes, SMTP check coverage, and genuine activity timeline. |
| `/app/history` | **Analysis History** | Comprehensive execution ledger featuring run search, date-range filtering, pagination, run inspection, CSV downloads, and deletion confirmation dialogs. |
| `/app/settings` | **Settings** | User-configurable appearance modes (Light/Dark/System), SMTP default configuration explanation, multi-tier storage explanation, and data deletion controls. |

---

## 4. Demographics Policy & Technical Dataset Composition

> [!NOTE]
> **Product Definition of "Demographics"**: In Mailora, "demographics" strictly refers to the **technical characteristics and composition of the email dataset** (e.g. domain distribution, mail provider infrastructure, routing protocols, and syntax hygiene).

Mailora **never infers or estimates personal demographics** (such as age, gender, ethnicity, income, exact location, or personal identity) from email addresses.

Key data integrity and privacy principles:
* **Custom Domain Privacy**: Custom domains are classified as `"Custom / Unknown Provider"` unless authoritative MX evidence supports a specific provider (e.g. Google Workspace, Microsoft 365, Proofpoint).
* **Decoupled Classification**: Provider and domain classifications are strictly distinguished from actual mailbox deliverability.
* **Privacy-Safe Aggregation**: Email local-parts are never exposed or rendered in charts, summaries, or history lists.
* **No Fabricated Data**: Time-series analytics and history entries derive strictly from genuine timestamps and completed verification runs.

---

## 5. Multi-Tier Storage Architecture & Privacy Lifecycle

Mailora employs a privacy-preserving storage model designed for unauthenticated environments:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             MAILORA STORAGE                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Server Memory (Ephemeral)                                            │
│     • Zero disk persistence for raw email addresses or uploaded docs.    │
│     • Memory is deallocated immediately upon request completion.         │
│                                                                          │
│  2. Server History Ledger (Aggregate Metadata Only)                      │
│     • Minimal SQLite / PostgreSQL database.                              │
│     • Stores only: Batch ID, timestamp, counts, top domain frequencies.  │
│     • Automatically purged after 30 days (HISTORY_RETENTION_DAYS).       │
│                                                                          │
│  3. Local Browser Storage (Device-Isolated)                              │
│     • Detailed per-address verification records and check evidence.       │
│     • Isolated to user's device in localStorage (up to 40 runs).         │
│     • When cleared, historical runs show "Metadata Only" with summary.   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

* **Zero Server Address Storage**: Raw email addresses and uploaded documents are never stored in the server database or written to disk.
* **30-Day Metadata Retention**: Server-side history stores non-sensitive aggregate run statistics with an automatic 30-day pruning TTL (`purge_expired_runs`).
* **Client-Side Isolation**: Detailed per-recipient check evidence is stored in browser `localStorage`. When detailed results expire or are viewed on a new device, Mailora clearly distinguishes summary metadata from full records.
* **User-Driven Deletion**: Users can delete individual runs or clear all history records at any time from both `/app/history` and `/app/settings`.

---

## 6. Document Email Extraction Workflow

The Analyze Emails workspace (`/app/analyze`) includes a streaming extraction workflow to detect candidate addresses from document files:

### Supported File Formats

| Format | Extension | Processing Engine | Notes |
| :--- | :--- | :--- | :--- |
| **Plain Text** | `.txt` | UTF-8 Streaming Regex | Line-by-line candidate extraction with row tracking. |
| **Spreadsheets / CSV** | `.csv` | Python `csv.reader` | Delimiter sniffing (comma, semicolon, tab) with column/row coordinates. |
| **PDF Documents** | `.pdf` | `pypdf` | Extractable text extraction with page numbers. Non-searchable scanned PDFs require text conversion first. |
| **Word Documents** | `.docx` | `python-docx` | Paragraph and table cell extraction with paragraph tracking. |
| **Email Messages** | `.eml` | Python `email` | RFC 822 header extraction (To, From, Cc, Bcc) and plain text / HTML body extraction. |

### Explicit Security & Format Protections
* **Legacy Word Files (`.doc`)**: Legacy binary Word files are rejected with a clear message directing users to convert the document to `.docx` or `.txt`.
* **Executables & Archives**: Files with extensions `.exe`, `.dll`, `.bat`, `.sh`, `.zip`, `.tar`, `.gz` are rejected immediately.
* **Bounds & Protections**: Maximum 5 MB per file, maximum 5 files per batch, maximum 10 MB total content length, path traversal sanitization, and streaming in-memory parsing.

---

## 7. Appearance & Theme System

Mailora features an application-wide appearance system:
* **Three Selectable Modes**:
  1. **Light**: Clean, high-contrast daylight theme with subtle borders and shadows.
  2. **Dark**: Deep slate/zinc theme optimized for low-light environments.
  3. **System**: Automatically syncs with operating system preference (`prefers-color-scheme`).
* **Default Preference**: Light mode for first-time visitors.
* **Persistence & FOUC Prevention**: Preference persisted in `localStorage`. Root theme class (`dark`) applied before paint to eliminate Flash of Unstyled Content (FOUC).
* **Controls**: Accessible theme switchers in the workspace header, sidebar, and Settings workspace (`/app/settings`).

---

## 8. Technology Stack

### Frontend
* **Core**: React 19, TypeScript 5.8+, Vite 8
* **Styling**: Tailwind CSS v4, Lucide React icons
* **Routing**: React Router v7 (with SPA wildcard fallback)
* **Testing & Quality**: Node.js test runner via `tsx`, `oxlint`

### Backend
* **Core**: Python 3.12+ / 3.14+, Flask 3.1
* **DNS Resolution**: `dnspython` 2.7+ with finite timeouts and thread safety
* **Syntax Validation**: `email-validator` 2.2+
* **Document Extraction**: `pypdf` 5.0+, `python-docx` 1.1+
* **Persistence**: SQLite (standard library) with WAL mode, parameterized queries, and PostgreSQL support via `DATABASE_URL`
* **Concurrency**: `concurrent.futures.ThreadPoolExecutor` (bounded to 10 workers)
* **Production Server**: Gunicorn 23+ (WSGI with gthread worker model)
* **Testing & Quality**: `pytest` 8.4+, `pytest-cov`

---

## 9. Environment Variables

### Backend Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `5000` | Port for Flask / Gunicorn server. |
| `FLASK_ENV` | `development` | Set to `production` in live environments. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed CORS origin(s). Comma-separated for multiple origins. |
| `MAX_BATCH_SIZE` | `100` | Maximum email addresses permitted per API batch request. |
| `SQLITE_PATH` | `data/mailora_history.db` | Filepath for SQLite history database (or `:memory:`). |
| `HISTORY_RETENTION_DAYS` | `30` | Number of days to retain server-side run metadata before auto-purging. |
| `MAX_CONTENT_LENGTH` | `10485760` (10 MB) | Maximum permitted request body size in bytes. |

### Frontend Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://localhost:5000` | Base URL pointing to deployed backend service (no trailing slash). |

---

## 10. Local Development Setup

### Prerequisites
* Python 3.12+ or 3.14+
* Node.js 20+ and npm

### 1. Backend Setup
```bash
# Install runtime and testing dependencies (from repository root)
pip install -r backend/requirements-dev.txt

# Start backend development server (from repository root)
python -m backend.app
# Server runs on http://localhost:5000
```

### 2. Frontend Setup
```bash
# In a separate terminal, navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
# Frontend runs on http://localhost:5173
```

---

## 11. API Documentation

### `GET /health`
Returns service status and operational metadata.

### `POST /api/analyze` (or `POST /api/v1/analyze`)
Analyzes a batch of email addresses across the verification pipeline.
* **Payload**: `{"addresses": ["user@example.com"], "smtp_enabled": false}`
* **Response**: Includes `batch_id`, `count`, `analysed_at`, and `results` array with checks and evidence.

### `POST /api/extract` (or `POST /api/v1/extract`)
Parses uploaded documents (`.txt`, `.csv`, `.pdf`, `.docx`, `.eml`) and returns candidate email addresses with source references.

### `GET /api/history` (or `GET /api/v1/history`)
Lists historical analysis runs with pagination, search query (`q`), and date range filters (`start_date`, `end_date`).

### `DELETE /api/history/<run_id>`
Permanently deletes a single analysis run from the history database.

### `DELETE /api/history`
Permanently clears all analysis run records from the history database.

---

## 12. Automated Testing & Quality Validation

### Backend Pytest Suite
Runs **164 unit and integration tests** covering syntax parsing, DNS resolution scenarios, SMTP state transitions, SSRF rejection, document extraction, history persistence, pagination, retention purging, and HTTP error status codes:
```bash
pytest backend/tests
```
**Outcome**: 164 passed, 0 failures.

### Frontend Test Suite
Runs **77 unit tests across 17 test suites** verifying address parsing, CWE-1236 CSV formula injection defense, filter/search consistency, API client mapping, document extraction, theme persistence, and history ledger management:
```bash
cd frontend
npm test
```
**Outcome**: 77 passed, 0 failures.

### Frontend Linter & Production Build
```bash
cd frontend
npm run lint    # oxlint runs on 54 files (0 errors)
npm run build   # tsc -b && vite build (generates production bundle in dist/)
```

---

## 13. Public Deployment Guide

Mailora is designed for production deployment as two independent services: a static Single-Page Application (Frontend) and a Python WSGI service (Backend).

### Option A: Render (Automated Two-Tier via `render.yaml`)
1. Log into [Render Dashboard](https://dashboard.render.com/) and click **New + > Blueprint**.
2. Connect this repository. Render automatically reads `render.yaml` and provisions:
   * **`mailora-api`**: Python Web Service running Gunicorn.
   * **`mailora-frontend`**: Static Site with SPA wildcard rewrite `/* -> /index.html`.
3. Set the environment variables:
   * Set `FRONTEND_ORIGIN` on `mailora-api` to your frontend's assigned URL.
   * Set `VITE_API_BASE_URL` on `mailora-frontend` to your backend's assigned URL.
4. Deploy both services.

### Option B: Docker / Docker Compose
Deploy to any Linux VPS, AWS EC2, or DigitalOcean Droplet:
```bash
docker compose up -d
curl -f http://localhost:5000/health
```

---

## 14. Operational Limitations & SMTP Realities

* **Port 25 Egress Blocking**: Outbound TCP port 25 is blocked by default across major cloud hosting providers. SMTP verification is disabled by default to maintain fast and reliable operation. When enabled, connection blocks are classified as `unknown` with check status `unavailable`, never falsifying a bounce.
* **Greylisting**: Some mail servers temporarily reject initial connection attempts from unrecognized IPs with code `451` or `421`. Mailora treats temporary codes as `inconclusive`.
* **Catch-All Mailboxes**: Domains configured with catch-all routing will respond `250 OK` to any probed address. Mailora highlights this caveat in the Evidence Ledger.
* **CWE-1236 Sanitization**: All exported CSV files prepend a single quote (`'`) to formula injection triggers (`=`, `+`, `-`, `@`, tab, pipe) to neutralize formula execution in Microsoft Excel and Google Sheets.

---

## 15. License

Distributed under the MIT License. See `LICENSE` for details.
