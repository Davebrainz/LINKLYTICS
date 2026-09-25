import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Check, Copy, LayoutDashboard, Link2, Megaphone, Menu, Moon, QrCode, Search, Settings, Sun, Trash2 } from 'lucide-react'
import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './App.css'
import Header from './components/Header'
import Logo from './components/Logo'
import { detectGender, getGenderedAvatar } from './utils/gender'

const API_BASE = 'http://localhost:5000/api'

type ClickEvent = {
  id: string
  country: string
  city: string
  device: 'Desktop' | 'Mobile' | 'Tablet'
  browser: string
  os: string
  referrer?: string
  createdAt: string
}

type UrlLink = {
  id: string
  title: string
  longUrl: string
  shortCode: string
  shortUrl: string
  customSlug?: string
  createdAt: string
  expiresAt?: string
  maxClicks?: number
  clickCount: number
  status: 'Active' | 'Expired' | 'Limit Reached'
  clickEvents: ClickEvent[]
  qrCode?: string
}

type AnalyticsData = {
  referrers: { source: string; clicks: number }[]
  daily: { date: string; clicks: number }[]
}

type Screen = 'landing' | 'auth' | 'dashboard'
type Page = 'dashboard' | 'links' | 'analytics' | 'campaigns' | 'settings'

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'settings', label: 'Settings', icon: Settings },
]

type Profile = { name: string; email: string; pic: string }

function ProfileSettings({ profile, onSave, onUpdate }: { profile: Profile; onSave?: (profile: Profile) => void; onUpdate?: (profile: Profile) => void }) {
  const [draft, setDraft] = useState(profile)
  const gender = detectGender(draft.name)
  const fallbackAvatar = getGenderedAvatar(gender, draft.name.length + (draft.name.charCodeAt(0) || 5))

  useEffect(() => setDraft(profile), [profile])

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => setDraft((current) => ({...current, pic: typeof reader.result === 'string'? reader.result : '' }))
    reader.readAsDataURL(file)
  }

  return <div className="settings-form profile-settings">
    <h3>Profile Settings</h3>
    <p className="settings-help">Your uploaded photo is saved in this browser. Without one, Linklytics generates a gendered passport-style avatar from your name.</p>
    <div className="profile-editor">
      <img src={draft.pic || fallbackAvatar} className="profile-editor-avatar" alt={`${draft.name || 'User'} profile`} />
      <div>
        <label className="upload-button">Choose from PC<input type="file" accept="image/*" onChange={handleUpload} /></label>
        {draft.pic? <button type="button" className="remove-picture" onClick={() => setDraft((current) => ({...current, pic: '' }))}>Remove</button> : null}
        <p className="settings-help" style={{ marginTop: '12px', display: 'block' }}>
  Detected: {gender} {draft.pic? '| Custom photo' : '| Generated avatar'}
</p>
      </div>
    </div>
    <label>Name<input value={draft.name} placeholder="Enter your full name" onChange={(event) => setDraft((current) => ({...current, name: event.target.value }))} /></label>
    <label>Email<input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({...current, email: event.target.value }))} /></label>
    <label>Change password<input type="password" placeholder="Enter a new password" /></label>
    <button type="button" className="primary-button" onClick={() => (onSave || onUpdate)?.(draft)}>Save profile</button>
  </div>
}

