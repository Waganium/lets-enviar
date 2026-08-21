const BUCKET_NAME = 'enviar_files';
let client = null;

async function initializeApp() {
    try {
        const { createClient } = supabase;
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('Could not load config');
        const { url, key } = await res.json();
        client = createClient(url, key);
    } catch (err) {
        console.error(err);
        showAlert("Failed to connect to Supabase.", "error");
    }
}
initializeApp();

// --- THEME (kept consistent with the main site) ---
function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    document.querySelector('.theme-toggle').textContent = isLight ? '☀️' : '🌙';
    localStorage.setItem('enviar-theme', isLight ? 'light' : 'dark');
}
(function () {
    if (localStorage.getItem('enviar-theme') === 'light') {
        document.body.classList.add('light-mode');
        document.addEventListener('DOMContentLoaded', () => {
            const btn = document.querySelector('.theme-toggle');
            if (btn) btn.textContent = '☀️';
        });
    }
})();

function showAlert(msg, type = 'success') {
    const div = document.getElementById('alerts');
    if (!div) return;
    const alert = document.createElement('div');
    alert.className = `alert show ${type === 'success' ? 'alert-success' : 'alert-error'}`;
    alert.textContent = msg;
    div.appendChild(alert);
    setTimeout(() => alert.remove(), 4000);
}

function setLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.original = btn.innerHTML;
        btn.innerHTML = `<span class="loading-spinner"></span> Processing...`;
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.original || 'Submit';
    }
}

// --- ADMIN LOGIN ---
async function verifyAdmin() {
    const password = document.getElementById('admin-pass').value;
    setLoading('btn-admin-login', true);

    try {
        const res = await fetch('/api/admin_login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (res.ok) {
            document.getElementById('admin-login-view').style.display = 'none';
            document.getElementById('admin-panel').style.display = 'block';
            loadAdmin();
        } else {
            showAlert("Incorrect password", "error");
        }
    } finally {
        setLoading('btn-admin-login', false);
    }
}

function exitAdmin() { location.reload(); }

// --- ADMIN DASHBOARD ---
async function loadAdmin() {
    if (!client) return;

    const { data: posts, error } = await client
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return showAlert("Admin load failed: " + error.message, "error");

    let totalSizeBytes = 0;
    let expiringCount = 0;
    const now = new Date();

    const postsHtml = posts.map(p => {
        totalSizeBytes += Number(p.file_size || 0);
        const expiry = new Date(p.expires_at);
        if (expiry - now < 3600000) expiringCount++;

        return `
            <div class="post-item" id="post-row-${p.id}">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px;">
                    <span>
                        Code: <strong>${p.code || '—'}</strong>
                        ${p.vault_code ? ` | Vault: <strong>${p.vault_code}</strong>` : ''}
                        | Del: <code>${p.delete_code}</code>
                    </span>
                    <button class="btn btn-danger" style="width:auto; padding:4px 12px;"
                        onclick="executeDelete('${p.id}', '${p.file_path || ''}')">Del</button>
                </div>
            </div>`;
    }).join('');

    document.getElementById('stat-total').textContent = posts.length;
    document.getElementById('stat-expiry').textContent = expiringCount;
    document.getElementById('admin-posts').innerHTML = postsHtml || "<p style='color:var(--text-secondary);'>No posts found.</p>";

    const totalMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
    document.getElementById('stat-storage').textContent = `${totalMB} MB`;
}

async function executeDelete(id, filePath) {
    if (!client) return;
    try {
        if (filePath) await client.storage.from(BUCKET_NAME).remove([filePath]);
        await client.from('posts').delete().eq('id', id);
        showAlert("Post deleted successfully.", "success");
        await loadAdmin();
    } catch (err) {
        showAlert("Delete failed: " + err.message, "error");
    }
}
