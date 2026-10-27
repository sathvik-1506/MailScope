# MailScope – Explainable Email Deliverability Intelligence

> **MailScope** is an explainable email deliverability intelligence platform that analyzes technical email routing evidence and provides transparent, auditable classifications for email addresses without ever sending messages.

---

## 1. Problem Statement & Mission

Traditional email validation tools operate as black boxes, often returning binary "valid" or "invalid" judgements without technical justification. In reality, internet mail delivery is nuanced:
* Mailbox existence **cannot always be verified conclusively** without attempting actual message transmission.
* Many enterprise and privacy-oriented mail servers deploy **greylisting**, **silent acceptance**, or **catch-all configurations** that accept all recipients during the initial SMTP handshake.
* Outbound SMTP port 25 connections are frequently blocked or restricted by hosting providers and ISPs.

**MailScope** rejects opaque scorecards. Instead, it inspects multi-layered technical signals—RFC syntax conformity, authoritative DNS records (MX/A/AAAA), null MX suppression, and optional non-intrusive SMTP recipient probes—and presents a granular **Evidence Ledger** with stated limitations and caveats.

> [!IMPORTANT]
> **What MailScope Cannot Prove**: MailScope estimates deliverability exclusively from technical infrastructure evidence. It **never guarantees final inbox placement or message delivery**. Mail delivery ultimately depends on sender IP reputation, recipient spam filters, domain authentication (SPF/DKIM/DMARC), rate limits, and internal corporate mailbox policies.

---

## 2. Core Features

* **Multi-Layer Technical Analysis Pipeline**:
  1. **RFC 5321/5322 Syntax Checking**: Normalization, internationalized domain decoding, length bounds (local-part <= 64, total <= 320), and strict grammar checks.
  2. **DNS & Mail Routing Inspection**: Authoritative DNS resolution for MX records, explicit null MX (RFC 7505) bounce detection, implicit MX fallback (RFC 5321 §5.1), and authoritative NXDOMAIN detection.
  3. **Non-Intrusive SMTP Probing (Opt-In)**: Issues `EHLO`, `MAIL FROM`, and `RCPT TO` commands to verify recipient acknowledgment, then issues `QUIT`. **Strictly never executes the `DATA` command or transmits message content.**
* **Explainable Classification Engine**:
  * **Likely Delivered**: Active mail server explicitly acknowledged the recipient envelope probe.
  * **Likely Bounce**: Definitively invalid syntax, non-existent domain (`NXDOMAIN`), explicit null MX, or 5xx rejection code.
  * **Unknown**: Mailbox existence cannot be verified conclusively (e.g. SMTP disabled, blocked port 25, timeouts, or greylisting).
* **Evidence Ledger & Audit Trail**: Every analyzed address includes an expandable drawer breaking down each pipeline check, observed latency, technical evidence items, and known operational caveats.
* **Modern SaaS Web Workspace**:
  * Professional deep navy aesthetic (`#0A0F1D` background, violet/indigo accents).
  * Fast bulk address textarea with line/comma/semicolon normalization and counter.
  * Live RFC 2606 test fixtures (`@example.com`, `@example.org`) for zero-risk demonstration.
  * Instant filter tabs, text search, and sorting.
  * RFC 4180 compliant CSV export hardened against Spreadsheet Formula Injection (CWE-1236).

---

## 3. Technology Stack

### Frontend
* **Core**: React 19, TypeScript 5.8+, Vite 8
* **Styling**: Tailwind CSS v4, Lucide React icons
* **Routing**: React Router v7 (with SPA wildcard fallback)
* **Testing & Quality**: Node test runner + `tsx`, `oxlint`

### Backend
* **Core**: Python 3.12+ / 3.14+, Flask 3.1
* **DNS Resolution**: `dnspython` 2.7+ with finite timeouts and thread safety
* **Syntax Validation**: `email-validator` 2.2+
* **Concurrency**: `concurrent.futures.ThreadPoolExecutor` (bounded to 10 workers)
* **Production Server**: Gunicorn 23+ (WSGI with gthread worker model)
* **Testing & Quality**: `pytest` 8.4+, `pytest-cov`

