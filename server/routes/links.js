const express = require('express');
const router  = express.Router();
const https   = require('https');
const http    = require('http');
const { URL } = require('url');

// ── Simple in-memory cache (url → { data, expires }) ──────────────────────────
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCached(url) {
  const entry = cache.get(url);
  if (entry && entry.expires > Date.now()) return entry.data;
  cache.delete(url);
  return null;
}
function setCache(url, data) {
  if (cache.size > 500) cache.delete(cache.keys().next().value); // evict oldest
  cache.set(url, { data, expires: Date.now() + CACHE_TTL });
}

// ── Fetch a URL and return the body as a string (follows one redirect) ─────────
function fetchUrl(rawUrl, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const req    = lib.get(rawUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LocalChat-LinkBot/1.0)',
        'Accept': 'text/html,application/json',
      },
      timeout: timeoutMs,
    }, res => {
      // Follow one redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return fetchUrl(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 500 * 1024) { req.destroy(); return; } // cap at 500 KB
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── Extract OG / meta tags from HTML ──────────────────────────────────────────
function extractOG(html, pageUrl) {
  const get = (prop) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
           || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
    return m ? m[1].trim() : null;
  };
  const titleTag = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim();
  const parsed   = new URL(pageUrl);

  return {
    title:       get('og:title')       || get('twitter:title')       || titleTag || parsed.hostname,
    description: get('og:description') || get('twitter:description') || null,
    image:       get('og:image')       || get('twitter:image')       || null,
    siteName:    get('og:site_name')   || parsed.hostname,
    url:         get('og:url')         || pageUrl,
    type:        get('og:type')        || 'website',
  };
}

// ── YouTube helper ─────────────────────────────────────────────────────────────
function youtubeVideoId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ── Spotify helper ─────────────────────────────────────────────────────────────
function isSpotify(url) {
  return /open\.spotify\.com\/(track|album|playlist|episode|show|artist)/.test(url);
}

// ── Main preview resolver ──────────────────────────────────────────────────────
async function resolvePreview(rawUrl) {
  const parsed = new URL(rawUrl);
  const host   = parsed.hostname.replace('www.', '');

  // ── YouTube ──────────────────────────────────────────────────────────────────
  const ytId = youtubeVideoId(rawUrl);
  if (ytId) {
    try {
      const oEmbed = JSON.parse(
        await fetchUrl(`https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`)
      );
      return {
        type:        'youtube',
        videoId:     ytId,
        title:       oEmbed.title       || 'YouTube Video',
        siteName:    'YouTube',
        author:      oEmbed.author_name || null,
        image:       `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
        embedUrl:    `https://www.youtube-nocookie.com/embed/${ytId}`,
        url:         rawUrl,
      };
    } catch { /* fall through to OG */ }
  }

  // ── Spotify ───────────────────────────────────────────────────────────────────
  if (isSpotify(rawUrl)) {
    try {
      const oEmbed = JSON.parse(
        await fetchUrl(`https://open.spotify.com/oembed?url=${encodeURIComponent(rawUrl)}`)
      );
      // Extract Spotify type + ID for the iframe embed
      const spMatch = rawUrl.match(/open\.spotify\.com\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
      const embedUrl = spMatch
        ? `https://open.spotify.com/embed/${spMatch[1]}/${spMatch[2]}?utm_source=generator&theme=0`
        : null;
      return {
        type:     'spotify',
        title:    oEmbed.title        || 'Spotify',
        siteName: 'Spotify',
        image:    oEmbed.thumbnail_url || null,
        embedUrl,
        url:      rawUrl,
      };
    } catch { /* fall through */ }
  }

  // ── Generic OG ────────────────────────────────────────────────────────────────
  const html = await fetchUrl(rawUrl);
  const og   = extractOG(html, rawUrl);
  return { type: 'link', ...og };
}

// ── GET /api/link-preview?url=... ─────────────────────────────────────────────
router.get('/preview', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url is required' });

  // Validate URL
  let parsed;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Block private/local IPs
  const host = parsed.hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    return res.status(403).json({ error: 'Private URLs not allowed' });
  }

  const cached = getCached(url);
  if (cached) return res.json(cached);

  try {
    const data = await resolvePreview(url);
    setCache(url, data);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Could not fetch preview: ' + err.message });
  }
});

module.exports = router;
