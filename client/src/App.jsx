import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ChatArea from './components/ChatArea.jsx';
import Onboarding from './components/Onboarding.jsx';
import ProfileModal from './components/ProfileModal.jsx';
import GroupModal from './components/GroupModal.jsx';
import ForwardModal from './components/ForwardModal.jsx';
import CallModal from './components/CallModal.jsx';
import IncomingCallModal from './components/IncomingCallModal.jsx';
import { SocketProvider } from './contexts/SocketContext.jsx';
import { CallProvider, useCall } from './contexts/CallContext.jsx';
import { getDmRoomId } from './utils/format.jsx';

function CallErrorToast() {
  const { callError } = useCall();
  if (!callError) return null;
  return (
    <div className="call-error-toast" role="alert">
      <span>⚠️ {callError}</span>
    </div>
  );
}

const THEME_KEY = 'localchat_theme';
const USER_KEY  = 'localchat_user';

function isMobileWidth() { return window.innerWidth <= 767; }

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  });
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);

  // Responsive sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(!isMobileWidth());
  const [isMobile, setIsMobile] = useState(isMobileWidth());

  // Modals
  const [showProfile, setShowProfile] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState(null);
  const [managedGroup, setManagedGroup] = useState(null);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [groupRefreshSignal, setGroupRefreshSignal] = useState(0);

  // Track viewport changes
  useEffect(() => {
    const onResize = () => {
      const mobile = isMobileWidth();
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true); // always show on desktop
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const fetchUsers = useCallback(async () => {
    try { setUsers(await (await fetch('/api/users')).json()); } catch {}
  }, []);

  const fetchGroups = useCallback(async () => {
    if (!currentUser) return;
    try { setGroups(await (await fetch(`/api/groups?userId=${currentUser.id}`)).json()); } catch {}
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    fetchUsers();
    fetchGroups();
    const up = setInterval(fetchUsers, 10000);
    const gp = setInterval(fetchGroups, 15000);
    return () => { clearInterval(up); clearInterval(gp); };
  }, [currentUser, fetchUsers, fetchGroups]);

  // ── Handlers ──────────────────────────────────────────

  const handleSelectDm = (user) => {
    setActiveRoom({ type: 'dm', id: getDmRoomId(currentUser.id, user.id), contact: user });
    if (isMobile) setSidebarOpen(false);
  };

  const handleSelectGroup = (group) => {
    setActiveRoom({ type: 'group', id: `group:${group.id}`, group });
    if (isMobile) setSidebarOpen(false);
  };

  const handleGroupCreated = (newGroup) => {
    setGroups(prev => [newGroup, ...prev]);
    handleSelectGroup(newGroup);
  };

  const handleProfileSave = (updated) => {
    setCurrentUser(updated);
    fetchUsers();
  };

  const handleForward = (msg, target) => {
    if (!currentUser) return;
    const roomId = target._type === 'group'
      ? `group:${target.id}`
      : getDmRoomId(currentUser.id, target.id);
    window.dispatchEvent(new CustomEvent('localchat:forward', {
      detail: { msg, roomId, senderId: currentUser.id }
    }));
  };

  const handleBackToSidebar = () => {
    setActiveRoom(null);
    setSidebarOpen(true);
  };

  if (!currentUser) {
    return (
      <div data-theme={theme}>
        <Onboarding onComplete={setCurrentUser} />
      </div>
    );
  }

  return (
    <SocketProvider userId={currentUser?.id}>
    <CallProvider currentUser={currentUser}>
      <CallModal />
      <IncomingCallModal />
      <CallErrorToast />
      <div className="app-layout">
        {/* Mobile backdrop — tap to close sidebar */}
        {isMobile && sidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
        )}

        <Sidebar
          currentUser={currentUser}
          users={users}
          groups={groups}
          activeRoom={activeRoom}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSelectDm={handleSelectDm}
          onSelectGroup={handleSelectGroup}
          onNewGroup={() => { setGroupModalMode('create'); if (isMobile) setSidebarOpen(false); }}
          onProfile={() => { setShowProfile(true); if (isMobile) setSidebarOpen(false); }}
          theme={theme}
          onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        />

        <ChatArea
          currentUser={currentUser}
          activeRoom={activeRoom}
          onForward={setForwardMsg}
          onGroupManage={(g) => { setManagedGroup(g); setGroupModalMode('manage'); }}
          groupRefreshSignal={groupRefreshSignal}
          onMenuOpen={() => setSidebarOpen(true)}
          isMobile={isMobile}
          onBack={handleBackToSidebar}
        />

        {/* ── Modals ── */}
        {showProfile && (
          <ProfileModal user={currentUser} onClose={() => setShowProfile(false)} onSave={handleProfileSave} />
        )}
        {groupModalMode === 'create' && (
          <GroupModal mode="create" currentUser={currentUser}
            onClose={() => setGroupModalMode(null)} onCreate={handleGroupCreated} />
        )}
        {groupModalMode === 'manage' && managedGroup && (
          <GroupModal mode="manage" group={managedGroup} currentUser={currentUser}
            onClose={() => {
              setGroupModalMode(null);
              setManagedGroup(null);
              fetchGroups();
              setGroupRefreshSignal(s => s + 1); // tells ChatArea to re-fetch member count
            }} />
        )}
        {forwardMsg && (
          <ForwardModal message={forwardMsg} currentUser={currentUser}
            onClose={() => setForwardMsg(null)} onForward={handleForward} />
        )}
      </div>
    </CallProvider>
    </SocketProvider>
  );
}
