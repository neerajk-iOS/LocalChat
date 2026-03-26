import { getInitials, getAvatarColor } from '../utils/format.jsx';

export default function Avatar({ user, size = 'md', showStatus = false, isOnline = false }) {
  const name = user?.display_name || user?.name || '?';
  const initials = getInitials(name);
  const bg = getAvatarColor(user?.id || name);

  return (
    <div className="avatar-wrap">
      <div className={`avatar avatar-${size}`} style={{ background: user?.avatar_url ? undefined : bg }}>
        {user?.avatar_url
          ? <img src={user.avatar_url} alt={name} />
          : initials
        }
      </div>
      {showStatus && (
        <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
      )}
    </div>
  );
}