---

## 4. Architecture & System Flow

```
[ User Browser / Client ]
            │
            ▼
    [ Vite React SPA ]  (Port 5173 / Production CDN)
            │
      HTTP POST /api/analyze  (JSON batch payload, max 100 addresses)
            │
            ▼
 [ Flask + Gunicorn WSGI ]  (Port 5000)
    │
    ├─ 1. Request Validator (Payload bounds <= 1MB, schema validation, batch limit)
    ├─ 2. Concurrency Pool (ThreadPoolExecutor max_workers=10, input order preserved)
    │     │
    │     ├─ Layer 1: Syntax Checker (RFC 5321/5322 grammar, length limits)
    │     │
    │     ├─ Layer 2: DNS Analyzer (MX / Implicit MX / Null MX via dnspython)
    │     │           [Thread-safe DNS domain cache to eliminate duplicate lookups]
    │     │
    │     └─ Layer 3: SMTP Probe (Opt-In only, RCPT TO probe, SSRF IP filtering)
    │                 [Blocked connections/timeouts safely classified as INCONCLUSIVE]
    │
    └─ 3. Evidence Classifier (Synthesizes checks into verdict + evidence ledger)
            │
            ▼
    Structured JSON Response (verdict, reason_code, evidence, limitations)
```

---

## 5. Directory Structure

```
mailScope/
├── .env.example              # Development environment variable reference
├── .env.production.example   # Production deployment environment variable reference
├── .gitignore                # Comprehensive Git exclusion rules
├── Dockerfile                # Production multi-stage Docker container specification
├── docker-compose.yml        # Container orchestration for local / VPS deployment
├── Procfile                  # WSGI command for Heroku / Render / Railway
├── pyproject.toml            # Root pytest configuration
├── render.yaml               # Render Blueprint for automated two-tier deployment
├── backend/
│   ├── app.py                # Flask application factory, error handlers, and API endpoints
│   ├── requirements.txt      # Production Python dependencies (includes Gunicorn)
│   ├── requirements-dev.txt  # Testing dependencies (pytest, pytest-cov)
│   ├── services/
│   │   ├── classifier.py     # Deterministic verdict synthesis and explanation rules
│   │   ├── dns_checker.py    # DNS query execution with finite timeouts and MX fallback
│   │   ├── schemas.py        # Request schema validation, bounds checking, email masking
│   │   ├── smtp_checker.py   # RCPT TO probe with SSRF protection (never calls DATA)
│   │   └── syntax_checker.py # RFC syntax parsing and normalization
│   └── tests/
│       ├── test_api.py       # API integration tests, CORS, duplicate caching, limits
│       ├── test_classifier.py# Verdict decision matrix tests
│       ├── test_dns_checker.py # Mocked DNS record scenarios
│       ├── test_smtp_checker.py# Mocked SMTP responses and SSRF protection tests
│       └── test_syntax_checker.py# RFC email syntax test vectors
├── docs/
│   └── architecture.md       # Detailed technical design specifications
└── frontend/
    ├── package.json          # Frontend scripts and dependencies
    ├── vercel.json           # Vercel SPA rewrite and security headers configuration
    ├── public/
    │   ├── _redirects        # SPA route fallback for Netlify / Cloudflare Pages / Render
    │   ├── favicon.svg       # Brand favicon
    │   └── icons.svg         # SVG sprite assets
    └── src/
        ├── App.tsx           # Route definitions (/ and /app with wildcard redirect)
        ├── components/       # UI components (Header, Footer, EvidenceDrawer, etc.)
        ├── pages/
        │   ├── LandingPage.tsx   # SaaS homepage with interactive demo and methodology
        │   └── AnalyzerPage.tsx  # Workspace with textarea, table, and evidence ledger
        ├── services/
        │   ├── api.ts            # Centralized typed HTTP client with error mapping
        │   └── analyzerAdapter.ts# Input parsing and RFC 2606 sample fixtures
        ├── utils/
        │   └── csvExport.ts      # RFC 4180 CSV export with formula injection mitigation
        └── __tests__/
            ├── analyzer.test.ts  # Input parsing and CSV formula injection tests
            └── api.test.ts       # API response mapping and network error handling tests
```

