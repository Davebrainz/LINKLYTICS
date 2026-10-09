import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import geoip from 'geoip-lite';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { dateKeyInTimeZone } from './date.js';

const JWT_SECRET = process.env.JWT_SECRET || 'linklytics_secret_key';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/linklytics';

const state = globalThis.linklyticsState || {
  users: [],
  links: [],
  clicks: [],
  mongoReady: false,
  connection: null,
};
globalThis.linklyticsState = state;

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
}, { timestamps: true });

const clickSchema = new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true },
  country: String,
  city: String,
  device: String,
  browser: String,
  os: String,
  referrer: { type: String, default: 'Direct' },
  ipAddress: String,
  timestamp: { type: Date, default: Date.now },
});

const linkSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'New URL' },
  longUrl: { type: String, required: true },
  shortCode: { type: String, required: true, unique: true },
  customSlug: { type: String, unique: true, sparse: true },
  shortUrl: { type: String, required: true, unique: true },
  campaignId: String,
  campaignName: String,
  expiresAt: Date,
  maxClicks: Number,
  clickCount: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Expired', 'Limit Reached'], default: 'Active' },
  qrCode: String,
  createdAt: { type: Date, default: Date.now },
  clickEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Click' }],
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Click = mongoose.models.Click || mongoose.model('Click', clickSchema);
const Link = mongoose.models.Link || mongoose.model('Link', linkSchema);

const json = (data, status = 200) => Response.json(data, { status });
const errorMessage = (error) => error instanceof Error ? error.message : 'Unexpected error';
const getMemoryUserById = (id) => state.users.find((user) => user.id === id);
const getMemoryUserByEmail = (email) => state.users.find((user) => user.email.toLowerCase() === email.toLowerCase());

async function connectDatabase() {
  if (!state.connection) {
    state.connection = mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
      .then(async () => {
        state.mongoReady = true;
        if (!await User.exists({ email: 'demo@linklytics.com' })) {
          await User.create({
            name: 'Demo User',
            email: 'demo@linklytics.com',
            password: await bcrypt.hash('123456', 10),
          });
        }
      })
      .catch(async () => {
        state.mongoReady = false;
        if (!getMemoryUserByEmail('demo@linklytics.com')) {
          state.users.push({
            id: 'demo-user-1',
            name: 'Demo User',
            email: 'demo@linklytics.com',
            password: await bcrypt.hash('123456', 10),
          });
        }
      });
  }
  await state.connection;
}

