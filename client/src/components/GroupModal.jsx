import { useState, useEffect, useRef } from 'react';
import { X, Camera, Search, Crown, UserMinus, UserPlus } from 'lucide-react';
import Avatar from './Avatar.jsx';

export default function GroupModal({ mode = 'create', group = null, currentUser, onClose, onCreate, onUpdate }) {
  const [name, setName] = useState(group?.name || '');
  const [desc, setDesc] = useState(group?.description || '');
  const [avatar, setAvatar] = useState(null);
  const [preview, setPreview] = useState(group?.avatar_url || null);
  const [users, setUsers] = useState([]);
  const [members, setMembers] = useState(group?.members || []);
  const [selected, setSelected] = useState(new Set(group?.members?.map(m => m.id) || []));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data =>
      setUsers(data.filter(u => u.id !== currentUser?.id))
    );
    if (mode === 'manage' && group) {
      fetch(`/api/groups/${group.id}`).then(r => r.json()).then(d => setMembers(d.members || []));
    }
  }, [currentUser, group, mode]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setAvatar(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('description', desc);
      fd.append('created_by', currentUser.id);
      fd.append('member_ids', JSON.stringify([...selected]));
      if (avatar) fd.append('avatar', avatar);

      const res = await fetch('/api/groups', { method: 'POST', body: fd });
      const g = await res.json();
      onCreate?.(g);
      onClose();
    } finally { setLoading(false); }
  };

  const handleRemoveMember = async (userId) => {
    await fetch(`/api/groups/${group.id}/members/${userId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId: currentUser.id })
    });
    setMembers(prev => prev.filter(m => m.id !== userId));
  };

  const filtered = users.filter(u =>
    u.display_name.toLowerCase().includes(search.toLowerCase())
  );

  const myRole = members.find(m => m.id === currentUser?.id)?.role;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{mode === 'create' ? 'New Group' : group?.name}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {/* Avatar */}
          <div className="avatar-upload" style={{ marginBottom: 16 }}>
            <div className="avatar-upload-wrap" onClick={() => fileRef.current.click()}>
              <div className="avatar avatar-lg" style={{ background: preview ? undefined : '#6366f1' }}>
                {preview ? <img src={preview} alt="group" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : name[0]?.toUpperCase() || '#'}
              </div>
              <div className="avatar-upload-overlay"><Camera size={18} /></div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          </div>

          <div className="form-group">
            <label className="form-label">Group Name *</label>
            <input className="form-input" placeholder="e.g. Backend Team" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" placeholder="What's this group about?" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>

          {/* Members section */}
          {mode === 'manage' && (
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Members ({members.length})</label>
              <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 8 }}>
                {members.map(m => (
                  <div key={m.id} className="member-item">
                    <Avatar user={m} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.display_name}</div>
                    </div>
                    {m.role === 'admin' && <span className="member-role-badge"><Crown size={10} /> Admin</span>}
                    {myRole === 'admin' && m.id !== currentUser?.id && (
                      <button className="icon-btn" style={{ color: 'var(--danger)' }} onClick={() => handleRemoveMember(m.id)}>
                        <UserMinus size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add members */}
          <div>
            <label className="form-label">{mode === 'create' ? 'Add Members' : 'Add People'}</label>
            <div className="search-input-wrap" style={{ margin: '8px 0 10px' }}>
              <Search size={13} color="var(--text-muted)" />
              <input placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filtered.map(u => (
                <div key={u.id} className="user-select-item" onClick={() => toggleSelect(u.id)}>
                  <Avatar user={u} size="sm" />
                  <div style={{ flex: 1, fontSize: 13 }}>{u.display_name}</div>
                  <div className={`checkbox ${selected.has(u.id) ? 'checked' : ''}`}>
                    {selected.has(u.id) && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" /></svg>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!name.trim() || loading} onClick={handleCreate}>
            {mode === 'create' ? (loading ? 'Creating…' : `Create Group`) : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
