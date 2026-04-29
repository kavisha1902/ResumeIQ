# ResumeIQ — Intelligent Resume Screening System

Full-stack web application for AI-powered resume screening, candidate ranking, and fairness auditing.

Based on the research paper:
> *Intelligent Resume Screening System: A Machine Learning Approach to Automated Talent Acquisition*
> Chandigarh University, 2026

---

## Project Structure

```
resumeiq/
├── backend/          ← Node.js + Express API
│   ├── server.js
│   ├── routes/
│   │   ├── auth.js       (register, login, demo)
│   │   ├── analyze.js    (resume analysis via Anthropic)
│   │   └── history.js    (CRUD for past analyses)
│   ├── middleware/
│   │   └── auth.js       (JWT verification)
│   ├── utils/
│   │   ├── store.js      (file-based JSON database)
│   │   └── extractor.js  (PDF/DOCX text extraction)
│   ├── data/             (auto-created — users.json, history.json)
│   ├── .env.example
│   └── package.json
│
└── frontend/         ← Vanilla HTML/CSS/JS
    ├── index.html
    ├── config.js         (set API URL here)
    └── package.json
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- An Anthropic API key (https://console.anthropic.com)

---

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env from template
cp .env.example .env
```

Edit `.env` and fill in:
```env
PORT=3001
JWT_SECRET=replace_with_a_long_random_string_at_least_32_chars
ANTHROPIC_API_KEY=sk-ant-your-key-here
FRONTEND_URL=http://localhost:3000
```

Start the server:
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server runs at: `http://localhost:3001`
Health check: `http://localhost:3001/api/health`

---

### 2. Frontend Setup

```bash
cd frontend
```

If needed, edit `config.js` to point to your backend:
```js
window.RESUMEIQ_CONFIG = {
  API_BASE_URL: 'http://localhost:3001/api',
};
```

Serve the frontend (any static server works):
```bash
# Option A — Python (no install needed)
python3 -m http.server 3000

# Option B — Node serve
npx serve . -p 3000

# Option C — Just open index.html directly in browser
# (works for development; change API_BASE_URL in config.js if needed)
```

Open: `http://localhost:3000`

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/demo` | Demo account login |
| GET  | `/api/auth/me` | Get current user (JWT required) |

### Analysis
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze` | Analyze resumes (multipart/form-data) |

**Form fields:**
- `resumes` — file(s): PDF, DOC, DOCX, TXT (max 10MB each, up to 20 files)
- `jobDescription` — string
- `pastedResume` — string (optional)
- `model` — `bert_xgboost` | `ensemble` | `bert` | `tfidf_svm`
- `threshold` — float e.g. `0.72`
- `biasMitigation` — `adversarial` | `rerank` | `none`

### History
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/api/history` | List all past analyses |
| GET    | `/api/history/:id` | Get full analysis record |
| DELETE | `/api/history/:id` | Delete a record |

---

## Features

### Authentication
- JWT-based auth (7-day tokens)
- bcrypt password hashing (12 rounds)
- Auto-login on page refresh
- Demo account for quick testing

### Analysis Pipeline
Mirrors the paper's Fig. 3 end-to-end pipeline:
1. **OCR + Parsing** — PDF/DOCX text extraction (pdf-parse + mammoth)
2. **NER Extraction** — Skills, companies, certifications, education
3. **BERT Embedding** — Semantic matching via Anthropic LLM
4. **Cosine Similarity** — JD–Resume scoring (default threshold: 0.72)
5. **Fairness Audit** — Demographic parity + equalized odds diff (IEEE P7003)
6. **Ranked Output** — Sorted candidates with shortlist decision

### Models (from paper Table I)
| Model | Accuracy | F1 |
|-------|----------|----|
| BERT + XGBoost | 93.2% | 0.93 |
| Ensemble | 94.8% | 0.94 |
| Fine-tuned BERT | 91.7% | 0.91 |
| TF-IDF + SVM | 78.4% | 0.77 |

### Fairness Metrics (from paper Section IV.C)
- **Demographic Parity Difference** — IEEE P7003 target ≤ 0.05
- **Equalized Odds Difference** — IEEE P7003 target ≤ 0.05

---

## Production Deployment

1. Replace file-based store (`utils/store.js`) with PostgreSQL or MongoDB
2. Use environment variables for all secrets
3. Enable HTTPS
4. Set `FRONTEND_URL` to your production domain in `.env`
5. Update `config.js` in frontend to point to your production API URL
6. Use a process manager like PM2: `pm2 start server.js`

---

## Tech Stack

**Backend:** Node.js, Express, Anthropic SDK, multer, pdf-parse, mammoth, bcryptjs, jsonwebtoken

**Frontend:** Vanilla HTML/CSS/JS — no framework required

**AI:** Anthropic Claude (claude-sonnet-4-20250514)
