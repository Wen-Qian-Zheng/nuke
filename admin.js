import { supabase } from './supabase.js';

let lbData = [];
let tpData = [];
let editingRow = null;
let editingTable = null;

async function checkAccess() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    showAuthScreen();
    return false;
  }

  if (!user.user_metadata?.isadmin) {
    showDenied(user.email);
    return false;
  }

  document.getElementById('auth-screen').style.display  = 'none';
  document.getElementById('denied-screen').style.display = 'none';
  document.getElementById('admin-content').style.display = 'block';
  document.getElementById('user-info').textContent = user.email;
  return true;
}

function showAuthScreen() {
  document.getElementById('auth-screen').style.display   = 'flex';
  document.getElementById('denied-screen').style.display = 'none';
  document.getElementById('admin-content').style.display = 'none';
}

function showDenied(email) {
  document.getElementById('auth-screen').style.display   = 'none';
  document.getElementById('admin-content').style.display = 'none';
  const d = document.getElementById('denied-screen');
  d.style.display = 'flex';
  d.querySelector('.denied-email').textContent = email;
}

window.adminLogin = async () => {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const err      = document.getElementById('login-error');
  err.textContent = '';
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { err.textContent = error.message; return; }
  init();
};

window.adminSignOut = async () => {
  await supabase.auth.signOut();
  showAuthScreen();
};

window.switchTab = (tab) => {
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.toggle('active', ['leaderboard', 'trigramplays'][i] === tab);
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${tab}`).classList.add('active');
};

window.loadLeaderboard = async () => {
  const sort = document.getElementById('lb-sort').value;
  document.getElementById('lb-status').textContent = 'Loading…';
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order(sort, { ascending: false });
  if (error) { document.getElementById('lb-status').textContent = 'Error: ' + error.message; return; }
  lbData = data;
  renderLeaderboard();
};

window.renderLeaderboard = () => {
  const q = document.getElementById('lb-search').value.toLowerCase();
  const rows = lbData.filter(r => !q || r.username?.toLowerCase().includes(q));
  document.getElementById('lb-status').textContent = `${rows.length} row${rows.length !== 1 ? 's' : ''}`;
  const tbody = document.getElementById('lb-tbody');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">No records found.</td></tr>'; return; }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><input type="checkbox" class="row-check lb-check" data-id="${r.id}" /></td>
      <td>${esc(r.username)}</td>
      <td>${r.score ?? ''}</td>
      <td>${r.wordsused ?? '-'}</td>
      <td>${r.maxcombo ?? '-'}</td>
      <td>${r.createdat ? new Date(r.createdat).toLocaleString() : '-'}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="openEditModal('leaderboard','${r.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSingle('leaderboard','${r.id}')">Delete</button>
      </td>
    </tr>`).join('');
};

window.loadTrigramPlays = async () => {
  document.getElementById('tp-status').textContent = 'Loading…';
  const { data, error } = await supabase
    .from('trigramplays')
    .select('*')
    .order('createdat', { ascending: false });
  if (error) { document.getElementById('tp-status').textContent = 'Error: ' + error.message; return; }
  tpData = data;
  renderTrigramPlays();
};

