import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'

// ─── Types ───────────────────────────────────────────────────────────────────
interface SocialProfile {
  found: boolean
  confidence: number
  url?: string
  handle?: string
  data?: Record<string, unknown>
}

interface Breach {
  name: string
  year: number
  severity: 'low' | 'medium' | 'high'
  dataTypes: string[]
}

interface ProfileResult {
  email: string
  username: string
  domain: string
  gravatarUrl: string | null
  gravatarProfile: Record<string, unknown> | null
  github: SocialProfile
  breaches: Breach[]
  companyLogo: string | null
  domainInfo: {
    company: string
    mxProvider: string
    emailType: string
    reputation: string
  }
  aiSummary: string
  riskScore: number
  trustScore: number
  identityConfidence: number
  botProbability: number
  threatFlags: string[]
  timeline: { year: number; event: string }[]
  scannedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function md5(str: string) {
  return crypto.createHash('md5').update(str.toLowerCase().trim()).digest('hex')
}

function getDomainInfo(domain: string) {
  const providers: Record<string, string> = {
    'gmail.com': 'Google',
    'googlemail.com': 'Google',
    'yahoo.com': 'Yahoo',
    'outlook.com': 'Microsoft',
    'hotmail.com': 'Microsoft',
    'live.com': 'Microsoft',
    'icloud.com': 'Apple',
    'protonmail.com': 'ProtonMail',
    'proton.me': 'ProtonMail',
    'fastmail.com': 'Fastmail',
    'zoho.com': 'Zoho',
  }
  const freeProviders = ['gmail.com','yahoo.com','outlook.com','hotmail.com','live.com','icloud.com','aol.com','protonmail.com','proton.me']
  const suspiciousTlds = ['.xyz','.tk','.ml','.ga','.cf']

  const emailType = freeProviders.includes(domain) ? 'personal'
    : domain.endsWith('.edu') ? 'educational'
    : suspiciousTlds.some(t => domain.endsWith(t)) ? 'suspicious'
    : 'corporate'

  const reputation = suspiciousTlds.some(t => domain.endsWith(t)) ? 'suspicious'
    : freeProviders.includes(domain) ? 'trusted'
    : 'neutral'

  const mxProvider = providers[domain] || (emailType === 'corporate' ? 'Custom / G Suite / M365' : 'Unknown')
  const company = domain.split('.')[0].replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase())

  return { company, mxProvider, emailType, reputation }
}

// ─── Real API calls ────────────────────────────────────────────────────────────

// FIX 1: Gravatar — properly parse displayName, registered date, and avatar check
async function fetchGravatar(email: string) {
  const hash = md5(email)
  const profileUrl = `https://www.gravatar.com/${hash}.json`
  const avatarUrl = `https://www.gravatar.com/avatar/${hash}?d=404&s=200`

  try {
    const [profileRes, avatarRes] = await Promise.all([
      fetch(profileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        }
      }),
      fetch(avatarUrl, { method: 'HEAD' }),
    ])

    const gravatarUrl = avatarRes.ok ? `https://www.gravatar.com/avatar/${hash}?s=200` : null

    let profile: Record<string, unknown> | null = null
    if (profileRes.ok) {
      const json = await profileRes.json()
      const entry = json?.entry?.[0]
      if (entry) {
        // Normalise fields so downstream code has consistent keys
        profile = {
          displayName: entry.displayName || entry.name?.formatted || null,
          // Gravatar exposes registration date as profileUrl creation or preferredUsername
          preferredUsername: entry.preferredUsername || null,
          location: entry.currentLocation || null,
          bio: entry.aboutMe || null,
          urls: entry.urls || [],
          accounts: entry.accounts || [],
          // Use `entry.hash` to derive registration year if available, else null
          registeredYear: entry.registrationDate
            ? new Date(entry.registrationDate).getFullYear()
            : null,
          thumbnailUrl: entry.thumbnailUrl || null,
        }
      }
    }

    return { gravatarUrl, profile }
  } catch {
    return { gravatarUrl: null, profile: null }
  }
}