function App() {
  const [links, setLinks] = useState<UrlLink[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('landing')
  const [activePage, setActivePage] = useState<Page>('dashboard')
  const [linkSearch, setLinkSearch] = useState('')
  const [linkFilter, setLinkFilter] = useState<'All' | 'Active' | 'Expired'>('All')
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrLink, setQrLink] = useState<string | null>(null)
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({ referrers: [], daily: [] })
  const [customCampaigns, setCustomCampaigns] = useState<{ id: string; name: string; color: string }[]>([])
  const [settingsTab, setSettingsTab] = useState<'Profile' | 'Branding' | 'Preferences'>('Profile')
  const [settings, setSettings] = useState(() => ({ domain: localStorage.getItem('linklytics-domain') || 'short.ly/', theme: localStorage.getItem('linklytics-brand-color') || '#4f46e5', expiry: localStorage.getItem('linklytics-expiry') || '30 days', maxClicks: localStorage.getItem('linklytics-max-clicks') || 'Unlimited', emailAlerts: localStorage.getItem('linklytics-email-alerts')!== 'false' }))
  const [profile, setProfile] = useState(() => ({
    name: localStorage.getItem('linklytics_name') || '',
    email: localStorage.getItem('linklytics_email') || 'demo@linklytics.com',
    pic: localStorage.getItem('linklytics_pic') || '',
  }))
  const [isLoading, setIsLoading] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('linklytics-theme') === 'dark')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [authNotice, setAuthNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [form, setForm] = useState({
    longUrl: '',
    customSlug: '',
    expiresAt: '',
    maxClicks: '',
  })
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const selectedLink = links.find((link) => link.id === selectedId)?? links[0]

  const aggregateStats = useMemo(() => {
    const totalLinks = links.length
    const totalClicks = links.reduce((sum, link) => sum + link.clickEvents.length, 0)
    const activeLinks = links.filter((link) => link.status === 'Active').length
    const uniqueCountries = new Set(links.flatMap((link) => link.clickEvents.map((event) => event.country))).size

    return { totalLinks, totalClicks, activeLinks, uniqueCountries }
  }, [links])

  const countryBreakdown = useMemo(() => {
    const map = new Map<string, number>()

    links.forEach((link) => {
      link.clickEvents.forEach((event) => {
        map.set(event.country, (map.get(event.country)?? 0) + 1)
      })
    })

    return Array.from(map.entries())
     .sort((a, b) => b[1] - a[1])
     .slice(0, 5)
  }, [links])

  const deviceBreakdown = useMemo(() => {
    const map = new Map<string, number>()

    links.forEach((link) => {
      link.clickEvents.forEach((event) => {
        map.set(event.device, (map.get(event.device)?? 0) + 1)
      })
    })

    return Array.from(map.entries())
  }, [links])

  const dailyTraffic = useMemo(() => {
    const lastSeven = Array.from({ length: 7 }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - index))
      return { day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: 0 }
    })

    links.forEach((link) => {
      link.clickEvents.forEach((event) => {
        const eventDate = new Date(event.createdAt)
        const label = eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const item = lastSeven.find((day) => day.day === label)
        if (item) item.value += 1
      })
    })

    return lastSeven
  }, [links])

  const fetchLinks = async (authToken: string) => {
    const response = await fetch(`${API_BASE}/links`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    if (!response.ok) {
      throw new Error('Unable to fetch links')
    }

    const data = await response.json()
    setLinks(data)
    if (data[0]) setSelectedId(data[0].id)
  }

  const fetchAnalytics = async (authToken: string) => {
    const response = await fetch(`${API_BASE}/analytics`, { headers: { Authorization: `Bearer ${authToken}` } })
    if (response.ok) setAnalyticsData(await response.json())
  }

  const updateProfile = (nextProfile: typeof profile) => {
    setProfile(nextProfile)
    localStorage.setItem('linklytics_name', nextProfile.name)
    localStorage.setItem('linklytics_email', nextProfile.email)
    if (nextProfile.pic) localStorage.setItem('linklytics_pic', nextProfile.pic)
    else localStorage.removeItem('linklytics_pic')
    window.dispatchEvent(new Event('profileUpdated'))
    setNotice({ type: 'success', text: 'Profile saved successfully.' })
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', isDarkMode)
    localStorage.setItem('linklytics-theme', isDarkMode? 'dark' : 'light')
  }, [isDarkMode])

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-color', settings.theme)
    localStorage.setItem('linklytics-domain', settings.domain)
    localStorage.setItem('linklytics-brand-color', settings.theme)
    localStorage.setItem('linklytics-expiry', settings.expiry)
    localStorage.setItem('linklytics-max-clicks', settings.maxClicks)
    localStorage.setItem('linklytics-email-alerts', String(settings.emailAlerts))
  }, [settings])

  useEffect(() => {
    if (notice?.text === 'Campaign creation is ready for your next launch.') {
      setCustomCampaigns((current) => current.some((campaign) => campaign.name === 'New Campaign')? current : [...current, { id: `custom-${Date.now()}`, name: 'New Campaign', color: settings.theme }])
      setNotice({ type: 'success', text: 'Campaign created successfully.' })
    }
  }, [notice, settings.theme])

  const openAuth = (mode: 'login' | 'register' = 'login') => {
    setAuthMode(mode)
    setAuthNotice(null)
    setScreen('auth')
  }

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthNotice(null)

    try {
      const endpoint = authMode === 'register'? 'register' : 'login'
      const response = await fetch(`${API_BASE}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authMode === 'register'
         ? authForm
          : { email: authForm.email, password: authForm.password }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed')
      }

      localStorage.setItem('linklytics-token', data.token)
      updateProfile({
        name: data.user?.name || profile.name,
        email: data.user?.email || profile.email,
        pic: localStorage.getItem('linklytics_pic') || profile.pic,
      })
      setToken(data.token)
      setActivePage('dashboard')
      setIsLoading(true)
      await fetchLinks(data.token)
      await fetchAnalytics(data.token)
      setScreen('dashboard')
      setAuthForm({ name: '', email: '', password: '' })
    } catch (error) {
      setAuthNotice({ type: 'error', text: error instanceof Error? error.message : 'Authentication failed' })
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('linklytics-token')
    setToken(null)
    setLinks([])
    setSelectedId('')
    setActivePage('dashboard')
    setScreen('landing')
  }

  const handleFieldChange = (field: 'longUrl' | 'customSlug' | 'expiresAt' | 'maxClicks', value: string) => {
    setForm((current) => ({...current, [field]: value }))
  }

  const createShortLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!form.longUrl.trim() ||!token) {
      setNotice({ type: 'error', text: 'Please enter a valid URL and make sure the backend is running.' })
      return
    }

    const response = await fetch(`${API_BASE}/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        longUrl: form.longUrl,
        customSlug: form.customSlug,
        expiresAt: form.expiresAt,
        maxClicks: form.maxClicks? Number(form.maxClicks) : undefined,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setNotice({ type: 'error', text: result.message || 'Could not create the short link.' })
      return
    }

    setLinks((current) => [result,...current])
    setSelectedId(result.id)
    setNotice({ type: 'success', text: `Short link created: ${result.shortUrl}` })
    setForm({ longUrl: '', customSlug: '', expiresAt: '', maxClicks: '' })
  }

  const simulateClick = async (linkId: string) => {
    if (!token) return

    const response = await fetch(`${API_BASE}/links/${linkId}/click`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const result = await response.json()

    if (!response.ok) {
      setNotice({ type: 'error', text: result.message || 'Unable to track this click.' })
      return
    }

    setLinks((current) => current.map((link) => (link.id === linkId? result.link : link)))
    setNotice({ type: 'success', text: result.message || 'Click tracked successfully.' })
  }

  const maxTraffic = Math.max(...dailyTraffic.map((point) => point.value), 1)
  const linePath = dailyTraffic
   .map((point, index) => {
      const x = (index / (dailyTraffic.length - 1)) * 260
      const y = 110 - (point.value / maxTraffic) * 80
      return `${index === 0? 'M' : 'L'} ${x} ${y}`
    })
   .join(' ')

  const demoDailyTraffic = dailyTraffic
  const analyticsDevices = deviceBreakdown.map(([name, value]) => ({ name, value }))
  const analyticsLinks = links.slice(0, 5).map((link) => ({ name: link.shortCode, clicks: link.clickCount }))
  const referrers = analyticsData.referrers.map((item) => ({ name: item.source, clicks: item.clicks }))
  const filteredLinks = links.filter((link) => {
    const matchesSearch = `${link.title} ${link.shortUrl} ${link.longUrl}`.toLowerCase().includes(linkSearch.toLowerCase())
    const matchesFilter = linkFilter === 'All' || link.status === linkFilter
    return matchesSearch && matchesFilter
  })
  const campaignGroups = [
    { id: 'blackfriday', name: 'Black Friday Sale', color: '#f97316', links: links.filter((link) => /black|sale/i.test(`${link.title} ${link.longUrl}`)) },
    { id: 'product-launch', name: 'Product Launch', color: '#4f46e5', links: links.filter((link) => /product|launch/i.test(`${link.title} ${link.longUrl}`)) },
    { id: 'always-on', name: 'Always-on Content', color: '#0d9488', links: links.filter((link) =>!/black|sale|product|launch/i.test(`${link.title} ${link.longUrl}`)) },
   ...customCampaigns.map((campaign) => ({...campaign, links: [] as UrlLink[] })),
  ]

  const copyLink = async (shortUrl: string) => {
    await navigator.clipboard?.writeText(shortUrl)
    setNotice({ type: 'success', text: 'Short link copied to your clipboard.' })
  }

  const deleteLink = (linkId: string) => {
    setLinks((current) => current.filter((link) => link.id!== linkId))
    if (selectedId === linkId) setSelectedId('')
    setNotice({ type: 'success', text: 'Link removed from this workspace.' })
  }

  const exportAnalytics = () => {
    const total = analyticsData.referrers.reduce((sum, item) => sum + item.clicks, 0)
    const rows = ['Source,Clicks,Share',...analyticsData.referrers.map((item) => `${item.source},${item.clicks},${total? Math.round((item.clicks / total) * 100) : 0}%`), '', 'Date,Clicks',...analyticsData.daily.map((item) => `${item.date},${item.clicks}`)]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const themeButton = (
    <button type="button" className="theme-toggle icon-toggle" onClick={() => setIsDarkMode((current) =>!current)} aria-label={isDarkMode? 'Switch to light mode' : 'Switch to dark mode'}>
      {isDarkMode? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )

  const renderPage = () => {
    if (activePage === 'links') {
      return <>
        <div className="page-heading"><div><p className="eyebrow">Workspace library</p><h2>All shortened links</h2><p>Search, filter, and manage every link in one place.</p></div><button type="button" className="primary-button" onClick={() => { setActivePage('dashboard'); setTimeout(() => document.querySelector('.shorten-form input')?.scrollIntoView({ behavior: 'smooth' }), 0) }}>Create link</button></div>
        <section className="stats-grid compact-stats"><article className="stat-card"><span>Total links</span><strong>{links.length}</strong><small>Across your workspace</small></article><article className="stat-card"><span>Active</span><strong>{links.filter((link) => link.status === 'Active').length}</strong><small>Ready to share</small></article><article className="stat-card"><span>Expired</span><strong>{links.filter((link) => link.status === 'Expired' || (link.expiresAt && new Date(link.expiresAt) <= new Date())).length}</strong><small>Need attention</small></article></section>
        <section className="panel links-library"><div className="library-toolbar"><label className="search-field"><Search size={17} /><input placeholder="Search links..." value={linkSearch} onChange={(event) => setLinkSearch(event.target.value)} /></label><div className="filter-tabs">{(['All', 'Active', 'Expired'] as const).map((filter) => <button key={filter} type="button" className={linkFilter === filter? 'active' : ''} onClick={() => setLinkFilter(filter)}>{filter}</button>)}</div></div><div className="table-scroll"><table><thead><tr><th>Short Link</th><th>Original URL</th><th>Clicks</th><th>Created</th><th>Expiry</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredLinks.length > 0? filteredLinks.map((link) => <tr key={link.id}><td><strong className="short-link-cell">{link.shortUrl.replace('http://localhost:5000/', 'short.ly/')}</strong></td><td className="url-cell">{link.longUrl}</td><td>{link.clickCount}</td><td>{new Date(link.createdAt).toLocaleDateString()}</td><td>{link.expiresAt? new Date(link.expiresAt).toLocaleDateString() : 'Never'}</td><td><span className={`status-pill ${link.status.toLowerCase().replace(/\s+/g, '-')}`}>{link.status}</span></td><td><div className="row-actions"><button type="button" className="icon-action" onClick={() => copyLink(link.shortUrl)} aria-label="Copy short link"><Copy size={15} /></button><button type="button" className="icon-action" onClick={() => window.open(link.qrCode || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link.shortUrl)}`, '_blank')} aria-label="Generate QR code"><QrCode size={15} /></button><button type="button" className="icon-action danger" onClick={() => deleteLink(link.id)} aria-label="Delete link"><Trash2 size={15} /></button></div></td></tr>) : <tr><td colSpan={7} className="empty-state">No links match this filter yet.</td></tr>}</tbody></table></div></section>
      </>
    }

    if (activePage === 'analytics') {
      return <><div className="page-heading"><div><p className="eyebrow">Performance intelligence</p><h2>Analytics overview</h2><p>Understand what your audience does after every share.</p></div><button type="button" className="ghost-button">Last 7 days</button></div><section className="stats-grid analytics-stats"><article className="stat-card"><span>Total clicks</span><strong>{aggregateStats.totalClicks || '1,284'}</strong><small>+18.6% this week</small></article><article className="stat-card"><span>Top country</span><strong>Nigeria</strong><small>80% of all clicks</small></article><article className="stat-card"><span>Top device</span><strong>Desktop</strong><small>60% of all clicks</small></article><article className="stat-card"><span>Click-through rate</span><strong>18.4%</strong><small>+3.2% from last week</small></article></section><section className="panel chart-panel large-chart"><div className="panel-header"><div><p className="eyebrow">Traffic trend</p><h3>Clicks over last 7 days</h3></div></div><ResponsiveContainer width="100%" height={260}><LineChart data={demoDailyTraffic}><XAxis dataKey="day" /><YAxis /><Tooltip /><Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={3} dot={{ fill: '#fff', stroke: '#4f46e5', strokeWidth: 2, r: 4 }} /></LineChart></ResponsiveContainer></section><section className="analytics-cards"><article className="panel chart-panel"><div className="panel-header"><div><p className="eyebrow">Audience</p><h3>Device Breakdown</h3></div></div><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={analyticsDevices} dataKey="value" nameKey="name" cx="50%" cy="48%" innerRadius={55} outerRadius={82} paddingAngle={4}>{analyticsDevices.map((entry, index) => <Cell key={entry.name} fill={['#4f46e5', '#14b8a6', '#f59e0b'][index]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></article><article className="panel chart-panel"><div className="panel-header"><div><p className="eyebrow">Leaders</p><h3>Top 5 Performing Links</h3></div></div><ResponsiveContainer width="100%" height={230}><BarChart data={analyticsLinks} layout="vertical" margin={{ left: 12, right: 16 }}><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={90} /><Tooltip /><Bar dataKey="clicks" fill="#4f46e5" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></article></section><section className="panel table-panel"><div className="panel-header"><div><p className="eyebrow">Acquisition</p><h3>Referrer table</h3></div></div><table><thead><tr><th>Source</th><th>Clicks</th><th>Share</th></tr></thead><tbody>{referrers.map((referrer) => <tr key={referrer.name}><td><strong>{referrer.name}</strong></td><td>{referrer.clicks}</td><td><div className="referrer-share"><span style={{ width: `${(referrer.clicks / referrers[0].clicks) * 100}%` }} /></div></td></tr>)}</tbody></table></section></>
    }

    if (activePage === 'campaigns') {
      return <><div className="page-heading"><div><p className="eyebrow">Organize your growth</p><h2>Campaigns</h2><p>Group related links and track the momentum of every initiative.</p></div><button type="button" className="primary-button" onClick={() => setNotice({ type: 'success', text: 'Campaign creation is ready for your next launch.' })}>+ New Campaign</button></div><section className="campaign-grid">{campaignGroups.map((campaign) => { const clicks = campaign.links.reduce((sum, link) => sum + link.clickCount, 0) || (campaign.id === 'blackfriday'? 1240 : campaign.id === 'product-launch'? 860 : 520); const progress = Math.min(100, Math.round(clicks / 20)); return <article className="campaign-card" key={campaign.id}><div className="campaign-card-top"><span className="campaign-icon" style={{ backgroundColor: campaign.color }}><Megaphone size={17} /></span><button type="button" className="more-button" onClick={() => setExpandedCampaign(expandedCampaign === campaign.id? null : campaign.id)}>{expandedCampaign === campaign.id? 'Hide links' : 'View links'}</button></div><h3>{campaign.name}</h3><div className="campaign-meta"><span>{campaign.links.length || 3} links</span><strong>{clicks.toLocaleString()} clicks</strong></div><div className="progress-track"><span style={{ width: `${progress}%`, backgroundColor: campaign.color }} /></div><small>{progress}% of monthly goal</small>{expandedCampaign === campaign.id? <div className="campaign-links">{(campaign.links.length > 0? campaign.links : [{ id: `${campaign.id}-demo`, shortUrl: `short.ly/${campaign.id}` } as UrlLink]).map((link) => <div key={link.id}><Link2 size={14} /><span>{link.shortUrl}</span></div>)}</div> : null}</article> })}</section></>
      }
    return <><div className="page-heading"><div><p className="eyebrow">Workspace controls</p><h2>Settings</h2><p>Keep your profile, brand, and link defaults in sync.</p></div></div><section className="panel settings-panel"><div className="settings-tabs">{(['Profile', 'Branding', 'Preferences'] as const).map((tab) => <button key={tab} type="button" className={settingsTab === tab? 'active' : ''} onClick={() => setSettingsTab(tab)}>{tab}</button>)}</div><div className="settings-content">{settingsTab === 'Profile'? <ProfileSettings profile={profile} onUpdate={updateProfile} /> : null}{settingsTab === 'Branding'? <div className="settings-form"><label>Default domain<select value={settings.domain} onChange={(event) => setSettings((current) => ({...current, domain: event.target.value }))}><option>short.ly/</option><option>links.linklytics.com/</option></select></label><label>Theme color<div className="color-setting"><input type="color" value={settings.theme} onChange={(event) => setSettings((current) => ({...current, theme: event.target.value }))} /><span>{settings.theme}</span></div></label><button type="button" className="primary-button">Save branding</button></div> : null}{settingsTab === 'Preferences'? <div className="settings-form"><label>Default expiry time<select value={settings.expiry} onChange={(event) => setSettings((current) => ({...current, expiry: event.target.value }))}><option>7 days</option><option>30 days</option><option>90 days</option><option>Never</option></select></label><label>Default max clicks<select value={settings.maxClicks} onChange={(event) => setSettings((current) => ({...current, maxClicks: event.target.value }))}><option>Unlimited</option><option>100 clicks</option><option>1,000 clicks</option></select></label><label className="checkbox-row"><input type="checkbox" checked={settings.emailAlerts} onChange={(event) => setSettings((current) => ({...current, emailAlerts: event.target.checked }))} /> Enable email alert when link expires</label><button type="button" className="primary-button">Save preferences</button></div> : null}</div></section></>
  }

  if (isLoading) {
    return <div className="loading-state">Loading dashboard...</div>
  }

  if (screen === 'landing') {
    return (
      <div className="marketing-page">
        <header className="marketing-nav">
          <Logo size={36} showText={true} />
          <div className="marketing-actions">
            {themeButton}
            <button type="button" className="text-button" onClick={() => openAuth('login')}>Log in</button>
            <button type="button" className="primary-button" onClick={() => openAuth('register')}>Get started</button>
          </div>
        </header>

        <main className="landing-content">
          <section className="landing-hero">
            <div className="hero-copy">
              <p className="eyebrow">Smart links. Clear growth.</p>
              <h1>Turn every click into a clearer next step.</h1>
              <p className="hero-description">Linklytics helps teams shorten, share, and understand their URLs from one focused workspace.</p>
              <div className="hero-actions">
                <button type="button" className="primary-button large-button" onClick={() => openAuth('register')}>Create your free account</button>
                <button type="button" className="ghost-button large-button" onClick={() => openAuth('login')}>Explore the dashboard</button>
              </div>
              <div className="hero-proof"><span className="status-dot" /> Built for campaigns, content, and teams that measure what matters.</div>
            </div>
            <div className="landing-preview">
              <div className="preview-window-bar"><span /><span /><span /><b>linklytics / overview</b></div>
              <div className="preview-metric-row"><div><small>LINKS CREATED</small><strong>1,284</strong></div><div><small>TOTAL CLICKS</small><strong>48.6k</strong></div></div>
              <div className="preview-chart"><span className="chart-line" /><i /><i /><i /></div>
              <div className="preview-link-row"><span className="mini-link-icon">↗</span><div><strong>launch.linklytics.app/summer</strong><small>Campaign link · 12,840 clicks</small></div><em>Active</em></div>
              <div className="preview-link-row"><span className="mini-link-icon">↗</span><div><strong>launch.linklytics.app/product</strong><small>Product page · 8,420 clicks</small></div><em>Active</em></div>
            </div>
          </section>

          <section className="feature-section">
            <div className="section-heading"><p className="eyebrow">Everything in one place</p><h2>A sharper way to manage your links.</h2><p>From the first shortened URL to the final conversion, Linklytics keeps every signal close at hand.</p></div>
            <div className="feature-grid">
              <article><span className="feature-icon">↗</span><h3>Shorten with control</h3><p>Create branded links with custom slugs, expiry dates, and click limits.</p></article>
              <article><span className="feature-icon">◒</span><h3>See who is clicking</h3><p>Understand countries, devices, browsers, and traffic patterns in real time.</p></article>
              <article><span className="feature-icon">▦</span><h3>Share with confidence</h3><p>Generate QR codes and keep every campaign link organized in one dashboard.</p></article>
            </div>
          </section>
        </main>
        <footer className="marketing-footer">© 2026 Linklytics <span>Smart URL Shortener & Analytics</span></footer>
      </div>
    )
  }

  if (screen === 'auth') {
    return (
      <div className="auth-page">
        <header className="auth-nav"><button type="button" className="back-button" onClick={() => setScreen('landing')}>← Back to home</button>{themeButton}</header>
        <main className="auth-layout">
          <section className="auth-intro"><Logo size={42} showText={true} /><p className="eyebrow">Your link workspace</p><h1>Make every share more measurable.</h1><p>Join Linklytics to create smarter short links and see the story behind every click.</p><div className="auth-benefit">✓ Unlimited campaign organization</div><div className="auth-benefit">✓ Fast, clear audience analytics</div></section>
          <form className="auth-card" onSubmit={handleAuthSubmit}><div className="auth-card-header"><p className="eyebrow">Welcome to Linklytics</p><h2>{authMode === 'login'? 'Log in to your workspace' : 'Create your account'}</h2><p>{authMode === 'login'? 'Pick up where your campaigns left off.' : 'Start building smarter links in minutes.'}</p></div>{authMode === 'register'? <label>Full name<input required value={authForm.name} onChange={(event) => setAuthForm((current) => ({...current, name: event.target.value }))} placeholder="Ada Lovelace" /></label> : null}<label>Email address<input required type="email" value={authForm.email} onChange={(event) => setAuthForm((current) => ({...current, email: event.target.value }))} placeholder="you@company.com" /></label><label>Password<input required minLength={6} type="password" value={authForm.password} onChange={(event) => setAuthForm((current) => ({...current, password: event.target.value }))} placeholder="At least 6 characters" /></label>{authNotice? <div className={`notice ${authNotice.type}`}>{authNotice.text}</div> : null}<button type="submit" className="primary-button full-width">{authMode === 'login'? 'Log in' : 'Create account'}</button><p className="auth-switch">{authMode === 'login'? 'New to Linklytics?' : 'Already have an account?'} <button type="button" onClick={() => { setAuthMode(authMode === 'login'? 'register' : 'login'); setAuthNotice(null) }}>{authMode === 'login'? 'Create an account' : 'Log in instead'}</button></p></form>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {qrLink? <div className="qr-modal-overlay" onClick={() => setQrLink(null)}><div className="qr-modal-card" onClick={(event) => event.stopPropagation()}><button type="button" className="qr-close-btn" onClick={() => setQrLink(null)} aria-label="Close QR code">×</button><h3>Scan QR Code</h3><p>{qrLink}</p><img className="real-qr" src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrLink)}`} alt="QR code for short link" /></div></div> : null}
      <aside className={`sidebar ${isCollapsed? 'collapsed' : ''}`}>
        <button type="button" className="menu-toggle-btn" onClick={() => setIsCollapsed((current) =>!current)} title={isCollapsed? 'Open menu' : 'Close menu'} aria-label={isCollapsed? 'Open menu' : 'Close menu'}>
          <Menu size={20} />
        </button>
        <div className="brand-block">
          <Logo size={38} showText={true} />
        </div>

        <nav className="nav-menu">
          {navItems.map((item) => {
            const Icon = item.icon
            return <button key={item.id} className={activePage === item.id? 'nav-item active' : 'nav-item'} type="button" onClick={() => setActivePage(item.id)}>
              <Icon size={18} />
              <span className="nav-label">{item.label}</span>
            </button>
          })}
        </nav>

        <div className="nav-card sidebar-footer">
          <span className="status-dot" />
          <div>
            <strong>Campaign Live</strong>
            <small>{aggregateStats.activeLinks} active links</small>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>{activePage === 'dashboard'? 'Smart URL Dashboard' : `${activePage.charAt(0).toUpperCase()}${activePage.slice(1)}`}</h1>
          </div>
          <Header isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode((current) =>!current)} onCreateLink={() => { setActivePage('dashboard'); setTimeout(() => document.querySelector<HTMLInputElement>('.shorten-form input')?.focus(), 0) }} onExport={exportAnalytics} onLogout={logout} />
        </header>

        {activePage!== 'dashboard'? renderPage() : null}

        {activePage === 'dashboard'? <>
        <section className="hero-panel">
          <form className="shorten-form" onSubmit={createShortLink}>
            <div className="form-header">
              <div>
                <p className="eyebrow">Create new</p>
                <h3>Shorten a long URL</h3>
              </div>
            </div>

            <label>
              Original URL
              <input
                type="text"
                placeholder="https://your-company.com/products/very-long-product-name?id=123"
                value={form.longUrl}
                onChange={(event) => handleFieldChange('longUrl', event.target.value)}
              />
            </label>

            <div className="inline-fields">
              <label>
                Custom slug
                <input
                  type="text"
                  placeholder="blackfriday"
                  value={form.customSlug}
                  onChange={(event) => handleFieldChange('customSlug', event.target.value)}
                />
              </label>

              <label>
                Expiry date
                <input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(event) => handleFieldChange('expiresAt', event.target.value)}
                />
              </label>
            </div>

            <label>
              Max clicks
              <input
                type="number"
                min="1"
                placeholder="Optional limit"
                value={form.maxClicks}
                onChange={(event) => handleFieldChange('maxClicks', event.target.value)}
              />
            </label>

            {notice? <div className={`notice ${notice.type}`}>{notice.text}</div> : null}

            <button type="submit" className="primary-button full-width">Generate short link</button>
          </form>

          <div className="preview-card">
            <p className="eyebrow">Selected link</p>
            <h3>{selectedLink?.title?? 'Campaign Preview'}</h3>

            <div className="link-preview">
              <span className="small-label">Original</span>
              <p>{selectedLink?.longUrl?? 'No link selected yet'}</p>
            </div>

            <div className="link-preview">
              <span className="small-label">Short</span>
              <div className="short-link-row"><a href={selectedLink?.shortUrl} target="_blank" rel="noreferrer" className="short-link-text">{selectedLink?.shortUrl?? 'https://short.ly/demo'}</a><button type="button" className="copy-icon-btn" onClick={() => { if (selectedLink) void copyLink(selectedLink.shortUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2000) }} title="Copy link" aria-label="Copy link">{copied? <Check size={16} /> : <Copy size={16} />}</button></div>
            </div>

            <div className="qr-wrap">
              <img className="real-qr" src={selectedLink?.qrCode || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(selectedLink?.shortUrl?? 'https://short.ly/preview')}`} alt="QR code for selected short link" />
              <small>Scan to open the short link</small><button type="button" className="ghost-button small" onClick={() => selectedLink && setQrLink(selectedLink.shortUrl)}>Enlarge QR</button>
            </div>
          </div>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <span>Total links</span>
            <strong>{aggregateStats.totalLinks}</strong>
            <small>+12% from last month</small>
          </article>
          <article className="stat-card">
            <span>Total clicks</span>
            <strong>{aggregateStats.totalClicks}</strong>
            <small>Across all campaigns</small>
          </article>
          <article className="stat-card">
            <span>Active links</span>
            <strong>{aggregateStats.activeLinks}</strong>
            <small>{aggregateStats.uniqueCountries} countries reached</small>
          </article>
          <article className="stat-card">
            <span>Conversion rate</span>
            <strong>18.4%</strong>
            <small>Average campaign CTR</small>
          </article>
        </section>

        <section className="analytics-grid">
          <article className="panel chart-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Traffic</p>
                <h3>Clicks over time</h3>
              </div>
              <button type="button" className="ghost-button small">7 days</button>
            </div>

            <svg viewBox="0 0 280 120" className="line-chart" aria-label="Traffic chart">
              <path d={linePath} />
              {dailyTraffic.map((point, index) => {
                const x = (index / (dailyTraffic.length - 1)) * 260
                const y = 110 - (point.value / maxTraffic) * 80
                return <circle key={point.day} cx={x} cy={y} r="4" />
              })}
            </svg>

            <div className="chart-labels">
              {dailyTraffic.map((point) => (
                <span key={point.day}>{point.day}</span>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Devices</p>
                <h3>Audience mix</h3>
              </div>
            </div>

            <div className="stack-list">
              {deviceBreakdown.map(([label, count]) => (
                <div className="stack-row" key={label}>
                  <div className="stack-meta">
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="bar-track">
                    <span style={{ width: `${(count / aggregateStats.totalClicks || 1) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="panel table-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Links</p>
              <h3>Recent URL activity</h3>
            </div>
            <button type="button" className="ghost-button small">View all</button>
          </div>

          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Short URL</th>
                <th>Status</th>
                <th>Clicks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className={selectedId === link.id? 'selected' : ''}>
                  <td>
                    <button type="button" className="table-link" onClick={() => setSelectedId(link.id)}>
                      {link.title}
                    </button>
                  </td>
                  <td>{link.shortUrl}</td>
                  <td>
                    <span className={`status-pill ${link.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {link.status}
                    </span>
                  </td>
                  <td>{link.clickCount}</td>
                  <td>
                    <button type="button" className="link-action" onClick={() => simulateClick(link.id)}>
                      Track click
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="country-panel panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Top regions</p>
              <h3>Geo analytics</h3>
            </div>
          </div>

          <div className="country-list">
            {countryBreakdown.map(([country, value]) => (
              <div key={country} className="country-row">
                <span>{country}</span>
                <div className="bar-track mini">
                  <span style={{ width: `${(value / (countryBreakdown[0]?.[1] || 1)) * 100}%` }} />
                </div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
        </> : null}
      </main>
    </div>
  )
}

export default App