---

## 6. Environment Variables

### Backend Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `5000` | Port for Flask / Gunicorn server. |
| `FLASK_ENV` | `development` | Set to `production` in live environments to disable debug endpoints. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed CORS origin(s). Separate multiple origins with commas. |
| `MAX_BATCH_SIZE` | `100` | Maximum email addresses permitted per API batch request. |

### Frontend Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://localhost:5000` | Base URL pointing to the deployed backend service (no trailing slash). |

---

## 7. Local Development Setup

### Prerequisites
* Python 3.12+ (or 3.14+)
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

## 8. API Documentation

### `GET /health`
Returns service status and operational metadata.

**Response `200 OK`**:
```json
{
  "status": "ok",
  "service": "mailscope-backend",
  "version": "1.0.0"
}
```

---

### `POST /api/analyze` (or `POST /api/v1/analyze`)
Analyzes a batch of email addresses across the verification pipeline.

**Request Body**:
```json
{
  "addresses": [
    "user@example.com",
    "invalid..syntax@@example.org"
  ],
  "smtp_enabled": false
}
```

**Request Constraints**:
* `Content-Type`: Must be `application/json`.
* Maximum payload size: `1 MB` (enforced via HTTP 413).
* Maximum addresses per batch: `100` (configurable via `MAX_BATCH_SIZE`).
* Maximum length per address: `320` characters.

**Response `200 OK`**:
```json
{
  "count": 2,
  "analysed_at": "2026-10-26T22:30:00.000000+00:00",
  "results": [
    {
      "address": "user@example.com",
      "original_input": "user@example.com",
      "normalized_address": "user@example.com",
      "verdict": "unknown",
      "reason_code": "MAILBOX_UNCONFIRMED",
      "explanation": "Domain has valid mail routing, but mailbox existence cannot be confirmed without SMTP probing.",
      "checks_run": ["syntax", "dns"],
      "checks_skipped": ["smtp"],
      "evidence": [
        "Address passes RFC 5321/5322 syntax validation.",
        "DNS: Found 1 MX record(s): mail.example.com"
      ],
      "limitations": [
        "Mailbox existence unconfirmed without active SMTP probing.",
        "Server may accept all recipients (catch-all) or greylist probes."
      ]
    },
    {
      "address": "invalid..syntax@@example.org",
      "original_input": "invalid..syntax@@example.org",
      "verdict": "likely_bounce",
      "reason_code": "INVALID_SYNTAX",
      "explanation": "The email address fails standard RFC 5321/5322 grammar and cannot receive mail.",
      "checks_run": ["syntax"],
      "checks_skipped": ["dns", "smtp"],
      "evidence": [
        "Address failed RFC syntax check."
      ],
      "limitations": []
    }
  ]
}
```

---

## 9. Automated Testing & Validation

### Backend Pytest Suite
Runs 133 unit and integration tests covering syntax parsing, DNS resolution scenarios, SMTP state transitions, SSRF rejection, duplicate caching, concurrency order preservation, rate limiting, and HTTP error status codes:
```bash
# From repository root
pytest --cov=backend.services --cov=backend.app

# Or from backend directory
cd backend
python -m pytest --cov=backend.services --cov=backend.app
```
**Outcome**: 133 passed, 0 skipped, 0 failures, 86% coverage across core services.

### Frontend Test Suite
Runs 29 unit tests across 5 suites verifying address parsing, RFC 4180 / CWE-1236 CSV formula injection defense, filter/search consistency, and typed API response mapping:
```bash
cd frontend
npm test
```
**Outcome**: 29 passed, 0 skipped, 0 failures.

### Frontend Linter & Build Verification
```bash
cd frontend
npm run lint    # oxlint runs on 33 files (0 errors, 0 warnings)
npm run build   # tsc -b && vite build (generates production bundle in dist/)
```