function generateToken(user) {
  return jwt.sign({ userId: user._id || user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function generateShortCode() {
  return `${Math.random().toString(36).slice(2, 8).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function parseUserAgent(userAgent = '') {
  const ua = userAgent.toLowerCase();
  let browser = 'Unknown';
  let device = 'Desktop';
  let os = 'Unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';
  if (/android/.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/.test(ua)) os = 'iOS';
  else if (/windows/.test(ua)) os = 'Windows';
  else if (/mac os/.test(ua)) os = 'macOS';
  if (/mobile|android|iphone/.test(ua)) device = 'Mobile';
  else if (/ipad|tablet/.test(ua)) device = 'Tablet';
  return { browser, device, os };
}

function formatLink(link, clickList = []) {
  return {
    id: link._id ? String(link._id) : link.id,
    title: link.title,
    longUrl: link.longUrl,
    shortCode: link.shortCode,
    shortUrl: link.shortUrl,
    campaignId: link.campaignId,
    campaignName: link.campaignName,
    customSlug: link.customSlug,
    expiresAt: link.expiresAt,
    maxClicks: link.maxClicks,
    clickCount: clickList.length,
    status: link.status || 'Active',
    clickEvents: clickList.map((event) => ({
      id: event._id ? String(event._id) : event.id,
      country: event.country || 'Unknown',
      city: event.city || 'Unknown',
      device: event.device || 'Desktop',
      browser: event.browser || 'Unknown',
      os: event.os || 'Unknown',
      referrer: event.referrer || 'Direct',
      createdAt: event.timestamp || event.createdAt,
    })),
    qrCode: link.qrCode,
    createdAt: link.createdAt,
  };
}

async function getUser(request) {
  await connectDatabase();
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return state.mongoReady ? await User.findById(decoded.userId) : getMemoryUserById(decoded.userId) || null;
  } catch {
    return null;
  }
}

async function authorizedUser(request) {
  const user = await getUser(request);
  return user ? { user } : { response: json({ message: 'User not found or token invalid' }, 401) };
}

async function getUserLinks(userId) {
  if (state.mongoReady) {
    const links = await Link.find({ userId }).sort({ createdAt: -1 });
    return Promise.all(links.map(async (link) => {
      const clicks = await Click.find({ linkId: link._id }).sort({ timestamp: -1 }).lean();
      return formatLink(link, clicks);
    }));
  }
  return state.links.filter((link) => link.userId === userId).map((link) =>
    formatLink(link, state.clicks.filter((click) => click.linkId === link.id)));
}

export async function health() {
  return json({ status: 'ok', message: 'Linklytics backend is running' });
}

export async function register(request) {
  try {
    await connectDatabase();
    const { name, email, password } = await request.json();
    if (!name || !email || !password) return json({ message: 'All fields are required' }, 400);
    if (state.mongoReady) {
      if (await User.exists({ email })) return json({ message: 'User already exists' }, 400);
      const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
      return json({ message: 'User registered', token: generateToken(user), user: { id: String(user._id), name, email } }, 201);
    }
    if (getMemoryUserByEmail(email)) return json({ message: 'User already exists' }, 400);
    const user = { id: randomUUID(), name, email, password: await bcrypt.hash(password, 10) };
    state.users.push(user);
    return json({ message: 'User registered', token: generateToken(user), user: { id: user.id, name, email } }, 201);
  } catch (error) {
    return json({ message: 'Registration failed', error: errorMessage(error) }, 500);
  }
}

export async function login(request) {
  try {
    await connectDatabase();
    const { email, password } = await request.json();
    if (!email || !password) return json({ message: 'Email and password are required' }, 400);
    const user = state.mongoReady ? await User.findOne({ email }) : getMemoryUserByEmail(email);
    if (!user || !await bcrypt.compare(password, user.password)) return json({ message: 'Invalid email or password' }, 401);
    return json({ message: 'Login successful', token: generateToken(user), user: { id: String(user._id || user.id), name: user.name, email: user.email } });
  } catch (error) {
    return json({ message: 'Login failed', error: errorMessage(error) }, 500);
  }
}

export async function listLinks(request) {
  try {
    const auth = await authorizedUser(request);
    if (auth.response) return auth.response;
    return json(await getUserLinks(String(auth.user._id || auth.user.id)));
  } catch (error) {
    return json({ message: 'Failed to fetch links', error: errorMessage(error) }, 500);
  }
}

export async function deleteLink(request, { params }) {
  try {
    const auth = await authorizedUser(request);
    if (auth.response) return auth.response;
    const { id } = await params;
    const userId = String(auth.user._id || auth.user.id);

    if (state.mongoReady) {
      if (!mongoose.isValidObjectId(id)) return json({ message: 'Link already deleted' });
      const link = await Link.findOne({ _id: id, userId });
      if (!link) return json({ message: 'Link already deleted' });
      await Click.deleteMany({ linkId: link._id });
      await Link.deleteOne({ _id: link._id });
      return json({ message: 'Link and click history deleted' });
    }

    const index = state.links.findIndex((link) => link.id === id && link.userId === userId);
    if (index === -1) return json({ message: 'Link already deleted' });
    state.links.splice(index, 1);
    state.clicks = state.clicks.filter((click) => click.linkId !== id);
    return json({ message: 'Link and click history deleted' });
  } catch (error) {
    return json({ message: 'Failed to delete link', error: errorMessage(error) }, 500);
  }
}

export async function createLink(request) {
  try {
    const auth = await authorizedUser(request);
    if (auth.response) return auth.response;
    const { longUrl, customSlug, expiresAt, maxClicks, title, campaignId, campaignName } = await request.json();
    if (!longUrl) return json({ message: 'longUrl is required' }, 400);
    if (typeof campaignId !== 'string' || !campaignId.trim()) {
      return json({ message: 'Select a campaign before creating a link.' }, 400);
    }
    const normalizedUrl = /^https?:\/\//i.test(longUrl) ? longUrl : `https://${longUrl}`;
    const slug = (customSlug || generateShortCode()).trim().replace(/\s+/g, '-').toLowerCase();
    const shortCode = slug.toUpperCase();
    const shortUrl = `${new URL(request.url).origin}/${slug}`;
    const duplicate = state.mongoReady
      ? await Link.findOne({ $or: [{ shortCode }, { customSlug: slug }, { shortUrl }] })
      : state.links.find((link) => link.shortCode.toLowerCase() === slug || link.customSlug === slug || link.shortUrl === shortUrl);
    if (duplicate) return json({ message: 'This slug is already in use. Choose another one.' }, 400);
    const qrCode = await QRCode.toDataURL(shortUrl);
    const values = {
      title: title || 'Campaign Link', longUrl: normalizedUrl, shortCode, customSlug: slug, shortUrl,
      campaignId, campaignName,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      maxClicks: maxClicks ? Number(maxClicks) : undefined,
      clickCount: 0, status: 'Active', qrCode, clickEvents: [],
    };
    if (state.mongoReady) {
      const link = await Link.create({ ...values, userId: auth.user._id });
      return json(formatLink(link), 201);
    }
    const link = { ...values, id: randomUUID(), userId: auth.user.id, createdAt: new Date().toISOString() };
    state.links.unshift(link);
    return json(formatLink(link), 201);
  } catch (error) {
    return json({ message: 'Failed to create short link', error: errorMessage(error) }, 500);
  }
}

export async function analytics(request) {
  try {
    const auth = await authorizedUser(request);
    if (auth.response) return auth.response;
    const timeZone = new URL(request.url).searchParams.get('timeZone') || 'UTC';
    const links = await getUserLinks(String(auth.user._id || auth.user.id));
    const referrers = new Map();
    const daily = new Map();
    links.forEach((link) => link.clickEvents.forEach((event) => {
      const source = event.referrer || 'Direct';
      referrers.set(source, (referrers.get(source) || 0) + 1);
      const date = dateKeyInTimeZone(event.createdAt, timeZone);
      daily.set(date, (daily.get(date) || 0) + 1);
    }));
    return json({
      referrers: Array.from(referrers, ([source, clicks]) => ({ source, clicks })),
      daily: Array.from(daily, ([date, clicks]) => ({ date, clicks })),
    });
  } catch (error) {
    return json({ message: 'Failed to fetch analytics', error: errorMessage(error) }, 500);
  }
}

export async function trackClick(request, { params }) {
  try {
    const auth = await authorizedUser(request);
    if (auth.response) return auth.response;
    const { id } = await params;
    const links = await getUserLinks(String(auth.user._id || auth.user.id));
    const link = links.find((item) => item.id === id);
    if (!link) return json({ message: 'Link not found' }, 404);
    return json({ message: 'Tracking refreshed', link });
  } catch (error) {
    return json({ message: 'Failed to refresh tracking', error: errorMessage(error) }, 500);
  }
}

export async function redirectShortLink(request, { params }) {
  try {
    const purpose = `${request.headers.get('purpose') || ''} ${request.headers.get('sec-purpose') || ''}`;
    if (/\b(prefetch|prerender)\b/i.test(purpose) || request.headers.has('next-router-prefetch')) {
      return new Response(null, { status: 204 });
    }

    await connectDatabase();
    const { slug } = await params;
    const link = state.mongoReady
      ? await Link.findOne({ $or: [{ shortCode: slug.toUpperCase() }, { customSlug: slug.toLowerCase() }] })
      : state.links.find((item) => item.customSlug === slug.toLowerCase() || item.shortCode.toLowerCase() === slug.toLowerCase());
    if (!link) return json({ message: 'Short link not found' }, 404);
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) return json({ message: 'This link has expired' }, 410);
    if (link.maxClicks && link.clickCount >= link.maxClicks) return json({ message: 'Click limit reached' }, 410);
    const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const geo = geoip.lookup(address.replace('::ffff:', '')) || {};
    const agent = parseUserAgent(request.headers.get('user-agent') || '');
    const click = {
      linkId: link._id || link.id, country: geo.country || 'Unknown', city: geo.city || 'Unknown', ...agent,
      referrer: request.headers.get('referer') || 'Direct', ipAddress: address, timestamp: new Date(),
    };
    if (state.mongoReady) {
      const savedClick = await Click.create(click);
      link.clickCount += 1;
      link.clickEvents.push(savedClick._id);
      if (link.maxClicks && link.clickCount >= link.maxClicks) link.status = 'Limit Reached';
      await link.save();
    } else {
      state.clicks.unshift({ ...click, id: randomUUID(), timestamp: click.timestamp.toISOString() });
      link.clickCount = (link.clickCount || 0) + 1;
      link.status = link.maxClicks && link.clickCount >= link.maxClicks ? 'Limit Reached' : 'Active';
    }
    return Response.redirect(link.longUrl, 307);
  } catch (error) {
    return json({ message: 'Redirect failed', error: errorMessage(error) }, 500);
  }
}
