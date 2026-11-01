/* =================================================
   AppTrack – Application Logic
   =================================================
   Features:
   - LocalStorage persistence
   - Kanban board with drag-and-drop
   - Table view with multi-column sorting
   - Analytics & Funnel Dashboard
   - Automatic company logos with gradient avatar fallback
   - Follow-up & deadline alert banner
   - JSON & CSV Import with merge/replace modal
   - JSON & CSV Export (Excel compatible)
   - Search across company, role, location
   - Keyboard shortcuts & Toast notifications
   ================================================= */

// ─── State ───────────────────────────────────────
let applications = [];
let currentView = 'kanban';
let currentFilter = 'all';
let searchQuery = '';
let sortKey = null;
let sortDir = 1;
let editingId = null;
let pendingDeleteId = null;
let draggedId = null;
let pendingImportData = null;
let alertBannerDismissed = false;

// ─── Sample seed data (first run only) ──────────
const SEED_DATA = [
  {
    id: genId(), company: 'Google', role: 'Software Engineer Intern',
    type: 'internship', status: 'interview', dateApplied: '2026-10-01',
    followUp: '2026-11-05', location: 'Mountain View, CA', salary: '$48/hr',
    link: 'https://careers.google.com', notes: 'Phone screen done. Waiting for technical round.',
    createdAt: Date.now() - 86400000 * 30
  },
  {
    id: genId(), company: 'Meta', role: 'Product Design Intern',
    type: 'internship', status: 'applied', dateApplied: '2026-10-10',
    followUp: '2026-11-01', location: 'Menlo Park, CA', salary: '$45/hr',
    link: 'https://metacareers.com', notes: 'Applied via LinkedIn. Follow-up today.',
    createdAt: Date.now() - 86400000 * 20
  },
  {
    id: genId(), company: 'Stripe', role: 'Backend Engineer Intern',
    type: 'internship', status: 'offer', dateApplied: '2026-09-15',
    followUp: '', location: 'Remote', salary: '$52/hr',
    link: 'https://stripe.com/jobs', notes: 'Offer received! Deciding deadline Nov 15.',
    createdAt: Date.now() - 86400000 * 45
  },
  {
    id: genId(), company: 'Amazon', role: 'SDE Intern',
    type: 'internship', status: 'rejected', dateApplied: '2026-09-20',
    followUp: '', location: 'Seattle, WA', salary: '$50/hr',
    link: 'https://amazon.jobs', notes: 'Received rejection after OA.',
    createdAt: Date.now() - 86400000 * 40
  },
  {
    id: genId(), company: 'Figma', role: 'Design Engineering Intern',
    type: 'internship', status: 'applied', dateApplied: '2026-10-18',
    followUp: '2026-10-28', location: 'San Francisco, CA', salary: '$44/hr',
    link: 'https://figma.com/careers', notes: 'Portfolio submitted. Overdue for email follow-up.',
    createdAt: Date.now() - 86400000 * 14
  },
  {
    id: genId(), company: 'Vercel', role: 'Frontend Engineer',
    type: 'full-time', status: 'applied', dateApplied: '2026-10-22',
    followUp: '', location: 'Remote', salary: '$140k',
    link: 'https://vercel.com/careers', notes: 'Dream job. Fingers crossed!',
    createdAt: Date.now() - 86400000 * 8
  }
];

