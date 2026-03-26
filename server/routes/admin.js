const express = require('express');
const router  = express.Router();
const db      = require('../db');
const os      = require('os');
const fs      = require('fs');
const path    = require('path');
const { getConnectedSessions, getOnlineUserIds, kickUser } = require('../sockets/chat');

const START_TIME = Date.now();

// ── Admin basic auth ──────────────────────────────────────────────────────────
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'localchat-admin';

router.use((req, res, next) => {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Basic ')) {
    const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="LocalChat Admin"');
  res.status(401).send('Unauthorised');
});

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60),
        h = Math.floor(m / 60),   d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ── Data collection helpers (used by both API routes and HTML SSR) ──

function collectStats() {
  const mem    = process.memoryUsage();
  const dbPath = path.join(__dirname, '..', 'localchat.db');
  let dbSize = 0;
  try { dbSize = fs.statSync(dbPath).size; } catch {}

  const q = (sql, p) => { try { return db.prepare(sql).get(...(p||[])); } catch { return {n:0}; } };

  const counts = {
    users:         q('SELECT COUNT(*) as n FROM users WHERE is_banned = 0').n,
    banned:        q('SELECT COUNT(*) as n FROM users WHERE is_banned = 1').n,
    messages:      q('SELECT COUNT(*) as n FROM messages WHERE is_deleted = 0').n,
    deleted:       q('SELECT COUNT(*) as n FROM messages WHERE is_deleted = 1').n,
    groups:        q('SELECT COUNT(*) as n FROM groups').n,
    reactions:     q('SELECT COUNT(*) as n FROM reactions').n,
    readReceipts:  q('SELECT COUNT(*) as n FROM read_receipts').n,
    todayMessages: q('SELECT COUNT(*) as n FROM messages WHERE is_deleted = 0 AND created_at > ?',
                     [Date.now() - 86400000]).n,
  };

  const msgPerDay = db.prepare(`
    SELECT date(created_at / 1000, 'unixepoch') as day, COUNT(*) as n
    FROM messages WHERE is_deleted = 0 AND created_at > ?
    GROUP BY day ORDER BY day
  `).all(Date.now() - 7 * 86400000);

  const rawHourly = db.prepare(`
    SELECT strftime('%H', created_at / 1000, 'unixepoch', 'localtime') as hour, COUNT(*) as n
    FROM messages WHERE is_deleted = 0 AND created_at > ?
    GROUP BY hour ORDER BY hour
  `).all(Date.now() - 24 * 3600000);
  const hourMap = {};
  rawHourly.forEach(r => { hourMap[r.hour] = r.n; });
  const nowH = new Date();
  const msgPerHour = Array.from({ length: 24 }, (_, i) => {
    const h = (nowH.getHours() - 23 + i + 24) % 24;
    const label = String(h).padStart(2, '0') + 'h';
    return { hour: label, n: hourMap[String(h).padStart(2, '0')] || 0 };
  });

  const topUsers = db.prepare(`
    SELECT u.display_name, u.avatar_url, COUNT(*) as msg_count
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.is_deleted = 0
    GROUP BY m.sender_id ORDER BY msg_count DESC LIMIT 8
  `).all();

  const topRooms = db.prepare(`
    SELECT room_id, COUNT(*) as msg_count
    FROM messages WHERE is_deleted = 0
    GROUP BY room_id ORDER BY msg_count DESC LIMIT 10
  `).all();

  const sessions  = getConnectedSessions();
  const onlineIds = getOnlineUserIds();

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  let uploadsSize = 0, uploadsCount = 0;
  function walkDir(dir) {
    try {
      fs.readdirSync(dir).forEach(f => {
        const fp = path.join(dir, f), st = fs.statSync(fp);
        if (st.isDirectory()) walkDir(fp);
        else { uploadsSize += st.size; uploadsCount++; }
      });
    } catch {}
  }
  walkDir(uploadsDir);

  return {
    server: {
      uptime: fmtUptime(Date.now() - START_TIME),
      uptimeMs: Date.now() - START_TIME,
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      memory: { rss: fmtBytes(mem.rss), heapUsed: fmtBytes(mem.heapUsed), heapTotal: fmtBytes(mem.heapTotal) },
      pid: process.pid,
    },
    database: { ...counts, sizeBytes: dbSize, size: fmtBytes(dbSize) },
    uploads:  { size: fmtBytes(uploadsSize), count: uploadsCount },
    activity: { msgPerDay, msgPerHour, topUsers, topRooms },
    connections: { sessions, onlineCount: onlineIds.length, onlineIds },
  };
}

