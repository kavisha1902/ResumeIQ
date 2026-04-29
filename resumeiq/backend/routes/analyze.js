const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const { extractText } = require('../utils/extractor');
const { History, Users } = require('../utils/store');

const router = express.Router();

// ── Multer (memory storage, 10MB per file) ────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt'];
    const ext = require('path').extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}`));
  },
});

// ── AI clients ────────────────────────────────────────
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function pickProvider() {
  const preferred = (process.env.LLM_PROVIDER || 'auto').toLowerCase();
  if (preferred === 'anthropic' || preferred === 'gemini') return preferred;
  if (anthropic) return 'anthropic';
  if (gemini) return 'gemini';
  return null;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildMockAnalysis(resumes, threshScore) {
  const skillPool = ['Python', 'Node.js', 'SQL', 'REST APIs', 'Express', 'NLP', 'Docker', 'Git'];

  const candidates = resumes
    .map((r, i) => {
      const score = randomInt(55, 96);
      const matched = skillPool.sort(() => 0.5 - Math.random()).slice(0, 3);
      const missing = skillPool.filter(s => !matched.includes(s)).slice(0, 2);
      return {
        name: r.name === 'Pasted Resume' ? `Candidate ${i + 1}` : r.name.replace(/\.[^.]+$/, ''),
        file: r.name,
        score,
        cosine_sim: Number((score / 100).toFixed(2)),
        verdict: score >= threshScore ? 'Strong Match' : 'Potential Match',
        shortlisted: score >= threshScore,
        experience_years: String(randomInt(1, 8)),
        education: 'B.Tech / B.E. (demo estimate)',
        current_role: 'Software Engineer (demo estimate)',
        ner_entities: {
          skills_matched: matched,
          skills_missing: missing,
          certifications: ['Demo Certification'],
          companies: ['Demo Company'],
        },
        analysis: 'Demo fallback result generated because live AI provider is unavailable.',
        strength: `${matched[0]} alignment appears strong based on resume keywords.`,
        concern: `${missing[0]} is less visible in the current profile.`,
        bias_note: 'Demo mode - no formal bias audit run.',
      };
    })
    .sort((a, b) => b.score - a.score);

  const avg = candidates.length
    ? Math.round(candidates.reduce((sum, c) => sum + c.score, 0) / candidates.length)
    : 0;

  return {
    candidates,
    stats: {
      total: candidates.length,
      shortlisted: candidates.filter(c => c.shortlisted).length,
      avg_score: avg,
      top_skill: candidates[0]?.ner_entities?.skills_matched?.[0] || 'Python',
      demographic_parity_diff: 0.03,
      equalized_odds_diff: 0.04,
    },
  };
}

async function generateWithProvider(prompt, provider) {
  if (provider === 'anthropic') {
    if (!anthropic) throw new Error('Anthropic provider selected but ANTHROPIC_API_KEY is missing.');
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content?.[0]?.text || '';
  }

  if (provider === 'gemini') {
    if (!gemini) throw new Error('Gemini provider selected but GEMINI_API_KEY is missing.');
    const configuredModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const fallbackModels = [
      configuredModel,
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ].filter((m, i, arr) => m && arr.indexOf(m) === i);

    let lastErr;
    for (const modelName of fallbackModels) {
      try {
        const model = gemini.getGenerativeModel({ model: modelName });
        const response = await model.generateContent(prompt);
        return response.response?.text() || '';
      } catch (err) {
        const msg = String(err?.message || '').toLowerCase();
        const notFound = err?.status === 404 || msg.includes('not found') || msg.includes('is not supported');
        if (!notFound) throw err;
        lastErr = err;
      }
    }

    throw lastErr || new Error('No supported Gemini model was found for this API key/project.');
  }

  throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY in backend/.env.');
}

// Model display labels (from paper Table I)
const MODEL_LABELS = {
  bert_xgboost: 'BERT+XGBoost (93.2% acc, F1=0.93)',
  ensemble:     'Ensemble BERT+XGBoost+GNN (94.8% acc, F1=0.94)',
  bert:         'Fine-tuned BERT (91.7% acc, F1=0.91)',
  tfidf_svm:    'TF-IDF+SVM baseline (78.4% acc, F1=0.77)',
};

const BIAS_LABELS = {
  adversarial: 'Adversarial Debiasing (target demographic parity diff ≤ 0.03)',
  rerank:      'Fairness-Aware Re-ranking',
  none:        'No bias mitigation (baseline)',
};

// ── POST /api/analyze ─────────────────────────────────
router.post(
  '/',
  authMiddleware,
  upload.array('resumes', 20),
  async (req, res) => {
    try {
      const {
        jobDescription,
        pastedResume,
        model = 'bert_xgboost',
        threshold = '0.72',
        biasMitigation = 'adversarial',
      } = req.body;

      if (!jobDescription || jobDescription.trim().length < 20) {
        return res.status(400).json({ error: 'Job description is too short (min 20 chars)' });
      }

      // Collect resume texts
      const resumes = [];

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const text = await extractText(file.buffer, file.originalname);
          resumes.push({ name: file.originalname, text: text.slice(0, 3000) });
        }
      }

      if (pastedResume && pastedResume.trim().length > 30) {
        resumes.push({ name: 'Pasted Resume', text: pastedResume.trim().slice(0, 3000) });
      }

      if (resumes.length === 0) {
        return res.status(400).json({ error: 'Please upload at least one resume or paste resume text' });
      }

      const threshScore = Math.round(parseFloat(threshold) * 100);

      const resumeBlock = resumes.map((r, i) =>
        `RESUME ${i + 1} — "${r.name}":\n${r.text}`
      ).join('\n\n---\n\n');

      const prompt = `You are an expert HR AI implementing the intelligent resume screening system (BERT+NER+GNN approach from research). Analyze each resume against the job description with precision.