### Continuous Integration (GitHub Actions)
Automated CI is configured via `.github/workflows/ci.yml` running on pushes and pull requests to `main`:
* **Backend Job**: Checks Python compilation (`compileall`), installs dependencies, and executes the full Pytest test suite with code coverage.
* **Frontend Job**: Runs `oxlint`, executes the Node.js test suite via `tsx`, and builds the production bundle with `tsc` and `vite`.

---

## 10. Security & Privacy Controls

### Privacy & Data Retention Guarantees
* **Zero Address Persistence**: MailScope never persists submitted email addresses or verification results to a database, key-value store, or disk files. Address batches exist purely in ephemeral process memory during request execution and are deallocated immediately upon response transmission (0-second data retention).
* **Privacy-Safe Application Logging**: MailScope application logs never record full email addresses. Only batch counts and a privacy-masked representation of the first address (e.g. `a***@example.com`) are logged for diagnostic observability.
* **Hosting-Provider & Proxy Access Log Implications**:
  * MailScope's application code does not log submitted email addresses.
  * However, external infrastructure components—such as cloud hosting access logs (Render, AWS, DigitalOcean, Heroku), reverse proxies (Nginx, Traefik), and CDNs (Cloudflare)—customarily log client IP addresses, request timestamps, User-Agent headers, and request URLs (`/api/analyze`).
  * MailScope deliberately accepts email addresses via the HTTP request body (`POST /api/analyze`) rather than URL query parameters to ensure email addresses are not captured in standard URL access logs.
  * Operators deploying MailScope in production should configure their edge reverse proxies and WAFs to disable body logging and set appropriate log retention windows for IP address records.

### Public API Abuse Controls & Rate Limiting Architecture
* **Process-Local Sliding Window Rate Limiting**:
  * Unauthenticated public APIs risk abuse from automated scrapers and denial-of-service attempts.
  * MailScope includes an in-memory sliding-window client rate limiter (`backend/services/rate_limiter.py`) configured via `RATE_LIMIT_PER_MINUTE` (default: 60 requests/minute).
  * Client IP addresses are extracted from `X-Forwarded-For` or `X-Real-IP` when behind a reverse proxy, falling back to `request.remote_addr`.
  * **Multi-Worker Architectural Note**: The rate limiter operates in-memory to preserve MailScope's zero-external-dependency and zero-persistence privacy model. In multi-worker deployments (e.g. Gunicorn with multiple worker processes), each worker enforces limits independently. For example, 4 workers with a 60 req/min limit provide an aggregate ceiling of up to 240 req/min under uniform round-robin distribution. For strict global rate limiting across horizontal clusters, an external distributed Redis token-bucket should be deployed.
* **Bounded Concurrency & Payload Limits**:
  * Request payload size is strictly bounded by `MAX_CONTENT_LENGTH` (default: 1 MB, configurable via environment).
  * Address batch size is capped by `MAX_BATCH_SIZE` (default: 100 addresses).
  * Concurrency per batch is bounded by `MAX_CONCURRENT_WORKERS` (default: 10 threads, clamped between 1 and 20) to prevent thread exhaustion.

### Network Destination & SSRF Defenses
* **No Arbitrary User Destinations**: User input cannot be used to target arbitrary hostnames, URLs, or internal networks. All destination targets are discovered strictly from authoritative DNS records (MX, A, AAAA) returned for the validated domain.
* **Server-Side Request Forgery (SSRF) & Anti-TOCTOU Protection**:
  * Destination IP addresses are checked against prohibited subnets (`is_prohibited_ip`): loopback (`127.0.0.0/8`, `::1`), private RFC 1918 networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local/cloud metadata (`169.254.169.254`), multicast, and reserved addresses.
  * Direct IP socket connections eliminate Time-Of-Check to Time-Of-Use (TOCTOU) DNS rebinding attacks.
  * Socket peer addresses are validated post-connect before any SMTP traffic is initiated.
* **Safe SMTP Probing**: Probes issue `EHLO`, `MAIL FROM`, and `RCPT TO` only. The `DATA` command is never executed, and no email messages are ever transmitted. When SMTP probing is disabled (default), port 25 is never contacted.