function collectUsers() {
  const onlineSet = new Set(getOnlineUserIds());
  const sessions  = getConnectedSessions();
  const socketMap = {};
  sessions.forEach(s => { socketMap[s.userId] = s.socketId; });

  let users = [];
  try {
    users = db.prepare(`
      SELECT u.id, u.display_name, u.avatar_url, u.status, u.bio,
             u.is_banned, u.ban_reason, u.ip_address, u.email, u.created_at, u.last_seen,
             COUNT(m.id) as message_count
      FROM users u
      LEFT JOIN messages m ON m.sender_id = u.id AND m.is_deleted = 0
      GROUP BY u.id ORDER BY u.created_at DESC
    `).all();
  } catch {
    users = db.prepare(
      'SELECT id, display_name, avatar_url, status, bio, created_at, last_seen FROM users ORDER BY created_at DESC'
    ).all().map(u => ({ ...u, is_banned: 0, ban_reason: null, ip_address: null, message_count: 0 }));
  }

  return users.map(u => ({
    ...u,
    online: onlineSet.has(u.id),
    socketId: socketMap[u.id] || null,
  }));
}

// ── Stats API ─────────────────────────────────────────
router.get('/api/stats', (req, res) => {
  try { res.json(collectStats()); }
  catch (err) { console.error('[Admin stats error]', err); res.status(500).json({ error: err.message }); }
});

// ── All users API ─────────────────────────────────────
router.get('/api/users', (req, res) => {
  try { res.json(collectUsers()); }
  catch (err) { console.error('[Admin users error]', err); res.status(500).json({ error: err.message }); }
});

// ── Ban ───────────────────────────────────────────────
router.post('/api/users/:id/ban', (req, res) => {
  const { reason } = req.body || {};
  db.prepare('UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?')
    .run(reason?.trim() || 'Banned by admin', req.params.id);
  kickUser(req.params.id);
  res.json({ ok: true });
});

