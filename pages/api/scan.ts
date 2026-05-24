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
  pwnCount?: number
}

interface GravatarProfile {
  displayName: string | null
  preferredUsername: string | null
  location: string | null
  bio: string | null
  urls: Array<{ title: string; value: string }>
  accounts: Array<{ shortname: string; display: string; url: string }>
  registeredYear: number | null
  thumbnailUrl: string | null
  pronouns: string | null
  jobTitle: string | null
  company: string | null
  timezone: string | null
  verified_accounts: Array<{ service_type: string; service_label: string; url: string }>
}

export interface ProfileResult {
  email: string
  username: string
  domain: string
  gravatarUrl: string | null
  gravatarProfile: GravatarProfile | null
  github: SocialProfile
  breaches: Breach[]
  hibpError: string | null
  companyLogo: string | null
  npmPackages: { name: string; version: string; description: string; downloads: number }[]
  domainInfo: {
    company: string
    mxProvider: string
    emailType: string
    reputation: string
    tld: string
  }
  aiSummary: string
  riskScore: number
  trustScore: number
  identityConfidence: number
  botProbability: number
  threatFlags: string[]
  timeline: { year: number; event: string; source: string }[]
  scannedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function md5(str: string) {
  return crypto.createHash('md5').update(str.toLowerCase().trim()).digest('hex')
}

function sha256(str: string) {
  return crypto.createHash('sha256').update(str.toLowerCase().trim()).digest('hex')
}

function getDomainInfo(domain: string) {
  const providers: Record<string, string> = {
    'gmail.com': 'Google',
    'googlemail.com': 'Google',
    'yahoo.com': 'Yahoo',
    'yahoo.co.in': 'Yahoo',
    'ymail.com': 'Yahoo',
    'outlook.com': 'Microsoft',
    'hotmail.com': 'Microsoft',
    'hotmail.co.in': 'Microsoft',
    'live.com': 'Microsoft',
    'msn.com': 'Microsoft',
    'icloud.com': 'Apple',
    'me.com': 'Apple',
    'mac.com': 'Apple',
    'protonmail.com': 'ProtonMail',
    'proton.me': 'ProtonMail',
    'pm.me': 'ProtonMail',
    'fastmail.com': 'Fastmail',
    'fastmail.fm': 'Fastmail',
    'zoho.com': 'Zoho',
    'tutanota.com': 'Tutanota',
    'tuta.io': 'Tutanota',
    'aol.com': 'AOL',
    'rediffmail.com': 'Rediff',
  }
  const freeProviders = [
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.in','ymail.com',
    'outlook.com','hotmail.com','hotmail.co.in','live.com','msn.com',
    'icloud.com','me.com','mac.com','aol.com','protonmail.com','proton.me',
    'pm.me','rediffmail.com','tutanota.com','tuta.io',
  ]
  const suspiciousTlds = ['.xyz','.tk','.ml','.ga','.cf','.gq','.top','.work','.click','.loan']
  const tld = '.' + domain.split('.').slice(-1)[0]

  const emailType = freeProviders.includes(domain) ? 'personal'
    : domain.endsWith('.edu') || domain.endsWith('.ac.in') || domain.endsWith('.ac.uk') ? 'educational'
    : domain.endsWith('.gov') || domain.endsWith('.gov.in') ? 'government'
    : suspiciousTlds.some(t => domain.endsWith(t)) ? 'suspicious'
    : 'corporate'

  const reputation = suspiciousTlds.some(t => domain.endsWith(t)) ? 'suspicious'
    : ['protonmail.com','proton.me','tutanota.com','pm.me'].includes(domain) ? 'privacy-focused'
    : freeProviders.includes(domain) ? 'trusted'
    : emailType === 'educational' ? 'trusted'
    : emailType === 'government' ? 'trusted'
    : 'neutral'

  const mxProvider = providers[domain] || (emailType === 'corporate' ? 'Custom / G Suite / M365' : 'Unknown')
  const company = domain.split('.')[0].replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase())

  return { company, mxProvider, emailType, reputation, tld }
}

// ─── Gravatar — full v3 REST API ──────────────────────────────────────────────
// Gravatar's newer REST API returns far richer data than the old .json endpoint

