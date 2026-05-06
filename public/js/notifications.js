/**
 * Enhanced Notification System with Real-time Support
 * Handles both local notifications and WebSocket-based real-time notifications
 *
 * ── Architecture ──
 *   • Toast banners — ephemeral slide-in/out alerts for instant feedback
 *   • Bell feed     — persistent, API-backed scrollable dropdown
 *     - Storage lives in MongoDB (Notification model)
 *     - GET  /api/notifications        → fetch feed
 *     - POST /api/notifications/:id/read → mark one read
 *     - POST /api/notifications/read-all → mark all read
 *     - DELETE /api/notifications/clear  → wipe feed
 *   • Socket.IO pushes arrive in real-time and prepend to the feed
 */

// Initialize Socket.IO connection
let socket = null;
let currentUser = null;

// Initialize notification system
function initNotifications() {
  if (typeof io === 'undefined') {
    console.warn('Socket.io is not loaded on this page. Real-time notifications disabled.');
    return;
  }

  if (!socket || socket.disconnected) {
    socket = io();

    socket.on('connect', () => {
      console.log('🔌 Connected to real-time notifications');
      if (currentUser && currentUser.id) {
        socket.emit('join-room', currentUser.id);
        socket.emit('user-login', {
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          profilePicture: currentUser.profilePicture || null
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('📡 Disconnected from real-time notifications');
    });

    // Real-time notifications: show toast AND add to persistent feed
    socket.on('notification', (data) => {
      showNotification(data.message, data.type, data.title);
      notifBell.addFromSocket(data);
    });

    socket.on('active-users-update', (data) => {
      updateActiveUsersDisplay(data);
    });

    socket.on('badge-counts-update', (counts) => {
      if (typeof window.applyBadgeCounts === 'function') {
        window.applyBadgeCounts(counts);
      }
    });

    socket.on('force-logout', () => {
      showNotification('Your account has been removed by an administrator.', 'error', 'Account Deleted');
      setTimeout(() => { window.location.href = '/login'; }, 2500);
    });
  }
}

// Set current user (call this when user logs in)
function setCurrentUser(user) {
  currentUser = user;
  notifBell.setUser(user && user.id ? user.id : null);
  if (socket && socket.connected) {
    socket.emit('join-room', user.id);
    socket.emit('user-login', {
      id: user.id,
      name: user.name,
      role: user.role,
      profilePicture: user.profilePicture || null
    });
  }
}

/** Normalize event targets (pointer events may target Text nodes). */
function eventTargetElement(ev) {
  const n = ev && ev.target;
  if (!n) return null;
  if (n.nodeType === 1) return n;
  if (n.nodeType === 3 && n.parentElement) return n.parentElement;
  return n.parentElement || null;
}

// ─── Toast banner (ephemeral) ────────────────────────────────────

function showNotification(message, type = 'info', title = null) {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.setAttribute('title', 'Click to dismiss');

  const content = document.createElement('div');
  content.style.display = 'flex';
  content.style.alignItems = 'center';
  content.style.gap = '12px';

  const messageDiv = document.createElement('div');
  if (title) {
    messageDiv.innerHTML = `<strong>${title}</strong><br>${message}`;
  } else {
    messageDiv.textContent = message;
  }

  content.appendChild(messageDiv);
  notification.appendChild(content);

  // Tap/click to dismiss
  notification.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    hideNotification(notification, true);
  }, true);

  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 100);
  setTimeout(() => hideNotification(notification), 5000);
}

function hideNotification(notification, instant) {
  if (!notification || !notification.parentNode) return;
  if (instant) { notification.remove(); return; }
  notification.classList.remove('show');
  setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300);
}

// ─── Active users display ────────────────────────────────────────

