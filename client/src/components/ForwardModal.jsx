import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import Avatar from './Avatar.jsx';

export default function ForwardModal({ message, currentUser, onForward, onClose }) {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data =>
      setUsers(data.filter(u => u.id !== currentUser?.id))
    );
    fetch(`/api/groups?userId=${currentUser?.id}`).then(r => r.json()).then(setGroups);
  }, [currentUser]);

  const handleForward = () => {
    if (!selected) return;
    onForward(message, selected);
    onClose();
  };

  const filterFn = (item) => item.name?.toLowerCase().includes(search.toLowerCase()) ||
    item.display_name?.toLowerCase().includes(search.toLowerCase());

  const allItems = [
    ...users.filter(filterFn).map(u => ({ ...u, _type: 'user', name: u.display_name })),
    ...groups.filter(filterFn).map(g => ({ ...g, _type: 'group' }))
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Forward Message</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="search-input-wrap" style={{ marginBottom: 12 }}>
            <Search size={14} color="var(--text-muted)" />
            <input placeholder="Search people or groups…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {message && (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '8px 12px', marginBottom: 12 }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Message to forward:</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }} className="truncate">
                {message.content || message.file_name || 'Attachment'}
              </p>
            </div>
          )}

          <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allItems.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: 13 }}>No contacts found</p>
            )}
            {allItems.map(item => (
              <div
                key={item.id}
                className="user-select-item"
                style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', background: selected?.id === item.id ? 'var(--accent-light)' : undefined }}
                onClick={() => setSelected(item)}
              >
                <Avatar user={item} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item._type === 'group' ? 'Group' : 'Direct message'}</div>
                </div>
                <div className={`checkbox ${selected?.id === item.id ? 'checked' : ''}`}>
                  {selected?.id === item.id && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" /></svg>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!selected} onClick={handleForward}>Forward</button>
        </div>
      </div>
    </div>
  );
}
