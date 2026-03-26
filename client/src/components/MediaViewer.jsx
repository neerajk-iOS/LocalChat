import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';

export default function MediaViewer({ src, filename, onClose }) {
  const [scale, setScale] = useState(1);

  const handleOverlay = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="lightbox-overlay" onClick={handleOverlay}>
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
        <button className="lightbox-btn" onClick={() => setScale(s => Math.min(s + 0.25, 4))}>
          <ZoomIn size={16} />
        </button>
        <button className="lightbox-btn" onClick={() => setScale(s => Math.max(s - 0.25, 0.25))}>
          <ZoomOut size={16} />
        </button>
        <a className="lightbox-btn" href={src} download={filename}>
          <Download size={16} /> Save
        </a>
        <button className="lightbox-btn" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <img
        className="lightbox-img"
        src={src}
        alt={filename}
        style={{ transform: `scale(${scale})`, transition: 'transform 0.2s ease', cursor: scale > 1 ? 'zoom-out' : 'zoom-in' }}
        onClick={() => setScale(s => s > 1 ? 1 : 2)}
      />

      {filename && (
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 }}>{filename}</p>
      )}
    </div>
  );
}
