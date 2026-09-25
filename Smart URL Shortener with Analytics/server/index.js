import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import geoip from 'geoip-lite';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'linklytics_secret_key';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/linklytics';

const inMemoryUsers = [];
const inMemoryLinks = [];
const inMemoryClicks = [];
let mongoReady = false;

app.use(cors());
app.use(express.json({ extended: true }));

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

const generateToken = (user) => jwt.sign({ userId: user._id || user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

const generateShortCode = () => `${Math.random().toString(36).slice(2, 8).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

const parseUserAgent = (userAgent = '') => {
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
};

const normalizeLinkDocument = (link) => ({
  id: link._id ? String(link._id) : link.id,
  title: link.title,
  longUrl: link.longUrl,
  shortCode: link.shortCode,
  shortUrl: link.shortUrl,
  customSlug: link.customSlug,
  expiresAt: link.expiresAt,
  maxClicks: link.maxClicks,
  clickCount: link.clickCount || 0,
  status: link.status || 'Active',
  clickEvents: link.clickEvents || [],
  qrCode: link.qrCode,
  createdAt: link.createdAt,
});

const getMemoryUserById = (userId) => inMemoryUsers.find((user) => user.id === userId);
const getMemoryUserByEmail = (email) => inMemoryUsers.find((user) => user.email.toLowerCase() === email.toLowerCase());

const seedMemoryDemoUser = async () => {
  const demoPassword = await bcrypt.hash('123456', 10);
  if (!getMemoryUserByEmail('demo@linklytics.com')) {
    inMemoryUsers.push({
      id: 'demo-user-1',
      name: 'Demo User',
      email: 'demo@linklytics.com',
      password: demoPassword,
    });
  }
};

const seedMongoDemoUser = async () => {
  const existing = await User.findOne({ email: 'demo@linklytics.com' });
  if (!existing) {
    const password = await bcrypt.hash('123456', 10);
    await User.create({
      name: 'Demo User',
      email: 'demo@linklytics.com',
      password,
    });
  }
};

const connectDatabase = async () => {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    mongoReady = true;
    console.log('MongoDB connected');
    await seedMongoDemoUser();
  } catch (error) {
    mongoReady = false;
    console.log('MongoDB unavailable — using in-memory storage for this demo.');
    await seedMemoryDemoUser();
  }
};

const getUserByToken = async (token) => {
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (mongoReady) {
      const user = await User.findById(decoded.userId);
      return user;
    }

    return getMemoryUserById(decoded.userId) || null;
  } catch {
    return null;
  }
};

const getAuthUser = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const user = await getUserByToken(token);
    if (!user) {
      return res.status(401).json({ message: 'User not found or token invalid' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const formatLinkForClient = (link, clickList = []) => ({
  id: link._id ? String(link._id) : link.id,
  title: link.title,
  longUrl: link.longUrl,
  shortCode: link.shortCode,
  shortUrl: link.shortUrl,
  customSlug: link.customSlug,
  expiresAt: link.expiresAt,
  maxClicks: link.maxClicks,
  clickCount: clickList.length || link.clickCount || 0,
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
});

const getUserLinks = async (userId) => {
  if (mongoReady) {
    const links = await Link.find({ userId }).sort({ createdAt: -1 });
    const formatted = [];

    for (const link of links) {
      const clickEvents = await Click.find({ linkId: link._id }).sort({ timestamp: -1 }).lean();
      formatted.push(formatLinkForClient(link, clickEvents));
    }

    return formatted;
  }

  return inMemoryLinks
    .filter((link) => link.userId === userId)
    .map((link) => ({
      ...link,
      clickEvents: inMemoryClicks.filter((event) => event.linkId === link.id),
    }))
    .map((link) => formatLinkForClient(link, link.clickEvents));
};

const findLinkBySlug = async (slug) => {
  const normalizedSlug = slug.toLowerCase();

  if (mongoReady) {
    return Link.findOne({ $or: [{ shortCode: slug.toUpperCase() }, { customSlug: normalizedSlug }] });
  }

  return inMemoryLinks.find((link) =>
    link.customSlug === normalizedSlug || link.shortCode.toLowerCase() === normalizedSlug,
  );
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Linklytics backend is running' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (mongoReady) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create({ name, email, password: hashedPassword });
      return res.status(201).json({ message: 'User registered', token: generateToken(user), user: { id: user._id, name: user.name, email: user.email } });
    }

    const existingUser = getMemoryUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { id: randomUUID(), name, email, password: hashedPassword };
    inMemoryUsers.push(user);
    return res.status(201).json({ message: 'User registered', token: generateToken(user), user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    return res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (mongoReady) {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      return res.json({ message: 'Login successful', token: generateToken(user), user: { id: user._id, name: user.name, email: user.email } });
    }

    const user = getMemoryUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    return res.json({ message: 'Login successful', token: generateToken(user), user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

app.post('/api/links', getAuthUser, async (req, res) => {
  try {
    const { longUrl, customSlug, expiresAt, maxClicks, title } = req.body;

    if (!longUrl) {
      return res.status(400).json({ message: 'longUrl is required' });
    }

    const normalizedUrl = /^https?:\/\//i.test(longUrl) ? longUrl : `https://${longUrl}`;
    const slugValue = (customSlug || generateShortCode()).trim();
    const finalSlug = slugValue.replace(/\s+/g, '-');
    const shortCode = finalSlug.toUpperCase();
    const shortUrl = `http://localhost:5000/${finalSlug.toLowerCase()}`;

    if (mongoReady) {
      const existing = await Link.findOne({ $or: [{ shortCode }, { customSlug: finalSlug.toLowerCase() }, { shortUrl }] });
      if (existing) {
        return res.status(400).json({ message: 'This slug is already in use. Choose another one.' });
      }

      const qrCode = await QRCode.toDataURL(shortUrl);
      const link = await Link.create({
        userId: req.user._id,
        title: title || 'Campaign Link',
        longUrl: normalizedUrl,
        shortCode,
        customSlug: finalSlug.toLowerCase(),
        shortUrl,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        maxClicks: maxClicks ? Number(maxClicks) : undefined,
        clickCount: 0,
        status: 'Active',
        qrCode,
        clickEvents: [],
      });

      return res.status(201).json(formatLinkForClient(link, []));
    }

    const duplicate = inMemoryLinks.find((link) =>
      link.shortCode.toLowerCase() === finalSlug.toLowerCase() ||
      link.customSlug === finalSlug.toLowerCase() ||
      link.shortUrl === shortUrl,
    );

    if (duplicate) {
      return res.status(400).json({ message: 'This slug is already in use. Choose another one.' });
    }

    const qrCode = await QRCode.toDataURL(shortUrl);
    const link = {
      id: randomUUID(),
      userId: req.user.id,
      title: title || 'Campaign Link',
      longUrl: normalizedUrl,
      shortCode,
      customSlug: finalSlug.toLowerCase(),
      shortUrl,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      maxClicks: maxClicks ? Number(maxClicks) : undefined,
      clickCount: 0,
      status: 'Active',
      qrCode,
      clickEvents: [],
      createdAt: new Date().toISOString(),
    };

    inMemoryLinks.unshift(link);
    return res.status(201).json(formatLinkForClient(link, []));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create short link', error: error.message });
  }
});