async function fetchGravatar(email: string): Promise<{ gravatarUrl: string | null; profile: GravatarProfile | null }> {
  const hash = md5(email)
  const avatarUrl = `https://www.gravatar.com/avatar/${hash}?d=404&s=200`

  // Check avatar existence in parallel with profile fetch
  const [avatarRes, profileRes] = await Promise.allSettled([
    fetch(avatarUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) }),
    // v3 REST API — much richer than the legacy .json
    fetch(`https://api.gravatar.com/v3/profiles/${hash}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ShadowTrace-OSINT/1.0',
        ...(process.env.GRAVATAR_API_KEY
          ? { 'Authorization': `Bearer ${process.env.GRAVATAR_API_KEY}` }
          : {}),
      },
      signal: AbortSignal.timeout(5000),
    }),
  ])

  const gravatarUrl =
    avatarRes.status === 'fulfilled' && avatarRes.value.ok
      ? `https://www.gravatar.com/avatar/${hash}?s=200`
      : null

  let profile: GravatarProfile | null = null

  if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
    try {
      const raw = await profileRes.value.json()

      // v3 API schema
      profile = {
        displayName: raw.display_name || raw.displayName || null,
        preferredUsername: raw.username || null,
        location: raw.location || raw.currentLocation || null,
        bio: raw.description || raw.aboutMe || null,
        pronouns: raw.pronouns || null,
        jobTitle: raw.job_title || null,
        company: raw.company || null,
        timezone: raw.timezone || null,
        // registered_date is available in v3 for authenticated requests
        registeredYear: raw.registration_date
          ? new Date(raw.registration_date).getFullYear()
          : null,
        thumbnailUrl: raw.avatar_url
          ? `${raw.avatar_url}?s=200`
          : gravatarUrl,
        urls: (raw.links || raw.urls || []).map((u: Record<string, string>) => ({
          title: u.label || u.title || '',
          value: u.url || u.value || '',
        })),
        accounts: [],
        verified_accounts: (raw.verified_accounts || []).map((a: Record<string, string>) => ({
          service_type: a.service_type || '',
          service_label: a.service_label || '',
          url: a.url || '',
        })),
      }
    } catch {
      profile = null
    }
  } else if (profileRes.status === 'fulfilled') {
    // Fallback: try legacy .json endpoint
    try {
      const legacyRes = await fetch(`https://www.gravatar.com/${hash}.json`, {
        headers: { 'User-Agent': 'ShadowTrace-OSINT/1.0' },
        signal: AbortSignal.timeout(5000),
      })
      if (legacyRes.ok) {
        const legacyJson = await legacyRes.json()
        const entry = legacyJson?.entry?.[0]
        if (entry) {
          profile = {
            displayName: entry.displayName || entry.name?.formatted || null,
            preferredUsername: entry.preferredUsername || null,
            location: entry.currentLocation || null,
            bio: entry.aboutMe || null,
            pronouns: null,
            jobTitle: null,
            company: null,
            timezone: null,
            registeredYear: null,
            thumbnailUrl: entry.thumbnailUrl || gravatarUrl,
            urls: (entry.urls || []).map((u: Record<string, string>) => ({
              title: u.title || '',
              value: u.value || '',
            })),
            accounts: (entry.accounts || []).map((a: Record<string, string>) => ({
              shortname: a.shortname || '',
              display: a.display || '',
              url: a.url || '',
            })),
            verified_accounts: [],
          }
        }
      }
    } catch { /* ignore */ }
  }

  return { gravatarUrl, profile }
}

// ─── GitHub — multi-strategy lookup ──────────────────────────────────────────