// ── Unban ─────────────────────────────────────────────
router.post('/api/users/:id/unban', (req, res) => {
  db.prepare('UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Kick ──────────────────────────────────────────────
router.post('/api/users/:id/kick', (req, res) => {
  kickUser(req.params.id);
  res.json({ ok: true });
});

// ── Delete user ───────────────────────────────────────
router.delete('/api/users/:id', (req, res) => {
  kickUser(req.params.id);
  const uid = req.params.id;
  const user = db.prepare('SELECT ip_address FROM users WHERE id = ?').get(uid);
  if (user?.ip_address) {
    db.prepare('DELETE FROM ip_registrations WHERE ip = ?').run(user.ip_address);
  }
  db.prepare('DELETE FROM reactions WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM read_receipts WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM group_members WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM messages WHERE sender_id = ?').run(uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  res.json({ ok: true });
});

// ── Server-side HTML helpers ──────────────────────────

function svgLine(data, lKey, vKey, color) {
  if (!data || !data.length) return '<p style="text-align:center;color:#5a5d72;padding:24px 0">No data yet</p>';
  const W=560,H=120,PL=32,PR=8,PT=10,PB=24,IW=W-PL-PR,IH=H-PT-PB;
  const maxV = Math.max(...data.map(d => d[vKey]), 1);
  const xs = data.map((_,i) => PL + (i / Math.max(data.length-1,1)) * IW);
  const ys = data.map(d  => PT + IH - (d[vKey] / maxV) * IH);
  const pts = xs.map((x,i) => x+','+ys[i]).join(' ');
  const area = 'M'+xs[0]+','+(PT+IH)+' '+xs.map((x,i)=>'L'+x+' '+ys[i]).join(' ')+' L'+xs[xs.length-1]+','+(PT+IH)+'Z';
  const step = Math.max(1, Math.floor(data.length/6));
  const xLbls = data.map((d,i) => {
    if (i%step!==0 && i!==data.length-1) return '';
    return '<text x="'+xs[i]+'" y="'+(H-5)+'" text-anchor="middle" fill="#5a5d72" font-size="9">'+d[lKey]+'</text>';
  }).join('');
  const yLbls = [0,0.5,1].map(t=>{
    const y=PT+IH-t*IH;
    return '<line x1="'+PL+'" y1="'+y+'" x2="'+(W-PR)+'" y2="'+y+'" stroke="#fff" stroke-opacity=".04"/>'+
           '<text x="'+(PL-3)+'" y="'+(y+3)+'" text-anchor="end" fill="#5a5d72" font-size="9">'+Math.round(maxV*t)+'</text>';
  }).join('');
  const uid = 'g'+Math.random().toString(36).slice(2,8);
  return '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:120px">'+
    '<defs><linearGradient id="'+uid+'" x1="0" y1="0" x2="0" y2="1">'+
    '<stop offset="0%" stop-color="'+color+'" stop-opacity=".25"/><stop offset="100%" stop-color="'+color+'" stop-opacity=".02"/></linearGradient></defs>'+
    yLbls+'<path d="'+area+'" fill="url(#'+uid+')"/>'+
    '<polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'+
    xs.map((x,i)=>'<circle cx="'+x+'" cy="'+ys[i]+'" r="2.5" fill="'+color+'"><title>'+data[i][lKey]+': '+data[i][vKey]+'</title></circle>').join('')+
    xLbls+'</svg>';
}

function svgBar(data, lKey, vKey, color) {
  if (!data || !data.length) return '<p style="text-align:center;color:#5a5d72;padding:24px 0">No data yet</p>';
  const W=560,H=120,PL=32,PR=8,PT=10,PB=24,IW=W-PL-PR,IH=H-PT-PB;
  const maxV = Math.max(...data.map(d => d[vKey]), 1);
  const gap = IW / data.length, bw = Math.max(2, gap*0.7);
  const bars = data.map((d,i) => {
    const bh = (d[vKey]/maxV)*IH, x = PL+i*gap+(gap-bw)/2, y = PT+IH-bh;
    return '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="2" fill="'+color+'" opacity=".8"><title>'+d[lKey]+': '+d[vKey]+'</title></rect>';
  }).join('');
  const step = Math.max(1, Math.floor(data.length/6));
  const xLbls = data.map((d,i) => {
    if (i%step!==0 && i!==data.length-1) return '';
    return '<text x="'+(PL+i*gap+gap/2)+'" y="'+(H-5)+'" text-anchor="middle" fill="#5a5d72" font-size="9">'+d[lKey]+'</text>';
  }).join('');
  const yLbls = [0,0.5,1].map(t=>{
    const y=PT+IH-t*IH;
    return '<line x1="'+PL+'" y1="'+y+'" x2="'+(W-PR)+'" y2="'+y+'" stroke="#fff" stroke-opacity=".04"/>'+
           '<text x="'+(PL-3)+'" y="'+(y+3)+'" text-anchor="end" fill="#5a5d72" font-size="9">'+Math.round(maxV*t)+'</text>';
  }).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:120px">'+yLbls+bars+xLbls+'</svg>';
}

function hbar(label, val, max, color) {
  const pct = max ? Math.round(val/max*100) : 0;
  return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'+
    '<div style="font-size:12px;color:#a0a3b1;width:90px;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+escS(label)+'">'+escS(label.slice(0,12))+'</div>'+
    '<div style="flex:1;height:8px;background:#1a1b25;border-radius:4px;overflow:hidden">'+
    '<div style="width:'+pct+'%;height:100%;background:'+color+';border-radius:4px"></div></div>'+
    '<div style="font-size:12px;color:#5a5d72;width:34px;text-align:right;flex-shrink:0">'+val+'</div></div>';
}

function pill(t, c) {
  const bg={green:'#22c55e18',red:'#ef444418',yellow:'#f59e0b18',blue:'#38bdf818',muted:'#1a1b25',accent:'#6366f118'};
  const fg={green:'#22c55e',red:'#ef4444',yellow:'#f59e0b',blue:'#38bdf8',muted:'#5a5d72',accent:'#818cf8'};
  return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:'+(bg[c]||bg.muted)+';color:'+(fg[c]||fg.muted)+'">'+t+'</span>';
}

function escS(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function infoRow(k, v) {
  return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #ffffff06">'+
    '<span style="font-size:12px;color:#a0a3b1">'+k+'</span>'+
    '<span style="font-size:12px;font-weight:600;color:#f1f2f7;font-family:monospace">'+escS(String(v))+'</span></div>';
}

// ── Admin HTML Dashboard ───────────────────────────────
router.get('/', (req, res) => {
  let s = null, users = [];
  try { s = collectStats(); } catch(e) { console.error('[Admin page stats]', e.message); }
  try { users = collectUsers(); } catch(e) { console.error('[Admin page users]', e.message); }

  // ── Build all HTML server-side ──
  const db_s = s ? s.database : {};
  const onlineCount = s ? s.connections.onlineCount : 0;

  // Stat tiles
  const tiles = s ? [
    {cls:'green', label:'Online Now',      val:onlineCount,           sub:s.connections.sessions.length+' socket sessions'},
    {cls:'',      label:'Total Users',     val:db_s.users,            sub:db_s.banned+' banned'},
    {cls:'accent',label:'Messages Today',  val:db_s.todayMessages,    sub:'All time: '+(db_s.messages||0).toLocaleString()},
    {cls:'',      label:'Groups',          val:db_s.groups,           sub:'Active channels'},
    {cls:'yellow',label:'Reactions',       val:db_s.reactions,        sub:'Emoji interactions'},
    {cls:'blue',  label:'Files',           val:s.uploads.count,       sub:s.uploads.size+' total'},
    {cls:'red',   label:'Banned',          val:db_s.banned,           sub:'Users restricted'},
    {cls:'',      label:'DB Size',         val:db_s.size,             sub:'Uploads: '+s.uploads.size, small:true},
  ].map(t=>'<div class="tile '+t.cls+'" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px 20px;display:flex;flex-direction:column;gap:5px">'+
    '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#5a5d72">'+t.label+'</div>'+
    '<div style="font-size:'+(t.small?'18px':'26px')+';font-weight:800;letter-spacing:-1px;line-height:1">'+escS(String(t.val))+'</div>'+
    '<div style="font-size:11px;color:#a0a3b1">'+escS(t.sub)+'</div></div>').join('')
  : '<div style="color:#ef4444;padding:20px">Failed to load stats — check server logs</div>';

  // Charts
  const hourlyChart = s ? svgLine(s.activity.msgPerHour, 'hour', 'n', '#6366f1') : '';
  const dailyChart  = s ? svgBar(s.activity.msgPerDay.map(d=>({day:d.day.slice(5),n:d.n})), 'day', 'n', '#818cf8') : '';

  // Top senders
  const topSenders = s && s.activity.topUsers.length
    ? (()=>{ const mx=Math.max(...s.activity.topUsers.map(u=>u.msg_count),1); return s.activity.topUsers.map(u=>hbar(u.display_name,u.msg_count,mx,'#818cf8')).join(''); })()
    : '<p style="text-align:center;color:#5a5d72;padding:20px 0">No messages yet</p>';

  // Top rooms
  const topRooms = s && s.activity.topRooms.length
    ? (()=>{ const mx=Math.max(...s.activity.topRooms.map(r=>r.msg_count),1); return s.activity.topRooms.map(r=>{
        const isG=r.room_id.startsWith('group:');
        return hbar((isG?'👥 ':'💬 ')+r.room_id.replace('group:','').replace('dm:','').slice(0,16), r.msg_count, mx, isG?'#22c55e':'#f59e0b');
      }).join(''); })()
    : '<p style="text-align:center;color:#5a5d72;padding:20px 0">No room activity</p>';

  // Active sessions
  const sessionRows = s && s.connections.sessions.length
    ? s.connections.sessions.map(ss=>'<tr><td style="padding-left:16px;font-family:monospace;font-size:11px;color:#f1f2f7">'+(ss.userId?ss.userId.slice(0,8)+'…':'—')+'</td>'+
        '<td style="font-family:monospace;font-size:11px;color:#5a5d72">'+ss.socketId.slice(0,12)+'</td>'+
        '<td>'+ss.rooms.length+'</td>'+
        '<td style="font-size:11px;color:#5a5d72">'+new Date(ss.connectedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'</td></tr>').join('')
    : '<tr><td colspan="4" style="text-align:center;color:#5a5d72;padding:24px">No active connections</td></tr>';

  // Traffic rooms table
  const trafficRoomRows = s && s.activity.topRooms.length
    ? s.activity.topRooms.map(r=>{
        const isG=r.room_id.startsWith('group:'), isDM=r.room_id.startsWith('dm:');
        return '<tr><td style="font-family:monospace;font-size:11px;color:#a0a3b1;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escS(r.room_id)+'</td>'+
          '<td>'+pill(isG?'group':isDM?'dm':'room',isG?'green':isDM?'yellow':'muted')+'</td>'+
          '<td>'+r.msg_count+'</td></tr>';}).join('')
    : '<tr><td colspan="3" style="text-align:center;color:#5a5d72;padding:24px">No room activity</td></tr>';

  // System info panels
  const sysServer = s ? [
    ['Uptime', s.server.uptime], ['Node.js', s.server.nodeVersion],
    ['Platform', s.server.platform], ['PID', s.server.pid],
    ['Online users', onlineCount],
  ].map(([k,v])=>infoRow(k,v)).join('') : '';

  const sysDB = s ? [
    ['Users', db_s.users], ['Banned', db_s.banned], ['Messages', (db_s.messages||0).toLocaleString()],
    ['Deleted msgs', db_s.deleted], ['Groups', db_s.groups], ['Reactions', db_s.reactions],
    ['Read receipts', db_s.readReceipts], ['File size', db_s.size],
  ].map(([k,v])=>infoRow(k,v)).join('') : '';

  const sysMem = s ? [
    ['RSS', s.server.memory.rss], ['Heap used', s.server.memory.heapUsed],
    ['Heap total', s.server.memory.heapTotal], ['Upload files', s.uploads.count],
    ['Upload size', s.uploads.size],
  ].map(([k,v])=>infoRow(k,v)).join('') : '';

  // Users table
  const onlineSet = new Set(s ? (s.connections.onlineIds||[]) : []);
  const userRows = users.length ? users.map(u => {
    const online  = onlineSet.has(u.id) || u.online;
    const avatar  = u.avatar_url
      ? '<img src="'+escS(u.avatar_url)+'" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid #ffffff12;flex-shrink:0" onerror="this.style.display=\'none\'">'
      : '<div style="width:28px;height:28px;border-radius:50%;background:#6366f1;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+escS((u.display_name||'?').slice(0,2).toUpperCase())+'</div>';
    const statusBadge = u.is_banned ? pill('banned','red') : online ? pill('online','green') : pill('offline','muted');
    const ts = ms => ms ? new Date(ms).toLocaleDateString()+' '+new Date(ms).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—';
    const actionBan    = '<button onclick="doAction(\'ban\',\''+escS(u.id)+'\',\''+escS(u.display_name)+'\')" class="abtn ban">🚫 Ban</button>';
    const actionUnban  = '<button onclick="doAction(\'unban\',\''+escS(u.id)+'\',\''+escS(u.display_name)+'\')" class="abtn unban">✓ Unban</button>';
    const actionKick   = '<button onclick="doAction(\'kick\',\''+escS(u.id)+'\',\''+escS(u.display_name)+'\')" class="abtn kick">⚡ Kick</button>';
    const actionDelete = '<button onclick="doAction(\'delete\',\''+escS(u.id)+'\',\''+escS(u.display_name)+'\')" class="abtn del">🗑</button>';
    const actions = u.is_banned
      ? '<div style="display:flex;gap:5px">'+actionUnban+actionDelete+'</div>'
      : '<div style="display:flex;gap:5px">'+actionKick+actionBan+actionDelete+'</div>';
    return '<tr data-name="'+escS(u.display_name.toLowerCase())+'" data-ip="'+escS(u.ip_address||'')+'" data-id="'+escS(u.id)+'" data-email="'+escS((u.email||'').toLowerCase())+'">'+
      '<td style="padding-left:16px"><div style="display:flex;align-items:center;gap:8px">'+avatar+
      '<div><div style="font-weight:500;color:#f1f2f7">'+escS(u.display_name)+'</div>'+
      '<div style="font-size:10px;color:#5a5d72;font-family:monospace">'+escS(u.id.slice(0,8))+'…</div></div></div></td>'+
      '<td>'+statusBadge+'</td>'+
      '<td>'+u.message_count+'</td>'+
      '<td style="font-size:11px;color:#a0a3b1">'+escS(u.email||'—')+'</td>'+
      '<td style="font-family:monospace;font-size:11px;color:#a0a3b1">'+escS(u.ip_address||'—')+'</td>'+
      '<td style="font-size:11px;color:#5a5d72">'+ts(u.created_at)+'</td>'+
      '<td style="font-size:11px;color:#5a5d72">'+ts(u.last_seen)+'</td>'+
      '<td>'+actions+'</td></tr>';
  }).join('') : '<tr><td colspan="8" style="text-align:center;color:#5a5d72;padding:28px">No users registered</td></tr>';

  const lastUpdated = 'Last updated '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>LocalChat Admin</title>
<meta name="referrer" content="no-referrer"/>
<style>
:root {
  --bg:#0d0e14; --surface:#12131a; --surface2:#1a1b25; --surface3:#22243280;
  --border:#ffffff12; --border2:#ffffff20;
  --accent:#6366f1; --accent2:#818cf8; --accent-glow:#6366f140;
  --green:#22c55e; --yellow:#f59e0b; --red:#ef4444; --blue:#38bdf8;
  --text:#f1f2f7; --muted:#a0a3b1; --dimmed:#5a5d72;
  --radius:10px; --radius-lg:16px;
  font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
  font-size:14px; color:var(--text); background:var(--bg);
}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;padding:0}
a{color:var(--accent2);text-decoration:none}

/* ── Sidebar layout ── */
.layout{display:flex;min-height:100vh}
.sidebar{width:220px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);
  display:flex;flex-direction:column;padding:24px 0;position:sticky;top:0;height:100vh}
.main{flex:1;padding:28px;overflow:auto;min-width:0}

.logo{padding:0 20px 20px;border-bottom:1px solid var(--border);margin-bottom:20px}
.logo h1{font-size:18px;font-weight:800;letter-spacing:-0.5px}
.logo h1 span{color:var(--accent2)}
.logo .badge{display:inline-flex;align-items:center;gap:5px;margin-top:6px;
  background:#22c55e14;border:1px solid #22c55e30;color:var(--green);
  border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600}
.badge::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--green);
  animation:pulse 2s infinite}

nav a{display:flex;align-items:center;gap:10px;padding:10px 20px;font-size:13px;
  font-weight:500;color:var(--muted);transition:all .15s;cursor:pointer;
  border-left:3px solid transparent;text-decoration:none}
nav a:hover{color:var(--text);background:var(--surface2)}
nav a.active{color:var(--accent2);background:#6366f10e;border-left-color:var(--accent2)}
nav a .icon{font-size:16px;width:20px;text-align:center}

.sidebar-footer{margin-top:auto;padding:16px 20px;border-top:1px solid var(--border);
  font-size:11px;color:var(--dimmed)}
.refresh-btn{background:transparent;border:1px solid var(--border2);color:var(--muted);
  padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;transition:all .15s;width:100%;margin-top:8px}
.refresh-btn:hover{background:var(--surface2);color:var(--text)}

/* ── Tabs (hidden; controlled by JS) ── */
.tab-panel{display:none}.tab-panel.active{display:block}

/* ── Stat tiles ── */
.tiles{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:24px}
.tile{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:18px 20px;display:flex;flex-direction:column;gap:5px;
  transition:transform .2s,box-shadow .2s;cursor:default}
.tile:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.4)}
.tile-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--dimmed)}
.tile-value{font-size:28px;font-weight:800;letter-spacing:-1px;line-height:1;
  animation:countUp .4s ease}
.tile-sub{font-size:11px;color:var(--muted)}
.tile.green{border-color:#22c55e28;background:#22c55e06}.tile.green .tile-value{color:var(--green)}
.tile.accent{border-color:#6366f128;background:#6366f106}.tile.accent .tile-value{color:var(--accent2)}
.tile.yellow{border-color:#f59e0b28;background:#f59e0b06}.tile.yellow .tile-value{color:var(--yellow)}
.tile.red{border-color:#ef444428;background:#ef444406}.tile.red .tile-value{color:var(--red)}
.tile.blue{border-color:#38bdf828;background:#38bdf806}.tile.blue .tile-value{color:var(--blue)}

@keyframes countUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* ── Cards ── */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:22px}
.card-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
  color:var(--dimmed);margin-bottom:18px;display:flex;align-items:center;gap:8px}
.card-title .dot{width:6px;height:6px;border-radius:50%;background:var(--accent);
  animation:pulse 2s infinite}

/* ── Grid ── */
.grid2{display:grid;gap:16px;grid-template-columns:1fr 1fr;margin-bottom:20px}
.grid3{display:grid;gap:16px;grid-template-columns:1fr 1fr 1fr;margin-bottom:20px}
@media(max-width:1100px){.grid3{grid-template-columns:1fr 1fr}}
@media(max-width:800px){.grid2,.grid3{grid-template-columns:1fr}.sidebar{width:180px}}
@media(max-width:600px){.layout{flex-direction:column}.sidebar{width:100%;height:auto;position:static}
  .main{padding:16px}}

/* ── SVG charts ── */
.chart-wrap{width:100%;overflow:hidden}
.chart-wrap svg{width:100%;display:block}
.empty{text-align:center;color:var(--dimmed);padding:28px 0;font-size:13px}

/* ── Horizontal bars ── */
.hbar-row{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.hbar-label{font-size:12px;color:var(--muted);width:90px;flex-shrink:0;
  text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hbar-track{flex:1;height:8px;background:var(--surface2);border-radius:4px;overflow:hidden}
.hbar-fill{height:100%;border-radius:4px;transition:width .6s cubic-bezier(.34,1.56,.64,1)}
.hbar-count{font-size:12px;color:var(--dimmed);width:36px;text-align:right;flex-shrink:0}

/* ── Tables ── */
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;
  letter-spacing:.06em;color:var(--dimmed);padding:0 8px 10px 0;border-bottom:1px solid var(--border)}
.tbl td{padding:10px 8px 10px 0;border-bottom:1px solid #ffffff06;color:var(--muted);vertical-align:middle}
.tbl td:first-child{color:var(--text);font-weight:500}
.tbl tr:last-child td{border-bottom:none}
.tbl tr{transition:background .1s}
.tbl tr:hover td{background:#ffffff03}

/* ── Pills & badges ── */
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
.pill-green{background:#22c55e18;color:var(--green)}
.pill-red{background:#ef444418;color:var(--red)}
.pill-yellow{background:#f59e0b18;color:var(--yellow)}
.pill-blue{background:#38bdf818;color:var(--blue)}
.pill-muted{background:var(--surface2);color:var(--dimmed)}
.pill-accent{background:#6366f118;color:var(--accent2)}

/* ── Action buttons ── */
.btn{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:6px;
  font-size:12px;font-weight:600;border:none;cursor:pointer;transition:all .15s}
.btn-kick{background:#f59e0b18;color:var(--yellow)}.btn-kick:hover{background:#f59e0b28}
.btn-ban{background:#ef444418;color:var(--red)}.btn-ban:hover{background:#ef444428}
.btn-unban{background:#22c55e18;color:var(--green)}.btn-unban:hover{background:#22c55e28}
.btn-delete{background:#ef444408;color:#ef444488;border:1px solid #ef444428}
.btn-delete:hover{background:#ef444428;color:var(--red)}
.btn-view{background:var(--surface2);color:var(--muted)}.btn-view:hover{color:var(--text)}
.btn-actions{display:flex;gap:5px;flex-wrap:wrap}

/* ── Search ── */
.search-row{display:flex;gap:10px;margin-bottom:16px;align-items:center}
.search-input{flex:1;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;
  padding:8px 14px;font-size:13px;color:var(--text);outline:none;transition:border .15s}
.search-input:focus{border-color:var(--accent)}
.search-input::placeholder{color:var(--dimmed)}

/* ── Modal ── */
.modal-overlay{position:fixed;inset:0;background:#00000088;display:flex;align-items:center;
  justify-content:center;z-index:1000;animation:fadeIn .15s}
.modal{background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius-lg);
  padding:28px;max-width:420px;width:90%;animation:slideIn .2s}
.modal h3{font-size:16px;font-weight:700;margin-bottom:8px}
.modal p{color:var(--muted);font-size:13px;margin-bottom:16px;line-height:1.5}
.modal-actions{display:flex;gap:10px;justify-content:flex-end}
.modal-cancel{background:var(--surface2);border:none;color:var(--muted);padding:8px 16px;
  border-radius:8px;cursor:pointer;font-size:13px;font-weight:600}
.modal-confirm{background:var(--red);border:none;color:#fff;padding:8px 16px;
  border-radius:8px;cursor:pointer;font-size:13px;font-weight:600}
.modal-confirm:hover{background:#dc2626}
.modal-input{width:100%;background:var(--surface2);border:1px solid var(--border2);
  border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;outline:none;margin-bottom:16px}
.modal-input:focus{border-color:var(--accent)}

/* ── Avatar ── */
.uavatar{width:28px;height:28px;border-radius:50%;object-fit:cover;background:var(--surface2);
  flex-shrink:0;border:1px solid var(--border)}
.user-cell{display:flex;align-items:center;gap:8px}
.user-initials{width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;
  font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}

/* ── Info rows ── */
.info-row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;
  border-bottom:1px solid #ffffff06}
.info-row:last-child{border-bottom:none}
.info-key{font-size:12px;color:var(--muted)}
.info-val{font-size:12px;font-weight:600;color:var(--text);font-family:monospace}

/* ── Section title ── */
.section-h{font-size:13px;font-weight:700;color:var(--text);margin-bottom:16px;margin-top:28px;
  display:flex;align-items:center;gap:10px}
.section-h::after{content:'';flex:1;height:1px;background:var(--border)}
.section-h:first-child{margin-top:0}

/* ── Misc ── */
.mono{font-family:ui-monospace,'Cascadia Code',monospace;font-size:11px}
.ts{font-size:11px;color:var(--dimmed)}
.room-id{font-family:monospace;font-size:11px;color:var(--muted);max-width:200px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.page-title{font-size:20px;font-weight:800;margin-bottom:4px;letter-spacing:-.5px}
.page-sub{font-size:13px;color:var(--muted);margin-bottom:24px}

/* ── Toast ── */
.toast{position:fixed;bottom:24px;right:24px;background:var(--surface);border:1px solid var(--border2);
  border-radius:10px;padding:12px 18px;font-size:13px;font-weight:500;z-index:2000;
  animation:toastIn .3s;display:flex;align-items:center;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,.5)}
.toast.success{border-color:#22c55e40;color:var(--green)}
.toast.error{border-color:#ef444440;color:var(--red)}
@keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideIn{from{opacity:0;transform:translateY(-10px)scale(.97)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* ── Scrollbar ── */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--surface2);border-radius:3px}
</style>
</head>
<body>

<div class="layout">

<!-- ── Sidebar ── -->
<div class="sidebar">
  <div class="logo">
    <h1>Local<span>Chat</span></h1>
    <div class="badge">Live</div>
  </div>
  <nav>
    <a class="active" data-tab="overview"><span class="icon">📊</span>Overview</a>
    <a data-tab="users"><span class="icon">👥</span>Users</a>
    <a data-tab="traffic"><span class="icon">🌐</span>Traffic</a>
    <a data-tab="system"><span class="icon">⚙️</span>System</a>
  </nav>
  <div class="sidebar-footer">
    Auto-refresh: <span id="countdown" style="color:var(--accent2);font-weight:700">10</span>s
    <button class="refresh-btn" onclick="location.reload()">↺ Refresh now</button>
  </div>
</div>

<!-- ── Main content ── -->
<div class="main">

<!-- ═══════════════════ OVERVIEW ═══════════════════ -->
<div class="tab-panel active" id="tab-overview">
  <div class="page-title">Dashboard</div>
  <div class="page-sub">${lastUpdated}</div>

  <!-- Stat tiles (server-rendered) -->
  <div class="tiles">${tiles}</div>

  <!-- Charts row (server-rendered SVG) -->
  <div class="grid2">
    <div class="card">
      <div class="card-title"><span class="dot"></span>Messages — last 24 hours</div>
      <div class="chart-wrap">${hourlyChart}</div>
    </div>
    <div class="card">
      <div class="card-title"><span class="dot"></span>Messages — last 7 days</div>
      <div class="chart-wrap">${dailyChart}</div>
    </div>
  </div>

  <!-- Top senders + Top rooms (server-rendered) -->
  <div class="grid2">
    <div class="card">
      <div class="card-title">🏆 Top Senders</div>
      <div>${topSenders}</div>
    </div>
    <div class="card">
      <div class="card-title">💬 Top Rooms</div>
      <div>${topRooms}</div>
    </div>
  </div>
</div>

<!-- ═══════════════════ USERS ═══════════════════ -->
<div class="tab-panel" id="tab-users">
  <div class="page-title">User Management</div>
  <div class="page-sub">Ban, kick, or delete users. One registration per device is enforced.</div>

  <div class="search-row">
    <input class="search-input" id="user-search" placeholder="🔍  Search by name, IP, or ID…"/>
    <span id="user-count" style="font-size:12px;color:var(--dimmed);white-space:nowrap"></span>
  </div>

  <div class="card" style="padding:0;overflow:hidden">
    <div style="overflow-x:auto">
      <table class="tbl" id="users-tbl" style="min-width:700px">
        <thead><tr>
          <th style="padding-left:16px">User</th>
          <th>Status</th>
          <th>Messages</th>
          <th>Email</th>
          <th>IP</th>
          <th>Joined</th>
          <th>Last seen</th>
          <th>Actions</th>
        </tr></thead>
        <tbody id="users-tbody">${userRows}</tbody>
      </table>
    </div>
  </div>
</div>

<!-- ═══════════════════ TRAFFIC ═══════════════════ -->
<div class="tab-panel" id="tab-traffic">
  <div class="page-title">Live Traffic</div>
  <div class="page-sub">Real-time WebSocket connections and room activity.</div>

  <div class="grid2">
    <div class="card">
      <div class="card-title"><span class="dot"></span>Active Connections</div>
      <table class="tbl" style="width:100%"><thead><tr><th>User ID</th><th>Socket</th><th>Rooms</th><th>Since</th></tr></thead>
      <tbody>${sessionRows}</tbody></table>
    </div>
    <div class="card">
      <div class="card-title">📡 Top Rooms by Volume</div>
      <table class="tbl" style="width:100%"><thead><tr><th>Room</th><th>Type</th><th>Messages</th></tr></thead>
      <tbody>${trafficRoomRows}</tbody></table>
    </div>
  </div>

  <div class="card">
    <div class="card-title">📈 Hourly Traffic — last 24h</div>
    <div class="chart-wrap">${hourlyChart}</div>
  </div>
</div>

<!-- ═══════════════════ SYSTEM ═══════════════════ -->
<div class="tab-panel" id="tab-system">
  <div class="page-title">System Info</div>
  <div class="page-sub">Server runtime, database and storage details.</div>

  <div class="grid3">
    <div class="card">
      <div class="card-title">🖥 Server</div>
      <div>${sysServer}</div>
    </div>
    <div class="card">
      <div class="card-title">🗄 Database</div>
      <div>${sysDB}</div>
    </div>
    <div class="card">
      <div class="card-title">💾 Memory &amp; Uploads</div>
      <div>${sysMem}</div>
    </div>
  </div>
</div>

</div><!-- /main -->
</div><!-- /layout -->

<!-- ── Modal ── -->
<div class="modal-overlay" id="modal" style="display:none" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <h3 id="modal-title"></h3>
    <p id="modal-body"></p>
    <input class="modal-input" id="modal-input" placeholder="Reason (optional)" style="display:none"/>
    <div class="modal-actions">
      <button class="modal-cancel" onclick="closeModal()">Cancel</button>
      <button class="modal-confirm" id="modal-confirm-btn">Confirm</button>
    </div>
  </div>
</div>

<style>
.abtn{display:inline-flex;align-items:center;gap:4px;padding:5px 9px;border-radius:6px;
  font-size:12px;font-weight:600;border:none;cursor:pointer;transition:all .15s}
.abtn.kick{background:#f59e0b18;color:#f59e0b}.abtn.kick:hover{background:#f59e0b28}
.abtn.ban{background:#ef444418;color:#ef4444}.abtn.ban:hover{background:#ef444428}
.abtn.unban{background:#22c55e18;color:#22c55e}.abtn.unban:hover{background:#22c55e28}
.abtn.del{background:#ef444408;color:#ef444488;border:1px solid #ef444420}.abtn.del:hover{background:#ef444428;color:#ef4444}
</style>
<script>
// ── Tabs ──
document.querySelectorAll('nav a[data-tab]').forEach(a => {
  a.addEventListener('click', () => {
    document.querySelectorAll('nav a').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
    document.getElementById('tab-' + a.dataset.tab).classList.add('active');
  });
});

// ── Search filter ──
document.getElementById('user-search').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll('#users-tbody tr').forEach(tr => {
    const show = !q || tr.dataset.name.includes(q) || tr.dataset.ip.includes(q) || tr.dataset.id.includes(q) || (tr.dataset.email||'').includes(q);
    tr.style.display = show ? '' : 'none';
  });
});

// ── Toast ──
function showToast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast ' + (type||'success');
  t.textContent = (type==='error' ? '✕ ' : '✓ ') + msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── User actions ──
async function doAction(action, id, name) {
  const confirmMsgs = {
    ban: 'Ban "'+name+'"? Enter a reason (optional):',
    unban: 'Unban "'+name+'"?',
    kick: 'Kick "'+name+'" now?',
    delete: 'DELETE "'+name+'" permanently? This cannot be undone.',
  };
  if (action === 'ban') {
    const reason = prompt(confirmMsgs.ban) ?? null;
    if (reason === null) return;
    await fetch('/admin/api/users/'+id+'/ban', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason})});
  } else if (action === 'unban') {
    if (!confirm(confirmMsgs.unban)) return;
    await fetch('/admin/api/users/'+id+'/unban', {method:'POST'});
  } else if (action === 'kick') {
    if (!confirm(confirmMsgs.kick)) return;
    await fetch('/admin/api/users/'+id+'/kick', {method:'POST'});
  } else if (action === 'delete') {
    if (!confirm(confirmMsgs.delete)) return;
    await fetch('/admin/api/users/'+id, {method:'DELETE'});
  }
  showToast(name + ' — ' + action + ' done');
  setTimeout(() => location.reload(), 600);
}

// ── Auto-refresh (full page reload keeps SSR data fresh) ──
let remaining = 20;
const cd = document.getElementById('countdown');
setInterval(() => { cd.textContent = --remaining; if (remaining <= 0) location.reload(); }, 1000);

// Stub (kept so modal close works if modal HTML still present)
function closeModal() { const m=document.getElementById('modal'); if(m) m.style.display='none'; }


</script>
</body>
</html>`);
});

module.exports = router;