app.get('/api/links', getAuthUser, async (req, res) => {
  try {
    const userId = mongoReady ? req.user._id.toString() : req.user.id;
    const links = await getUserLinks(userId);
    return res.json(links);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch links', error: error.message });
  }
});

app.get('/api/analytics', getAuthUser, async (req, res) => {
  try {
    const userId = mongoReady ? req.user._id.toString() : req.user.id;
    const links = await getUserLinks(userId);
    const referrers = new Map();
    const daily = new Map();

    links.forEach((link) => link.clickEvents.forEach((event) => {
      const source = event.referrer || 'Direct';
      referrers.set(source, (referrers.get(source) || 0) + 1);
      const date = new Date(event.createdAt).toISOString().slice(0, 10);
      daily.set(date, (daily.get(date) || 0) + 1);
    }));

    return res.json({
      referrers: Array.from(referrers, ([source, clicks]) => ({ source, clicks })),
      daily: Array.from(daily, ([date, clicks]) => ({ date, clicks })),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch analytics', error: error.message });
  }
});

app.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const link = await findLinkBySlug(slug);

    if (!link) {
      return res.status(404).json({ message: 'Short link not found' });
    }

    const now = new Date();
    if (link.expiresAt && new Date(link.expiresAt) < now) {
      return res.status(410).json({ message: 'This link has expired' });
    }

    if (link.maxClicks && link.clickCount >= link.maxClicks) {
      return res.status(410).json({ message: 'Click limit reached' });
    }

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const geo = geoip.lookup(Array.isArray(ipAddress) ? ipAddress[0].replace('::ffff:', '') : ipAddress.replace('::ffff:', '')) || {};
    const ua = parseUserAgent(req.headers['user-agent']);
    const referrer = req.headers.referer || req.headers.referrer || 'Direct';

    if (mongoReady) {
      const click = await Click.create({
        linkId: link._id,
        country: geo.country || 'Unknown',
        city: geo.city || 'Unknown',
        device: ua.device,
        browser: ua.browser,
        os: ua.os,
        referrer,
        ipAddress,
        timestamp: new Date(),
      });

      link.clickCount += 1;
      link.clickEvents.push(click._id);
      if (link.maxClicks && link.clickCount >= link.maxClicks) {
        link.status = 'Limit Reached';
      }
      await link.save();
      return res.redirect(link.longUrl);
    }

    const clickEvent = {
      id: randomUUID(),
      linkId: link.id,
      country: geo.country || 'Nigeria',
      city: geo.city || 'Lagos',
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
      referrer,
      ipAddress,
      timestamp: new Date().toISOString(),
    };

    inMemoryClicks.unshift(clickEvent);
    link.clickCount = (link.clickCount || 0) + 1;
    link.status = link.maxClicks && link.clickCount >= link.maxClicks ? 'Limit Reached' : 'Active';
    return res.redirect(link.longUrl);
  } catch (error) {
    return res.status(500).json({ message: 'Redirect failed', error: error.message });
  }
});

