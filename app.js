/* =================================================
   AppTrack – Application Logic
   =================================================
   Features:
   - LocalStorage persistence
   - Kanban board with drag-and-drop
   - Table view with sorting
   - Filtering by status
   - Search across company/role
   - Add/Edit/Delete applications
   - Stats calculation
   - JSON export
   - Toast notifications
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
    followUp: '2026-11-10', location: 'Menlo Park, CA', salary: '$45/hr',
    link: 'https://metacareers.com', notes: 'Applied via LinkedIn. No response yet.',
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
    followUp: '2026-11-15', location: 'San Francisco, CA', salary: '$44/hr',
    link: 'https://figma.com/careers', notes: 'Portfolio submitted.',
    createdAt: Date.now() - 86400000 * 12
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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + 'T00:00:00') < new Date();
}

function daysSince(dateStr) {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr + 'T00:00:00').getTime();
  return Math.floor(diff / 86400000);
}

// ─── Storage ─────────────────────────────────────
function save() {
  localStorage.setItem('apptrack_data', JSON.stringify(applications));
}

function load() {
  const raw = localStorage.getItem('apptrack_data');
  if (raw) {
    try { applications = JSON.parse(raw); } catch { applications = []; }
  } else {
    applications = SEED_DATA;
    save();
  }
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

  // Stat cards
  animateNumber('stat-card-total', total);
  animateNumber('stat-card-interview', interviews);
  animateNumber('stat-card-offer', offers);
  document.getElementById('stat-card-response').textContent = responseRate + '%';

  // Sidebar mini stats
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-response').textContent = responseRate + '%';
  document.getElementById('stat-offer-rate').textContent = offerRate + '%';
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
      <div class="card-company">${escHtml(app.company)}</div>
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
    ${app.notes ? `<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(app.notes)}">💬 ${escHtml(app.notes)}</div>` : ''}
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

function formatType(type) {
  const map = { internship: 'Internship', 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', 'co-op': 'Co-op' };
  return map[type] || 'Internship';
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
        ${app.link
          ? `<a href="${escHtml(app.link)}" target="_blank" rel="noopener" style="color:var(--text-primary);text-decoration:none;" onmouseover="this.style.color='var(--accent-light)'" onmouseout="this.style.color='var(--text-primary)'">${escHtml(app.company)}</a>`
          : escHtml(app.company)}
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
      <td class="td-date" style="${overdue && app.followUp ? 'color:var(--rejected)' : ''}">
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

function statusLabel(status) {
  const map = { applied: 'Applied', interview: 'Interviewing', offer: 'Offer', rejected: 'Rejected' };
  return map[status] || status;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function sortTable(key) {
  if (sortKey === key) { sortDir *= -1; }
  else { sortKey = key; sortDir = 1; }
  renderTable();
}

// ─── Render All ──────────────────────────────────
function renderAll() {
  calcStats();
  if (currentView === 'kanban') renderKanban();
  else renderTable();
}

// ─── View Switching ──────────────────────────────
function switchView(view) {
  currentView = view;
  document.getElementById('kanban-view').style.display = view === 'kanban' ? 'block' : 'none';
  document.getElementById('table-view').style.display  = view === 'table'  ? 'block' : 'none';
  document.getElementById('nav-kanban').classList.toggle('active', view === 'kanban');
  document.getElementById('nav-table').classList.toggle('active', view === 'table');
  document.getElementById('view-title').textContent = view === 'kanban' ? 'Kanban Board' : 'Table View';
  document.getElementById('view-subtitle').textContent = view === 'kanban'
    ? 'Drag cards between columns to update status'
    : 'Sort and filter all your applications';
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

  // Set today's date as default
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

// ─── Export ──────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(applications, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `apptrack-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Exported to JSON');
}

// ─── Toast ───────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Keyboard Shortcuts ──────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    document.getElementById('delete-overlay').classList.remove('active');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('search-input').focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    openModal();
  }
});

// ─── Boot ────────────────────────────────────────
load();
renderAll();
