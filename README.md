# Mailora – Explainable Email Deliverability Intelligence

> **"Every Address Has a Story. Discover the Signals."**
>
> **Mailora** is an explainable email deliverability intelligence platform grounded in technical evidence. It analyzes mail-routing infrastructure, authoritative DNS configurations, and protocol-level recipient signals to provide transparent, auditable classifications for email addresses—without ever sending messages.

---

## Table of Contents
- [A. Project Overview](#a-project-overview)
- [B. Live Demo and Repository](#b-live-demo-and-repository)
- [C. Architecture and Technology Stack](#c-architecture-and-technology-stack)
- [D. How Mailora Interprets Results](#d-how-mailora-interprets-results)
- [E. SMTP Limitations in the Deployed Version](#e-smtp-limitations-in-the-deployed-version)
- [F. Unknown Results Are Valid](#f-unknown-results-are-valid)
- [G. Privacy and Responsible Use](#g-privacy-and-responsible-use)
- [H. Local Installation and Execution](#h-local-installation-and-execution)
- [I. Testing and Operational Limitations](#i-testing-and-operational-limitations)
- [Additional Features & Reference](#additional-features--reference)
  - [Application Workspaces & Routes](#application-workspaces--routes)
  - [Technical Demographics Policy](#technical-demographics-policy)
  - [Multi-Tier Storage Architecture](#multi-tier-storage-architecture)
  - [Document Email Extraction Workflow](#document-email-extraction-workflow)
  - [Appearance & Theme System](#appearance--theme-system)
  - [License](#license)

---

## A. Project Overview

Traditional email verification services operate as black boxes, returning opaque binary "valid" or "invalid" judgements without technical justification or evidentiary audit trails. In reality, internet mail delivery is nuanced:
* Mailbox existence **cannot always be verified conclusively** without attempting actual message transmission.
* Many enterprise mail servers deploy **greylisting**, **silent acceptance**, or **catch-all configurations** that accept all recipients during the initial SMTP handshake.
* Outbound SMTP port 25 connections are frequently blocked or restricted by hosting providers and ISPs.

**Mailora** replaces arbitrary scorecards with transparent technical evidence. It analyzes email addresses across multi-layered technical dimensions:
1. **Email Syntax Validation**: Rigorous validation against RFC 5321 and RFC 5322 grammar, label length constraints, and internationalized domain names (IDNA).
2. **DNS Resolution**: Authoritative resolution of DNS zone data using dual-stack IPv4 (`A`) and IPv6 (`AAAA`) queries.
3. **MX Records & Mail-Routing Configuration**: Prioritized Mail Exchanger (MX) evaluation, RFC 5321 § 5.1 implicit MX fallback to domain `A`/`AAAA` records, RFC 7505 Null MX rejection, and domain-level authentication record inspection (SPF and DMARC).
4. **Optional SMTP Recipient-Handshake Probing**: Bounded, non-intrusive protocol handshakes (`HELO`/`EHLO`, `MAIL FROM`, `RCPT TO`, `RSET`, `QUIT`) where supported by the network environment.
5. **Evidence-Based Result Classification**: A deterministic 13-rule decision engine that produces an explicit verdict, structured reason codes, human-readable explanations, and an auditable **Evidence Ledger**.

> [!IMPORTANT]
> **Strict Zero-Message Architecture**: Mailora **does not send email messages** as part of recipient verification. It never transmits message bodies, never issues the SMTP `DATA` command, and never delivers test messages to mailboxes. All intelligence is derived exclusively from non-intrusive protocol handshakes and public domain infrastructure.

---

## B. Live Demo and Repository

### Project Links
* **GitHub Repository**: [https://github.com/sathvik-1506/Mailora](https://github.com/sathvik-1506/Mailora)
* **Live Frontend**: [https://mailora-xi.vercel.app/app/analyze](https://mailora-xi.vercel.app/app/analyze)
* **Backend Health Endpoint**: [https://mailora-api.onrender.com/health](https://mailora-api.onrender.com/health)

> [!NOTE]
> **Hosting & Availability Note**: The backend API is hosted on Render's web service tier. Free web services on Render automatically spin down after periods of inactivity. If the service has spun down, the health endpoint and API may take approximately 50–60 seconds to complete a cold start before responding. Do not assume an endpoint is offline until allowing for cold-start latency.

### How to Use the Application
1. **Open the Application**: Navigate to the live frontend at [https://mailora-xi.vercel.app/app/analyze](https://mailora-xi.vercel.app/app/analyze).
2. **Enter Email Addresses**:
   * Enter addresses directly into the textarea (one per line, or delimited by commas/semicolons).
   * Or upload a supported document (`.txt`, `.csv`, `.pdf`, `.docx`, `.eml`) to extract candidate addresses automatically.
   * Or load one of the built-in test batches to inspect predefined deliverability scenarios.
3. **Run the Analysis**: Click **Analyze Batch**. The system automatically performs syntax validation, authoritative DNS resolution, mail-routing verification, and environment-aware SMTP probing.
4. **Inspect Results and the Evidence Ledger**:
   * Review the aggregate verdict summary (**Likely to Deliver**, **Likely Bounce**, **Unknown**) in the interactive results table.
   * Click **Inspect Evidence** on any address row to open the **Evidence Drawer**.
   * Review the granular checks: Syntax, DNS Domain, Mail Routing, SMTP Probe, and Mailbox Existence.
   * Inspect authoritative MX priority records, target IPs, SPF/DMARC policies, reason codes, and technical limitations.

---

## C. Architecture and Technology Stack

### Request Flow
```
┌─────────────────┐       JSON Batch Request       ┌──────────────────┐
│  React Frontend │ ─────────────────────────────> │  Flask REST API  │
│    (Vercel)     │ <───────────────────────────── │     (Render)     │
└─────────────────┘       Structured Verdicts      └─────────┬────────┘
                                                             │
                              ┌──────────────────────────────┴──────────────────────────────┐
                              │                                                             │
                              ▼                                                             ▼
                    ┌───────────────────┐                                         ┌───────────────────┐
                    │ 1. Syntax Checker │                                         │ 2. DNS/MX Checker │
                    │   (email-validator)                                         │    (dnspython)    │
                    └─────────┬─────────┘                                         └─────────┬─────────┘
                              │                                                             │
                              └──────────────────────────────┬──────────────────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ 3. SMTP Prober    │
                                                   │  (smtplib/socket) │
                                                   │   [Environment    │
                                                   │    Aware Probe]   │
                                                   └─────────┬─────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ 4. Classifier     │
                                                   │  (13-Rule Engine) │
                                                   └─────────┬─────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Structured JSON   │
                                                   │ & Evidence Ledger │
                                                   └───────────────────┘
```

1. **Client Submission**: The user submits email addresses via the React SPA running on Vercel.
2. **API Ingestion & Validation**: The Flask API (`backend/app.py`) parses the payload against `schemas.py`, validates bounds, enforces rate limiting, and masks addresses for privacy-safe server logging.
3. **Syntax Validation**: `syntax_checker.py` evaluates grammatical validity, length constraints, and IDNA normalization.
4. **DNS & Mail Routing Audit**: `dns_checker.py` queries authoritative nameservers for MX records, evaluates RFC 5321 § 5.1 implicit MX fallback, detects RFC 7505 Null MX records, resolves dual-stack `A`/`AAAA` target IPs, and queries root SPF and DMARC policies.
5. **Optional SMTP Probing**: `smtp_checker.py` verifies target IP security (anti-SSRF/anti-TOCTOU), tests network reachability, and executes an RFC 5321 recipient handshake probe (`RCPT TO`). If port 25 egress is blocked by the host, it safely records network unreachability without stalling.
6. **Classification Engine**: `classifier.py` synthesizes multi-dimensional evidence into a deterministic verdict (`likely_delivered`, `likely_bounce`, `unknown`), assigning explicit reason codes and technical explanations.
7. **Response & Audit**: Structured JSON is returned to the client and rendered in the **Evidence Ledger**. Aggregate metadata (batch ID, counts, domain summary) is stored in SQLite for 30-day history tracking, while full per-address results are cached strictly in browser `localStorage`.

### Component Responsibilities
* **Frontend (`frontend/`)**: Single-page application providing batch input, file upload extraction, analytics telemetry, CSV export generation (with CWE-1236 spreadsheet formula injection defense), multi-page routing, and theme switching.
* **Backend API (`backend/app.py`)**: Flask WSGI application managing API routes (`/health`, `/api/analyze`, `/api/extract`, `/api/history`), request validation, error formatting, CORS policies, bounded thread pool concurrency (`ThreadPoolExecutor`), and privacy-preserving masking.
* **Validation Services (`backend/services/`)**:
  * `syntax_checker.py`: RFC grammar validation and address normalization.
  * `dns_checker.py`: Authoritative DNS queries, MX preference sorting, dual-stack IP resolution, and SPF/DMARC policy discovery.
  * `smtp_checker.py`: Non-intrusive socket handshakes, SSRF defense, network unreachability detection, and environment caching.
  * `classifier.py`: 13-rule deterministic decision engine combining independent validation signals.
  * `schemas.py`: Request schemas, batch bounds, length limits, and email masking.
  * `extractor.py`: Streaming extraction of candidate emails from text, CSV, PDF, Word, and EML documents.
  * `history_service.py`: Multi-tier SQLite/PostgreSQL aggregate metadata persistence with automated 30-day retention pruning.
* **Deployment Platforms**:
  * **Vercel**: Static hosting and global CDN distribution for the React/Vite SPA.
  * **Render**: Cloud web service running the Python WSGI application via Gunicorn.

### Confirmed Technologies and Versions
| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Backend Framework** | Flask | `3.1.x` | Core REST API web framework |
| **WSGI Server** | Gunicorn | `23.0.x` | Production WSGI HTTP server with `gthread` workers |
| **DNS Resolution** | dnspython | `2.7.x` | Authoritative DNS resolution and record extraction |
| **Syntax Validation** | email-validator | `2.2.x` | RFC 5321 / RFC 5322 syntax validation |
| **Document Processing**| pypdf / python-docx | `5.0+` / `1.1+` | Candidate address extraction from PDF and Word files |
| **Database** | SQLite 3 | Standard Library | Server-side aggregate metadata and history tracking |
| **Backend Testing** | pytest / pytest-cov | `8.3+` / `6.0+` | Automated test suite and coverage reporting |
| **Frontend Core** | React / React DOM | `19.3.x` | Reactive UI framework |
| **Frontend Tooling** | Vite | `8.3.x` | Build tool and local development server |
| **Language** | TypeScript | `5.8+` / `6.0.x` | Static typing across the frontend application |
| **Routing** | React Router | `7.18.x` | Client-side routing with SPA fallback |
| **Styling** | Tailwind CSS | `4.3.x` | Utility-first styling engine with `@tailwindcss/vite` |
| **Icons** | Lucide React | `1.61.x` | Interface iconography |
| **Frontend Testing** | tsx / Node.js test runner | `4.23.x` | TypeScript test execution for unit and integration suites |
| **Frontend Linter** | oxlint | `1.88.x` | High-performance Rust-based JavaScript/TypeScript linter |

---

## D. How Mailora Interprets Results

Mailora decouples validation into distinct technical dimensions. It never conflates domain-level routing with recipient mailbox existence.

### Meaning of Statuses
* **Valid Syntax**: The address conforms strictly to RFC 5321 and RFC 5322 grammar, has a valid domain label, does not exceed 64 characters in the local-part or 255 characters in the domain, and passes IDNA normalization.
* **DNS/MX Configured**: The recipient domain exists in authoritative DNS and publishes usable mail-routing configuration (either dedicated MX records or RFC 5321 § 5.1 implicit fallback to domain `A`/`AAAA` records).
* **SMTP Unavailable**: The SMTP check could not be completed from the current hosting environment due to outbound network egress restrictions (e.g. port 25 firewall blocks, `Errno 101: Network is unreachable`), connection refusal, or host unreachability.
* **Unknown**: Available technical evidence is insufficient to determine the outcome reliably. Mailora preserves uncertainty rather than manufacturing a guess.
* **Likely to Deliver**: An estimate based on the checks that actually succeeded (valid syntax, configured mail routing, and target mail server acknowledgment during an SMTP recipient handshake). **This is an estimate, not a guarantee of mailbox existence or inbox delivery.**
* **Likely Bounce**: A result based on sufficiently strong, definitive negative evidence under the implemented classification rules (e.g. invalid syntax, non-existent domain NXDOMAIN, RFC 7505 Null MX, missing mail routing, or explicit 5xx SMTP recipient rejection).

### Domain-Level Routing vs. Individual Recipient Mailbox Existence

> [!WARNING]
> **Critical Distinction**:
> * **Domain-Level Routing Evidence** (valid syntax + resolved MX records) confirms only that the organization has designated mail servers to accept incoming traffic.
> * **Mailbox Existence** confirms that a specific user account exists on that mail server.
>
> **Syntax validation and MX records DO NOT confirm that an individual mailbox exists.** A domain may publish valid MX records but reject every unknown recipient, or it may accept all recipients indiscriminately under a catch-all configuration.

### Implemented Classification Rules Summary

| Rule | Observed Technical Signals | Verdict | Reason Code | Technical Meaning |
| :--- | :--- | :--- | :--- | :--- |
| **1. Invalid Syntax** | RFC grammar violation or invalid characters | `likely_bounce` | `INVALID_SYNTAX` | Address cannot be routed by any mail system. |
| **2. Domain Not Found** | Authoritative DNS returns `NXDOMAIN` | `likely_bounce` | `DOMAIN_NOT_FOUND` | Domain does not exist in the root DNS zone. |
| **3. Null MX Record** | RFC 7505 priority 0 dot (`.`) published | `likely_bounce` | `NO_MAIL_ROUTING` | Domain explicitly declares it does not accept email. |
| **4. No Mail Routing** | Domain exists but has no MX and no A/AAAA | `likely_bounce` | `NO_MAIL_ROUTING` | Domain has no mail server configured. |
| **5. DNS Timeout** | Nameserver query timed out | `unknown` | `DNS_TIMEOUT` | Temporary infrastructure issue; status inconclusive. |
| **6. DNS Server Failure** | Nameserver returned `SERVFAIL` or network error | `unknown` | `DNS_TEMPORARY_FAILURE` | Temporary resolution failure; status inconclusive. |
| **7. Mailbox Accepted** | Target MX server returned `250 OK` to `RCPT TO` | `likely_delivered` | `MAILBOX_ACCEPTED` | Server acknowledged recipient (subject to catch-all caveats). |
| **8. Mailbox Rejected** | Target MX server returned `5xx` rejection | `likely_bounce` | `MAILBOX_REJECTED` | Server explicitly rejected recipient address. |
| **9. SMTP Unavailable** | Outbound port 25 blocked (`Errno 101` / refused) | `unknown` | `SMTP_UNAVAILABLE` | Hosting environment cannot reach port 25; DNS preserved. |
| **10. SMTP Timeout** | Socket connection or handshake timed out | `unknown` | `SMTP_TIMEOUT` | Target server unresponsive; status inconclusive. |
| **11. Mailbox Unconfirmed** | MX configured, but SMTP unattempted/disabled | `unknown` | `MAILBOX_UNCONFIRMED` | Domain routes mail, but individual mailbox unverified. |
| **12. Ambiguous Evidence** | Server returned `4xx` deferral or greylisting | `unknown` | `AMBIGUOUS_EVIDENCE` | Temporary deferral; deliverability unconfirmed. |

---

## E. SMTP Limitations in the Deployed Version

### Observed Deployment Behavior on Render
During verification testing in Mailora's deployed production environment on Render, outbound SMTP recipient probes failed with the following evidence:
* **Check Status in Evidence Ledger**: `SMTP_UNAVAILABLE`
* **Underlying Kernel Error**: `[Errno 101] Network is unreachable`
* **Port**: TCP Port 25 (outbound)

This behavior occurs because the deployed environment could not establish the required outbound SMTP connection. Render's free web-service restrictions on outbound SMTP traffic are a known limitation relevant to this deployment.

### Render's Outbound Port 25 Egress Restriction
Cloud platforms restrict outbound traffic on TCP port 25 to protect their IP ranges from spam and abuse. Render explicitly blocks outbound port 25 on free web services:
* **Official Render Documentation**: [Render Changelog: Free web services will no longer allow outbound traffic to SMTP ports](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)

### Key Realities of the Deployed Environment
1. **SMTP unavailability is NOT proof that an email address is invalid**: A blocked port 25 socket connection reflects a hosting-provider network firewall policy, not recipient invalidity.
2. **DNS and MX checks remain fully operational**: Even when SMTP probing cannot connect, Mailora successfully validates RFC syntax, resolves authoritative MX hosts, sorts routing preferences, verifies dual-stack `A`/`AAAA` IPs, and inspects SPF and DMARC policies.
3. **Mailbox existence remains unconfirmed**: Without an active recipient-handshake probe or actual delivery attempt, Mailora cannot verify whether the recipient mailbox exists. It marks mailbox existence as `Unconfirmed` and assigns an `unknown` verdict.
4. **Switching web frameworks does not solve network restrictions**: Switching from Flask to FastAPI (or any other application framework) does not alter hosting-level network firewall rules. Egress restrictions are enforced by the cloud infrastructure kernel, not the application framework.
5. **Local behavior differs from deployed behavior**: When running Mailora locally on a network where port 25 is open (or using local test fixtures), SMTP socket probes may connect. In the deployed Render free web-service environment, outbound port 25 is blocked.

> [!CAUTION]
> **Production Integrity Policy**: Mailora does not claim that SMTP probing works in production unless it has been tested successfully from the actual deployed environment. In Render's free environment, Mailora automatically detects the egress block, caches the unreachability signal for 120 seconds to prevent connection hangs, and gracefully returns `unknown` with `SMTP_UNAVAILABLE`.

---

## F. Unknown Results Are Valid

A foundational design principle of Mailora is that **preserving uncertainty is better than manufacturing a false definitive answer**.

### Why Mail Servers Hide Mailbox Existence
Many modern mail servers and security gateways are intentionally configured not to disclose whether an individual mailbox exists:
* **Catch-All Routing**: Enterprise mail servers frequently accept all recipient envelopes during the SMTP handshake (`250 OK`), routing non-existent addresses to an administrator queue or silently discarding them post-session.
* **Greylisting**: Security gateways temporarily defer unknown senders with `451` or `421` codes to deter spam automation.
* **Anti-Harvesting Defenses**: Providers implement tarpitting, rate-limiting, and generic responses to prevent directory harvest attacks (DHA).
* **Network Restrictions & Timeouts**: Hosting firewalls, temporary DNS latency, or remote server downtime prevent conclusive communication.

When Mailora encounters these conditions, returning `unknown` is the technically honest outcome.

### Illustrative Example: An Honest Result Under SMTP Restrictions

| Evaluation Dimension | Assessed Value | Technical Evidence & Explanation |
| :--- | :--- | :--- |
| **Email Address** | `alex@example.com` | Target recipient under analysis |
| **Syntax Validation** | **Valid** | Conforms to RFC 5321/5322 grammar and length bounds |
| **DNS Domain Resolution** | **Resolved** | Domain resolves via authoritative nameservers |
| **Mail Routing** | **Configured** | Priority MX records resolved (`mail.example.com` with IPv4 `A` record) |
| **SMTP Probe** | **Unavailable** | Outbound port 25 unreachable (`Errno 101: Network is unreachable`) |
| **Mailbox Existence** | **Unconfirmed** | Handshake could not be performed due to hosting egress restriction |
| **Overall Verdict** | **Unknown** | Reason Code: `SMTP_UNAVAILABLE` |

**User Explanation Provided by Mailora**:
> *"SMTP verification could not be completed because the current hosting environment cannot establish the required outbound connection. This does not mean the email address is invalid. DNS/MX results are available, but mailbox existence remains unconfirmed."*

*(Note: This example illustrates how Mailora handles network egress restrictions. Actual results depend on the observed evidence for each specific domain and address.)*

---

## G. Privacy and Responsible Use

Mailora is built with strict privacy and security principles. All users and operators must adhere to these policies:

1. **Authorized Analysis Only**: Only analyze email addresses that you own or are explicitly authorized to assess.
2. **Zero-Message Policy**: Do not send unsolicited or unverified email messages to addresses you do not own. Mailora itself never sends emails, transmits message content, or delivers test messages.
3. **Third-Party Server Interaction**: SMTP recipient probes, where supported and enabled, initiate direct socket handshakes with third-party mail servers (`MAIL FROM` / `RCPT TO`). Although no message is sent, target servers log these connection attempts.
4. **Respect Rate Limits and Policies**: Respect remote provider policies, avoid aggressive probing, and comply with all applicable privacy regulations (such as GDPR, CCPA, and anti-spam legislation).
5. **Protect Credentials and Logs**: Never publish raw email addresses, production credentials, API secrets, private database connection strings, or sensitive logs in public GitHub issues, pull requests, screenshots, or repository commits.

---

## H. Local Installation and Execution

### Prerequisites
* **Python**: Python 3.12+ or 3.14+
* **Node.js**: Node.js 20+ and npm 10+
* **Git**: Installed and configured

### 1. Clone the Repository
```bash
git clone https://github.com/sathvik-1506/Mailora.git
cd Mailora
```

### 2. Backend Setup & Startup (Terminal 1)

#### Windows (PowerShell)
```powershell
# Create and activate a Python virtual environment
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install runtime and development dependencies
pip install -r backend/requirements-dev.txt

# Start the Flask development server from the repository root
python -m backend.app
```

#### Linux / macOS (Bash)
```bash
# Create and activate a Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install runtime and development dependencies
pip install -r backend/requirements-dev.txt

# Start the Flask development server from the repository root
python3 -m backend.app
```
* **Local API Base URL**: `http://localhost:5000`
* **Health Check URL**: `http://localhost:5000/health`

### 3. Frontend Setup & Startup (Terminal 2)

#### All Operating Systems
```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```
* **Local Frontend URL**: `http://localhost:5173`

### Environment Variables Reference

| Variable Name | Service | Default Value | Purpose & Constraints |
| :--- | :--- | :--- | :--- |
| `PORT` | Backend | `5000` | Port for the Flask / Gunicorn HTTP server. |
| `FLASK_ENV` | Backend | `development` | Set to `production` in deployed environments. |
| `FRONTEND_ORIGIN` | Backend | `http://localhost:5173,http://localhost:3000` | Allowed CORS origins (comma-separated). Required in production. |
| `SMTP_PROBING_ENABLED` | Backend | `auto` | Probing mode: `auto` (auto-detects egress blocks), `disabled`/`false`, `enabled`/`true`. |
| `SMTP_TIMEOUT_SECONDS` | Backend | `3.0` | Socket connection timeout in seconds (bounded between 1.0s and 10.0s). |
| `SMTP_CACHE_TTL_SECONDS` | Backend | `120.0` | Cache duration in seconds for network unreachability (`Errno 101`) to prevent connection stalls. |
| `MAX_BATCH_SIZE` | Backend | `100` | Maximum number of email addresses permitted per batch analysis request. |
| `MAX_CONCURRENT_WORKERS`| Backend | `10` | Bounded thread pool concurrency limit for batch analysis (1 to 20). |
| `MAX_CONTENT_LENGTH` | Backend | `10485760` (10 MB) | Maximum permitted HTTP request payload size in bytes. |
| `SQLITE_PATH` | Backend | `data/mailora_history.db` | Filepath for SQLite history database (or `:memory:` for testing). |
| `HISTORY_RETENTION_DAYS`| Backend | `30` | Number of days to retain server-side run metadata before automatic pruning. |
| `VITE_API_BASE_URL` | Frontend | `http://localhost:5000` | Base URL pointing to the backend API (no trailing slash). |

### Troubleshooting Common Issues

* **CORS Errors (`Access-Control-Allow-Origin`)**:
  * Ensure the backend has `FRONTEND_ORIGIN` configured to match your frontend port (e.g. `http://localhost:5173`).
  * In production, the backend requires an explicit `FRONTEND_ORIGIN` matching the Vercel deployment URL.
* **API Connectivity Failures (`NetworkError` / Failed to Fetch)**:
  * Verify that the backend is running and listening on port 5000 (`curl http://localhost:5000/health`).
  * Verify `VITE_API_BASE_URL` in `frontend/.env` or deployment settings points to the active backend URL.
* **DNS Resolution Timeouts**:
  * Local firewalls, enterprise VPNs, or ISP security filters may block UDP port 53. Check that your local machine can query external nameservers (e.g. `nslookup -type=mx google.com`).
* **SMTP Port 25 Unavailability (`Errno 101` / Connection Refused)**:
  * Most residential ISPs and cloud hosting providers block outbound TCP port 25.
  * Mailora automatically handles this: it records `SMTP_UNAVAILABLE`, caches the condition, and assigns an `unknown` verdict while preserving all DNS/MX evidence.
  * To disable socket probing entirely and prevent timeouts, set `SMTP_PROBING_ENABLED=disabled`.

---

## I. Testing and Operational Limitations

### Automated Test Verification
Both backend and frontend test suites are fully automated and verified against the current codebase:

#### Backend Pytest Suite
```bash
pytest backend/tests
```
* **Observed Test Outcome**: **189 passed**, 0 failures (11.54s execution time).
* **Coverage**: RFC syntax parsing, authoritative MX resolution, dual-stack `A`/`AAAA` fallback, RFC 7505 Null MX detection, RFC 5321 § 5.1 implicit fallback, SPF and DMARC extraction, anti-SSRF/anti-TOCTOU IP validation, network unreachable caching (`Errno 101`), graceful port 25 degradation, document candidate extraction, SQLite aggregate persistence, pagination, and date filtering.

#### Frontend Test Suite
```bash
cd frontend
npm test
```
* **Observed Test Outcome**: **79 passed across 17 test suites**, 0 failures (856ms execution time).
* **Coverage**: Address parsing, CWE-1236 CSV spreadsheet formula injection defense, verdict filter/search consistency, API client response mapping, document extraction client, theme system persistence (Light/Dark/System), and history ledger state management.

#### Frontend Linter and Production Build
```bash
cd frontend
npm run lint    # oxlint runs on 54 files (0 errors)
npm run build   # tsc -b && vite build (production bundle generated in dist/)
```

### Operational Limitations
1. **Hosting-Level SMTP Egress Restrictions**: As documented in Section E, free cloud hosting platforms like Render block outbound TCP port 25. SMTP probing cannot verify individual mailboxes in this environment.
2. **Inconclusive Recipient Responses**: Mailbox existence cannot be definitively confirmed on mail servers that employ catch-all routing, greylisting deferrals (`451`), or silent discards.
3. **Deliverability Estimate vs. Guaranteed Delivery**: A `likely_delivered` verdict indicates that technical syntax, domain routing, and recipient-handshake checks succeeded. It **does not guarantee that a message will be delivered to the inbox**, as spam filters, IP reputation, sender domain authentication, and recipient content filters operate post-handshake.

---

## Additional Features & Reference

### Application Workspaces & Routes

Mailora is organized as a multi-page single-page application with dedicated workspaces:

| Route | Workspace | Purpose |
| :--- | :--- | :--- |
| `/` | **Landing Page** | Public homepage detailing methodology, zero-message policy, and interactive demo fixtures. |
| `/app` | **Overview Dashboard** | Deliverability intelligence hub displaying genuine aggregate metrics, verdict distributions, and recent activity. |
| `/app/analyze` | **Analyze Emails** | Verification engine supporting manual entry, sample test fixtures, and document file upload with candidate extraction. |
| `/app/exports` | **Export Center** | CSV report generator featuring report preview, column selection, download history, and formula injection defense (CWE-1236). |
| `/app/analytics` | **Analytics** | Technical dataset composition telemetry: domain rankings, email provider infrastructure breakdown, and routing outcomes. |
| `/app/history` | **Analysis History** | Execution ledger featuring run search, date-range filtering, pagination, run inspection, and CSV downloads. |
| `/app/settings` | **Settings** | Appearance preferences (Light/Dark/System), SMTP default configuration explanation, and history deletion controls. |

### Technical Demographics Policy

> [!NOTE]
> **Definition**: In Mailora, "demographics" strictly refers to the **technical characteristics and composition of the email dataset** (such as domain distribution, mail provider infrastructure, and syntax hygiene).
>
> Mailora **never infers or estimates personal demographics** (such as age, gender, ethnicity, income, location, or personal identity).

* **Custom Domain Privacy**: Custom domains are classified as `"Custom / Unknown Provider"` unless authoritative MX evidence links them to a known provider (e.g. Google Workspace, Microsoft 365, Proton, Zoho).
* **Decoupled Classification**: Provider infrastructure classification is strictly separated from individual mailbox deliverability.
* **Privacy-Safe Aggregation**: Email local-parts are never rendered in charts, analytics summaries, or history lists.

### Multi-Tier Storage Architecture

Mailora uses a privacy-preserving storage model designed for unauthenticated environments:

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
* **30-Day Metadata Retention**: Server-side history stores non-sensitive aggregate statistics with an automatic 30-day pruning TTL (`purge_expired_runs`).
* **Client-Side Isolation**: Detailed per-recipient check evidence is stored in browser `localStorage`.
* **User-Driven Deletion**: Users can delete individual runs or clear all history records at any time from both `/app/history` and `/app/settings`.

### Document Email Extraction Workflow

The Analyze Emails workspace (`/app/analyze`) includes a streaming extraction workflow to detect candidate addresses from document files:

| Format | Extension | Processing Engine | Notes |
| :--- | :--- | :--- | :--- |
| **Plain Text** | `.txt` | Streaming Regex | Candidate extraction with row tracking. |
| **Spreadsheets / CSV** | `.csv` | Python `csv.reader` | Delimiter sniffing (comma, semicolon, tab) with coordinates. |
| **PDF Documents** | `.pdf` | `pypdf` | Text extraction with page tracking. Non-searchable scanned PDFs require OCR. |
| **Word Documents** | `.docx` | `python-docx` | Paragraph and table cell extraction. |
| **Email Messages** | `.eml` | Python `email` | RFC 822 header extraction (To, From, Cc, Bcc) and body extraction. |

* **Protections**: Binary Word files (`.doc`) and executables/archives (`.exe`, `.dll`, `.bat`, `.zip`, etc.) are rejected immediately. File uploads are bounded to 5 MB per file and 10 MB total batch size.

### Appearance & Theme System

Mailora features a persistent appearance system:
* **Three Selectable Modes**: **Light** (clean daylight theme), **Dark** (slate/zinc theme), and **System** (syncs with `prefers-color-scheme`).
* **Persistence & FOUC Prevention**: Preference persisted in `localStorage`. The root theme class is applied before paint to eliminate Flash of Unstyled Content (FOUC).

---

## License

Distributed under the MIT License. See `LICENSE` for details.