app.post('/api/links/:id/click', getAuthUser, async (req, res) => {
  try {
    if (mongoReady) {
      const link = await Link.findById(req.params.id);
      if (!link) {
        return res.status(404).json({ message: 'Link not found' });
      }

      const now = new Date();
      if (link.expiresAt && now > new Date(link.expiresAt)) {
        link.status = 'Expired';
        await link.save();
        return res.status(400).json({ message: 'This link has expired', link: { id: link._id, status: 'Expired' } });
      }

      if (link.maxClicks && link.clickCount >= link.maxClicks) {
        link.status = 'Limit Reached';
        await link.save();
        return res.status(400).json({ message: 'Click limit reached', link: { id: link._id, status: 'Limit Reached' } });
      }

      const ua = parseUserAgent(req.headers['user-agent']);
      const click = await Click.create({
        linkId: link._id,
        country: 'Nigeria',
        city: 'Lagos',
        device: ua.device,
        browser: ua.browser,
        os: ua.os,
        timestamp: new Date(),
      });

      link.clickCount += 1;
      link.clickEvents.push(click._id);
      link.status = link.maxClicks && link.clickCount >= link.maxClicks ? 'Limit Reached' : 'Active';
      await link.save();

      const updatedClicks = await Click.find({ linkId: link._id }).sort({ timestamp: -1 }).lean();
      return res.json({ message: 'Click tracked successfully', link: formatLinkForClient(link, updatedClicks) });
    }

    const link = inMemoryLinks.find((item) => item.id === req.params.id);
    if (!link) return res.status(404).json({ message: 'Link not found' });

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      link.status = 'Expired';
      return res.status(400).json({ message: 'This link has expired', link: { id: link.id, status: 'Expired' } });
    }

    if (link.maxClicks && link.clickCount >= link.maxClicks) {
      link.status = 'Limit Reached';
      return res.status(400).json({ message: 'Click limit reached', link: { id: link.id, status: 'Limit Reached' } });
    }

    const ua = parseUserAgent(req.headers['user-agent']);
    const clickEvent = {
      id: randomUUID(),
      linkId: link.id,
      country: 'Nigeria',
      city: 'Lagos',
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
      timestamp: new Date().toISOString(),
    };

    inMemoryClicks.unshift(clickEvent);
    link.clickCount = (link.clickCount || 0) + 1;
    link.status = link.maxClicks && link.clickCount >= link.maxClicks ? 'Limit Reached' : 'Active';

    return res.json({ message: 'Click tracked successfully', link: formatLinkForClient(link, inMemoryClicks.filter((event) => event.linkId === link.id)) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to track click', error: error.message });
  }
});

connectDatabase();

app.listen(PORT, () => {
  console.log(`Linklytics server running on http://localhost:${PORT}`);
});
