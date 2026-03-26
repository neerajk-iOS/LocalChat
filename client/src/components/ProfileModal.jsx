import { useState, useRef } from 'react';
import { X, Camera } from 'lucide-react';
import Avatar from './Avatar.jsx';

export default function ProfileModal({ user, onClose, onSave }) {
  const [name, setName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(null);
  const [preview, setPreview] = useState(user?.avatar_url || null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setAvatar(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('display_name', name.trim());
      fd.append('bio', bio);
      if (avatar) fd.append('avatar', avatar);

      const res = await fetch(`/api/users/${user.id}`, { method: 'PUT', body: fd });
      const updated = await res.json();
      localStorage.setItem('localchat_user', JSON.stringify(updated));
      onSave?.(updated);
      onClose();
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Edit Profile</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="avatar-upload">
            <div className="avatar-upload-wrap" onClick={() => fileRef.current.click()}>
              <Avatar user={{ ...user, avatar_url: preview }} size="xl" />
              <div className="avatar-upload-overlay"><Camera size={22} /></div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          </div>

          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} maxLength={40} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Bio</label>
            <input className="form-input" placeholder="Tell people about yourself" value={bio} onChange={e => setBio(e.target.value)} maxLength={80} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!name.trim() || loading} onClick={handleSave}>
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
