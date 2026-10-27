# MailScope – Architecture Document

> **Phase 1 – Foundation**
> Last updated: 2026-10-26

---

## 1. Overview

MailScope is an **explainable email deliverability intelligence platform**.
It accepts batches of email addresses and classifies each one as:

| Verdict | Meaning |
|---|---|
| `likely_delivered` | Strong evidence the address exists and is reachable |
| `likely_bounce` | Strong evidence the address is invalid or unreachable |
| `unknown` | Insufficient evidence for a confident verdict |

Every result surfaces the **evidence** used and the **limitations** of that evidence.
The platform never claims certainty; mailbox existence can only be confirmed by actually delivering a message.

---

## 2. Repository Layout

```
mailScope/
├── frontend/            # React/Vite/TypeScript SPA
│   ├── src/
│   │   ├── pages/       # Route-level page components
│   │   ├── components/  # Shared UI components
│   │   ├── services/    # API client (fetch wrapper)
│   │   ├── types/       # Shared TypeScript type definitions
│   │   ├── styles/      # Additional CSS (Tailwind extended via @theme)
│   │   └── __tests__/   # Frontend unit tests
│   ├── .env.example
│   └── vite.config.ts
├── backend/             # Python/Flask REST API
│   ├── app.py           # Application factory
│   ├── services/
│   │   ├── syntax_checker.py
│   │   ├── dns_checker.py
│   │   ├── smtp_checker.py
│   │   └── classifier.py
│   ├── tests/
│   │   ├── test_syntax_checker.py
│   │   ├── test_dns_checker.py
│   │   ├── test_smtp_checker.py
│   │   └── test_classifier.py
│   ├── requirements.txt
│   └── requirements-dev.txt
├── docs/
│   └── architecture.md  # this file
├── .env.example
├── .gitignore
└── pyproject.toml       # pytest configuration
```

---

## 3. Frontend

### 3.1 Technology choices

| Concern | Library / Tool | Rationale |
|---|---|---|
| UI framework | React 19 + TypeScript | Widespread ecosystem, strict typing |
| Build tool | Vite 6 | Fast HMR, native ESM, first-class TypeScript |
| CSS | Tailwind CSS v4 | Single `@import "tailwindcss"` no config file required |
| Routing | React Router v7 | Declarative, nested-route capable |
| Icons | Lucide React | Tree-shakeable, consistent icon set |

### 3.2 Routes

| Path | Component | Purpose |
|---|---|---|
| `/` | `LandingPage` | Marketing / entry page |
| `/app` | `AnalyzerPage` | Batch email analysis UI |

### 3.3 API client

`src/services/api.ts` wraps `fetch` and reads `VITE_API_URL` at build time.
During local development the Vite dev-server proxies `/health` and `/api/*` to `localhost:5000`
so no CORS headers are required for browser requests.

### 3.4 Type safety

`src/types/index.ts` defines request/response types that mirror the backend's Python dataclasses.
These are the source of truth for the frontend; there is no code-generation step in Phase 1.

---

## 4. Backend

### 4.1 Technology choices

| Concern | Library | Rationale |
|---|---|---|
| HTTP framework | Flask 3 | Lightweight, minimal surface area for an API |
| CORS | flask-cors 5 | Parameterised per-origin; never wildcard in production |
| DNS resolution | dnspython 2.9 | Mature, actively maintained; supports all record types |
| Email syntax | email-validator 2.3 | RFC 5321/5322 compliant, returns normalised addresses |
| Testing | pytest 8 + pytest-cov | Standard Python test tooling |

### 4.2 Service pipeline

```
Raw address
    |
    v
syntax_checker.check_syntax()
    |  invalid? -> LIKELY_BOUNCE (exit early)
    v
dns_checker.check_dns()
    |  NXDOMAIN? -> LIKELY_BOUNCE
    |  TIMEOUT/ERROR? -> UNKNOWN
    v
smtp_checker.check_smtp()   <- disabled by default
    |  ACCEPTED? -> LIKELY_DELIVERED
    |  REJECTED? -> LIKELY_BOUNCE
    |  INCONCLUSIVE/DISABLED? -> UNKNOWN
    v
classifier.classify()
    +-> ClassificationResult(verdict, reason_code, evidence[], limitations[])
```

### 4.3 SMTP verification policy

SMTP checks are **off by default** and must be explicitly enabled per request. Even when enabled:

- No message is ever sent (the handshake ends immediately after `RCPT TO`).
- Blocked connections, port-25 rejections, and timeouts are treated as **inconclusive**, not as evidence of non-existence.
- The result surfaces `smtp_code` and a human-readable reason so the UI can explain what happened.

### 4.4 No database

Phase 1 has no persistence layer. Each `/api/v1/analyze` call is stateless.
A database would be appropriate if we add: result caching, usage auditing, or team/project management.
None of these are required today.

---

## 5. Environment variables

| Variable | Consumer | Purpose |
|---|---|---|
| `PORT` | Backend | Flask listen port (default 5000) |
| `CORS_ORIGIN` | Backend | Allowed browser origin for CORS |
| `FLASK_ENV` | Backend | `development` or `production` |
| `VITE_API_URL` | Frontend | Backend base URL inlined at build time |

See `.env.example` for defaults.

---

## 6. Local development

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm run dev      # http://localhost:5173
```

### Backend

```bash
# from workspace root
python -m flask --app backend.app:create_app run --debug --port 5000
```

### Tests

```bash
# Python (from workspace root)
python -m pytest

# Frontend type check + build
cd frontend && npm run build
```

---

## 7. Phase 2 – Planned work

- Full LandingPage design (hero, features, CTA)
- Full AnalyzerPage UI (textarea input, results table, evidence expansion, reason code ledger)
- `/api/v1/analyze` route fully implemented
- Frontend test suite (Vitest)
- Domain-level DNS result caching (in-memory, TTL-bound) to speed up batch analysis
- CI workflow (GitHub Actions)