async function fetchGitHub(username: string, email: string): Promise<SocialProfile> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ShadowTrace-OSINT/1.0',
  }
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const fetchUser = async (login: string, conf: number): Promise<SocialProfile | null> => {
    try {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
        headers,
        signal: AbortSignal.timeout(6000),
      })
      if (res.status === 404) return null
      if (res.status === 403 || res.status === 429) return null // rate limited
      if (!res.ok) return null
      const data = await res.json()
      return buildGitHubProfile(data, email, conf)
    } catch {
      return null
    }
  }

  // Strategy 1: direct username variants
  const variants = Array.from(new Set([
    username,
    username.replace(/\./g, '-'),
    username.replace(/\./g, ''),
    username.replace(/\./g, '_'),
    username.replace(/_/g, '-'),
    username.replace(/-/g, ''),
    username.split('.')[0],
    username.split('_')[0],
    username.split('-')[0],
  ])).filter(v => v.length >= 2 && /^[a-zA-Z0-9]/.test(v))

  for (let i = 0; i < variants.length; i++) {
    const result = await fetchUser(variants[i], i === 0 ? 90 : 62)
    if (result) return result
  }

  // Strategy 2: search by email (requires token, but email must be public on GitHub)
  if (process.env.GITHUB_TOKEN) {
    try {
      const searchRes = await fetch(
        `https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email&per_page=3`,
        { headers, signal: AbortSignal.timeout(6000) }
      )
      if (searchRes.ok) {
        const { items } = await searchRes.json()
        if (items?.length > 0) {
          const userRes = await fetch(`https://api.github.com/users/${items[0].login}`, {
            headers, signal: AbortSignal.timeout(6000)
          })
          if (userRes.ok) {
            return buildGitHubProfile(await userRes.json(), email, 85)
          }
        }
      }
    } catch { /* continue */ }

    // Strategy 3: search by full name derived from email
    const nameGuess = username.replace(/[._-]/g, ' ').replace(/\d+/g, '').trim()
    if (nameGuess.includes(' ')) {
      try {
        const nameRes = await fetch(
          `https://api.github.com/search/users?q=${encodeURIComponent(nameGuess)}+in:fullname&per_page=3`,
          { headers, signal: AbortSignal.timeout(6000) }
        )
        if (nameRes.ok) {
          const { items } = await nameRes.json()
          if (items?.length > 0) {
            const userRes = await fetch(`https://api.github.com/users/${items[0].login}`, {
              headers, signal: AbortSignal.timeout(6000)
            })
            if (userRes.ok) {
              return buildGitHubProfile(await userRes.json(), email, 45)
            }
          }
        }
      } catch { /* continue */ }
    }
  }

  return { found: false, confidence: 0 }
}

async function buildGitHubProfile(
  data: Record<string, unknown>,
  email: string,
  confidence: number
): Promise<SocialProfile> {
  // Fetch recent public repos for extra context
  let recentRepos: Array<{ name: string; language: string | null; stars: number; description: string | null }> = []
  try {
    const reposRes = await fetch(
      `https://api.github.com/users/${data.login}/repos?sort=updated&per_page=5&type=public`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ShadowTrace-OSINT/1.0',
          ...(process.env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (reposRes.ok) {
      const repos = await reposRes.json()
      recentRepos = repos.map((r: Record<string, unknown>) => ({
        name: r.name as string,
        language: r.language as string | null,
        stars: r.stargazers_count as number,
        description: r.description as string | null,
      }))
    }
  } catch { /* non-fatal */ }

  // Confidence boost if GitHub email matches the searched email
  const ghEmail = data.email as string | null
  if (ghEmail && ghEmail.toLowerCase() === email.toLowerCase()) {
    confidence = Math.min(99, confidence + 10)
  }

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
      email: data.email,
      blog: data.blog,
      twitterUsername: data.twitter_username,
      publicRepos: data.public_repos,
      publicGists: data.public_gists,
      followers: data.followers,
      following: data.following,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      avatarUrl: data.avatar_url,
      hireable: data.hireable,
      siteAdmin: data.site_admin,
      type: data.type,
      recentRepos,
    },
  }
}

// ─── HaveIBeenPwned ───────────────────────────────────────────────────────────

async function fetchBreaches(email: string): Promise<{ breaches: Breach[]; hibpError: string | null }> {
  const apiKey = process.env.HIBP_API_KEY
  if (!apiKey) {
    return {
      breaches: [],
      hibpError: 'HIBP_API_KEY not configured — breach check requires a key from haveibeenpwned.com/API/Key ($3.50/mo)',
    }
  }

  try {
    const res = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      {
        headers: {
          'User-Agent': 'ShadowTrace-OSINT/1.0',
          'hibp-api-key': apiKey,
        },
        signal: AbortSignal.timeout(8000),
      }
    )

    if (res.status === 404) return { breaches: [], hibpError: null }
    if (res.status === 401) return { breaches: [], hibpError: 'HIBP API key invalid or expired' }
    if (res.status === 403) return { breaches: [], hibpError: 'HIBP API key unauthorised for this endpoint' }
    if (res.status === 429) return { breaches: [], hibpError: 'HIBP rate limit exceeded — try again in 1 minute' }
    if (!res.ok) return { breaches: [], hibpError: `HIBP returned HTTP ${res.status}` }

    const data: Array<{
      Name: string
      BreachDate: string
      PwnCount: number
      DataClasses: string[]
      IsVerified: boolean
      IsFabricated: boolean
    }> = await res.json()

    const breaches: Breach[] = data
      .filter(b => b.IsVerified && !b.IsFabricated)
      .slice(0, 15)
      .map(b => ({
        name: b.Name,
        year: new Date(b.BreachDate).getFullYear(),
        severity: b.PwnCount > 10_000_000 ? 'high' : b.PwnCount > 500_000 ? 'medium' : 'low',
        dataTypes: (b.DataClasses || []).slice(0, 5),
        pwnCount: b.PwnCount,
      }))

    return { breaches, hibpError: null }
  } catch (err) {
    return { breaches: [], hibpError: `HIBP request failed: ${String(err)}` }
  }
}