window.renderTrigramPlays = () => {
  const q = document.getElementById('tp-search').value.toLowerCase();
  const f = document.getElementById('tp-filter').value;
  const rows = tpData.filter(r => {
    if (q && !r.trigram?.toLowerCase().includes(q) && !r.userid?.toLowerCase().includes(q)) return false;
    if (f !== '' && String(r.solved) !== f) return false;
    return true;
  });
  document.getElementById('tp-status').textContent = `${rows.length} row${rows.length !== 1 ? 's' : ''}`;
  const tbody = document.getElementById('tp-tbody');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty">No records found.</td></tr>'; return; }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><input type="checkbox" class="row-check tp-check" data-id="${r.id}" /></td>
      <td style="font-size:0.75rem;color:#64748b">${esc(r.userid)}</td>
      <td><strong>${esc(r.trigram)}</strong></td>
      <td><span class="badge ${r.solved ? 'badge-green' : 'badge-red'}">${r.solved ? 'Yes' : 'No'}</span></td>
      <td>${r.wordlength ?? '-'}</td>
      <td>${r.timetaken != null ? (r.timetaken).toFixed(2) : '-'}</td>
      <td>${r.createdat ? new Date(r.createdat).toLocaleString() : '-'}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteSingle('trigramplays','${r.id}')">Delete</button>
      </td>
    </tr>`).join('');
};

window.toggleAll = (table) => {
  const master = document.getElementById(`${table === 'leaderboard' ? 'lb' : 'tp'}-check-all`);
  document.querySelectorAll(`.${table === 'leaderboard' ? 'lb' : 'tp'}-check`)
    .forEach(cb => cb.checked = master.checked);
};

window.deleteSingle = async (table, id) => {
  if (!confirm('Delete this row?')) return;
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) { alert('Error: ' + error.message); return; }
  table === 'leaderboard' ? loadLeaderboard() : loadTrigramPlays();
};

window.deleteSelected = async (table) => {
  const cls = table === 'leaderboard' ? '.lb-check' : '.tp-check';
  const ids = [...document.querySelectorAll(cls + ':checked')].map(cb => cb.dataset.id);
  if (!ids.length) { alert('No rows selected.'); return; }
  if (!confirm(`Delete ${ids.length} row(s)?`)) return;
  const { error } = await supabase.from(table).delete().in('id', ids);
  if (error) { alert('Error: ' + error.message); return; }
  table === 'leaderboard' ? loadLeaderboard() : loadTrigramPlays();
};

const lbFields = [
  { key: 'username',  label: 'Username',  type: 'text'   },
  { key: 'score',     label: 'Score',     type: 'number' },
  { key: 'wordsused', label: 'Words Used',type: 'number' },
  { key: 'maxcombo',  label: 'Max Combo', type: 'number' },
];

window.openAddModal = () => {
  editingRow = null;
  editingTable = 'leaderboard';
  document.getElementById('modal-title').textContent = 'Add Row';
  document.getElementById('modal-fields').innerHTML = lbFields.map(f => `
    <div class="field">
      <label>${f.label}</label>
      <input id="mf-${f.key}" type="${f.type}" placeholder="${f.label}" />
    </div>`).join('');
  document.getElementById('modal-overlay').classList.add('open');
};

window.openEditModal = (table, id) => {
  editingTable = table;
  editingRow = lbData.find(r => String(r.id) === String(id));
  if (!editingRow) return;
  document.getElementById('modal-title').textContent = 'Edit Row';
  document.getElementById('modal-fields').innerHTML = lbFields.map(f => `
    <div class="field">
      <label>${f.label}</label>
      <input id="mf-${f.key}" type="${f.type}" value="${editingRow[f.key] ?? ''}" />
    </div>`).join('');
  document.getElementById('modal-overlay').classList.add('open');
};

window.saveModal = async () => {
  const payload = {};
  lbFields.forEach(f => {
    const val = document.getElementById(`mf-${f.key}`).value;
    payload[f.key] = f.type === 'number' ? (val === '' ? null : Number(val)) : val;
  });

  let error;
  if (editingRow) {
    ({ error } = await supabase.from('leaderboard').update(payload).eq('id', editingRow.id));
  } else {
    ({ error } = await supabase.from('leaderboard').insert(payload));
  }
  if (error) { alert('Error: ' + error.message); return; }
  closeModalDirect();
  loadLeaderboard();
};

window.closeModal = (e) => { if (e.target === document.getElementById('modal-overlay')) closeModalDirect(); };
window.closeModalDirect = () => {
  document.getElementById('modal-overlay').classList.remove('open');
  editingRow = null;
};

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function init() {
  const ok = await checkAccess();
  if (ok) {
    loadLeaderboard();
    loadTrigramPlays();
  }
}

init();
