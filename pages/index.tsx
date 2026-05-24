import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'


// ─── Types ────────────────────────────────────────────────────────────────────
interface SocialProfile {
  found: boolean; confidence: number; url?: string; handle?: string
  data?: {
    name?: string; bio?: string; company?: string; location?: string
    publicRepos?: number; followers?: number; following?: number
    createdAt?: string; avatarUrl?: string; blog?: string
  }
}
interface Breach { name: string; year: number; severity: 'low'|'medium'|'high'; dataTypes: string[] }
interface ProfileResult {
  email: string; username: string; domain: string
  gravatarUrl: string | null; gravatarProfile: Record<string,unknown> | null
  github: SocialProfile; breaches: Breach[]; companyLogo: string | null
  domainInfo: { company: string; mxProvider: string; emailType: string; reputation: string }
  aiSummary: string; riskScore: number; trustScore: number
  identityConfidence: number; botProbability: number; threatFlags: string[]
  timeline: { year: number; event: string }[]; scannedAt: string
}

// ─── Scan stages ──────────────────────────────────────────────────────────────
const STAGES = [
  { id: 'email',   label: 'Email validation' },
  { id: 'domain',  label: 'Domain intelligence' },
  { id: 'gravatar',label: 'Gravatar lookup' },
  { id: 'github',  label: 'GitHub discovery' },
  { id: 'breach',  label: 'Breach analysis' },
  { id: 'company', label: 'Company signals' },
  { id: 'ai',      label: 'AI profiling' },
]

// ─── Small components ─────────────────────────────────────────────────────────
function Badge({ type, text }: { type: 'low'|'medium'|'high'|'ok'; text: string }) {
  const styles: Record<string, string> = {
    low:    'bg-green-500/10 border-green-500/30 text-green-400',
    ok:     'bg-green-500/10 border-green-500/30 text-green-400',
    medium: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    high:   'bg-red-500/10 border-red-500/30 text-red-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-mono tracking-wider ${styles[type]}`}>
      {text}
    </span>
  )
}

function ScoreRing({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 28; const circ = 2 * Math.PI * r
  const offset = circ * (1 - value / 100)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"/>
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1.2s ease' }}/>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold font-mono" style={{ color }}>{value}</span>
        </div>
      </div>
      <span className="text-xs text-white/30 tracking-widest uppercase">{label}</span>
    </div>
  )
}

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    setDisplayed('')
    let i = 0
    const tick = () => {
      if (i < text.length) { setDisplayed(text.slice(0, ++i)); setTimeout(tick, 16) }
    }
    const t = setTimeout(tick, 400)
    return () => clearTimeout(t)
  }, [text])
  return (
    <span>
      {displayed}
      {displayed.length < text.length && (
        <span className="inline-block w-0.5 h-3.5 bg-blue-400 animate-blink ml-0.5 align-middle" />
      )}
    </span>
  )
}

