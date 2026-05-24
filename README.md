# ⬡ ShadowTrace — Email Intelligence Platform

Public OSINT tool. Email daalo, digital footprint niklo.

## What it does

- ✅ GitHub profile discovery (real API)
- ✅ Gravatar avatar + profile lookup (real)
- ✅ HaveIBeenPwned breach check (real, needs API key for full)
- ✅ Company logo via Clearbit (free, no key)
- ✅ Domain intelligence (MX provider, email type, reputation)
- ✅ AI-powered summary via Claude
- ✅ Risk + Trust + Identity confidence scores
- ✅ Digital activity timeline

---

## Deploy on Vercel (5 minutes)

### Step 1 — GitHub pe daalo

```bash
# Pehli baar
git init
git add .
git commit -m "shadowtrace launch"

# GitHub pe naya repo banao (github.com/new)
git remote add origin https://github.com/TUMHARA_USERNAME/shadowtrace.git
git push -u origin main
```

### Step 2 — Vercel pe deploy karo

1. **vercel.com** pe jao → Login with GitHub
2. **"Add New Project"** click karo
3. Apna `shadowtrace` repo select karo
4. **Environment Variables** mein add karo:

| Variable | Value | Kahan milega |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | console.anthropic.com |
| `GITHUB_TOKEN` | `ghp_...` | github.com/settings/tokens (optional) |
| `HIBP_API_KEY` | `...` | haveibeenpwned.com/API/Key (optional) |

5. **Deploy** click karo — 2 minute mein live!

### Step 3 — Local test (optional)

```bash
npm install
cp .env.example .env.local
# .env.local mein ANTHROPIC_API_KEY daalo
npm run dev
# Open: http://localhost:3000
```

---

## Free APIs used

| Source | Data | Key needed? |
|---|---|---|
| GitHub API | Repos, followers, bio | No (or free token for higher limits) |
| Gravatar | Avatar, public profile | No |
| Clearbit Logo | Company logo | No |
| HaveIBeenPwned | Breach history | Yes ($4/mo) or basic free |
| Claude AI | Intelligent summary | Yes (Anthropic) |

---

## Environment Variables

Copy `.env.example` to `.env.local` for local dev.

---

## Tech Stack

- **Next.js 14** — Framework
- **TypeScript** — Type safety
- **Tailwind CSS** — Styling
- **Vercel** — Deployment

---

## Legal

Public data only. No authentication bypass. GDPR compliant.
Add opt-out link if making this public at scale.
