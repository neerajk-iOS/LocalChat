import { useState, useRef } from 'react';
import { Camera, MessageSquare } from 'lucide-react';
import { getInitials, getAvatarColor } from '../utils/format.jsx';

export default function Onboarding({ onComplete }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setAvatar(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your display name'); return; }
    if (!email.trim()) { setError('Please enter your email address'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) { setError('Please enter a valid email address'); return; }
    setLoading(true); setError('');

    try {
      const fd = new FormData();
      fd.append('display_name', name.trim());
      fd.append('email', email.trim().toLowerCase());
      fd.append('bio', bio);
      if (avatar) fd.append('avatar', avatar);

      const res = await fetch('/api/users', { method: 'POST', body: fd });
      const data = await res.json();

      if (res.status === 409 && data.existingUserId) {
        // Device already has a registered user — load and resume that profile
        const existing = await fetch(`/api/users/${data.existingUserId}`);
        if (existing.ok) {
          const user = await existing.json();
          localStorage.setItem('localchat_user', JSON.stringify(user));
          onComplete(user);
          return;
        }
      }

      if (!res.ok) throw new Error(data.error || 'Failed to create profile');
      localStorage.setItem('localchat_user', JSON.stringify(data));
      onComplete(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const initials = name ? getInitials(name) : '?';
  const bg = getAvatarColor(name);

  return (
    <div className="onboarding-overlay">
      <form className="onboarding-card" onSubmit={handleSubmit}>
        <div className="onboarding-logo">Local<span>Chat</span></div>
        <p className="onboarding-tagline">Secure LAN chat — no internet required</p>

        {/* Avatar picker */}
        <div className="avatar-upload">
          <div className="avatar-upload-wrap" onClick={() => fileRef.current.click()}>
            <div className="avatar avatar-xl" style={{ background: preview ? undefined : bg }}>
              {preview ? <img src={preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : initials}
            </div>
            <div className="avatar-upload-overlay">
              <Camera size={22} />
            </div>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Upload profile photo (optional)</span>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        </div>

        <div className="form-group">
          <label className="form-label">Display Name *</label>
          <input
            className="form-input"
            placeholder="How should people see you?"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={40}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">Email *</label>
          <input
            className="form-input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            maxLength={120}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            Used for identity — one account per email
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">Bio <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <input
            className="form-input"
            placeholder="e.g. Backend dev · Team Infra"
            value={bio}
            onChange={e => setBio(e.target.value)}
            maxLength={80}
          />
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <button className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: 15 }} disabled={loading}>
          {loading ? 'Setting up…' : (
            <><MessageSquare size={16} /> Enter LocalChat</>
          )}
        </button>
      </form>
    </div>
  );
}
