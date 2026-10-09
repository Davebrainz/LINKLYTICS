import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Check, Copy, LayoutDashboard, Link2, Megaphone, Menu, Moon, QrCode, Search, Settings, Sun, Trash2 } from 'lucide-react'
import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type PptxGenJS from 'pptxgenjs'
import './App.css'
import Header from './components/Header'
import Logo from './components/Logo'
import { detectGender, getGenderedAvatar } from './utils/gender'

const API_BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')}/api`

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
  campaignName?: string
  customSlug?: string
  createdAt: string
  expiresAt?: string
  maxClicks?: number
  campaignId?: string
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
  const [campaignLinks, setCampaignLinks] = useState<UrlLink[]>([])
  const [deletedLinkIds, setDeletedLinkIds] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('linklytics-deleted-links') || '[]')
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  })
  const [selectedId, setSelectedId] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('landing')
  const [activePage, setActivePage] = useState<Page>('dashboard')
  const [linkSearch, setLinkSearch] = useState('')
  const [linkFilter, setLinkFilter] = useState<'All' | 'Active' | 'Expired'>('All')
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)
  const [hiddenCampaigns, setHiddenCampaigns] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('linklytics-hidden-campaigns') || '[]')
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  })
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrLink, setQrLink] = useState<string | null>(null)
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({ referrers: [], daily: [] })
  const [customCampaigns, setCustomCampaigns] = useState<{ id: string; name: string; color: string }[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('linklytics-campaigns') || '[]')
      return Array.isArray(saved) ? saved.filter((campaign): campaign is { id: string; name: string; color: string } =>
        campaign && typeof campaign.id === 'string' && typeof campaign.name === 'string' && typeof campaign.color === 'string') : []
    } catch {
      return []
    }
  })
  const [campaignName, setCampaignName] = useState('')
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'Profile' | 'Branding' | 'Preferences'>('Profile')
  const [settings, setSettings] = useState(() => ({ domain: localStorage.getItem('linklytics-domain') || 'short.ly/', theme: localStorage.getItem('linklytics-brand-color') || '#4f46e5', expiry: localStorage.getItem('linklytics-expiry') || '30 days', maxClicks: localStorage.getItem('linklytics-max-clicks') || 'Unlimited', emailAlerts: localStorage.getItem('linklytics-email-alerts')!== 'false' }))
  const [profile, setProfile] = useState(() => ({
    name: localStorage.getItem('linklytics_name') || '',
    email: localStorage.getItem('linklytics_email') || 'demo@linklytics.com',
    pic: localStorage.getItem('linklytics_pic') || '',
  }))
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshingCampaigns, setIsRefreshingCampaigns] = useState(false)
  const [isRefreshingAnalytics, setIsRefreshingAnalytics] = useState(false)
  const [campaignRefreshError, setCampaignRefreshError] = useState('')
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
  const qrSelectedLink = links.find((link) => link.shortUrl === qrLink)

  const aggregateStats = useMemo(() => {
    const totalLinks = links.length
    const totalClicks = links.reduce((sum, link) => sum + link.clickEvents.length, 0)
    const activeLinks = links.filter((link) => link.status === 'Active').length
    const linksWithClicks = links.filter((link) => link.clickEvents.length > 0).length
    const uniqueCountries = new Set(links.flatMap((link) => link.clickEvents.map((event) => event.country))).size

    return {
      totalLinks,
      totalClicks,
      activeLinks,
      uniqueCountries,
      linksWithClicks,
      linkClickRate: totalLinks ? Math.round((linksWithClicks / totalLinks) * 100) : 0,
    }
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
      return {
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: 0,
      }
    })

    links.forEach((link) => {
      link.clickEvents.forEach((event) => {
        const eventDate = new Date(event.createdAt)
        if (Number.isNaN(eventDate.getTime())) return
        const eventDateKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`
        const item = lastSeven.find((day) => day.date === eventDateKey)
        if (item) item.value += 1
      })
    })

    return lastSeven
  }, [links])

  const fetchLatestLinks = async (authToken: string): Promise<UrlLink[]> => {
    const response = await fetch(`${API_BASE}/links`, {
      headers: { Authorization: 'Bearer ' + authToken },
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.message || 'Unable to fetch links')
    }
    if (!Array.isArray(result)) {
      throw new Error('The server returned an invalid link list.')
    }
    return result
  }

  const persistDeletedLinkIds = (ids: string[]) => {
    setDeletedLinkIds(ids)
    localStorage.setItem('linklytics-deleted-links', JSON.stringify(ids))
  }

  const withoutDeletedLinks = (data: UrlLink[]) => data.filter((link) => !deletedLinkIds.includes(link.id))

  const retryDeletedLinks = async (authToken: string, ids: string[] = deletedLinkIds) => {
    let pendingIds = ids
    for (const id of ids) {
      try {
        const response = await fetch(`${API_BASE}/links/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken}` },
        })
        if (!response.ok) continue
        const savedLinks = await fetchLatestLinks(authToken)
        if (!savedLinks.some((link) => link.id === id)) {
          pendingIds = pendingIds.filter((pendingId) => pendingId !== id)
        }
      } catch {
        // Keep failed deletions queued for the next refresh.
      }
    }
    persistDeletedLinkIds(pendingIds)
    return pendingIds
  }

  const refreshCampaignData = async () => {
    if (!token) return
    setIsRefreshingCampaigns(true)
    setCampaignRefreshError('')
    try {
      await retryDeletedLinks(token)
      setCampaignLinks(withoutDeletedLinks(await fetchLatestLinks(token)))
    } catch (error) {
      setCampaignRefreshError(error instanceof Error ? error.message : 'Unable to refresh campaign links.')
    } finally {
      setIsRefreshingCampaigns(false)
    }
  }

  const fetchLinks = async (authToken: string) => {
    await retryDeletedLinks(authToken)
    const data = withoutDeletedLinks(await fetchLatestLinks(authToken))
    setLinks(data)
    setCampaignLinks(data)
    if (data[0]) setSelectedId(data[0].id)
  }

  const fetchAnalytics = async (authToken: string) => {
    const response = await fetch(`${API_BASE}/analytics`, { headers: { Authorization: `Bearer ${authToken}` } })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message || 'Unable to fetch analytics')
    }
    setAnalyticsData(data)
  }

  const refreshAnalyticsData = async () => {
    if (!token) return
    setIsRefreshingAnalytics(true)
    try {
      await retryDeletedLinks(token)
      const latestLinks = withoutDeletedLinks(await fetchLatestLinks(token))
      await fetchAnalytics(token)
      setLinks(latestLinks)
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to refresh traffic analytics.' })
    } finally {
      setIsRefreshingAnalytics(false)
    }
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
    localStorage.setItem('linklytics-hidden-campaigns', JSON.stringify(hiddenCampaigns))
  }, [hiddenCampaigns])

  useEffect(() => {
    localStorage.setItem('linklytics-campaigns', JSON.stringify(customCampaigns))
  }, [customCampaigns])

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-color', settings.theme)
    localStorage.setItem('linklytics-domain', settings.domain)
    localStorage.setItem('linklytics-brand-color', settings.theme)
    localStorage.setItem('linklytics-expiry', settings.expiry)
    localStorage.setItem('linklytics-max-clicks', settings.maxClicks)
    localStorage.setItem('linklytics-email-alerts', String(settings.emailAlerts))
  }, [settings])

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
    setCampaignLinks([])
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

    if (!selectedCampaignId) {
      setNotice({ type: 'error', text: 'Select a campaign before creating a link.' })
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
        campaignId: selectedCampaignId,
        campaignName: campaignGroups.find((campaign) => campaign.id === selectedCampaignId)?.name || selectedCampaignId,
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

    const createdLink = { ...result, campaignId: result.campaignId || selectedCampaignId }
    setLinks((current) => [createdLink,...current])
    setCampaignLinks((current) => [createdLink,...current])
    setSelectedId(createdLink.id)
    setNotice({ type: 'success', text: `Short link created: ${createdLink.shortUrl}` })
    setForm({ longUrl: '', customSlug: '', expiresAt: '', maxClicks: '' })
    try {
      const latestLinks = withoutDeletedLinks(await fetchLatestLinks(token))
      setLinks(latestLinks)
      setCampaignLinks(latestLinks)
    } catch (error) {
      setCampaignRefreshError(error instanceof Error ? error.message : 'Link created, but campaign data could not be refreshed.')
    }
  }

  const createCampaign = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = campaignName.trim()
    if (!name) return
    const createdCampaignId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setCustomCampaigns((current) => [...current, {
      id: createdCampaignId,
      name,
      color: settings.theme,
    }])
    setSelectedCampaignId(createdCampaignId)
    setCampaignName('')
    setIsCreatingCampaign(false)
    setNotice({ type: 'success', text: 'Campaign created successfully.' })
  }

  const openDirectLink = (longUrl: string) => {
    window.open(longUrl, '_blank', 'noopener,noreferrer')
  }

  const refreshLinkTracking = async (link: UrlLink) => {
    if (!token) {
      setNotice({ type: 'error', text: 'Please log in again to view recorded clicks.' })
      return
    }

    try {
      const response = await fetch(`${API_BASE}/links`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.message || 'Unable to refresh click tracking.')
      }

      const updatedLink = result.find((item: UrlLink) => item.id === link.id)
      if (!updatedLink) {
        throw new Error('Link not found while refreshing click tracking.')
      }

      const visibleLinks = withoutDeletedLinks(result)
      setLinks(visibleLinks)
      setCampaignLinks(visibleLinks)
      await fetchAnalytics(token)
      setNotice({ type: 'success', text: `Tracking refreshed for ${link.shortUrl}. Only visits to the short link count.` })
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to refresh click tracking.' })
    }
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
  const topCountry = countryBreakdown[0]
  const topDevice = [...deviceBreakdown].sort((a, b) => b[1] - a[1])[0]
  const filteredLinks = links.filter((link) => {
    const matchesSearch = `${link.title} ${link.shortUrl} ${link.longUrl}`.toLowerCase().includes(linkSearch.toLowerCase())
    const matchesFilter = linkFilter === 'All' || link.status === linkFilter
    return matchesSearch && matchesFilter
  })
  const predefinedCampaigns = [
    { id: 'blackfriday', name: 'Black Friday Sale', color: '#f97316' },
    { id: 'product-launch', name: 'Product Launch', color: '#4f46e5' },
    { id: 'always-on', name: 'Always-on Content', color: '#0d9488' },
    ...customCampaigns,
  ]
  const persistedCampaigns = campaignLinks.reduce<{ id: string; name: string; color: string }[]>((campaigns, link) => {
    if (link.campaignId && !predefinedCampaigns.some((campaign) => campaign.id === link.campaignId) &&
      !campaigns.some((campaign) => campaign.id === link.campaignId)) {
      campaigns.push({
        id: link.campaignId,
        name: link.campaignName || link.campaignId,
        color: settings.theme,
      })
    }
    return campaigns
  }, [])
  const campaignGroups = [
    ...predefinedCampaigns,
    ...persistedCampaigns,
  ].map((campaign) => ({
    ...campaign,
    links: campaignLinks.filter((link) => link.campaignId === campaign.id),
  })).filter((campaign) => !hiddenCampaigns.includes(campaign.id))

  const deleteCampaign = (campaignId: string) => {
    setCustomCampaigns((current) => current.filter((campaign) => campaign.id !== campaignId))
    setHiddenCampaigns((current) => current.includes(campaignId) ? current : [...current, campaignId])
    setExpandedCampaign((current) => current === campaignId ? null : current)
    setSelectedCampaignId((current) => current === campaignId ? '' : current)
  }

  const copyLink = async (shortUrl: string) => {
    await navigator.clipboard?.writeText(shortUrl)
    setNotice({ type: 'success', text: 'Short link copied to your clipboard.' })
  }

  const deleteLink = async (linkId: string) => {
    const pendingIds = [...new Set([...deletedLinkIds, linkId])]
    persistDeletedLinkIds(pendingIds)
    setLinks((current) => current.filter((link) => link.id !== linkId))
    setCampaignLinks((current) => current.filter((link) => link.id !== linkId))
    if (selectedId === linkId) setSelectedId('')

    if (!token) return
    try {
      const response = await fetch(`${API_BASE}/links/${encodeURIComponent(linkId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return

      const remainingLinks = await fetchLatestLinks(token)
      if (remainingLinks.some((link) => link.id === linkId)) return
      const updatedPendingIds = pendingIds.filter((id) => id !== linkId)
      persistDeletedLinkIds(updatedPendingIds)
      const visibleLinks = withoutDeletedLinks(remainingLinks)
      setLinks(visibleLinks)
      setCampaignLinks(visibleLinks)
      await fetchAnalytics(token)
    } catch {
      // Keep the local tombstone so the link remains hidden and is retried later.
    }
  }

  const exportAnalytics = async () => {
    try {
      const { default: PptxGenJS } = await import('pptxgenjs')
      const pptx = new PptxGenJS()
      pptx.layout = 'LAYOUT_WIDE'
      pptx.author = profile.name || profile.email
      pptx.subject = 'Linklytics link and campaign activity analytics'
      pptx.title = 'Linklytics Analytics Report'
      pptx.company = 'Linklytics'
      pptx.theme = {
        headFontFace: 'Aptos Display',
        bodyFontFace: 'Aptos',
      }

      const totalClicks = links.reduce((sum, link) => sum + link.clickCount, 0)
      const recordedClicks = links.flatMap((link) => link.clickEvents.map((event) => ({ link, event })))
      const campaignName = (campaignId?: string) => campaignGroups.find((campaign) => campaign.id === campaignId)?.name || 'Unassigned / legacy'
      const dateText = (value: string | undefined) => {
        if (!value) return 'Unknown'
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
      }
      const breakdown = (readValue: (item: typeof recordedClicks[number]) => string) => {
        const counts = new Map<string, number>()
        recordedClicks.forEach((item) => {
          const key = readValue(item) || 'Unknown'
          counts.set(key, (counts.get(key) || 0) + 1)
        })
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => [label, String(count)])
      }

      const addSlideHeader = (slide: PptxGenJS.Slide, title: string, subtitle: string) => {
        slide.background = { color: 'F6F8FC' }
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.16, line: { color: '4F46E5', transparency: 100 }, fill: { color: '4F46E5' } })
        slide.addText(title, { x: 0.55, y: 0.35, w: 12.2, h: 0.42, fontFace: 'Aptos Display', fontSize: 23, bold: true, color: '172554', margin: 0 })
        slide.addText(subtitle, { x: 0.55, y: 0.83, w: 12.2, h: 0.3, fontFace: 'Aptos', fontSize: 10, color: '64748B', margin: 0 })
        slide.addText(`Linklytics Analytics  |  ${new Date().toLocaleDateString()}`, { x: 0.55, y: 7.12, w: 12.2, h: 0.18, fontFace: 'Aptos', fontSize: 8, color: '94A3B8', align: 'right', margin: 0 })
      }

      const addTableSection = (title: string, subtitle: string, headers: string[], rows: string[][], colW: number[]) => {
        const pageSize = 13
        const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
        for (let page = 0; page < pageCount; page += 1) {
          const slide = pptx.addSlide()
          addSlideHeader(slide, title, pageCount > 1 ? `${subtitle} (page ${page + 1} of ${pageCount})` : subtitle)
          const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize)
          const tableRows = [
            headers.map((text) => ({ text, options: { bold: true, color: 'FFFFFF', fill: { color: '1E3A8A' }, fontSize: 9, margin: 0.06 } })),
            ...(pageRows.length ? pageRows : [headers.map(() => 'No recorded activity')]).map((row, rowIndex) =>
              row.map((text) => ({ text, options: { color: '1E293B', fill: { color: rowIndex % 2 ? 'F1F5F9' : 'FFFFFF' }, fontSize: 8, margin: 0.05, breakLine: false } })),
            ),
          ]
          slide.addTable(tableRows, {
            x: 0.55,
            y: 1.35,
            w: 12.2,
            colW,
            rowH: 0.39,
            border: { type: 'solid', color: 'D7DFEA', pt: 0.5 },
            fontFace: 'Aptos',
            fontSize: 8,
            color: '1E293B',
            margin: 0.05,
            valign: 'middle',
            autoPage: false,
          })
        }
      }

      const cover = pptx.addSlide()
      cover.background = { color: 'F6F8FC' }
      cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 2.05, line: { color: '172554', transparency: 100 }, fill: { color: '172554' } })
      cover.addText('LINKLYTICS', { x: 0.72, y: 0.48, w: 11.8, h: 0.3, fontFace: 'Aptos', fontSize: 12, bold: true, charSpacing: 2, color: 'A5B4FC', margin: 0 })
      cover.addText('Analytics & Activity Report', { x: 0.72, y: 0.95, w: 11.8, h: 0.58, fontFace: 'Aptos Display', fontSize: 30, bold: true, color: 'FFFFFF', margin: 0 })
      cover.addText(`Generated ${new Date().toLocaleString()}${profile.email ? ` for ${profile.email}` : ''}`, { x: 0.75, y: 2.35, w: 11.8, h: 0.3, fontFace: 'Aptos', fontSize: 11, color: '64748B', margin: 0 })
      const summaryItems = [
        ['SHORT LINKS', String(links.length)],
        ['RECORDED CLICKS', String(totalClicks)],
        ['CAMPAIGNS', String(campaignGroups.length)],
        ['CLICK EVENTS', String(recordedClicks.length)],
      ]
      summaryItems.forEach(([label, value], index) => {
        const x = 0.75 + index * 3.1
        cover.addShape(pptx.ShapeType.roundRect, { x, y: 3.1, w: 2.75, h: 1.2, rectRadius: 0.08, line: { color: 'E2E8F0', pt: 1 }, fill: { color: 'FFFFFF' } })
        cover.addText(label, { x: x + 0.15, y: 3.35, w: 2.45, h: 0.2, fontFace: 'Aptos', fontSize: 9, bold: true, color: '64748B', align: 'center', margin: 0 })
        cover.addText(value, { x: x + 0.15, y: 3.65, w: 2.45, h: 0.42, fontFace: 'Aptos Display', fontSize: 25, bold: true, color: '312E81', align: 'center', margin: 0 })
      })
      cover.addText('Report includes campaign performance, link inventory, click trends, audience breakdowns, and recorded click activity.', { x: 0.78, y: 4.75, w: 11.7, h: 0.5, fontFace: 'Aptos', fontSize: 13, color: '334155', breakLine: false, margin: 0 })
      cover.addText('Activity detail reflects data currently recorded for links in this workspace. Previously deleted links or actions that were not tracked are not available in this export.', { x: 0.78, y: 5.45, w: 11.7, h: 0.55, fontFace: 'Aptos', fontSize: 10, color: '64748B', breakLine: false, margin: 0 })

      addTableSection(
        'Campaign performance',
        'Link and click totals for every available campaign.',
        ['Campaign', 'Links', 'Clicks', 'Share of clicks'],
        campaignGroups.map((campaign) => {
          const campaignClicks = campaign.links.reduce((sum, link) => sum + link.clickCount, 0)
          return [campaign.name, String(campaign.links.length), String(campaignClicks), totalClicks ? `${((campaignClicks / totalClicks) * 100).toFixed(1)}%` : '0%']
        }),
        [5.2, 1.6, 1.8, 3.6],
      )

      const linkRows = [...links].sort((a, b) => b.clickCount - a.clickCount).map((link) => [
        link.shortCode,
        campaignName(link.campaignId),
        link.shortUrl,
        link.longUrl,
        String(link.clickCount),
        link.status,
        dateText(link.createdAt),
      ])
      addTableSection('Short link inventory', 'All current links, ordered by recorded click count.', ['Code', 'Campaign', 'Short URL', 'Destination', 'Clicks', 'Status', 'Created'], linkRows, [1.05, 1.55, 2.0, 3.5, 0.65, 1.2, 2.25])

      const breakdownRows = [
        ...breakdown(({ event }) => event.country || 'Unknown').map(([label, count]) => ['Country', label, count]),
        ...breakdown(({ event }) => event.city || 'Unknown').map(([label, count]) => ['City', label, count]),
        ...breakdown(({ event }) => event.device || 'Unknown').map(([label, count]) => ['Device', label, count]),
        ...breakdown(({ event }) => event.browser || 'Unknown').map(([label, count]) => ['Browser', label, count]),
        ...breakdown(({ event }) => event.os || 'Unknown').map(([label, count]) => ['Operating system', label, count]),
        ...breakdown(({ event }) => event.referrer || 'Direct').map(([label, count]) => ['Referrer', label, count]),
        ...breakdown(({ event }) => {
          const date = new Date(event.createdAt)
          return Number.isNaN(date.getTime()) ? 'Unknown' : date.toISOString().slice(0, 10)
        }).map(([label, count]) => ['Date', label, count]),
      ]
      addTableSection('Click analytics breakdown', 'Recorded events grouped by date, geography, device, browser, operating system, and referrer.', ['Dimension', 'Value', 'Clicks'], breakdownRows, [3.0, 6.4, 3.2])

      const activityRows = recordedClicks
        .sort((a, b) => new Date(b.event.createdAt).getTime() - new Date(a.event.createdAt).getTime())
        .map(({ link, event }) => [
          link.shortCode,
          dateText(event.createdAt),
          [event.city, event.country].filter(Boolean).join(', ') || 'Unknown',
          [event.device, event.browser, event.os].filter(Boolean).join(' / ') || 'Unknown',
          event.referrer || 'Direct',
        ])
      addTableSection('Recorded click activity', 'One row per click event recorded by Linklytics.', ['Short code', 'Timestamp', 'Location', 'Device / browser / OS', 'Referrer'], activityRows, [1.5, 2.4, 2.5, 3.2, 3.0])

      await pptx.writeFile({ fileName: `linklytics-analytics-${new Date().toISOString().slice(0, 10)}.pptx` })
      setNotice({ type: 'success', text: 'PowerPoint analytics report downloaded.' })
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? `Could not create PowerPoint report: ${error.message}` : 'Could not create PowerPoint report.' })
    }
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
        <section className="panel links-library"><div className="library-toolbar"><label className="search-field"><Search size={17} /><input placeholder="Search links..." value={linkSearch} onChange={(event) => setLinkSearch(event.target.value)} /></label><div className="filter-tabs">{(['All', 'Active', 'Expired'] as const).map((filter) => <button key={filter} type="button" className={linkFilter === filter? 'active' : ''} onClick={() => setLinkFilter(filter)}>{filter}</button>)}</div></div><div className="table-scroll"><table><thead><tr><th>Short Link</th><th>Original URL</th><th>Clicks</th><th>Created</th><th>Expiry</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredLinks.length > 0? filteredLinks.map((link) => <tr key={link.id}><td><strong className="short-link-cell">{link.shortUrl.replace('http://localhost:5000/', 'short.ly/')}</strong></td><td className="url-cell">{link.longUrl}</td><td>{link.clickCount}</td><td>{new Date(link.createdAt).toLocaleDateString()}</td><td>{link.expiresAt? new Date(link.expiresAt).toLocaleDateString() : 'Never'}</td><td><span className={`status-pill ${link.status.toLowerCase().replace(/\s+/g, '-')}`}>{link.status}</span></td><td><div className="row-actions"><button type="button" className="icon-action" onClick={() => copyLink(link.shortUrl)} aria-label="Copy short link"><Copy size={15} /></button><button type="button" className="icon-action" onClick={() => setQrLink(link.shortUrl)} aria-label={`Show QR code for ${link.shortCode}`}><QrCode size={15} /></button><button type="button" className="icon-action danger" onClick={() => deleteLink(link.id)} aria-label="Delete link"><Trash2 size={15} /></button></div></td></tr>) : <tr><td colSpan={7} className="empty-state">No links match this filter yet.</td></tr>}</tbody></table></div></section>
      </>
    }

    if (activePage === 'analytics') {
      return <>
        <div className="page-heading">
          <div>
            <p className="eyebrow">Performance intelligence</p>
            <h2>Analytics overview</h2>
            <p>Understand what your audience does after every share.</p>
          </div>
          <button type="button" className="ghost-button" onClick={() => void refreshAnalyticsData()} disabled={isRefreshingAnalytics}>
            {isRefreshingAnalytics ? 'Refreshing...' : 'Refresh analytics'}
          </button>
        </div>
        <section className="stats-grid analytics-stats">
          <article className="stat-card">
            <span>Total clicks</span>
            <strong>{aggregateStats.totalClicks}</strong>
            <small>Recorded short-link visits</small>
          </article>
          <article className="stat-card">
            <span>Top country</span>
            <strong>{topCountry?.[0] || '—'}</strong>
            <small>{topCountry ? `${topCountry[1]} recorded clicks` : 'No recorded clicks yet'}</small>
          </article>
          <article className="stat-card">
            <span>Top device</span>
            <strong>{topDevice?.[0] || '—'}</strong>
            <small>{topDevice ? `${topDevice[1]} recorded clicks` : 'No recorded clicks yet'}</small>
          </article>
          <article className="stat-card">
            <span>Links with clicks</span>
            <strong>{aggregateStats.linksWithClicks} / {aggregateStats.totalLinks}</strong>
            <small>{aggregateStats.linkClickRate}% of created links have at least one recorded click; impressions are not tracked.</small>
          </article>
        </section>
        {campaignRefreshError ? <div className="notice error">{campaignRefreshError}</div> : null}
        <section className="panel chart-panel large-chart"><div className="panel-header"><div><p className="eyebrow">Traffic trend</p><h3>Clicks over last 7 days</h3></div></div><ResponsiveContainer width="100%" height={260}><LineChart data={demoDailyTraffic}><XAxis dataKey="day" /><YAxis /><Tooltip /><Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={3} dot={{ fill: '#fff', stroke: '#4f46e5', strokeWidth: 2, r: 4 }} /></LineChart></ResponsiveContainer></section><section className="analytics-cards"><article className="panel chart-panel"><div className="panel-header"><div><p className="eyebrow">Audience</p><h3>Device Breakdown</h3></div></div><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={analyticsDevices} dataKey="value" nameKey="name" cx="50%" cy="48%" innerRadius={55} outerRadius={82} paddingAngle={4}>{analyticsDevices.map((entry, index) => <Cell key={entry.name} fill={['#4f46e5', '#14b8a6', '#f59e0b'][index]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></article><article className="panel chart-panel"><div className="panel-header"><div><p className="eyebrow">Leaders</p><h3>Top 5 Performing Links</h3></div></div><ResponsiveContainer width="100%" height={230}><BarChart data={analyticsLinks} layout="vertical" margin={{ left: 12, right: 16 }}><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={90} /><Tooltip /><Bar dataKey="clicks" fill="#4f46e5" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></article></section><section className="panel table-panel"><div className="panel-header"><div><p className="eyebrow">Acquisition</p><h3>Referrer table</h3></div></div><table><thead><tr><th>Source</th><th>Clicks</th><th>Share</th></tr></thead><tbody>{referrers.map((referrer) => <tr key={referrer.name}><td><strong>{referrer.name}</strong></td><td>{referrer.clicks}</td><td><div className="referrer-share"><span style={{ width: `${(referrer.clicks / referrers[0].clicks) * 100}%` }} /></div></td></tr>)}</tbody></table></section>
      </>
    }

    if (activePage === 'campaigns') {
      return <>
        <div className="page-heading">
          <div><p className="eyebrow">Organize your growth</p><h2>Campaigns</h2><p>Group related links and track the momentum of every initiative.</p></div>
          <div className="page-heading-actions">
            <button type="button" className="ghost-button" onClick={() => void refreshCampaignData()} disabled={isRefreshingCampaigns}>
              {isRefreshingCampaigns ? 'Refreshing...' : 'Refresh data'}
            </button>
            <button type="button" className="primary-button" onClick={() => setIsCreatingCampaign((current) => !current)}>{isCreatingCampaign ? 'Cancel' : '+ New Campaign'}</button>
          </div>
        </div>
        {campaignRefreshError ? <div className="notice error">{campaignRefreshError}</div> : null}
        {isCreatingCampaign ? <form className="campaign-create-form" onSubmit={createCampaign}>
          <label htmlFor="campaign-name">Campaign title<input id="campaign-name" autoFocus maxLength={60} placeholder="Name this campaign" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} required /></label>
          <button type="submit" className="primary-button">Create campaign</button>
        </form> : null}
        <section className="campaign-grid">
          {campaignGroups.map((campaign) => {
            const clicks = campaign.links.reduce((sum, link) => sum + link.clickEvents.length, 0)
            const progress = Math.min(100, Math.round(clicks / 20))
            return <article className="campaign-card" key={campaign.id}>
              <div className="campaign-card-top">
                <span className="campaign-icon" style={{ backgroundColor: campaign.color }}><Megaphone size={17} /></span>
                <div className="campaign-card-actions">
                  <button type="button" className="more-button" onClick={() => {
                    setSelectedCampaignId(campaign.id)
                    setExpandedCampaign(expandedCampaign === campaign.id ? null : campaign.id)
                  }}>{expandedCampaign === campaign.id ? 'Hide links' : 'View links'}</button>
                  {campaign.id.startsWith('custom-') ? <button type="button" className="icon-action danger" onClick={() => deleteCampaign(campaign.id)} aria-label={`Delete ${campaign.name} campaign`} title="Delete campaign"><Trash2 size={15} /></button> : null}
                </div>
              </div>
              <h3>{campaign.name}</h3>
              <div className="campaign-meta"><span>{campaign.links.length} links</span><strong>{clicks.toLocaleString()} clicks</strong></div>
              <div className="progress-track"><span style={{ width: `${progress}%`, backgroundColor: campaign.color }} /></div>
              <small>{progress}% of monthly goal</small>
              {expandedCampaign === campaign.id ? <div className="campaign-links">
                {campaign.links.length > 0 ? campaign.links.map((link) => <div key={link.id}><Link2 size={14} /><span>{link.shortUrl}</span><strong>{link.clickEvents.length} clicks</strong><button type="button" className="icon-action danger" onClick={() => void deleteLink(link.id)} aria-label={`Delete link ${link.shortCode}`} title="Delete link"><Trash2 size={14} /></button></div>) : <p>No links in this campaign yet.</p>}
              </div> : null}
            </article>
          })}
        </section>
      </>
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
      {qrLink ? <div className="qr-modal-overlay" onClick={() => setQrLink(null)}>
        <div className="qr-modal-card" role="dialog" aria-modal="true" aria-labelledby="qr-modal-title" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="qr-close-btn" onClick={() => setQrLink(null)} aria-label="Close QR code">×</button>
          <h3 id="qr-modal-title">Scan QR Code</h3>
          <p>{qrLink}</p>
          {qrSelectedLink?.qrCode ? <img className="real-qr enlarged-qr" src={qrSelectedLink.qrCode} alt={`QR code for ${qrLink}`} /> : <p className="qr-unavailable">QR code is not available for this link.</p>}
          <div className="qr-modal-actions">
            <button type="button" className="ghost-button" onClick={() => setQrLink(null)}>Close</button>
            {qrSelectedLink?.qrCode ? <a className="primary-button" href={qrSelectedLink.qrCode} download={`link-${qrSelectedLink.shortCode}-qr.png`}>Download</a> : null}
          </div>
        </div>
      </div> : null}
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
            return <button key={item.id} className={activePage === item.id? 'nav-item active' : 'nav-item'} type="button" onClick={() => {
              setActivePage(item.id)
              if (item.id === 'campaigns') void refreshCampaignData()
              if (item.id === 'dashboard' || item.id === 'analytics') void refreshAnalyticsData()
            }}>
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

        {activePage !== 'dashboard' && notice ? <div className={`notice ${notice.type}`}>{notice.text}</div> : null}
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
              Campaign
              <select className="campaign-select" value={selectedCampaignId} onChange={(event) => setSelectedCampaignId(event.target.value)} required>
                <option value="">Select a campaign</option>
                {campaignGroups.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
            </label>

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
              {selectedLink?.qrCode ? <img className="real-qr" src={selectedLink.qrCode} alt="QR code for selected short link" /> : null}
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
            <span>Links with clicks</span>
            <strong>{aggregateStats.linksWithClicks} / {aggregateStats.totalLinks}</strong>
            <small>{aggregateStats.linkClickRate}% of created links have a recorded click</small>
          </article>
        </section>

        <section className="analytics-grid">
          <article className="panel chart-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Traffic</p>
                <h3>Clicks over time</h3>
              </div>
              <button type="button" className="ghost-button small" onClick={() => void refreshAnalyticsData()} disabled={isRefreshingAnalytics}>
                {isRefreshingAnalytics ? 'Refreshing...' : 'Refresh'}
              </button>
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
                    <div className="link-actions">
                    <button type="button" className="link-action" onClick={() => openDirectLink(link.shortUrl)}>
                      Open link
                    </button>
                    <button type="button" className="link-action track-link-action" onClick={() => void refreshLinkTracking(link)}>
                      Track link
                    </button>
                    </div>
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