function updateActiveUsersDisplay(data) {
  const activeUsersElement = document.getElementById('activeUsersCount');
  const activeUsersListElement = document.getElementById('activeUsersList');

  if (activeUsersElement) activeUsersElement.textContent = data.count;

  if (activeUsersListElement && data.users) {
    activeUsersListElement.innerHTML = '';
    if (data.users.length === 0) {
      activeUsersListElement.innerHTML = '<div class="text-muted">No active users</div>';
    } else {
      data.users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: rgba(59,130,246,0.02); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 8px; transition: all 0.2s ease;';

        const avatarUrl = user.profilePicture ? (user.profilePicture.startsWith('http') ? user.profilePicture : `/${user.profilePicture}`) : null;
        const initials = (user.name || '?').split(' ').filter(Boolean).map(n => n[0].toUpperCase()).slice(0, 2).join('') || '?';

        userElement.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="position: relative; width: 40px; height: 40px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 2px solid var(--primary); background: linear-gradient(135deg, var(--panel-hover), var(--panel)); display: flex; align-items: center; justify-content: center;">
              ${avatarUrl
                ? `<img src="${avatarUrl}" alt="${user.name}" style="width: 100%; height: 100%; object-fit: cover;" />`
                : `<span style="font-size: 0.9rem; color: var(--muted); font-weight: 600;">${initials}</span>`}
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px; align-items: flex-start;">
              <strong style="color: var(--text); font-size: 0.95rem;">${user.name}</strong>
              <span class="badge ${user.role.toLowerCase()}" style="font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; letter-spacing: 0.5px;">${user.role}</span>
            </div>
          </div>
          <div class="text-muted" style="font-size: 0.85rem; font-weight: 500; display: flex; align-items: center;">
            <span style="color: #10b981; display: flex; align-items: center; gap: 4px;">
              <span style="width: 6px; height: 6px; background: #10b981; border-radius: 50%; display: inline-block; box-shadow: 0 0 8px rgba(16,185,129,0.8);"></span>
              Active now
            </span>
          </div>
        `;
        activeUsersListElement.appendChild(userElement);
      });
    }
  }
}

// ─── Form validation helpers ─────────────────────────────────────

function validateForm(form) {
  const inputs = form.querySelectorAll('input[required], textarea[required], select[required]');
  let isValid = true;
  inputs.forEach(input => {
    clearValidation(input);
    if (!input.value.trim()) {
      showFieldError(input, 'This field is required');
      isValid = false;
    } else if (input.type === 'email' && !isValidEmail(input.value)) {
      showFieldError(input, 'Please enter a valid email address');
      isValid = false;
    } else if (input.type === 'url' && !isValidUrl(input.value)) {
      showFieldError(input, 'Please enter a valid URL');
      isValid = false;
    } else {
      showFieldSuccess(input);
    }
  });
  return isValid;
}

function showFieldError(input, message) {
  input.classList.add('error');
  input.classList.remove('success');
  let errorElement = input.parentNode.querySelector('.error-message');
  if (!errorElement) {
    errorElement = document.createElement('span');
    errorElement.className = 'error-message';
    input.parentNode.appendChild(errorElement);
  }
  errorElement.textContent = message;
}

function showFieldSuccess(input) {
  input.classList.add('success');
  input.classList.remove('error');
  const errorElement = input.parentNode.querySelector('.error-message');
  if (errorElement) errorElement.remove();
}

function clearValidation(input) {
  input.classList.remove('error', 'success');
  const errorElement = input.parentNode.querySelector('.error-message');
  if (errorElement) errorElement.remove();
}

function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

function isValidUrl(url) {
  try { new URL(url); return url.startsWith('http://') || url.startsWith('https://'); }
  catch { return false; }
}

function setLoading(element, isLoading = true) {
  if (isLoading) { element.classList.add('loading'); element.disabled = true; }
  else { element.classList.remove('loading'); element.disabled = false; }
}

// ─── DOMContentLoaded bootstrap ──────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initNotifications();
  notifBell.init();

  // Auto-fetch session info so user-login is emitted on every page load
  fetch('/session-info')
    .then(r => r.json())
    .then(data => { if (data && data.user) setCurrentUser(data.user); })
    .catch(() => {});

  // Global form validation
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', (e) => {
      if (!validateForm(form)) {
        e.preventDefault();
        showNotification('Please fix the errors in the form', 'error');
      }
    });
  });

  // Real-time input validation
  document.querySelectorAll('input, textarea, select').forEach(input => {
    input.addEventListener('blur', () => {
      if (input.hasAttribute('required') && input.value.trim()) {
        if (input.type === 'email' && !isValidEmail(input.value)) {
          showFieldError(input, 'Please enter a valid email address');
        } else if (input.type === 'url' && !isValidUrl(input.value)) {
          showFieldError(input, 'Please enter a valid URL');
        } else {
          showFieldSuccess(input);
        }
      }
    });
    input.addEventListener('input', () => {
      if (input.classList.contains('error') && input.value.trim()) clearValidation(input);
    });
  });
});

// Legacy compatibility
window.showSuccess = (message) => showNotification(message, 'success');
window.showError   = (message) => showNotification(message, 'error');
window.showWarning = (message) => showNotification(message, 'warning');
window.showInfo    = (message) => showNotification(message, 'info');

window.showNotification = showNotification;
window.setCurrentUser = setCurrentUser;
window.updateActiveUsersDisplay = updateActiveUsersDisplay;
window.validateForm = validateForm;
window.setLoading = setLoading;
window.hideNotification = hideNotification;

/* ==============================================================
   Notification Bell — API-backed persistent feed
   ---------------------------------------------------------------
   Storage: MongoDB `notifications` collection via REST API
   - GET    /api/notifications          → fetch feed (newest first)
   - POST   /api/notifications/:id/read → mark single as read
   - POST   /api/notifications/read-all → mark all as read
   - DELETE  /api/notifications/clear    → wipe feed

   Real-time: Socket.IO 'notification' events prepend to the feed
   in-memory (and are already DB-persisted server-side).
   ============================================================== */
const notifBell = (() => {
  let userId = null;
  /** In-memory feed cache (avoids re-fetch on every render). */
  let feedCache = [];
  /** Prevents double-wiring if this script is included twice. */
  let bellDomWired = false;

  // Tiny HTML escape
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function timeAgo(iso) {
    try {
      const diff = (Date.now() - new Date(iso).getTime()) / 1000;
      if (diff < 60)    return 'just now';
      if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    } catch (e) { return ''; }
  }

  // ── API calls ──────────────────────────────────────────────────

  async function apiFetch() {
    try {
      const res = await fetch('/api/notifications', { credentials: 'same-origin' });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) { return []; }
  }

  async function apiMarkRead(id) {
    try { await fetch(`/api/notifications/${id}/read`, { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* silent */ }
  }

  async function apiMarkAllRead() {
    try { await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* silent */ }
  }

  async function apiClear() {
    try { await fetch('/api/notifications/clear', { method: 'DELETE', credentials: 'same-origin' }); } catch (e) { /* silent */ }
  }

  // ── Render ─────────────────────────────────────────────────────

  function render() {
    const list  = document.getElementById('notifPanelList');
    const empty = document.getElementById('notifPanelEmpty');
    const badge = document.getElementById('notifBellBadge');
    const btn   = document.getElementById('notifBellBtn');
    const clear = document.getElementById('notifClearAllBtn');
    if (!list || !empty || !badge || !btn) return;

    const items  = feedCache;
    const unread = items.filter(n => !n.read).length;

    if (unread > 0) {
      badge.hidden = false;
      badge.textContent = unread > 99 ? '99+' : String(unread);
      btn.classList.add('has-unread');
    } else {
      badge.hidden = true;
      btn.classList.remove('has-unread');
    }

    if (clear) clear.disabled = items.length === 0;

    if (items.length === 0) {
      list.innerHTML = '';
      list.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    list.style.display = '';
    empty.style.display = 'none';

    const ALLOWED = { success: 1, error: 1, warning: 1, info: 1 };
    list.innerHTML = items.map(n => {
      const safeType = ALLOWED[n.type] ? n.type : 'info';
      const ts = n.createdAt || n.timestamp;
      const titleHtml = n.title
        ? '<p class="notif-item-title">' + esc(n.title) + '</p>'
        : '';
      return (
        '<li class="notif-item ' + (n.read ? '' : 'unread') + '" data-id="' + esc(n._id || n.id) + '">' +
          '<span class="notif-item-accent ' + safeType + '" aria-hidden="true"></span>' +
          '<div>' +
            titleHtml +
            '<p class="notif-item-message">' + esc(n.message || '') + '</p>' +
            '<div class="notif-item-time">' + esc(timeAgo(ts)) + '</div>' +
          '</div>' +
        '</li>'
      );
    }).join('');
  }

  // ── Public API ─────────────────────────────────────────────────

  /** Fetch feed from server and re-render. */
  async function refresh() {
    if (!userId) return;
    feedCache = await apiFetch();
    render();
  }

  /** Called by the Socket.IO handler when a real-time notification arrives.
   *  The server already persisted it, so just prepend to the in-memory cache. */
  function addFromSocket(data) {
    if (!data || (!data.message && !data.title)) return;
    feedCache.unshift({
      _id:       data._id || ('tmp_' + Date.now()),
      title:     data.title   || '',
      message:   data.message || '',
      type:      data.type    || 'info',
      link:      data.link    || null,
      read:      false,
      createdAt: data.createdAt || data.timestamp || new Date().toISOString()
    });
    // Cap local cache at 50 items
    if (feedCache.length > 50) feedCache.length = 50;
    render();
  }

  async function markAllRead() {
    if (!feedCache.some(n => !n.read)) return;
    feedCache.forEach(n => { n.read = true; });
    render();
    await apiMarkAllRead();
  }

  async function clearAll() {
    feedCache = [];
    render();
    await apiClear();
  }

  function togglePanel(forceState) {
    const panel = document.getElementById('notifPanel');
    const btn   = document.getElementById('notifBellBtn');
    if (!panel || !btn) return;
    const isOpen   = panel.classList.contains('is-open');
    const newState = typeof forceState === 'boolean' ? forceState : !isOpen;
    if (newState) {
      // Mutual exclusion: close hamburger menu when notification panel opens
      if (window.navSetOpen) window.navSetOpen(false);
      panel.removeAttribute('hidden');
      void panel.offsetHeight;
      panel.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      markAllRead();
    } else {
      panel.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      setTimeout(() => {
        if (!panel.classList.contains('is-open')) panel.setAttribute('hidden', '');
      }, 200);
    }
  }

  // ── Init (wires DOM once) ──────────────────────────────────────

  function init() {
    const btn      = document.getElementById('notifBellBtn');
    const clearBtn = document.getElementById('notifClearAllBtn');
    if (!btn) return;         // Bell HTML isn't on the page (logged-out user)
    if (bellDomWired) return;
    bellDomWired = true;

    // ── Unified pointer handler (fixes Android Chrome) ──
    // Using pointerdown instead of click eliminates the 300ms tap delay
    // and avoids "ghost clicks" on Android WebView / Chrome.
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // only primary pointer
      e.preventDefault();
      e.stopPropagation();
      // Dismiss any active toast banner
      const toast = document.querySelector('.notification');
      if (toast) hideNotification(toast, true);
      togglePanel();
    });
    // Prevent the trailing click from also firing (double-toggle).
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });

    if (clearBtn) {
      clearBtn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        clearAll();
      });
      clearBtn.addEventListener('click', (e) => { e.stopPropagation(); });
    }

    // Outside click closes the panel.
    document.addEventListener('pointerdown', (e) => {
      const el = eventTargetElement(e);
      if (el && typeof el.closest === 'function' && el.closest('.notification')) return;
      const wrapper = document.getElementById('notifBellWrapper');
      const panel   = document.getElementById('notifPanel');
      if (!wrapper || !panel || !panel.classList.contains('is-open')) return;
      if (el && !wrapper.contains(el)) togglePanel(false);
    });

    // Esc closes the panel.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const toast = document.querySelector('.notification');
      if (toast) { e.preventDefault(); e.stopPropagation(); hideNotification(toast, true); return; }
      const panel = document.getElementById('notifPanel');
      if (!panel || !panel.classList.contains('is-open')) return;
      e.stopPropagation();
      togglePanel(false);
    }, true);

    // Periodically re-render so the "Xm ago" timestamps stay accurate.
    setInterval(render, 60_000);

    render();
  }

  function setUser(id) {
    if (id === userId) return;
    userId = id;
    if (!userId) {
      feedCache = [];
      render();
      return;
    }
    // Initial fetch from server
    refresh();
  }

  return { init, setUser, addFromSocket, refresh, render, markAllRead, clearAll, togglePanel };
})();

window.notifBell = notifBell;