### Client-Side Security & Error Redaction
* **Sanitized Error Responses**: API error responses never expose Python stack traces, exception classes, environment variables, or server file paths to clients.
* **CORS Restrictions**: Cross-Origin Resource Sharing permits only configured frontend origins (`FRONTEND_ORIGIN`).
* **Strict Security Headers**: Every HTTP response enforces `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Cache-Control: no-store, max-age=0`.
* **Spreadsheet Formula Injection Defense (CWE-1236)**: Exported CSV cells matching `=+\-@|%` or preceded by leading whitespace or control characters are automatically prepended with a single quote (`'`) to neutralize formula execution in Excel and Google Sheets.

### Remaining Risks
* While MailScope implements defense-in-depth protections, deploying any unauthenticated public API carries residual operational risks:
  1. Distributed botnets utilizing rotating residential proxies can distribute requests across many IP addresses to bypass IP-based rate limiting.
  2. Public SMTP probing from cloud provider IP ranges may lead to recipient mail servers temporarily greylisting or rate-limiting the MailScope host IP.
  3. Reverse proxies that log full HTTP request bodies would inadvertently store email addresses in proxy access logs unless specifically configured to omit request bodies.

---

## 11. Public Deployment Guide

MailScope is designed for production deployment as two independent services: a static Single-Page Application (Frontend) and a Python WSGI service (Backend).

### Option A: Render (Automated Two-Tier via `render.yaml`)
Render supports both Python Web Services and Static Sites with automated route rewrites using the committed `render.yaml` blueprint:
1. Push this repository to GitHub or GitLab.
2. Log into [Render Dashboard](https://dashboard.render.com/) and click **New + > Blueprint**.
3. Select the repository. Render will automatically detect `render.yaml` and provision:
   * **`mailscope-api`**: Python Web Service running Gunicorn.
   * **`mailscope-frontend`**: Static Site with SPA rewrite `/* -> /index.html`.
4. Update `FRONTEND_ORIGIN` on the backend with your frontend's assigned Render URL.
5. Update `VITE_API_BASE_URL` on the frontend with your backend's assigned Render URL and trigger a redeploy.

### Option B: Frontend on Vercel / Netlify + Backend on Railway / Fly.io

#### 1. Backend (Railway or Fly.io)
* **Start Command**: `gunicorn -w 4 -k gthread --threads 8 --bind 0.0.0.0:$PORT "backend.app:create_app()"`
* **Environment Variables**:
  * `PORT=5000`
  * `FLASK_ENV=production`
  * `FRONTEND_ORIGIN=https://<your-frontend-app>.vercel.app`
* Verify health endpoint: `curl https://<your-backend-url>/health`

#### 2. Frontend (Vercel or Netlify)
* **Root Directory**: `frontend`
* **Build Command**: `npm run build`
* **Output Directory**: `dist`
* **Environment Variable**: `VITE_API_BASE_URL=https://<your-backend-url>`
* The repository includes `frontend/vercel.json` and `frontend/public/_redirects` which automatically ensure direct visits to `/app` load correctly.

### Option C: Docker / Docker Compose
Deploy to any Linux VPS, AWS EC2, or DigitalOcean Droplet:
```bash
# Build and launch backend container
docker compose up -d

# Verify container health
curl -f http://localhost:5000/health
```

---

## 12. Operational Limitations & SMTP Realities

* **Port 25 Egress Blocking**: Outbound TCP port 25 is blocked by default across major cloud platforms (AWS, Google Cloud Run, Render, Vercel Serverless, DigitalOcean). When deploying to environments with port 25 restrictions:
  * Keep SMTP verification disabled (the default setting).
  * If SMTP is enabled, MailScope gracefully handles connection blocks and classifies the result as `unknown` with check status `unavailable`, never falsifying a bounce.
* **Greylisting**: Some mail servers temporarily reject initial connection attempts from unrecognized IPs with SMTP code `451` or `421`. MailScope treats temporary codes as `inconclusive`.
* **Catch-All Mailboxes**: Domains configured with catch-all routing will respond `250 OK` to any probed address. MailScope highlights this limitation in the Evidence Ledger.

---

## 13. License

Distributed under the MIT License. See `LICENSE` for details.
