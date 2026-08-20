

// --- 1. CONFIGURATION & SECURE INITIALIZATION ---
const BUCKET_NAME = 'enviar_files';

let client = null;

async function initializeApp() {
    try {
        const { createClient } = supabase;
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('Could not load config');
        const { url, key } = await res.json();

        client = createClient(url, key);
        console.log("✅ Connected to Supabase.");
    } catch (err) {
        console.error(err);
        showAlert("Failed to connect to Supabase.", "error");
    }
}
initializeApp();

let selectedFile = null;

// --- THEME TOGGLE (FIX 1) ---
function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    document.querySelector('.theme-toggle').textContent = isLight ? '☀️' : '🌙';
    localStorage.setItem('enviar-theme', isLight ? 'light' : 'dark');
}

// Restore saved theme on load
(function () {
    if (localStorage.getItem('enviar-theme') === 'light') {
        document.body.classList.add('light-mode');
        // Wait for DOM before updating button text
        document.addEventListener('DOMContentLoaded', () => {
            const btn = document.querySelector('.theme-toggle');
            if (btn) btn.textContent = '☀️';
        });
    }
})();

// --- 2. UI UTILITIES ---

// FIX 2: showAlert uses typed CSS classes instead of btn classes for styling
function showAlert(msg, type = 'success') {
    const div = document.getElementById('alerts');
    if (!div) return;
    const alert = document.createElement('div');
    // Use alert-success / alert-error classes (not btn-primary / btn-danger)
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

// --- NAVIGATION (replaces old tab bar) ---
function goto(view) {
    document.getElementById('home-view').style.display = 'none';
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(view + '-tab').classList.add('active');
}

function goHome() {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('home-view').style.display = 'grid';
}

// --- 3. CORE FEATURES ---
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.size <= 5 * 1024 * 1024) {
        selectedFile = file;
        document.getElementById('file-info').textContent = `✓ Selected: ${file.name}`;
    } else if (file) {
        showAlert("File exceeds 5MB limit", "error");
    }
}

