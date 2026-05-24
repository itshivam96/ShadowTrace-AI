import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import type { ProfileResult } from './api/scan'

// ─── Scan step labels ─────────────────────────────────────────────────────────
const STEPS = [
  { id: 'domain',   label: 'Domain intelligence' },
  { id: 'gravatar', label: 'Gravatar lookup' },
  { id: 'github',   label: 'GitHub discovery' },
  { id: 'breach',   label: 'Breach analysis' },
  { id: 'npm',      label: 'npm packages' },
  { id: 'logo',     label: 'Company signals' },
  { id: 'ai',       label: 'AI profiling' },
]

const QUICK_TARGETS = [
  'torvalds@linux-foundation.org',
  'john.doe@google.com',
  'researcher@mit.edu',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ScoreRing({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 30, circ = 2 * Math.PI * r
  const fill = circ - (value / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#1a1a2e" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={fill}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="40" y="44" textAnchor="middle" fill={color} fontSize="15" fontWeight="700" fontFamily="monospace">
          {value}
        </text>
      </svg>
      <span className="text-xs text-gray-400 tracking-widest uppercase">{label}</span>
    </div>
  )
}

function Badge({ text, variant }: { text: string; variant: 'danger' | 'warning' | 'info' | 'success' }) {
  const styles: Record<string, string> = {
    danger:  'bg-red-900/40 text-red-400 border-red-700/40',
    warning: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40',
    info:    'bg-blue-900/40 text-blue-400 border-blue-700/40',
    success: 'bg-green-900/40 text-green-400 border-green-700/40',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border font-mono tracking-wider ${styles[variant]}`}>
      {text}
    </span>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="border border-green-900/30 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-green-950/20 border-b border-green-900/20">
        <span className="text-green-500">{icon}</span>
        <span className="text-xs text-green-400 font-mono tracking-widest uppercase">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function DataRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-gray-800/50 last:border-0">
      <span className="text-xs text-gray-500 shrink-0 w-36">{label}</span>
      <span className={`text-xs text-right ${mono ? 'font-mono text-green-400' : 'text-gray-300'} break-all ml-2`}>
        {value || <span className="text-gray-600">—</span>}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Home() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [result, setResult] = useState<ProfileResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  async function runScan(targetEmail?: string) {
    const target = (targetEmail || email).trim()
    if (!target || !target.includes('@')) return

    setEmail(target)
    setLoading(true)
    setResult(null)
    setError(null)
    setCurrentStep(0)

    // Animate through steps
    const stepTimer = setInterval(() => {
      setCurrentStep(prev => {
        if (prev >= STEPS.length - 1) { clearInterval(stepTimer); return prev }
        return prev + 1
      })
    }, 700)

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      })
      clearInterval(stepTimer)
      setCurrentStep(STEPS.length)

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const data: ProfileResult = await res.json()
      setResult(data)
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 200)
    } catch (err) {
      clearInterval(stepTimer)
      setError(String(err).replace('Error: ', ''))
    } finally {
      setLoading(false)
      setCurrentStep(-1)
    }
  }

  const ghData = result?.github?.data as Record<string, unknown> | undefined
  const gp = result?.gravatarProfile

  return (
    <>
      <Head>
        <title>ShadowTrace — Email Intelligence</title>
        <meta name="description" content="OSINT email intelligence. Discover public digital footprints." />
      </Head>

      <div className="min-h-screen bg-[#030712] text-white font-mono">
        {/* Scanline overlay */}
        <div className="pointer-events-none fixed inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,255,70,0.015)_2px,rgba(0,255,70,0.015)_4px)] z-0" />

        <div className="relative z-10 max-w-3xl mx-auto px-4 py-12">

          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 text-green-500 text-2xl font-bold tracking-[0.3em] mb-1">
              <span>⬡</span> SHADOWTRACE
            </div>
            <div className="text-[10px] text-green-700 tracking-[0.5em] uppercase mb-1">Email Intelligence Platform</div>
            <div className="flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-green-600 tracking-widest">ONLINE v2.0</span>
            </div>
          </div>

          {/* Input */}
          <div className="border border-green-800/40 rounded-lg p-5 mb-6 bg-black/30">
            <label className="block text-[10px] text-green-600 tracking-widest mb-2 uppercase">
              Target Email
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-700 text-sm">›</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runScan()}
                  placeholder="target@domain.com"
                  className="w-full bg-black/60 border border-green-900/50 rounded pl-7 pr-4 py-2.5 text-sm text-green-300 placeholder-green-900 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-800"
                  disabled={loading}
                />
              </div>
              <button
                onClick={() => runScan()}
                disabled={loading || !email}
                className="px-5 py-2.5 bg-green-950 border border-green-700/50 rounded text-green-400 text-xs tracking-widest hover:bg-green-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'SCANNING…' : '⬡ INITIATE TRACE'}
              </button>
            </div>

            {/* Quick targets */}
            <div className="flex flex-wrap gap-2 mt-3">
              {QUICK_TARGETS.map(t => (
                <button
                  key={t}
                  onClick={() => runScan(t)}
                  disabled={loading}
                  className="text-[10px] text-green-700 hover:text-green-500 border border-green-900/40 hover:border-green-700/40 rounded px-2 py-0.5 transition-all"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Scan progress */}
          {loading && (
            <div className="border border-green-900/30 rounded-lg p-4 mb-6 bg-black/20">
              <div className="text-[10px] text-green-600 tracking-widest mb-3 uppercase">Scan Progress</div>
              {STEPS.map((step, i) => (
                <div key={step.id} className="flex items-center gap-2 py-1">
                  <span className={`text-xs ${
                    i < currentStep ? 'text-green-500' :
                    i === currentStep ? 'text-green-300 animate-pulse' :
                    'text-gray-700'
                  }`}>
                    {i < currentStep ? '✓' : i === currentStep ? '◉' : '○'}
                  </span>
                  <span className={`text-xs ${
                    i < currentStep ? 'text-green-600' :
                    i === currentStep ? 'text-green-300' :
                    'text-gray-700'
                  }`}>
                    {step.label}
                    {i === currentStep && <span className="ml-1 animate-pulse">…</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="border border-red-900/50 rounded-lg p-4 mb-6 bg-red-950/20">
              <span className="text-xs text-red-400">⚠ {error}</span>
            </div>
          )}

          {/* Results */}
          {result && (
            <div ref={resultsRef} className="space-y-4 animate-fadeIn">

              {/* Header bar */}
              <div className="flex items-center justify-between p-3 border border-green-800/30 rounded-lg bg-black/20">
                <div>
                  <div className="text-green-400 text-sm font-bold">{result.email}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    Scanned {new Date(result.scannedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  {result.threatFlags.map(f => (
                    <Badge key={f} text={f}
                      variant={f.includes('BREACH') || f.includes('CRITICAL') ? 'danger' : f.includes('SUSPICIOUS') ? 'warning' : 'info'}
                    />
                  ))}
                </div>
              </div>

              {/* Score rings */}
              <div className="grid grid-cols-4 gap-3 p-4 border border-green-900/20 rounded-lg bg-black/20">
                <ScoreRing value={result.trustScore}         label="Trust"       color="#22c55e" />
                <ScoreRing value={result.riskScore}          label="Risk"        color="#ef4444" />
                <ScoreRing value={result.identityConfidence} label="Confidence"  color="#3b82f6" />
                <ScoreRing value={result.botProbability}     label="Bot Prob"    color="#f59e0b" />
              </div>

              {/* AI Summary */}
              <Section title="AI Intelligence Summary" icon="◈">
                <p className="text-sm text-gray-300 leading-relaxed font-sans">{result.aiSummary}</p>
              </Section>

              {/* Domain */}
              <Section title="Domain Intelligence" icon="◎">
                <div>
                  <DataRow label="Domain"      value={result.domain} mono />
                  <DataRow label="Email Type"  value={result.domainInfo.emailType} />
                  <DataRow label="MX Provider" value={result.domainInfo.mxProvider} />
                  <DataRow label="Reputation"  value={
                    <span className={
                      result.domainInfo.reputation === 'suspicious' ? 'text-red-400' :
                      result.domainInfo.reputation === 'trusted' ? 'text-green-400' :
                      result.domainInfo.reputation === 'privacy-focused' ? 'text-blue-400' :
                      'text-gray-300'
                    }>{result.domainInfo.reputation}</span>
                  } />
                  {result.companyLogo && (
                    <div className="mt-3 flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={result.companyLogo} alt="Company logo" className="h-6 w-auto opacity-80" />
                      <span className="text-xs text-gray-500">{result.domainInfo.company}</span>
                    </div>
                  )}
                </div>
              </Section>

              {/* Gravatar */}
              <Section title="Gravatar Profile" icon="◈">
                {result.gravatarUrl || result.gravatarProfile ? (
                  <div className="flex gap-4">
                    {result.gravatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={result.gravatarUrl}
                        alt="Gravatar"
                        className="w-16 h-16 rounded-full border border-green-900/40 shrink-0"
                      />
                    )}
                    <div className="flex-1">
                      <DataRow label="Display Name"  value={gp?.displayName} />
                      <DataRow label="Username"      value={gp?.preferredUsername} mono />
                      <DataRow label="Location"      value={gp?.location} />
                      <DataRow label="Job Title"     value={gp?.jobTitle} />
                      <DataRow label="Company"       value={gp?.company} />
                      <DataRow label="Pronouns"      value={gp?.pronouns} />
                      <DataRow label="Bio"           value={gp?.bio} />
                      {gp?.verified_accounts && gp.verified_accounts.length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] text-gray-500 mb-1">Verified Accounts</div>
                          <div className="flex flex-wrap gap-1">
                            {gp.verified_accounts.map((a, i) => (
                              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] px-2 py-0.5 bg-blue-950/40 border border-blue-900/40 text-blue-400 rounded hover:bg-blue-900/40 transition-colors">
                                {a.service_label}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {gp?.urls && gp.urls.length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] text-gray-500 mb-1">Links</div>
                          {gp.urls.map((u, i) => (
                            <a key={i} href={u.value} target="_blank" rel="noopener noreferrer"
                              className="block text-xs text-blue-400 hover:text-blue-300 truncate">
                              {u.title || u.value}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">No Gravatar profile found for this email.</p>
                )}
              </Section>

              {/* GitHub */}
              <Section title={`GitHub Profile ${result.github.found ? `— @${result.github.handle}` : ''}`} icon="◉">
                {result.github.found ? (
                  <div>
                    <div className="flex items-start gap-4 mb-3">
                      {ghData?.avatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ghData.avatarUrl as string}
                          alt="GitHub avatar"
                          className="w-14 h-14 rounded-full border border-green-900/40 shrink-0"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <a href={result.github.url} target="_blank" rel="noopener noreferrer"
                            className="text-green-400 text-sm hover:text-green-300 font-bold">
                            @{result.github.handle}
                          </a>
                          <Badge text={`${result.github.confidence}% confidence`} variant="info" />
                          {ghData?.hireable && <Badge text="HIREABLE" variant="success" />}
                        </div>
                        {ghData?.name && <div className="text-xs text-gray-300">{ghData.name as string}</div>}
                        {ghData?.bio  && <div className="text-xs text-gray-400 mt-0.5">{ghData.bio as string}</div>}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4">
                      <DataRow label="Company"    value={ghData?.company as string} />
                      <DataRow label="Location"   value={ghData?.location as string} />
                      <DataRow label="Email"      value={ghData?.email as string} mono />
                      <DataRow label="Website"    value={ghData?.blog
                        ? <a href={ghData.blog as string} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:underline">{ghData.blog as string}</a>
                        : null} />
                      <DataRow label="Twitter"    value={ghData?.twitterUsername ? `@${ghData.twitterUsername}` : null} />
                      <DataRow label="Joined"     value={ghData?.createdAt ? new Date(ghData.createdAt as string).toLocaleDateString() : null} />
                      <DataRow label="Public Repos"  value={String(ghData?.publicRepos || 0)} mono />
                      <DataRow label="Public Gists"  value={String(ghData?.publicGists || 0)} mono />
                      <DataRow label="Followers"  value={String(ghData?.followers || 0)} mono />
                      <DataRow label="Following"  value={String(ghData?.following || 0)} mono />
                    </div>

                    {/* Recent repos */}
                    {(ghData?.recentRepos as Array<{ name: string; language: string | null; stars: number; description: string | null }>)?.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider">Recent Repositories</div>
                        <div className="space-y-1.5">
                          {(ghData.recentRepos as Array<{ name: string; language: string | null; stars: number; description: string | null }>).map((repo) => (
                            <div key={repo.name} className="flex items-center justify-between text-xs p-2 bg-black/30 rounded border border-gray-800/40">
                              <div>
                                <a href={`${result.github.url}/${repo.name}`} target="_blank" rel="noopener noreferrer"
                                  className="text-green-400 hover:text-green-300">{repo.name}</a>
                                {repo.description && <span className="text-gray-500 ml-2 text-[10px]">{repo.description}</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                {repo.language && <span className="text-[10px] text-blue-400">{repo.language}</span>}
                                {repo.stars > 0 && <span className="text-[10px] text-yellow-600">★ {repo.stars}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">No GitHub profile matched for this email or username.</p>
                )}
              </Section>

              {/* npm */}
              {result.npmPackages?.length > 0 && (
                <Section title="npm Packages" icon="◫">
                  <div className="space-y-2">
                    {result.npmPackages.map(pkg => (
                      <div key={pkg.name} className="flex items-center justify-between p-2 bg-black/30 rounded border border-gray-800/40">
                        <div>
                          <a href={`https://www.npmjs.com/package/${pkg.name}`} target="_blank" rel="noopener noreferrer"
                            className="text-green-400 text-xs hover:text-green-300">{pkg.name}</a>
                          <span className="text-[10px] text-gray-600 ml-2">v{pkg.version}</span>
                          {pkg.description && <div className="text-[10px] text-gray-500 mt-0.5">{pkg.description}</div>}
                        </div>
                        <div className="text-[10px] text-yellow-600 shrink-0 ml-2">
                          {pkg.downloads.toLocaleString()} dl/mo
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Breaches */}
              <Section title={`Breach History — ${result.breaches.length} found`} icon="⚠">
                {result.hibpError && (
                  <div className="text-[10px] text-yellow-700 bg-yellow-950/20 border border-yellow-900/30 rounded p-2 mb-3">
                    ℹ {result.hibpError}
                  </div>
                )}
                {result.breaches.length > 0 ? (
                  <div className="space-y-2">
                    {result.breaches.map((b, i) => (
                      <div key={i} className="p-3 bg-black/30 rounded border border-gray-800/40">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-white font-medium">{b.name}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-500">{b.year}</span>
                            <Badge
                              text={b.severity}
                              variant={b.severity === 'high' ? 'danger' : b.severity === 'medium' ? 'warning' : 'info'}
                            />
                          </div>
                        </div>
                        {b.pwnCount && (
                          <div className="text-[10px] text-gray-500 mb-1">{b.pwnCount.toLocaleString()} accounts affected</div>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {b.dataTypes.map(dt => (
                            <span key={dt} className="text-[10px] px-1.5 py-0.5 bg-red-950/30 text-red-400 rounded border border-red-900/30">
                              {dt}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !result.hibpError ? (
                  <p className="text-xs text-green-700">✓ No breaches found for this email address.</p>
                ) : null}
              </Section>

              {/* Timeline */}
              {result.timeline.length > 0 && (
                <Section title="Digital Activity Timeline" icon="◷">
                  <div className="relative ml-2">
                    {result.timeline.map((item, i) => (
                      <div key={i} className="flex gap-3 mb-3 last:mb-0">
                        <div className="flex flex-col items-center">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                            item.source === 'hibp' ? 'bg-red-500' :
                            item.source === 'github' ? 'bg-green-500' :
                            item.source === 'npm' ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }`} />
                          {i < result.timeline.length - 1 && (
                            <div className="w-px flex-1 bg-gray-800 mt-1" />
                          )}
                        </div>
                        <div className="pb-2">
                          <div className="text-[10px] text-gray-500 font-mono">
                            {item.year === 0 ? 'Unknown year' : item.year}
                          </div>
                          <div className="text-xs text-gray-300 mt-0.5">{item.event}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Footer */}
              <div className="text-center text-[10px] text-gray-700 pt-2 tracking-widest">
                SHADOWTRACE · PUBLIC DATA ONLY · GDPR COMPLIANT · ETHICAL OSINT
              </div>
            </div>
          )}

          {/* Idle state */}
          {!result && !loading && !error && (
            <div className="text-center py-16">
              <div className="text-4xl text-green-900 mb-3">⬡</div>
              <div className="text-xs text-gray-700 tracking-widest">ENTER EMAIL TO BEGIN TRACE</div>
              <div className="text-[10px] text-gray-800 mt-2">Public data only · GDPR compliant · Powered by Claude AI</div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #030712; font-family: 'JetBrains Mono', monospace; }
        ::selection { background: #15803d40; color: #86efac; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #030712; }
        ::-webkit-scrollbar-thumb { background: #14532d; border-radius: 2px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease forwards; }
      `}</style>
    </>
  )
}