// ─── npm — check if username has published packages ──────────────────────────

async function fetchNpmPackages(username: string): Promise<{ name: string; version: string; description: string; downloads: number }[]> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=author:${encodeURIComponent(username)}&size=5`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    const packages = (data.objects || []) as Array<{
      package: { name: string; version: string; description: string }
    }>

    // Get download counts for each package
    const results = await Promise.all(
      packages.slice(0, 5).map(async (obj) => {
        let downloads = 0
        try {
          const dlRes = await fetch(
            `https://api.npmjs.org/downloads/point/last-month/${obj.package.name}`,
            { signal: AbortSignal.timeout(3000) }
          )
          if (dlRes.ok) {
            const dlData = await dlRes.json()
            downloads = dlData.downloads || 0
          }
        } catch { /* non-fatal */ }
        return {
          name: obj.package.name,
          version: obj.package.version,
          description: obj.package.description || '',
          downloads,
        }
      })
    )
    return results
  } catch {
    return []
  }
}

// ─── Clearbit logo ────────────────────────────────────────────────────────────

async function fetchCompanyLogo(domain: string): Promise<string | null> {
  const url = `https://logo.clearbit.com/${domain}`
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) })
    return res.ok ? url : null
  } catch {
    return null
  }
}

// ─── AI summary ───────────────────────────────────────────────────────────────

async function generateAISummary(data: Partial<ProfileResult>): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return buildFallbackSummary(data)

  const ghData = data.github?.data as Record<string, unknown> | undefined
  const gp = data.gravatarProfile

  const contextLines = [
    `Email: ${data.email}`,
    `Domain: ${data.domain} (${data.domainInfo?.emailType}, ${data.domainInfo?.reputation} reputation, MX: ${data.domainInfo?.mxProvider})`,
    gp?.displayName        ? `Gravatar name: ${gp.displayName}` : null,
    gp?.bio                ? `Gravatar bio: ${gp.bio}` : null,
    gp?.location           ? `Gravatar location: ${gp.location}` : null,
    gp?.jobTitle           ? `Gravatar job title: ${gp.jobTitle}` : null,
    gp?.company            ? `Gravatar company: ${gp.company}` : null,
    gp?.pronouns           ? `Pronouns: ${gp.pronouns}` : null,
    gp?.verified_accounts?.length
      ? `Gravatar verified accounts: ${gp.verified_accounts.map(a => a.service_label).join(', ')}` : null,
    data.github?.found
      ? `GitHub: @${data.github.handle} — ${ghData?.publicRepos} repos, ${ghData?.followers} followers, joined ${ghData?.createdAt ? new Date(ghData.createdAt as string).getFullYear() : '?'}`
      : 'GitHub: not found',
    ghData?.name       ? `GitHub name: ${ghData.name}` : null,
    ghData?.bio        ? `GitHub bio: ${ghData.bio}` : null,
    ghData?.company    ? `GitHub company: ${ghData.company}` : null,
    ghData?.location   ? `GitHub location: ${ghData.location}` : null,
    ghData?.blog       ? `GitHub website: ${ghData.blog}` : null,
    ghData?.twitterUsername ? `GitHub Twitter: @${ghData.twitterUsername}` : null,
    ghData?.hireable   ? `GitHub hireable: yes` : null,
    data.npmPackages?.length
      ? `npm packages: ${data.npmPackages.map(p => p.name).join(', ')}` : null,
    `Breaches: ${data.breaches?.length || 0}${data.breaches?.length ? ' — ' + data.breaches.map(b => `${b.name} (${b.year})`).join(', ') : ''}`,
    data.hibpError ? `Breach note: ${data.hibpError}` : null,
    data.gravatarUrl ? 'Gravatar avatar: present' : 'Gravatar avatar: none',
  ].filter(Boolean).join('\n')

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
        max_tokens: 350,
        messages: [{
          role: 'user',
          content: `You are a professional OSINT analyst. Based only on the public data below, write a 3-4 sentence intelligence summary. State what was found, what it tells us about this person's digital footprint, and note any risk signals. Be factual, neutral, and concise. Skip fields marked "not found" or missing.\n\n${contextLines}`,
        }],
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('Anthropic API error:', res.status, body)
      return buildFallbackSummary(data)
    }
    const json = await res.json()
    return json.content?.[0]?.text?.trim() || buildFallbackSummary(data)
  } catch (err) {
    console.error('generateAISummary:', err)
    return buildFallbackSummary(data)
  }
}