async function createPost() {
    if (!client) return showAlert("Connecting to server, please wait...", "error");

    const code = document.getElementById('create-code').value.trim().toUpperCase();
    const msg = document.getElementById('create-message').value.trim();
    if (!code) return showAlert("Search code required", "error");

    setLoading('btn-create', true);
    let fileUrl = null, storagePath = null;

    try {
        if (selectedFile) {
            storagePath = `${Date.now()}-${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const { error: uploadError } = await client.storage.from(BUCKET_NAME).upload(storagePath, selectedFile);
            if (uploadError) throw uploadError;
            const { data: urlData } = client.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
            fileUrl = urlData.publicUrl;
        }

        const deleteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const expiry = new Date();
        expiry.setHours(expiry.getHours() + 24);

        const { error: dbError } = await client.from('posts').insert([{
            code, message: msg, file_name: selectedFile?.name,
            file_url: fileUrl, file_path: storagePath, file_size: selectedFile?.size || 0,
            delete_code: deleteCode, expires_at: expiry.toISOString()
        }]);

        if (dbError) throw dbError;

        // FIX 3: Green border on success
        document.getElementById('create-tab').innerHTML = `
            <div class="card card-success" style="text-align:center;">
                <h3 style="color:var(--accent-success); margin-bottom:8px;">✅ Post Created!</h3>
                <p style="color:var(--text-secondary); margin-bottom:12px;">Save your delete code:</p>
                <div style="font-size:32px; font-weight:bold; letter-spacing:4px; color:var(--accent-success);">${deleteCode}</div>
                <button class="btn btn-primary" style="margin-top:20px;" onclick="location.reload()">Create Another</button>
            </div>`;
    } catch (err) {
        // FIX 3: Show error with red-bordered card
        showAlert(`Error: ${err.message}`, "error");
        // Also visually mark the form card as errored
        const card = document.querySelector('#create-tab .card');
        if (card) {
            card.classList.add('card-error');
            setTimeout(() => card.classList.remove('card-error'), 3000);
        }
    } finally {
        setLoading('btn-create', false);
    }
}

async function searchPosts() {
    if (!client) return showAlert("Please wait for secure connection...", "error");

    const query = document.getElementById('search-input').value.trim().toUpperCase();
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = "<p>Searching...</p>";

    const { data, error } = await client.from('posts')
        .select('*')
        .eq('code', query)
        .gt('expires_at', new Date().toISOString());

    if (error) return showAlert(error.message, "error");

    resultsDiv.innerHTML = data?.length ? data.map(p => `
        <div class="post-item">
            <div style="display:flex; justify-content:space-between;">
                <strong style="color:var(--accent-primary);">${p.code}</strong>
                <small style="color:var(--text-secondary);">Expires: ${new Date(p.expires_at).toLocaleTimeString()}</small>
            </div>
            <p style="margin-top:6px;">${p.message || ''}</p>
            ${p.file_url ? `<a href="${p.file_url}" target="_blank" class="btn btn-primary" style="display:block; text-decoration:none; margin-top:10px; text-align:center;">Download</a>` : ''}
        </div>`).join('') : "<p style='color:var(--text-secondary);'>No posts found.</p>";
}

// --- 4. VAULT ---
let currentVaultCode = null;
let selectedVaultFile = null;

function handleVaultFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.size <= 5 * 1024 * 1024) {
        selectedVaultFile = file;
        document.getElementById('vault-file-info').textContent = `✓ Selected: ${file.name}`;
    } else if (file) {
        showAlert("File exceeds 5MB limit", "error");
    }
}

function toggleGeneralCode() {
    const checked = document.getElementById('vault-general-check').checked;
    document.getElementById('vault-general-code-group').style.display = checked ? 'block' : 'none';
}

function enterVault() {
    const code = document.getElementById('vault-code-input').value.trim().toUpperCase();
    if (!code) return showAlert("Enter a vault code", "error");
    currentVaultCode = code;
    document.getElementById('vault-code-label').textContent = code;
    document.getElementById('vault-auth').style.display = 'none';
    document.getElementById('vault-content').style.display = 'block';
    loadVaultFiles();
}

function lockVault() {
    currentVaultCode = null;
    selectedVaultFile = null;
    document.getElementById('vault-code-input').value = '';
    document.getElementById('vault-content').style.display = 'none';
    document.getElementById('vault-auth').style.display = 'block';
}

async function uploadToVault() {
    if (!client) return showAlert("Connecting to server, please wait...", "error");
    if (!currentVaultCode) return showAlert("Enter your vault first", "error");
    if (!selectedVaultFile) return showAlert("Select a file to upload", "error");

    const isGeneral = document.getElementById('vault-general-check').checked;
    const generalCode = document.getElementById('vault-general-search-code').value.trim().toUpperCase();
    if (isGeneral && !generalCode) return showAlert("Enter a search code for the general post", "error");

    const msg = document.getElementById('vault-message').value.trim();

    setLoading('btn-vault-upload', true);
    try {
        const storagePath = `${Date.now()}-${selectedVaultFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const { error: uploadError } = await client.storage.from(BUCKET_NAME).upload(storagePath, selectedVaultFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = client.storage.from(BUCKET_NAME).getPublicUrl(storagePath);

        // Vault posts don't need to "expire" for the vault owner. expires_at is only
        // ever checked by searchPosts(), which also requires `code` to match — so a
        // vault-only file (code left null) is invisible to general search regardless
        // of this value. For a general-post-linked file it governs when it drops out
        // of general search, exactly like a normal Create Post upload.
        const expiry = new Date();
        expiry.setHours(expiry.getHours() + 24);

        const { error: dbError } = await client.from('posts').insert([{
            code: isGeneral ? generalCode : null,
            message: msg,
            file_name: selectedVaultFile.name,
            file_url: urlData.publicUrl,
            file_path: storagePath,
            file_size: selectedVaultFile.size,
            delete_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
            expires_at: expiry.toISOString(),
            vault_code: currentVaultCode
        }]);
        if (dbError) throw dbError;

        showAlert("Uploaded to vault" + (isGeneral ? " and posted publicly" : ""), "success");
        selectedVaultFile = null;
        document.getElementById('vault-file-info').textContent = '';
        document.getElementById('vault-message').value = '';
        document.getElementById('vault-general-check').checked = false;
        document.getElementById('vault-general-search-code').value = '';
        toggleGeneralCode();
        await loadVaultFiles();
    } catch (err) {
        showAlert("Upload failed: " + err.message, "error");
    } finally {
        setLoading('btn-vault-upload', false);
    }
}

async function loadVaultFiles() {
    if (!client || !currentVaultCode) return;
    const filesDiv = document.getElementById('vault-files');
    filesDiv.innerHTML = "<p style='color:var(--text-secondary);'>Loading...</p>";

    // No expiry filter here — vault files persist regardless of expires_at.
    const { data, error } = await client.from('posts')
        .select('*')
        .eq('vault_code', currentVaultCode)
        .order('created_at', { ascending: false });

    if (error) return showAlert(error.message, "error");

    filesDiv.innerHTML = data?.length ? data.map(p => `
        <div class="post-item" id="post-row-${p.id}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:var(--accent-primary);">${p.file_name || '(no file)'}</strong>
                ${p.code ? `<small style="color:var(--text-secondary);">Public as: ${p.code}</small>` : `<small style="color:var(--text-secondary);">Private to vault</small>`}
            </div>
            <p style="margin-top:6px;">${p.message || ''}</p>
            <div style="display:flex; gap:10px; margin-top:10px;">
                ${p.file_url ? `<a href="${p.file_url}" target="_blank" class="btn btn-primary" style="text-decoration:none; text-align:center;">Download</a>` : ''}
                <button class="btn btn-danger" onclick="executeDelete('${p.id}', '${p.file_path || ''}')">Delete</button>
            </div>
        </div>`).join('') : "<p style='color:var(--text-secondary);'>Your vault is empty.</p>";
}

// --- 5. DELETION & ADMIN ---
async function previewDelete() {
    if (!client) return showAlert("System loading...", "error");

    const code = document.getElementById('delete-code-input').value.trim().toUpperCase();
    const previewDiv = document.getElementById('delete-preview');
    const { data, error } = await client.from('posts').select('*').eq('delete_code', code).maybeSingle();

    if (error || !data) return showAlert("Invalid code", "error");

    previewDiv.innerHTML = `
        <div class="card" style="border: 1px solid var(--accent-danger);">
            <h3 style="color:var(--accent-danger); margin-bottom:12px;">Confirm Deletion</h3>
            <p style="color:var(--text-secondary); margin-bottom:16px;">Code: <strong style="color:var(--text-primary);">${data.code}</strong></p>
            <button class="btn btn-danger" id="btn-confirm-del" onclick="executeDelete('${data.id}', '${data.file_path || ''}')">Delete Permanently</button>
        </div>`;
    document.getElementById('delete-initial').style.display = 'none';
}

async function executeDelete(id, filePath) {
    if (!client) return;
    setLoading('btn-confirm-del', true);
    try {
        if (filePath) await client.storage.from(BUCKET_NAME).remove([filePath]);
        await client.from('posts').delete().eq('id', id);
        showAlert("Post deleted successfully.", "success");

        // FIX 4: If in admin panel, reload only the posts list — do NOT reload the page
        if (document.getElementById('admin-panel').style.display !== 'none') {
            await loadAdmin(); // refresh stats + list in-place
        } else if (currentVaultCode && document.getElementById('vault-content').style.display !== 'none') {
            await loadVaultFiles(); // refresh vault list in-place — reloading the page would lose the vault session
        } else {
            location.reload(); // only reload when deleting from the Delete tab
        }
    } catch (err) {
        showAlert("Delete failed: " + err.message, "error");
        setLoading('btn-confirm-del', false);
    }
}

function openAdminModal() { document.getElementById('admin-modal').style.display = 'flex'; }
function closeAdminModal() { document.getElementById('admin-modal').style.display = 'none'; }
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
async function verifyAdmin() {
    const password = document.getElementById('admin-pass').value;

    const res = await fetch('/api/admin_login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    
    if (res.ok) {
        closeAdminModal();
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('admin-panel').style.display = 'block';
        loadAdmin();
    } else {
        showAlert("Incorrect password", "error");
    }
}
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function exitAdmin() { location.reload(); }

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
                    <span>Code: <strong>${p.code}</strong> | Del: <code>${p.delete_code}</code></span>
                    <button class="btn btn-danger" style="width:auto; padding:4px 12px;"
                        onclick="executeDelete('${p.id}', '${p.file_path || ''}')">Del</button>
                </div>
            </div>`;
    }).join('');

    // FIX 5 & 6: Update stat values — these now use .stat-value class for correct color
    document.getElementById('stat-total').textContent = posts.length;
    document.getElementById('stat-expiry').textContent = expiringCount;
    document.getElementById('admin-posts').innerHTML = postsHtml || "<p style='color:var(--text-secondary);'>No posts found.</p>";

    const totalMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
    document.getElementById('stat-storage').textContent = `${totalMB} MB`;
}