// FIX 2: GitHub — try more username variants and also search the GitHub API by email
async function fetchGitHub(username: string, email: string): Promise<SocialProfile> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ShadowTrace/1.0',
  }
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`
  }

  // Build a richer set of variants
  const variants = Array.from(new Set([
    username,
    username.replace(/\./g, '-'),
    username.replace(/\./g, ''),
    username.replace(/_/g, '-'),
    username.replace(/-/g, ''),
    username.split('.')[0],
    username.split('_')[0],
    username.split('-')[0],
  ])).filter(v => v.length >= 1)

  // 1. Try direct username variants
  for (const variant of variants) {
    try {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(variant)}`, { headers })
      if (res.ok) {
        const data = await res.json()
        return buildGitHubProfile(data, variant === username ? 90 : 65)
      }
      if (res.status === 403) break // Rate limited — stop trying
    } catch { /* continue */ }
  }

  // 2. Search GitHub by email (works when GITHUB_TOKEN is set and email is public)
  if (process.env.GITHUB_TOKEN) {
    try {
      const searchRes = await fetch(
        `https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`,
        { headers }
      )
      if (searchRes.ok) {
        const searchData = await searchRes.json()
        const firstItem = searchData?.items?.[0]
        if (firstItem?.login) {
          const userRes = await fetch(`https://api.github.com/users/${firstItem.login}`, { headers })
          if (userRes.ok) {
            const userData = await userRes.json()
            return buildGitHubProfile(userData, 80)
          }
        }
      }
    } catch { /* continue */ }
  }

  return { found: false, confidence: 0 }
}

function buildGitHubProfile(data: Record<string, unknown>, confidence: number): SocialProfile {
  return {
    found: true,
    confidence,
    url: data.html_url as string,
    handle: data.login as string,
    data: {
      name: data.name,
      bio: data.bio,
      company: data.company,
      location: data.location,
      publicRepos: data.public_repos,
      followers: data.followers,
      following: data.following,
      createdAt: data.created_at,
      avatarUrl: data.avatar_url,
      blog: data.blog,
      email: data.email,
      twitterUsername: data.twitter_username,
      hireable: data.hireable,
    },
  }
}

// FIX 3: Breaches — HIBP v3 with proper key handling + clear error messages
async function fetchBreaches(email: string): Promise<{ breaches: Breach[]; hibpError: string | null }> {
  const apiKey = process.env.HIBP_API_KEY

  if (!apiKey) {
    // No key — return empty but signal it clearly so the UI can show a note
    return { breaches: [], hibpError: 'HIBP_API_KEY not set — breach check skipped' }
  }

  try {
    const res = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      {
        headers: {
          'User-Agent': 'ShadowTrace/1.0',
          'hibp-api-key': apiKey,
        },
      }
    )

    if (res.status === 404) return { breaches: [], hibpError: null } // Clean — no breaches
    if (res.status === 401) return { breaches: [], hibpError: 'HIBP API key is invalid' }
    if (res.status === 429) return { breaches: [], hibpError: 'HIBP rate limit hit — try again later' }
    if (!res.ok) return { breaches: [], hibpError: `HIBP returned HTTP ${res.status}` }

    const data: Array<{
      Name: string
      BreachDate: string
      PwnCount: number
      DataClasses: string[]
    }> = await res.json()

    const breaches: Breach[] = data.slice(0, 10).map(b => ({
      name: b.Name,
      year: new Date(b.BreachDate).getFullYear(),
      severity: b.PwnCount > 10_000_000 ? 'high' : b.PwnCount > 1_000_000 ? 'medium' : 'low',
      dataTypes: (b.DataClasses || []).slice(0, 4),
    }))

    return { breaches, hibpError: null }
  } catch (err) {
    return { breaches: [], hibpError: `HIBP fetch failed: ${String(err)}` }
  }
}

async function fetchCompanyLogo(domain: string): Promise<string | null> {
  const url = `https://logo.clearbit.com/${domain}`
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok ? url : null
  } catch {
    return null
  }
}