// ─── Tab views ────────────────────────────────────────────────────────────────
function OverviewTab({ d }: { d: ProfileResult }) {
  const riskColor = d.riskScore < 30 ? '#00ff9d' : d.riskScore < 60 ? '#ffd60a' : '#ff4d6d'
  return (
    <div className="space-y-4 animate-fade-up">
      {/* Identity hero */}
      <div className="card p-4">
        <div className="flex items-start gap-4">
          {(d.gravatarUrl || d.github?.data?.avatarUrl) ? (
            <img
              src={d.github?.data?.avatarUrl || d.gravatarUrl || ''}
              alt="avatar" className="w-16 h-16 rounded-lg border border-white/10 object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg border border-[var(--c1)]/20 bg-[var(--c1)]/5 flex items-center justify-center text-xl text-[var(--c1)] font-bold">
              {d.username[0].toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[var(--c1)] font-bold text-base tracking-wide">
              {d.github?.data?.name || (d.gravatarProfile as Record<string,unknown>)?.displayName as string || d.username}
            </div>
            <div className="text-white/40 text-xs mt-0.5">{d.email}</div>
            {d.github?.data?.bio && (
              <div className="text-white/60 text-xs mt-1 italic">&ldquo;{d.github.data.bio}&rdquo;</div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge type={d.domainInfo.reputation === 'trusted' ? 'ok' : d.domainInfo.reputation === 'suspicious' ? 'high' : 'medium'}
                text={d.domainInfo.emailType.toUpperCase()} />
              {d.threatFlags.map(f => <Badge key={f} type="high" text={f} />)}
              {d.threatFlags.length === 0 && <Badge type="ok" text="NO THREATS" />}
            </div>
          </div>
          {d.companyLogo && (
            <img src={d.companyLogo} alt="company" className="w-10 h-10 rounded object-contain opacity-70" />
          )}
        </div>
      </div>

      {/* Scores */}
      <div className="card p-4">
        <div className="text-xs text-[var(--c1)]/50 tracking-widest uppercase mb-4">Signal Scores</div>
        <div className="flex justify-around">
          <ScoreRing value={d.identityConfidence} label="Identity" color="var(--c1)" />
          <ScoreRing value={d.trustScore} label="Trust" color="var(--c2)" />
          <ScoreRing value={d.riskScore} label="Risk" color={riskColor} />
          <ScoreRing value={100 - d.botProbability} label="Human" color="#bd00ff" />
        </div>
      </div>

      {/* AI Summary */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-green" />
          <span className="text-xs text-blue-400 tracking-widest uppercase">AI Intelligence Summary</span>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg p-3">
          <p className="text-sm text-white/70 leading-relaxed font-sans">
            <TypewriterText text={d.aiSummary} />
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3">
          <div className="text-xs text-white/30 tracking-widest uppercase mb-1">Company</div>
          <div className="text-sm text-white/80">{d.domainInfo.company}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-white/30 tracking-widest uppercase mb-1">MX Provider</div>
          <div className="text-sm text-white/80">{d.domainInfo.mxProvider}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-white/30 tracking-widest uppercase mb-1">Breaches</div>
          <div className={`text-sm font-bold ${d.breaches.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {d.breaches.length > 0 ? `${d.breaches.length} Found` : 'Clean'}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-white/30 tracking-widest uppercase mb-1">GitHub</div>
          <div className={`text-sm font-bold ${d.github.found ? 'text-[var(--c1)]' : 'text-white/30'}`}>
            {d.github.found ? `@${d.github.handle}` : 'Not found'}
          </div>
        </div>
      </div>
    </div>
  )
}

function SocialTab({ d }: { d: ProfileResult }) {
  const platforms = [
    { label: 'GitHub', key: 'github', icon: '⌥', profile: d.github },
    { label: 'Gravatar', key: 'gravatar', icon: '◈', profile: { found: !!d.gravatarUrl, confidence: d.gravatarUrl ? 95 : 0, url: d.gravatarUrl || undefined } },
  ]
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="card p-4">
        <div className="text-xs text-[var(--c1)]/50 tracking-widest uppercase mb-4">Platform Discovery</div>
        <div className="space-y-3">
          {platforms.map(p => (
            <div key={p.key} className={`flex items-center gap-3 p-3 rounded-lg border ${p.profile.found ? 'bg-green-500/5 border-green-500/20' : 'bg-white/2 border-white/5'}`}>
              <span className={`text-lg ${p.profile.found ? 'text-[var(--c1)]' : 'text-white/20'}`}>{p.icon}</span>
              <div className="flex-1">
                <div className={`text-sm font-semibold ${p.profile.found ? 'text-white/90' : 'text-white/25'}`}>{p.label}</div>
                <div className="text-xs text-white/40 mt-0.5">
                  {p.profile.found ? (p.profile.handle ? `@${p.profile.handle}` : p.profile.url || 'Profile found') : 'Not detected'}
                </div>
              </div>
              {p.profile.found && (
                <div className="text-right">
                  <div className="text-xs text-[var(--c1)] font-bold">{p.profile.confidence}%</div>
                  <div className="text-xs text-white/30">confidence</div>
                </div>
              )}
            </div>
          ))}

          {/* Static undetected platforms */}
          {['LinkedIn', 'Twitter/X', 'Reddit', 'StackOverflow', 'Medium', 'Dev.to'].map(name => (
            <div key={name} className="flex items-center gap-3 p-3 rounded-lg border bg-white/[0.02] border-white/5">
              <span className="text-lg text-white/15">◌</span>
              <div className="flex-1">
                <div className="text-sm text-white/25">{name}</div>
                <div className="text-xs text-white/20">Add API key to enable</div>
              </div>
              <span className="text-xs text-white/20 border border-white/10 rounded px-1.5 py-0.5">—</span>
            </div>
          ))}
        </div>
      </div>

      {/* GitHub detail */}
      {d.github.found && d.github.data && (
        <div className="card p-4">
          <div className="text-xs text-[var(--c1)]/50 tracking-widest uppercase mb-3">GitHub Profile Detail</div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Repos', val: d.github.data.publicRepos ?? 0 },
              { label: 'Followers', val: d.github.data.followers ?? 0 },
              { label: 'Following', val: d.github.data.following ?? 0 },
            ].map(s => (
              <div key={s.label} className="bg-white/3 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-[var(--c1)]">{s.val}</div>
                <div className="text-xs text-white/30 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          {d.github.data.location && <div className="text-xs text-white/40 mt-1">📍 {d.github.data.location}</div>}
          {d.github.data.company && <div className="text-xs text-white/40 mt-1">🏢 {d.github.data.company}</div>}
          {d.github.data.blog && <div className="text-xs text-blue-400 mt-1">🔗 {d.github.data.blog}</div>}
          {d.github.url && (
            <a href={d.github.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-xs text-[var(--c1)] border border-[var(--c1)]/25 rounded px-2 py-1 hover:bg-[var(--c1)]/10 transition-colors">
              View Profile ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function BreachTab({ d }: { d: ProfileResult }) {
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs text-[var(--c1)]/50 tracking-widest uppercase">Breach Intelligence</div>
          <Badge type={d.breaches.length === 0 ? 'ok' : d.breaches.length > 2 ? 'high' : 'medium'}
            text={`${d.breaches.length} BREACH${d.breaches.length !== 1 ? 'ES' : ''}`} />
        </div>

        {d.breaches.length === 0 ? (
          <div className="flex items-center gap-3 p-4 bg-green-500/5 border border-green-500/15 rounded-lg">
            <span className="text-2xl">✓</span>
            <div>
              <div className="text-green-400 font-semibold text-sm">No known breaches detected</div>
              <div className="text-white/40 text-xs mt-0.5">This email was not found in public breach databases.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {d.breaches.map((b, i) => (
              <div key={i} className="p-3 bg-red-500/5 border border-red-500/15 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-red-400 text-sm">{b.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/30">{b.year}</span>
                    <Badge type={b.severity} text={b.severity.toUpperCase()} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {b.dataTypes.map(dt => (
                    <span key={dt} className="text-xs text-white/50 bg-white/5 px-1.5 py-0.5 rounded">{dt}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-3 border border-white/5 rounded-lg">
          <p className="text-xs text-white/30 leading-relaxed">
            ⚠ To get real-time breach data, add your <span className="text-[var(--c1)]/60">HIBP_API_KEY</span> environment variable.
            Get a free key at haveibeenpwned.com.
          </p>
        </div>
      </div>
    </div>
  )
}

function TimelineTab({ d }: { d: ProfileResult }) {
  const tl = d.timeline.length > 0 ? d.timeline : [
    { year: 2020, event: 'Email address first registered (estimated)' },
    { year: new Date().getFullYear(), event: 'Profile scanned by ShadowTrace' },
  ]
  return (
    <div className="animate-fade-up">
      <div className="card p-4">
        <div className="text-xs text-[var(--c1)]/50 tracking-widest uppercase mb-4">Digital Activity Timeline</div>
        <div className="relative pl-5">
          <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gradient-to-b from-[var(--c1)] to-transparent" />
          {tl.map((item, i) => (
            <div key={i} className="relative mb-5">
              <div className="absolute -left-4 top-1 w-2 h-2 rounded-full bg-[var(--c1)] border-2 border-[var(--bg)]" />
              <div className="text-xs text-[var(--c1)]/50 tracking-widest mb-0.5">{item.year}</div>
              <div className="text-sm text-white/70">{item.event}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DomainTab({ d }: { d: ProfileResult }) {
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="card p-4">
        <div className="text-xs text-[var(--c1)]/50 tracking-widest uppercase mb-4">Domain Intelligence</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Domain', val: d.domain },
            { label: 'MX Provider', val: d.domainInfo.mxProvider },
            { label: 'Email Type', val: d.domainInfo.emailType.toUpperCase() },
            { label: 'Reputation', val: d.domainInfo.reputation.toUpperCase() },
            { label: 'Username', val: d.username },
            { label: 'Scanned', val: new Date(d.scannedAt).toLocaleTimeString() },
          ].map(item => (
            <div key={item.label} className="bg-white/2 rounded-lg p-3 border border-white/5">
              <div className="text-xs text-white/30 tracking-widest uppercase mb-1">{item.label}</div>
              <div className="text-sm text-white/80 truncate">{item.val}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card p-4">
        <div className="text-xs text-[var(--c1)]/50 tracking-widest uppercase mb-3">Company Intelligence</div>
        <div className="flex items-center gap-3 mb-3">
          {d.companyLogo && (
            <img src={d.companyLogo} alt="" className="w-10 h-10 object-contain opacity-80 rounded" />
          )}
          <div>
            <div className="text-white/90 font-semibold">{d.domainInfo.company}</div>
            <div className="text-xs text-white/40">{d.domain}</div>
          </div>
        </div>
        <p className="text-xs text-white/30 leading-relaxed">
          Add <span className="text-[var(--c1)]/60">CLEARBIT_KEY</span> or <span className="text-[var(--c1)]/60">HUNTER_API_KEY</span> for full company data including employees, funding, tech stack, and social links.
        </p>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = ['Overview', 'Social', 'Breaches', 'Timeline', 'Domain']
const QUICK = ['elon@tesla.com', 'torvalds@linux-foundation.org', 'john.doe@google.com', 'researcher@mit.edu']

export default function Home() {
  const [email, setEmail] = useState('')
  const [scanning, setScanning] = useState(false)
  const [stageIdx, setStageIdx] = useState(-1)
  const [result, setResult] = useState<ProfileResult | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('Overview')
  const inputRef = useRef<HTMLInputElement>(null)

  // Animate progress stages
  const animateStages = async () => {
    for (let i = 0; i < STAGES.length; i++) {
      setStageIdx(i)
      await new Promise(r => setTimeout(r, 500 + Math.random() * 300))
    }
  }

  const scan = async (target?: string) => {
    const addr = (target || email).trim()
    if (!addr.includes('@')) { setError('Valid email required'); return }
    setError(''); setResult(null); setScanning(true); setStageIdx(-1); setActiveTab('Overview')
    animateStages()
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setScanning(false); setStageIdx(-1)
    }
  }

  return (
    <>
      <Head>
        <title>ShadowTrace — AI | Shivam Kumar</title>
        <meta name="description" content="OSINT email intelligence platform. Discover public digital footprints." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
        <link rel="icon" href="/favicon.svg" />
      </Head>

      <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #050a10 0%, #090f1e 60%, #0a0d16 100%)' }}>
        {/* Header */}
        <header className="border-b border-white/5 px-6 py-3 flex items-center justify-between sticky top-0 z-20 backdrop-blur-sm bg-black/20">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded border border-[var(--c1)]/50 flex items-center justify-center text-xs font-bold text-[var(--c1)] relative overflow-hidden">
              <div className="absolute inset-0 border-t-2 border-[var(--c1)]/30 rounded animate-spin-slow" />
              ST
            </div>
            <div>
              <div className="text-[var(--c1)] font-bold tracking-[0.2em] text-sm">SHADOWTRACE</div>
              <div className="text-white/20 text-[9px] tracking-[0.3em]">EMAIL INTELLIGENCE</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-white/30 tracking-widest">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--c1)] animate-pulse-green" />
              ONLINE
            </span>
            <span>v1.0</span>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar */}
          <aside className="space-y-4">
            {/* Input */}
            <div className="card p-4">
              <label className="text-[10px] text-[var(--c1)]/50 tracking-widest uppercase block mb-2">
                Target Email
              </label>
              <input
                ref={inputRef}
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && scan()}
                placeholder="target@domain.com"
                className="w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-[var(--c1)]/60 transition-all"
              />
              <button
                onClick={() => scan()}
                disabled={scanning}
                className="w-full mt-2 py-2.5 rounded-lg border border-[var(--c1)] text-[var(--c1)] text-xs tracking-[0.2em] uppercase font-bold transition-all hover:bg-[var(--c1)]/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {scanning ? '⟳ SCANNING...' : '⬡ INITIATE TRACE'}
              </button>
              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            </div>

            {/* Quick targets */}
            <div className="card p-4">
              <div className="text-[10px] text-[var(--c1)]/40 tracking-widest uppercase mb-2">Quick Targets</div>
              <div className="space-y-1.5">
                {QUICK.map(q => (
                  <button key={q} onClick={() => { setEmail(q); scan(q) }}
                    className="w-full text-left px-2.5 py-1.5 rounded text-xs text-blue-400/80 border border-blue-500/10 bg-blue-500/3 hover:bg-blue-500/10 hover:border-blue-500/30 transition-all truncate">
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Progress */}
            <div className="card p-4">
              <div className="text-[10px] text-[var(--c1)]/40 tracking-widest uppercase mb-3">Scan Progress</div>
              <div className="space-y-2">
                {STAGES.map((s, i) => {
                  const done = scanning ? i < stageIdx : result ? true : false
                  const active = scanning && i === stageIdx
                  return (
                    <div key={s.id} className={`flex items-center gap-2 text-[11px] transition-colors ${done ? 'text-[var(--c1)]' : active ? 'text-yellow-400' : 'text-white/20'}`}>
                      <span className="w-3 text-center">{done ? '✓' : active ? '►' : '○'}</span>
                      <span className={active ? 'animate-blink' : ''}>{s.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Risk meter */}
            {result && (
              <div className="card p-4 animate-fade-up">
                <div className="text-[10px] text-[var(--c1)]/40 tracking-widest uppercase mb-2">Risk Score</div>
                <div className="flex justify-between text-xs mb-1">
                  <span className={result.riskScore < 30 ? 'text-green-400' : result.riskScore < 60 ? 'text-yellow-400' : 'text-red-400'}>
                    {result.riskScore < 30 ? 'LOW' : result.riskScore < 60 ? 'MEDIUM' : 'HIGH'}
                  </span>
                  <span className="text-white/40">{result.riskScore}/100</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${result.riskScore}%`,
                      background: `linear-gradient(90deg, #00ff9d, #0099ff, ${result.riskScore > 60 ? '#ff4d6d' : '#ffd60a'})`,
                    }} />
                </div>
              </div>
            )}
          </aside>

          {/* Main panel */}
          <main className="min-h-[500px]">
            {!scanning && !result && (
              <div className="flex flex-col items-center justify-center h-80 gap-4 text-center opacity-40">
                <div className="text-5xl">⬡</div>
                <p className="text-sm tracking-widest text-[var(--c2)]/80">ENTER EMAIL TO BEGIN TRACE</p>
                <p className="text-xs text-white/30">Public data only · GDPR compliant · Powered by Claude AI</p>
              </div>
            )}

            {scanning && (
              <div className="flex flex-col items-center justify-center h-80 gap-6">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 border-2 border-[var(--c1)] border-t-transparent rounded-full animate-spin" />
                  <div className="absolute inset-2 border-2 border-blue-400 border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
                </div>
                <div className="text-xs text-[var(--c1)]/70 tracking-widest animate-blink">
                  {stageIdx >= 0 ? STAGES[stageIdx]?.label.toUpperCase() : 'INITIALIZING...'}
                </div>
              </div>
            )}

            {result && !scanning && (
              <div>
                {/* Tabs */}
                <div className="flex gap-1 mb-4 border-b border-white/5 pb-3">
                  {TABS.map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                      className={`px-3 py-1.5 text-xs rounded tracking-widest uppercase transition-all ${activeTab === t ? 'bg-[var(--c1)]/10 text-[var(--c1)] border border-[var(--c1)]/25' : 'text-white/30 hover:text-white/60'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                {activeTab === 'Overview'  && <OverviewTab  d={result} />}
                {activeTab === 'Social'    && <SocialTab    d={result} />}
                {activeTab === 'Breaches'  && <BreachTab    d={result} />}
                {activeTab === 'Timeline'  && <TimelineTab  d={result} />}
                {activeTab === 'Domain'    && <DomainTab    d={result} />}
              </div>
            )}
          </main>
        </div>

        {/* Footer */}
        <footer className="text-center py-4 text-[10px] text-white/15 tracking-widest border-t border-white/5 mt-4">
          SHADOWTRACE · PUBLIC DATA ONLY · GDPR COMPLIANT · ETHICAL OSINT
        </footer>
      </div>
    </>
  )
}
