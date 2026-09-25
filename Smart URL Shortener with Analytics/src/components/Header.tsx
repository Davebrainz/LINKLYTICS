import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { detectGender, getGenderedAvatar } from '../utils/gender'

type HeaderProps = {
  isDarkMode: boolean
  onToggleTheme: () => void
  onCreateLink: () => void
  onExport: () => void
  onLogout: () => void
}

const getStoredName = () => localStorage.getItem('linklytics_name') || 'Tochukwu Mgbemena'

export default function Header({ isDarkMode, onToggleTheme, onCreateLink, onExport, onLogout }: HeaderProps) {
  const [profilePic, setProfilePic] = useState(() => localStorage.getItem('linklytics_pic') || '')
  const [name, setName] = useState(getStoredName)

  useEffect(() => {
    const updateProfile = () => {
      setProfilePic(localStorage.getItem('linklytics_pic') || '')
      setName(getStoredName())
    }

    window.addEventListener('storage', updateProfile)
    window.addEventListener('profileUpdated', updateProfile)
    return () => {
      window.removeEventListener('storage', updateProfile)
      window.removeEventListener('profileUpdated', updateProfile)
    }
  }, [])

  const gender = detectGender(name)
  const fallbackAvatar = getGenderedAvatar(gender, name.length + name.charCodeAt(0))

  return (
    <div className="workspace-header">
      <div className="header-actions">
        <button type="button" className="export-button" onClick={onExport}>Export</button>
        <button type="button" className="theme-toggle icon-toggle" onClick={onToggleTheme} aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button type="button" className="primary-button header-create-button" onClick={onCreateLink}>Create link</button>
        <div className="profile-chip">
          <img src={profilePic || fallbackAvatar} className="profile-avatar" alt={`${name} profile`} />
          <div className="profile-copy">
            <p>{name}</p>
            <span>Admin</span>
          </div>
        </div>
        <button type="button" className="logout-button" onClick={onLogout}>Log out</button>
      </div>
    </div>
  )
}