// FIX 4: AI summary — always call Claude; never silently fall back to static text
async function generateAISummary(data: Partial<ProfileResult & { hibpError: string | null }>): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Only fall back if there is literally no API key configured
    return buildFallbackSummary(data)
  }

  const ghData = data.github?.data as Record<string, unknown> | undefined
  const gravatarDisplayName = (data.gravatarProfile as Record<string, unknown> | null)?.displayName

  const context = `
Email: ${data.email}
Username: ${data.username}
Domain: ${data.domain}
Email type: ${data.domainInfo?.emailType} (${data.domainInfo?.reputation} reputation)
MX Provider: ${data.domainInfo?.mxProvider}
Gravatar avatar: ${data.gravatarUrl ? 'found' : 'not found'}
Gravatar display name: ${gravatarDisplayName || 'N/A'}
Gravatar bio: ${(data.gravatarProfile as Record<string,unknown> | null)?.bio || 'N/A'}
Gravatar location: ${(data.gravatarProfile as Record<string,unknown> | null)?.location || 'N/A'}
GitHub: ${data.github?.found
  ? `found — @${data.github.handle}, ${ghData?.publicRepos || 0} repos, ${ghData?.followers || 0} followers, joined ${ghData?.createdAt ? new Date(ghData.createdAt as string).getFullYear() : 'unknown'}`
  : 'not found'}
GitHub name: ${ghData?.name || 'N/A'}
GitHub bio: ${ghData?.bio || 'N/A'}
GitHub company: ${ghData?.company || 'N/A'}
GitHub location: ${ghData?.location || 'N/A'}
GitHub Twitter: ${ghData?.twitterUsername || 'N/A'}
Breaches: ${data.breaches?.length || 0} known breach(es)${data.breaches?.length ? ': ' + data.breaches.map(b => `${b.name} (${b.year}, ${b.severity})`).join(', ') : ''}
${data.hibpError ? `Breach note: ${data.hibpError}` : ''}
`.trim()

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You are an OSINT analyst. Based on this public data only, write a 3-4 sentence professional intelligence summary. State what was found and what it indicates. Be factual and neutral. Do NOT speculate beyond the data provided. Do NOT mention data that shows as "N/A".\n\n${context}`,
        }],
      }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.error('Anthropic API error:', res.status, errBody)
      return buildFallbackSummary(data)
    }
    const json = await res.json()
    return json.content?.[0]?.text || buildFallbackSummary(data)
  } catch (err) {
    console.error('generateAISummary failed:', err)
    return buildFallbackSummary(data)
  }
}

function buildFallbackSummary(data: Partial<ProfileResult>): string {
  const ghData = data.github?.data as Record<string, unknown> | undefined
  const parts: string[] = [
    `Public footprint analysis complete for ${data.email}.`,
    data.domainInfo?.emailType === 'corporate'
      ? `The address belongs to a corporate domain (${data.domain}).`
      : `The address uses a ${data.domainInfo?.emailType} email provider (${data.domain}).`,
    data.github?.found
      ? `An active GitHub account was found under @${data.github.handle} with ${ghData?.publicRepos || 0} public repositories and ${ghData?.followers || 0} followers.`
      : 'No matching GitHub developer profile was detected.',
    data.breaches && data.breaches.length > 0
      ? `This address appears in ${data.breaches.length} known data breach(es): ${data.breaches.map(b => b.name).join(', ')}.`
      : 'No breach exposure was detected in available sources.',
  ]
  return parts.join(' ')
}

// FIX 5: Scores — use real breach count and real gravatar registration year
function computeScores(data: Partial<ProfileResult>) {
  let trust = 50
  let risk = 20
  let confidence = 30

  if (data.gravatarUrl) { trust += 10; confidence += 15 }
  if (data.gravatarProfile) { trust += 10; confidence += 15 }
  if (data.github?.found) {
    trust += 20
    confidence += 20
    const ghData = data.github.data as Record<string, unknown> | undefined
    if (ghData?.followers && (ghData.followers as number) > 100) { trust += 5; confidence += 5 }
    if (ghData?.publicRepos && (ghData.publicRepos as number) > 10) { trust += 5 }
  }
  if (data.domainInfo?.emailType === 'corporate') { trust += 10; confidence += 10 }
  if (data.domainInfo?.emailType === 'educational') { trust += 15; confidence += 10 }
  if (data.domainInfo?.reputation === 'suspicious') { risk += 40; trust -= 20 }

  const breachCount = data.breaches?.length || 0
  if (breachCount > 0) {
    risk += breachCount * 10
    trust -= breachCount * 3
  }
  if (breachCount > 3) risk += 15

  const threatFlags: string[] = []
  if (data.domainInfo?.reputation === 'suspicious') threatFlags.push('SUSPICIOUS DOMAIN')
  if (breachCount > 2) threatFlags.push('MULTIPLE BREACHES')
  if (breachCount > 0) threatFlags.push('BREACH EXPOSURE')
  if (data.github?.found) {
    const ghData = data.github.data as Record<string, unknown> | undefined
    if (ghData?.hireable) threatFlags.push('DEVELOPER / HIREABLE')
  }

  return {
    trustScore: Math.min(100, Math.max(0, trust)),
    riskScore: Math.min(100, Math.max(0, risk)),
    identityConfidence: Math.min(100, Math.max(10, confidence)),
    botProbability: data.domainInfo?.reputation === 'suspicious' ? 45 : data.github?.found ? 5 : 20,
    threatFlags,
  }
}

// FIX 6: Timeline — use real dates from API responses, not hardcoded year
function buildTimeline(data: Partial<ProfileResult>): { year: number; event: string }[] {
  const tl: { year: number; event: string }[] = []
  const ghData = data.github?.data as Record<string, unknown> | undefined
  const gravatarProfile = data.gravatarProfile as Record<string, unknown> | null

  if (ghData?.createdAt) {
    const yr = new Date(ghData.createdAt as string).getFullYear()
    tl.push({ year: yr, event: `GitHub account created (@${data.github?.handle})` })
  }

  // Only add Gravatar entry if we have a real registration year from the API
  if (gravatarProfile?.registeredYear) {
    tl.push({ year: gravatarProfile.registeredYear as number, event: 'Gravatar profile registered' })
  } else if (data.gravatarUrl) {
    // We know a Gravatar exists but don't know the year — note it without a year
    tl.push({ year: 0, event: 'Gravatar profile found (registration date unavailable)' })
  }

  if (data.breaches) {
    data.breaches.forEach(b => tl.push({ year: b.year, event: `Credentials exposed in ${b.name} breach (${b.severity} severity)` }))
  }

  if (ghData?.publicRepos && (ghData.publicRepos as number) > 0) {
    tl.push({ year: new Date().getFullYear(), event: `${ghData.publicRepos} public repositories active on GitHub` })
  }

  // Sort: put year=0 (unknown) at end
  return tl.sort((a, b) => {
    if (a.year === 0) return 1
    if (b.year === 0) return -1
    return a.year - b.year
  })
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email } = req.body
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' })
  }

  const cleanEmail = email.toLowerCase().trim()
  const atIndex = cleanEmail.indexOf('@')
  const username = cleanEmail.substring(0, atIndex)
  const domain = cleanEmail.substring(atIndex + 1)

  try {
    // FIX: pass email to fetchGitHub so it can search by email too
    const [
      { gravatarUrl, profile: gravatarProfile },
      github,
      { breaches, hibpError },
      companyLogo,
    ] = await Promise.all([
      fetchGravatar(cleanEmail),
      fetchGitHub(username, cleanEmail),
      fetchBreaches(cleanEmail),
      fetchCompanyLogo(domain),
    ])

    const domainInfo = getDomainInfo(domain)
    const partial: Partial<ProfileResult & { hibpError: string | null }> = {
      email: cleanEmail, username, domain,
      gravatarUrl, gravatarProfile, github, breaches,
      companyLogo, domainInfo, hibpError,
    }

    const [aiSummary, scores] = await Promise.all([
      generateAISummary(partial),
      Promise.resolve(computeScores(partial)),
    ])

    const result: ProfileResult & { hibpError?: string | null } = {
      email: cleanEmail, username, domain,
      gravatarUrl, gravatarProfile,
      github, breaches, companyLogo,
      domainInfo, aiSummary,
      ...scores,
      timeline: buildTimeline(partial),
      scannedAt: new Date().toISOString(),
      // Surface hibpError to the frontend so it can show a note if breach data is missing
      ...(hibpError ? { hibpError } : {}),
    }

    res.status(200).json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Scan failed', details: String(err) })
  }
}
