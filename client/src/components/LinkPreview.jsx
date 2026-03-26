import { useState, useEffect, useRef } from 'react';

const previewCache = new Map();

async function fetchPreview(url) {
  if (previewCache.has(url)) return previewCache.get(url);
  const res = await fetch(`/api/links/preview?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error('failed');
  const data = await res.json();
  previewCache.set(url, data);
  return data;
}

// ── YouTube embed ──────────────────────────────────────────────────────────────
function YouTubePreview({ data }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="lp-card lp-youtube" onClick={() => !playing && setPlaying(true)}>
      {playing ? (
        <iframe
          className="lp-yt-iframe"
          src={`${data.embedUrl}?autoplay=1`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          title={data.title}
        />
      ) : (
        <div className="lp-yt-thumb">
          {data.image && <img src={data.image} alt={data.title} className="lp-thumb-img" />}
          <div className="lp-yt-play">▶</div>
        </div>
      )}
      <div className="lp-meta">
        <div className="lp-site"><span className="lp-yt-badge">▶ YouTube</span></div>
        <div className="lp-title">{data.title}</div>
        {data.author && <div className="lp-desc">{data.author}</div>}
      </div>
    </div>
  );
}

// ── Spotify embed ──────────────────────────────────────────────────────────────
function SpotifyPreview({ data }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="lp-card lp-spotify">
      {expanded && data.embedUrl ? (
        <iframe
          className="lp-sp-iframe"
          src={data.embedUrl}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          title={data.title}
        />
      ) : (
        <div className="lp-sp-collapsed" onClick={() => setExpanded(true)}>
          {data.image && <img src={data.image} alt={data.title} className="lp-sp-art" />}
          <div className="lp-sp-info">
            <div className="lp-site"><span className="lp-sp-badge">♫ Spotify</span></div>
            <div className="lp-title">{data.title}</div>
            <div className="lp-desc">Click to play</div>
          </div>
          <div className="lp-sp-play">▶</div>
        </div>
      )}
    </div>
  );
}

// ── Generic link preview ───────────────────────────────────────────────────────
function GenericPreview({ data }) {
  return (
    <a className="lp-card lp-generic" href={data.url} target="_blank" rel="noopener noreferrer">
      {data.image && (
        <div className="lp-img-wrap">
          <img src={data.image} alt={data.title} className="lp-thumb-img"
            onError={e => { e.target.parentElement.style.display = 'none'; }} />
        </div>
      )}
      <div className="lp-meta">
        <div className="lp-site">{data.siteName || new URL(data.url).hostname}</div>
        <div className="lp-title">{data.title}</div>
        {data.description && (
          <div className="lp-desc">{data.description.slice(0, 120)}{data.description.length > 120 ? '…' : ''}</div>
        )}
      </div>
    </a>
  );
}

// ── Main LinkPreview component ─────────────────────────────────────────────────
export default function LinkPreview({ url }) {
  const [data, setData]     = useState(null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setData(null); setFailed(false);
    fetchPreview(url)
      .then(d => { if (mounted.current) setData(d); })
      .catch(() => { if (mounted.current) setFailed(true); });
    return () => { mounted.current = false; };
  }, [url]);

  if (failed || !data) return null;

  if (data.type === 'youtube') return <YouTubePreview data={data} />;
  if (data.type === 'spotify') return <SpotifyPreview data={data} />;
  return <GenericPreview data={data} />;
}

// ── URL detector ───────────────────────────────────────────────────────────────
const URL_REGEX = /https?:\/\/[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*/g;

export function extractFirstUrl(text) {
  if (!text) return null;
  const m = text.match(URL_REGEX);
  return m ? m[0] : null;
}

// Render message text with clickable links
export function renderTextWithLinks(text) {
  if (!text) return null;
  const parts = [];
  let last = 0;
  let m;
  URL_REGEX.lastIndex = 0;
  const re = new RegExp(URL_REGEX.source, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer" className="msg-link">
        {m[0]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
