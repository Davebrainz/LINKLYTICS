type LogoProps = {
  size?: number
  showText?: boolean
}

const Logo = ({ size = 32, showText = true }: LogoProps) => {
  return (
    <div className="linklytics-logo" style={{ gap: showText ? 12 : 0 }}>
      <div className="linklytics-logo-icon" style={{ width: size, height: size }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Linklytics" role="img">
          <path d="M10 13C10.4295 13.5748 10.9774 14.0491 11.6066 14.3929C12.2359 14.7367 12.9315 14.9411 13.6467 14.9923C14.3618 15.0435 15.0796 14.9403 15.7513 14.6897C16.4231 14.4392 17.0331 14.047 17.54 13.54L20.54 10.54C22.4508 8.59695 22.4508 5.49108 20.54 3.54C18.5908 1.62924 15.4849 1.62924 13.54 3.54L11.75 5.33" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 11C13.5705 10.4252 13.0226 9.95088 12.3934 9.60709C11.7642 9.2633 11.0686 9.05889 10.3535 9.00765C9.63836 8.95641 8.92064 9.0596 8.24892 9.3102C7.57721 9.56079 6.96719 9.95296 6.46 10.46L3.46 13.46C1.54924 15.403 1.54924 18.5089 3.46 20.46C5.40924 22.3708 8.51511 22.3708 10.46 20.46L12.25 18.67" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {showText ? (
        <div className="linklytics-logo-copy">
          <div className="linklytics-logo-name">Linklytics</div>
          <div className="linklytics-logo-tagline">SMART URL</div>
        </div>
      ) : null}
    </div>
  )
}

export default Logo