// ─── Utilities ───────────────────────────────────
function genId() {
  return '_' + Math.random().toString(36).slice(2, 11);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function daysSince(dateStr) {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr + 'T00:00:00').getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatType(type) {
  const map = {
    internship: 'Internship',
    'full-time': 'Full-time',
    'part-time': 'Part-time',
    contract: 'Contract',
    'co-op': 'Co-op'
  };
  return map[type] || 'Internship';
}

function statusLabel(status) {
  const map = {
    applied: 'Applied',
    interview: 'Interviewing',
    offer: 'Offer',
    rejected: 'Rejected'
  };
  return map[status] || status;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Storage ─────────────────────────────────────
function save() {
  localStorage.setItem('apptrack_data', JSON.stringify(applications));
}

function load() {
  const raw = localStorage.getItem('apptrack_data');
  if (raw) {
    try {
      applications = JSON.parse(raw);
    } catch {
      applications = [];
    }
  } else {
    applications = SEED_DATA;
    save();
  }
}

// ─── Company Logos & Avatars ─────────────────────
const AVATAR_PALETTES = [
  'linear-gradient(135deg, #6366f1, #a855f7)',
  'linear-gradient(135deg, #3b82f6, #06b6d4)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #ec4899, #f43f5e)',
  'linear-gradient(135deg, #8b5cf6, #d946ef)',
  'linear-gradient(135deg, #14b8a6, #0284c7)'
];

function getCompanyColor(name) {
  if (!name) return AVATAR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function getCompanyInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getCompanyDomain(company, link) {
  if (link) {
    try {
      const url = new URL(link);
      return url.hostname.replace(/^www\./, '');
    } catch {}
  }
  const clean = (company || '').toLowerCase().trim()
    .replace(/\s+(inc|llc|corp|ltd|co|technologies|tech|interactive)\.?$/i, '')
    .replace(/[^a-z0-9]/g, '');
  return clean ? `${clean}.com` : '';
}

function renderCompanyBadge(company, link, isSmall = false) {
  const domain = getCompanyDomain(company, link);
  const logoUrl = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '';
  const initials = escHtml(getCompanyInitials(company));
  const bg = getCompanyColor(company);
  const sizeCls = isSmall ? 'badge-sm' : '';

  return `
    <div class="company-badge ${sizeCls}">
      ${logoUrl ? `<img class="company-logo-img" src="${logoUrl}" alt="${escHtml(company)}" loading="lazy" onload="this.style.opacity='1'" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
      <span class="company-avatar-fallback" style="background:${bg}; ${logoUrl ? 'display:none;' : ''}">${initials}</span>
    </div>
  `;
}

// ─── Follow-up Alert Banner ──────────────────────
function renderAlertBanner() {
  const banner = document.getElementById('alert-banner');
  if (!banner) return;

  if (alertBannerDismissed) {
    banner.style.display = 'none';
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const overdueApps = applications.filter(a => a.followUp && a.followUp < todayStr && a.status !== 'rejected' && a.status !== 'offer');
  const todayApps = applications.filter(a => a.followUp && a.followUp === todayStr && a.status !== 'rejected');

  if (overdueApps.length === 0 && todayApps.length === 0) {
    banner.style.display = 'none';
    return;
  }

  const alertText = document.getElementById('alert-text');
  const alertIcon = document.getElementById('alert-icon');
  const messages = [];

  if (overdueApps.length > 0) {
    alertIcon.textContent = '⚠️';
    banner.classList.add('banner-warning');
    const names = overdueApps.slice(0, 3).map(a => `<strong>${escHtml(a.company)}</strong>`).join(', ');
    const extra = overdueApps.length > 3 ? ` +${overdueApps.length - 3} more` : '';
    messages.push(`<span>${overdueApps.length} overdue follow-up${overdueApps.length > 1 ? 's' : ''}: ${names}${extra}</span>`);
  }

  if (todayApps.length > 0) {
    if (overdueApps.length === 0) {
      alertIcon.textContent = '⏰';
      banner.classList.remove('banner-warning');
    }
    const names = todayApps.slice(0, 3).map(a => `<strong>${escHtml(a.company)}</strong>`).join(', ');
    const extra = todayApps.length > 3 ? ` +${todayApps.length - 3} more` : '';
    messages.push(`<span>Due today: ${names}${extra}</span>`);
  }

  alertText.innerHTML = messages.join(' <span class="banner-sep">·</span> ');
  banner.style.display = 'flex';
}

function focusFollowUps() {
  switchView('table');
  sortKey = 'followUp';
  sortDir = 1;
  renderTable();
  showToast('🔍 Showing applications sorted by follow-up date');
}

function dismissAlert() {
  alertBannerDismissed = true;
  const banner = document.getElementById('alert-banner');
  if (banner) banner.style.display = 'none';
}

// ─── Stats ───────────────────────────────────────
function calcStats() {
  const total = applications.length;
  const interviews = applications.filter(a => a.status === 'interview').length;
  const offers = applications.filter(a => a.status === 'offer').length;
  const rejected = applications.filter(a => a.status === 'rejected').length;
  const responded = interviews + offers + rejected;
  const responseRate = total ? Math.round((responded / total) * 100) : 0;
  const offerRate = total ? Math.round((offers / total) * 100) : 0;

  animateNumber('stat-card-total', total);
  animateNumber('stat-card-interview', interviews);
  animateNumber('stat-card-offer', offers);
  
  const respEl = document.getElementById('stat-card-response');
  if (respEl) respEl.textContent = responseRate + '%';

  // Sidebar mini stats
  const stTotal = document.getElementById('stat-total');
  const stResp = document.getElementById('stat-response');
  const stOffer = document.getElementById('stat-offer-rate');
  if (stTotal) stTotal.textContent = total;
  if (stResp) stResp.textContent = responseRate + '%';
  if (stOffer) stOffer.textContent = offerRate + '%';
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const diff = target - start;
  if (diff === 0) return;
  const steps = 20;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    el.textContent = Math.round(start + (diff * step / steps));
    if (step >= steps) clearInterval(timer);
  }, 15);
}

// ─── Filter & Search ─────────────────────────────
function getFilteredApps() {
  let apps = [...applications];
  if (currentFilter !== 'all') {
    apps = apps.filter(a => a.status === currentFilter);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    apps = apps.filter(a =>
      a.company.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q) ||
      (a.location || '').toLowerCase().includes(q)
    );
  }
  return apps;
}

function getAppsByStatus(status) {
  return getFilteredApps().filter(a => a.status === status);
}

// ─── Kanban Render ───────────────────────────────
function renderKanban() {
  const statuses = ['applied', 'interview', 'offer', 'rejected'];
  statuses.forEach(status => {
    const container = document.getElementById('cards-' + status);
    const countEl = document.getElementById('count-' + status);
    const emptyEl = document.getElementById('empty-' + status);
    if (!container || !countEl || !emptyEl) return;

    const apps = getAppsByStatus(status);
    countEl.textContent = apps.length;

    // Remove old cards (keep empty hint)
    const existingCards = container.querySelectorAll('.kanban-card');
    existingCards.forEach(c => c.remove());

    if (apps.length === 0) {
      emptyEl.classList.add('visible');
    } else {
      emptyEl.classList.remove('visible');
      apps.forEach(app => {
        container.appendChild(buildKanbanCard(app));
      });
    }
  });
}

function buildKanbanCard(app) {
  const card = document.createElement('div');
  card.className = 'kanban-card';
  card.dataset.id = app.id;
  card.draggable = true;

  card.addEventListener('dragstart', e => {
    draggedId = app.id;
    setTimeout(() => card.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedId = null;
    document.querySelectorAll('.column-body').forEach(col => col.classList.remove('drag-over'));
  });

  const days = daysSince(app.dateApplied);
  const hasFollowUp = !!app.followUp;
  const overdue = isOverdue(app.followUp);
  const typeCls = 'type-' + (app.type || 'internship');

  card.innerHTML = `
    <div class="card-top">
      <div class="card-company-header">
        ${renderCompanyBadge(app.company, app.link)}
        <div class="card-company" title="${escHtml(app.company)}">${escHtml(app.company)}</div>
      </div>
      <div class="card-actions">
        <button class="card-action-btn" onclick="openModal(null,'${app.id}')" title="Edit" aria-label="Edit ${escHtml(app.company)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="card-action-btn del" onclick="deleteApp('${app.id}','${escHtml(app.company)}')" title="Delete" aria-label="Delete ${escHtml(app.company)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>
    <div class="card-role">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
      ${escHtml(app.role)}
    </div>
    <div class="card-meta">
      <span class="type-badge ${typeCls}">${formatType(app.type)}</span>
      ${app.location ? `<span class="meta-tag">📍 ${escHtml(app.location)}</span>` : ''}
      ${app.salary ? `<span class="meta-tag">💰 ${escHtml(app.salary)}</span>` : ''}
    </div>
    ${app.notes ? `<div class="card-notes" title="${escHtml(app.notes)}">💬 ${escHtml(app.notes)}</div>` : ''}
    <div class="card-footer">
      <span class="card-date">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${formatDate(app.dateApplied)} · ${days}d ago
      </span>
      ${hasFollowUp
        ? `<span class="followup-badge ${overdue ? 'overdue' : ''}">
            ⏰ ${formatDate(app.followUp)}
           </span>`
        : app.link
          ? `<a class="card-link" href="${escHtml(app.link)}" target="_blank" rel="noopener">↗ View</a>`
          : ''}
    </div>
  `;

  return card;
}

// ─── Drag and Drop ───────────────────────────────
function allowDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function dropCard(e, newStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!draggedId) return;

  const app = applications.find(a => a.id === draggedId);
  if (app && app.status !== newStatus) {
    app.status = newStatus;
    save();
    renderAll();
    showToast(`✅ Moved to ${capitalize(newStatus)}`);
  }
}

document.querySelectorAll('.column-body').forEach(col => {
  col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
});

// ─── Table Render ────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('table-body');
  const emptyEl = document.getElementById('table-empty');
  if (!tbody || !emptyEl) return;

  let apps = getFilteredApps();

  if (sortKey) {
    apps.sort((a, b) => {
      let av = (a[sortKey] || '').toString().toLowerCase();
      let bv = (b[sortKey] || '').toString().toLowerCase();
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });
  }

  tbody.innerHTML = '';

  if (apps.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  apps.forEach(app => {
    const tr = document.createElement('tr');
    const overdue = isOverdue(app.followUp);
    tr.innerHTML = `
      <td class="td-company">
        <div class="table-company-cell">
          ${renderCompanyBadge(app.company, app.link, true)}
          <span class="table-company-name">
            ${app.link
              ? `<a href="${escHtml(app.link)}" target="_blank" rel="noopener" class="table-link">${escHtml(app.company)}</a>`
              : escHtml(app.company)}
          </span>
        </div>
      </td>
      <td class="td-role">${escHtml(app.role)}</td>
      <td class="td-date">${formatDate(app.dateApplied)}</td>
      <td>
        <span class="status-badge status-${app.status}">
          <span class="status-dot"></span>
          ${statusLabel(app.status)}
        </span>
      </td>
      <td><span class="type-badge type-${app.type || 'internship'}">${formatType(app.type)}</span></td>
      <td class="td-date" style="${overdue && app.followUp ? 'color:var(--rejected);font-weight:600;' : ''}">
        ${app.followUp ? (overdue ? '⚠️ ' : '⏰ ') + formatDate(app.followUp) : '—'}
      </td>
      <td class="td-notes" title="${escHtml(app.notes)}">${app.notes ? escHtml(app.notes) : '—'}</td>
      <td class="td-actions">
        <button class="action-btn" onclick="openModal(null,'${app.id}')">Edit</button>
        <button class="action-btn del" onclick="deleteApp('${app.id}','${escHtml(app.company)}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function sortTable(key) {
  if (sortKey === key) { sortDir *= -1; }
  else { sortKey = key; sortDir = 1; }
  renderTable();
}

// ─── Analytics & Funnel Render ───────────────────
function renderAnalytics() {
  const total = applications.length;
  const interviews = applications.filter(a => a.status === 'interview').length;
  const offers = applications.filter(a => a.status === 'offer').length;
  const rejected = applications.filter(a => a.status === 'rejected').length;
  const appliedOnly = applications.filter(a => a.status === 'applied').length;

  const responded = interviews + offers + rejected;
  const responseRate = total ? Math.round((responded / total) * 100) : 0;
  const interviewRate = total ? Math.round(((interviews + offers) / total) * 100) : 0;
  const offerRate = total ? Math.round((offers / total) * 100) : 0;
  const offerFromInterview = (interviews + offers) ? Math.round((offers / (interviews + offers)) * 100) : 0;

  // 1. Funnel
  const funnelEl = document.getElementById('funnel-container');
  const badgeEl = document.getElementById('analytics-response-badge');
  if (badgeEl) badgeEl.textContent = `${responseRate}% Response Rate`;

  if (funnelEl) {
    if (total === 0) {
      funnelEl.innerHTML = `<div class="analytics-empty">No applications found to display funnel.</div>`;
    } else {
      const steps = [
        { label: 'Applications Submitted', count: total, pct: 100, color: 'var(--applied)' },
        { label: 'Responses Received', count: responded, pct: responseRate, color: 'var(--accent-light)' },
        { label: 'Interviews Reached', count: interviews + offers, pct: interviewRate, color: 'var(--interview)' },
        { label: 'Job / Internship Offers', count: offers, pct: offerRate, color: 'var(--offer)' }
      ];

      funnelEl.innerHTML = steps.map(s => `
        <div class="funnel-row">
          <div class="funnel-label-col">
            <span class="funnel-step-name">${s.label}</span>
            <span class="funnel-step-count"><strong>${s.count}</strong> (${s.pct}%)</span>
          </div>
          <div class="funnel-track">
            <div class="funnel-fill" style="width: ${Math.max(s.pct, 3)}%; background: ${s.color};"></div>
          </div>
        </div>
      `).join('');
    }
  }

  // 2. Velocity Chart
  renderVelocityChart();

  // 3. Type Breakdown
  const typeContainer = document.getElementById('type-distribution');
  if (typeContainer) {
    const typeCounts = {
      'internship': 0,
      'full-time': 0,
      'part-time': 0,
      'contract': 0,
      'co-op': 0
    };
    applications.forEach(a => {
      const t = a.type || 'internship';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });

    const activeTypes = Object.entries(typeCounts).filter(([_, cnt]) => cnt > 0);
    if (activeTypes.length === 0) {
      typeContainer.innerHTML = `<div class="analytics-empty">No applications yet.</div>`;
    } else {
      typeContainer.innerHTML = activeTypes.map(([type, count]) => {
        const pct = total ? Math.round((count / total) * 100) : 0;
        return `
          <div class="dist-row">
            <div class="dist-info">
              <span class="type-badge type-${type}">${formatType(type)}</span>
              <span class="dist-count"><strong>${count}</strong> (${pct}%)</span>
            </div>
            <div class="dist-track">
              <div class="dist-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. Status Breakdown
  const statusContainer = document.getElementById('status-distribution');
  if (statusContainer) {
    const statuses = [
      { key: 'applied', label: 'Applied', count: appliedOnly, color: 'var(--applied)' },
      { key: 'interview', label: 'Interviewing', count: interviews, color: 'var(--interview)' },
      { key: 'offer', label: 'Offers', count: offers, color: 'var(--offer)' },
      { key: 'rejected', label: 'Rejected', count: rejected, color: 'var(--rejected)' }
    ];

    statusContainer.innerHTML = statuses.map(s => {
      const pct = total ? Math.round((s.count / total) * 100) : 0;
      return `
        <div class="dist-row">
          <div class="dist-info">
            <span class="status-name"><span class="status-dot" style="background:${s.color}"></span> ${s.label}</span>
            <span class="dist-count"><strong>${s.count}</strong> (${pct}%)</span>
          </div>
          <div class="dist-track">
            <div class="dist-fill" style="width: ${pct}%; background:${s.color};"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Insights Grid
  const insightsEl = document.getElementById('insights-grid');
  if (insightsEl) {
    const remoteCount = applications.filter(a => (a.location || '').toLowerCase().includes('remote')).length;
    const remotePct = total ? Math.round((remoteCount / total) * 100) : 0;

    let totalDays = 0;
    applications.forEach(a => {
      totalDays += daysSince(a.dateApplied);
    });
    const avgDays = total ? Math.round(totalDays / total) : 0;

    insightsEl.innerHTML = `
      <div class="insight-box">
        <span class="insight-num green">${offerFromInterview}%</span>
        <span class="insight-label">Interview to Offer Rate</span>
      </div>
      <div class="insight-box">
        <span class="insight-num accent">${remotePct}%</span>
        <span class="insight-label">Remote Positions</span>
      </div>
      <div class="insight-box">
        <span class="insight-num">${avgDays}d</span>
        <span class="insight-label">Avg. Application Age</span>
      </div>
      <div class="insight-box">
        <span class="insight-num amber">${appliedOnly}</span>
        <span class="insight-label">Awaiting First Response</span>
      </div>
    `;
  }
}

function renderVelocityChart() {
  const container = document.getElementById('velocity-chart');
  if (!container) return;

  if (applications.length === 0) {
    container.innerHTML = `<div class="analytics-empty">No applications yet to plot.</div>`;
    return;
  }

  const monthMap = {};
  applications.forEach(a => {
    if (!a.dateApplied) return;
    const d = new Date(a.dateApplied + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthMap[key] = (monthMap[key] || 0) + 1;
  });

  const entries = Object.entries(monthMap);
  if (entries.length === 0) {
    container.innerHTML = `<div class="analytics-empty">No valid application dates found.</div>`;
    return;
  }

  const maxVal = Math.max(...entries.map(e => e[1]), 1);
  const chartHeight = 150;
  const barWidth = 38;
  const gap = 24;
  const totalWidth = Math.max(entries.length * (barWidth + gap) + gap, 300);

  const svgBars = entries.map(([label, count], idx) => {
    const x = gap + idx * (barWidth + gap);
    const barHeight = Math.max((count / maxVal) * (chartHeight - 44), 8);
    const y = chartHeight - 26 - barHeight;

    return `
      <g class="chart-bar-group">
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="url(#velocityGrad)" class="chart-bar" />
        <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" fill="var(--text-primary)" font-size="11.5" font-weight="700">${count}</text>
        <text x="${x + barWidth / 2}" y="${chartHeight - 8}" text-anchor="middle" fill="var(--text-muted)" font-size="11">${label}</text>
      </g>
    `;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${totalWidth} ${chartHeight}" class="velocity-svg">
      <defs>
        <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8b84ff" />
          <stop offset="100%" stop-color="#6c63ff" />
        </linearGradient>
      </defs>
      <line x1="0" y1="${chartHeight - 24}" x2="${totalWidth}" y2="${chartHeight - 24}" stroke="var(--border)" stroke-width="1" />
      ${svgBars}
    </svg>
  `;
}

// ─── Render All ──────────────────────────────────
function renderAll() {
  calcStats();
  renderAlertBanner();
  if (currentView === 'kanban') renderKanban();
  else if (currentView === 'table') renderTable();
  else if (currentView === 'analytics') renderAnalytics();
}

// ─── View Switching ──────────────────────────────
function switchView(view) {
  currentView = view;
  const kanban = document.getElementById('kanban-view');
  const table = document.getElementById('table-view');
  const analytics = document.getElementById('analytics-view');
  const statsBar = document.getElementById('stats-bar');

  if (kanban) kanban.style.display = view === 'kanban' ? 'block' : 'none';
  if (table) table.style.display = view === 'table' ? 'block' : 'none';
  if (analytics) analytics.style.display = view === 'analytics' ? 'block' : 'none';
  if (statsBar) statsBar.style.display = view === 'analytics' ? 'none' : 'grid';

  document.getElementById('nav-kanban')?.classList.toggle('active', view === 'kanban');
  document.getElementById('nav-table')?.classList.toggle('active', view === 'table');
  document.getElementById('nav-analytics')?.classList.toggle('active', view === 'analytics');

  const titleEl = document.getElementById('view-title');
  const subtitleEl = document.getElementById('view-subtitle');

  if (view === 'kanban') {
    if (titleEl) titleEl.textContent = 'Kanban Board';
    if (subtitleEl) subtitleEl.textContent = 'Drag cards between columns to update status';
  } else if (view === 'table') {
    if (titleEl) titleEl.textContent = 'Table View';
    if (subtitleEl) subtitleEl.textContent = 'Sort and filter all your applications';
  } else if (view === 'analytics') {
    if (titleEl) titleEl.textContent = 'Analytics & Insights';
    if (subtitleEl) subtitleEl.textContent = 'Hiring conversion funnel, momentum & key metrics';
  }

  renderAll();
}

// ─── Filters ─────────────────────────────────────
document.querySelectorAll('.filter-check').forEach(label => {
  label.addEventListener('click', () => {
    currentFilter = label.dataset.status;
    document.querySelectorAll('.filter-check').forEach(l => l.classList.remove('active'));
    label.classList.add('active');
    renderAll();
  });
});

// ─── Search ──────────────────────────────────────
function handleSearch() {
  searchQuery = document.getElementById('search-input').value.trim();
  renderAll();
}

// ─── Sidebar Toggle ──────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ─── Modal ───────────────────────────────────────
function openModal(defaultStatus, editId) {
  const overlay = document.getElementById('modal-overlay');
  const form = document.getElementById('app-form');
  const title = document.getElementById('modal-title');
  const submitBtn = document.getElementById('submit-btn');

  form.reset();
  editingId = editId || null;

  document.getElementById('field-date').value = new Date().toISOString().split('T')[0];

  if (editId) {
    const app = applications.find(a => a.id === editId);
    if (!app) return;
    title.textContent = 'Edit Application';
    submitBtn.textContent = 'Save Changes';
    document.getElementById('field-company').value = app.company;
    document.getElementById('field-role').value = app.role;
    document.getElementById('field-type').value = app.type || 'internship';
    document.getElementById('field-status').value = app.status;
    document.getElementById('field-date').value = app.dateApplied;
    document.getElementById('field-followup').value = app.followUp || '';
    document.getElementById('field-location').value = app.location || '';
    document.getElementById('field-salary').value = app.salary || '';
    document.getElementById('field-link').value = app.link || '';
    document.getElementById('field-notes').value = app.notes || '';
    document.getElementById('field-id').value = app.id;
  } else {
    title.textContent = 'Add Application';
    submitBtn.textContent = 'Add Application';
    if (defaultStatus) document.getElementById('field-status').value = defaultStatus;
    document.getElementById('field-id').value = '';
  }

  overlay.classList.add('active');
  setTimeout(() => document.getElementById('field-company').focus(), 100);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  editingId = null;
}

function closeModalOnOverlay(e) {
  if (e.target === e.currentTarget) closeModal();
}

// ─── Save Application ────────────────────────────
function saveApplication(e) {
  e.preventDefault();

  const app = {
    id: editingId || genId(),
    company: document.getElementById('field-company').value.trim(),
    role: document.getElementById('field-role').value.trim(),
    type: document.getElementById('field-type').value,
    status: document.getElementById('field-status').value,
    dateApplied: document.getElementById('field-date').value,
    followUp: document.getElementById('field-followup').value,
    location: document.getElementById('field-location').value.trim(),
    salary: document.getElementById('field-salary').value.trim(),
    link: document.getElementById('field-link').value.trim(),
    notes: document.getElementById('field-notes').value.trim(),
    createdAt: editingId ? (applications.find(a => a.id === editingId)?.createdAt || Date.now()) : Date.now()
  };

  if (editingId) {
    const idx = applications.findIndex(a => a.id === editingId);
    if (idx > -1) applications[idx] = app;
    showToast('✏️ Application updated');
  } else {
    applications.unshift(app);
    showToast('🎉 Application added');
  }

  save();
  closeModal();
  renderAll();
}

// ─── Delete ──────────────────────────────────────
function deleteApp(id, company) {
  pendingDeleteId = id;
  document.getElementById('delete-company-name').textContent = company;
  document.getElementById('delete-overlay').classList.add('active');
}

function confirmDelete() {
  if (!pendingDeleteId) return;
  applications = applications.filter(a => a.id !== pendingDeleteId);
  save();
  closeDeleteModal();
  renderAll();
  showToast('🗑️ Application deleted');
  pendingDeleteId = null;
}

function closeDeleteModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('delete-overlay').classList.remove('active');
  pendingDeleteId = null;
}

// ─── Import & Export (JSON & CSV) ────────────────
function toggleExportMenu(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('export-dropdown');
  if (dropdown) dropdown.classList.toggle('show');
}

document.addEventListener('click', e => {
  const dropdown = document.getElementById('export-dropdown');
  if (dropdown && !e.target.closest('.dropdown-wrapper')) {
    dropdown.classList.remove('show');
  }
});

function exportData(format = 'json') {
  document.getElementById('export-dropdown')?.classList.remove('show');

  const today = new Date().toISOString().split('T')[0];

  if (format === 'csv') {
    const headers = ['ID', 'Company', 'Role', 'Type', 'Status', 'Date Applied', 'Follow-up Date', 'Location', 'Salary', 'Posting URL', 'Notes', 'Created At'];
    const rows = applications.map(a => [
      a.id || '',
      a.company || '',
      a.role || '',
      a.type || '',
      a.status || '',
      a.dateApplied || '',
      a.followUp || '',
      a.location || '',
      a.salary || '',
      a.link || '',
      (a.notes || '').replace(/[\r\n]+/g, ' '),
      a.createdAt ? new Date(a.createdAt).toISOString() : ''
    ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `apptrack-export-${today}.csv`);
    showToast('📊 Exported to CSV (Excel ready)');
  } else {
    const blob = new Blob([JSON.stringify(applications, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `apptrack-export-${today}.json`);
    showToast('📥 Exported to JSON');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function handleFileImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const reader = new FileReader();

  reader.onload = e => {
    try {
      const text = e.target.result;
      let parsed = [];

      if (isCsv) {
        parsed = parseCSV(text);
      } else {
        const json = JSON.parse(text);
        parsed = Array.isArray(json) ? json : (json.applications || []);
      }

      parsed = parsed.filter(item => item && (item.company || item.Company))
        .map(item => ({
          id: item.id || genId(),
          company: (item.company || item.Company || '').trim(),
          role: (item.role || item.Role || '').trim() || 'Applicant',
          type: (item.type || item.Type || 'internship').toLowerCase(),
          status: normalizeStatus(item.status || item.Status),
          dateApplied: normalizeDate(item.dateApplied || item['Date Applied'] || item.date),
          followUp: normalizeDate(item.followUp || item['Follow-up Date'] || item.followup),
          location: (item.location || item.Location || '').trim(),
          salary: (item.salary || item.Salary || '').trim(),
          link: (item.link || item.PostingURL || item['Posting URL'] || item.url || '').trim(),
          notes: (item.notes || item.Notes || '').trim(),
          createdAt: item.createdAt ? Number(item.createdAt) : Date.now()
        }));

      if (parsed.length === 0) {
        showToast('❌ No valid applications found in file');
        event.target.value = '';
        return;
      }

      pendingImportData = parsed;
      document.getElementById('import-summary-text').innerHTML = `Found <strong>${parsed.length}</strong> application${parsed.length > 1 ? 's' : ''} in <em>${escHtml(file.name)}</em>.`;
      document.getElementById('import-overlay').classList.add('active');
    } catch (err) {
      console.error(err);
      showToast('❌ Error parsing file: ' + err.message);
    }
    event.target.value = '';
  };

  reader.readAsText(file);
}

function normalizeStatus(status) {
  if (!status) return 'applied';
  const s = status.toString().toLowerCase().trim();
  if (s.includes('interview')) return 'interview';
  if (s.includes('offer')) return 'offer';
  if (s.includes('reject')) return 'rejected';
  return 'applied';
}

function normalizeDate(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

function parseCSV(text) {
  const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    const obj = {};
    header.forEach((h, idx) => {
      obj[h.trim()] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function closeImportModal() {
  document.getElementById('import-overlay').classList.remove('active');
  pendingImportData = null;
}

function closeImportModalOnOverlay(e) {
  if (e.target === e.currentTarget) closeImportModal();
}

function confirmImport(mode) {
  if (!pendingImportData) return;

  const count = pendingImportData.length;
  if (mode === 'replace') {
    applications = pendingImportData;
  } else {
    const existingKeys = new Set(applications.map(a => `${a.company.toLowerCase()}|||${a.role.toLowerCase()}`));
    const newItems = [];
    pendingImportData.forEach(item => {
      const key = `${item.company.toLowerCase()}|||${item.role.toLowerCase()}`;
      if (!existingKeys.has(key)) {
        newItems.push(item);
        existingKeys.add(key);
      }
    });
    applications = [...newItems, ...applications];
  }

  save();
  renderAll();
  closeImportModal();
  showToast(`📥 Successfully imported ${count} application${count > 1 ? 's' : ''}`);
}

// ─── Toast ───────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerHTML = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Keyboard Shortcuts ──────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeImportModal();
    document.getElementById('delete-overlay').classList.remove('active');
    document.getElementById('export-dropdown')?.classList.remove('show');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('search-input')?.focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    openModal();
  }
});

// ─── Boot ────────────────────────────────────────
load();
renderAll();