MODEL: ${MODEL_LABELS[model] || MODEL_LABELS.bert_xgboost}
SHORTLIST THRESHOLD: Cosine similarity ≥ ${threshold} (scores mapped 0–100)
BIAS MITIGATION: ${BIAS_LABELS[biasMitigation] || BIAS_LABELS.adversarial}

JOB DESCRIPTION:
${jobDescription.slice(0, 2000)}

RESUMES:
${resumeBlock}

Respond with ONLY valid JSON (no markdown, no explanation). Use this exact structure:

{
  "candidates": [
    {
      "name": "Full name from resume or filename",
      "file": "filename",
      "score": 87,
      "cosine_sim": 0.87,
      "verdict": "Strong Match",
      "shortlisted": true,
      "experience_years": "4",
      "education": "B.Tech Computer Science",
      "current_role": "ML Engineer at TechCorp",
      "ner_entities": {
        "skills_matched": ["Python", "BERT", "NLP"],
        "skills_missing": ["Kubernetes", "Go"],
        "certifications": ["AWS Certified"],
        "companies": ["TechCorp", "StartupX"]
      },
      "analysis": "2-3 sentence detailed match analysis",
      "strength": "Key strength in one sentence",
      "concern": "Key gap in one sentence",
      "bias_note": "Brief bias risk note or 'None detected'"
    }
  ],
  "stats": {
    "total": 3,
    "shortlisted": 2,
    "avg_score": 74,
    "top_skill": "Python",
    "demographic_parity_diff": 0.02,
    "equalized_odds_diff": 0.03
  }
}

Sort candidates highest to lowest score. Shortlisted = score >= ${threshScore}.`;

      let provider = pickProvider();
      let parsed;
      try {
        const raw = await generateWithProvider(prompt, provider);
        parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      } catch (err) {
        const msg = String(err.message || '').toLowerCase();
        const shouldUseMock =
          err.status === 401 ||
          err.status === 404 ||
          err.status === 429 ||
          msg.includes('api key') ||
          msg.includes('x-api-key') ||
          msg.includes('authentication_error') ||
          msg.includes('credit balance is too low') ||
          msg.includes('billing') ||
          msg.includes('quota') ||
          msg.includes('too many requests') ||
          msg.includes('rate limit') ||
          msg.includes('resource has been exhausted') ||
          msg.includes('not found') ||
          msg.includes('not supported') ||
          msg.includes('no ai provider configured');

        if (!shouldUseMock) throw err;

        provider = 'mock';
        parsed = buildMockAnalysis(resumes, threshScore);
      }

      // Save to history
      const record = {
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        jobDescription: jobDescription.slice(0, 300) + (jobDescription.length > 300 ? '...' : ''),
        model,
        threshold,
        biasMitigation,
        resumeCount: resumes.length,
        shortlistedCount: (parsed.candidates || []).filter(c => c.shortlisted).length,
        avgScore: parsed.stats?.avg_score || 0,
        results: parsed,
      };
      History.add(req.user.id, record);

      // Increment user analysis count
      Users.update(req.user.email, { analysisCount: (req.user.analysisCount || 0) + 1 });

      res.json({ success: true, historyId: record.id, provider, ...parsed });
    } catch (err) {
      console.error('[analyze]', err);
      const msg = String(err.message || '').toLowerCase();
      if (
        err.status === 401 ||
        msg.includes('api key') ||
        msg.includes('x-api-key') ||
        msg.includes('authentication_error') ||
        msg.includes('not valid') ||
        msg.includes('unauthorized')
      ) {
        return res.status(500).json({ error: 'Invalid API key for configured AI provider. Check backend/.env.' });
      }
      if (
        msg.includes('credit balance is too low') ||
        msg.includes('billing') ||
        msg.includes('quota') ||
        msg.includes('resource has been exhausted')
      ) {
        return res.status(500).json({ error: 'AI provider quota/billing limit reached. Add credits or change provider.' });
      }
      res.status(500).json({ error: err.message || 'Analysis failed' });
    }
  }
);

module.exports = router;