function buildFallbackSummary(data: Partial<ProfileResult>): string {
  const ghData = data.github?.data as Record<string, unknown> | undefined
  const parts: string[] = [
    `Public footprint analysis complete for ${data.email}.`,
    data.domainInfo?.emailType === 'corporate'
      ? `The address belongs to a corporate domain (${data.domain}).`
      : `Uses a ${data.domainInfo?.emailType} email provider via ${data.domainInfo?.mxProvider}.`,
    data.github?.found
      ? `An active GitHub account was found (@${data.github.handle}) with ${ghData?.publicRepos || 0} public repositories and ${ghData?.followers || 0} followers.`
      : 'No matching GitHub developer profile was detected.',
    data.breaches?.length
      ? `This address appears in ${data.breaches.length} known breach(es): ${data.breaches.map(b => b.name).join(', ')}.`
      : 'No breach exposure was detected.',
    data.npmPackages?.length
      ? `${data.npmPackages.length} npm package(s) found under this username.`
      : '',
  ]
  return parts.filter(Boolean).join(' ')
}

// ─── Scores ───────────────────────────────────────────────────────────────────

function computeScores(data: Partial<ProfileResult>) {
  let trust = 40
  let risk = 15
  let confidence = 20

  const ghData = data.github?.data as Record<string, unknown> | undefined

  // Identity signals — raise confidence and trust
  if (data.gravatarUrl)      { trust += 8;  confidence += 12 }
  if (data.gravatarProfile)  { trust += 8;  confidence += 12 }
  if (data.gravatarProfile?.displayName) confidence += 5
  if (data.gravatarProfile?.jobTitle || data.gravatarProfile?.company) { trust += 5; confidence += 5 }
  if (data.gravatarProfile?.verified_accounts?.length) { trust += 5; confidence += 8 }

  if (data.github?.found) {
    trust += 18
    confidence += 18
    if ((ghData?.followers as number) > 50)   { trust += 5; confidence += 5 }
    if ((ghData?.followers as number) > 500)  { trust += 5; confidence += 5 }
    if ((ghData?.publicRepos as number) > 10) { trust += 3; confidence += 3 }
    if (ghData?.email)    { trust += 5; confidence += 8 }
    if (ghData?.hireable) confidence += 3
    if (data.github.confidence > 80) confidence += 5
  }

  if (data.npmPackages?.length) { trust += 5; confidence += 8 }

  if (data.domainInfo?.emailType === 'corporate')    { trust += 8;  confidence += 8 }
  if (data.domainInfo?.emailType === 'educational')  { trust += 12; confidence += 10 }
  if (data.domainInfo?.emailType === 'government')   { trust += 15; confidence += 12 }

  // Risk signals
  if (data.domainInfo?.reputation === 'suspicious') { risk += 45; trust -= 25 }
  if (data.domainInfo?.reputation === 'privacy-focused') risk -= 5

  const bc = data.breaches?.length || 0
  if (bc > 0)  { risk += bc * 8;  trust -= bc * 2 }
  if (bc > 3)  risk += 12
  if (bc > 7)  risk += 20

  const threatFlags: string[] = []
  if (data.domainInfo?.reputation === 'suspicious') threatFlags.push('SUSPICIOUS DOMAIN')
  if (bc > 5)  threatFlags.push('HIGH BREACH EXPOSURE')
  else if (bc > 2) threatFlags.push('MULTIPLE BREACHES')
  else if (bc > 0) threatFlags.push('BREACH EXPOSURE')
  if (data.breaches?.some(b => b.severity === 'high')) threatFlags.push('CRITICAL DATA EXPOSED')
  if (data.github?.found && ghData?.hireable) threatFlags.push('DEVELOPER / HIREABLE')
  if (data.npmPackages?.length) threatFlags.push('OPEN SOURCE DEVELOPER')
  if (data.domainInfo?.emailType === 'government') threatFlags.push('GOVERNMENT DOMAIN')

  const botProbability = data.domainInfo?.reputation === 'suspicious' ? 55
    : data.github?.found ? 4
    : data.gravatarProfile ? 8
    : 22

  return {
    trustScore:          Math.min(100, Math.max(0,  trust)),
    riskScore:           Math.min(100, Math.max(0,  risk)),
    identityConfidence:  Math.min(100, Math.max(10, confidence)),
    botProbability,
    threatFlags,
  }
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function buildTimeline(data: Partial<ProfileResult>): { year: number; event: string; source: string }[] {
  const tl: { year: number; event: string; source: string }[] = []
  const ghData = data.github?.data as Record<string, unknown> | undefined

  if (ghData?.createdAt) {
    tl.push({
      year: new Date(ghData.createdAt as string).getFullYear(),
      event: `GitHub account created as @${data.github?.handle}`,
      source: 'github',
    })
  }
  if (data.gravatarProfile?.registeredYear) {
    tl.push({
      year: data.gravatarProfile.registeredYear,
      event: 'Gravatar profile registered',
      source: 'gravatar',
    })
  } else if (data.gravatarUrl) {
    tl.push({ year: 0, event: 'Gravatar profile found (registration date unavailable)', source: 'gravatar' })
  }
  if (data.breaches) {
    data.breaches.forEach(b => tl.push({
      year: b.year,
      event: `Credentials exposed in ${b.name} breach (${b.severity} severity, ${b.pwnCount?.toLocaleString() ?? '?'} accounts)`,
      source: 'hibp',
    }))
  }
  if (ghData?.publicRepos && (ghData.publicRepos as number) > 0) {
    tl.push({
      year: new Date().getFullYear(),
      event: `${ghData.publicRepos} active public repositories on GitHub`,
      source: 'github',
    })
  }
  if (data.npmPackages?.length) {
    tl.push({
      year: new Date().getFullYear(),
      event: `${data.npmPackages.length} package(s) published on npm`,
      source: 'npm',
    })
  }

  return tl.sort((a, b) => {
    if (a.year === 0) return 1
    if (b.year === 0) return -1
    return a.year - b.year
  })
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email } = req.body
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  const cleanEmail = email.toLowerCase().trim()
  const atIndex = cleanEmail.indexOf('@')
  const username = cleanEmail.substring(0, atIndex)
  const domain = cleanEmail.substring(atIndex + 1)

  try {
    // All independent fetches run in parallel
    const [
      { gravatarUrl, profile: gravatarProfile },
      github,
      { breaches, hibpError },
      companyLogo,
      npmPackages,
    ] = await Promise.all([
      fetchGravatar(cleanEmail),
      fetchGitHub(username, cleanEmail),
      fetchBreaches(cleanEmail),
      fetchCompanyLogo(domain),
      fetchNpmPackages(username),
    ])

    const domainInfo = getDomainInfo(domain)

    const partial: Partial<ProfileResult> = {
      email: cleanEmail, username, domain,
      gravatarUrl, gravatarProfile,
      github, breaches, hibpError,
      companyLogo, npmPackages,
      domainInfo,
    }

    const [aiSummary, scores] = await Promise.all([
      generateAISummary(partial),
      Promise.resolve(computeScores(partial)),
    ])

    const result: ProfileResult = {
      email: cleanEmail, username, domain,
      gravatarUrl, gravatarProfile,
      github, breaches, hibpError,
      companyLogo, npmPackages,
      domainInfo, aiSummary,
      ...scores,
      timeline: buildTimeline(partial),
      scannedAt: new Date().toISOString(),
    }

    // Cache for 5 minutes on CDN, don't store personal data longer
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
    res.status(200).json(result)
  } catch (err) {
    console.error('[scan] error:', err)
    res.status(500).json({ error: 'Scan failed', details: String(err) })
  }
}
