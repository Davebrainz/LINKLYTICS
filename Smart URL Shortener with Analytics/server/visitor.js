import geoip from 'geoip-lite';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function getClientIpAddress(headers, fallbackAddress = '') {
  const readHeader = (name) => {
    const value = typeof headers.get === 'function' ? headers.get(name) : headers.headers?.[name];
    return Array.isArray(value) ? value[0] : value || '';
  };
  const forwarded = readHeader('x-forwarded-for').split(',')[0]?.trim();
  const address = readHeader('cf-connecting-ip')
    || readHeader('x-real-ip')
    || forwarded
    || fallbackAddress;
  const normalizedAddress = address.replace(/^::ffff:/i, '').trim();
  const bracketedIpv6 = normalizedAddress.match(/^\[([^\]]+)\](?::\d+)?$/);
  return (bracketedIpv6?.[1] || normalizedAddress).replace(/%[^%]+$/, '');
}

export function getVisitorLocation(ipAddress) {
  const geo = ipAddress ? geoip.lookup(ipAddress) : null;
  const countryCode = geo?.country;
  return {
    country: countryCode ? regionNames.of(countryCode) || countryCode : 'Nigeria',
    city: geo?.city || 'Unknown',
  };
}

export function parseUserAgent(userAgent = '') {
  const ua = userAgent.toLowerCase();
  let browser = 'Unknown';
  let device = 'Desktop';
  let os = 'Unknown';

  if (ua.includes('edg')) browser = 'Edge';
  else if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari')) browser = 'Safari';

  if (/android/.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/.test(ua)) os = 'iOS';
  else if (/windows/.test(ua)) os = 'Windows';
  else if (/mac os|macintosh/.test(ua)) os = 'macOS';

  if (/ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) device = 'Tablet';
  else if (/mobile|android|iphone|ipod|windows phone/.test(ua)) device = 'Mobile';

  return { browser, device, os };
}
