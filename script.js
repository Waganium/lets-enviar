// --- 1. CONFIGURATION & SECURE INITIALIZATION ---
const BUCKET_NAME = 'enviar_files';
const ADMIN_PASS = 'soywaga246'; 

let client = null; // The Supabase client starts as null

// This function "knocks" on your Vercel API door to get the keys
async function initializeApp() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Could not fetch secure configuration');
        
        const config = await response.json();

        // Now we initialize the client with the keys Vercel gave us
        const { createClient } = supabase;
        client = createClient(config.url, config.key);
        
        console.log("✅ Secure connection to Supabase established.");
    } catch (err) {
        console.error("❌ Critical Security Error:", err);
        showAlert("Failed to connect securely. Please refresh the page.", "error");
    }
}

// Start the secure connection immediately
initializeApp();

let selectedFile = null;

// --- 2. UI UTILITIES ---
function showAlert(msg, type = 'success') {
    const div = document.getElementById('alerts');
    if (!div) return;
    const alert = document.createElement('div');
    alert.className = `alert show ${type === 'success' ? 'btn-primary' : 'btn-danger'}`;
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

function switchTab(e, tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById(tab + '-tab').classList.add('active');
}

// --- 3. CORE FEATURES ---
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.size <= 5 * 1024 * 1024) {
        selectedFile = file;
        document.getElementById('file-info').textContent = `✓ Selected: ${file.name}`;
    } else if (file) showAlert("File exceeds 5MB limit", "error");
}

async function createPost() {
    // GUARD: Ensure client is loaded
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

        document.getElementById('create-tab').innerHTML = `
            <div class="card" style="text-align:center; border: 2px solid var(--accent-success);">
                <h3 style="color:var(--accent-success)">Post Created!</h3>
                <p>Delete Code:</p>
                <div style="font-size:32px; font-weight:bold; letter-spacing:4px;">${deleteCode}</div>
                <button class="btn btn-primary" style="margin-top:20px;" onclick="location.reload()">Create Another</button>
            </div>`;
    } catch (err) {
        showAlert(`Error: ${err.message}`, "error");
    } finally { setLoading('btn-create', false); }
}

async function searchPosts() {
    // GUARD: Ensure client is loaded
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
                <small>Expires: ${new Date(p.expires_at).toLocaleTimeString()}</small>
            </div>
            <p>${p.message || ''}</p>
            ${p.file_url ? `<a href="${p.file_url}" target="_blank" class="btn btn-primary" style="display:block; text-decoration:none; margin-top:10px; text-align:center;">Download</a>` : ''}
        </div>`).join('') : "<p>No posts found.</p>";
}

// --- 4. DELETION & ADMIN ---
async function previewDelete() {
    if (!client) return showAlert("System loading...", "error");

    const code = document.getElementById('delete-code-input').value.trim().toUpperCase();
    const previewDiv = document.getElementById('delete-preview');
    const { data, error } = await client.from('posts').select('*').eq('delete_code', code).maybeSingle();
    
    if (error || !data) return showAlert("Invalid code", "error");

    previewDiv.innerHTML = `
        <div class="card" style="border: 1px solid var(--accent-danger);">
            <h3>Confirm Deletion</h3>
            <button class="btn btn-danger" id="btn-confirm-del" onclick="executeDelete('${data.id}', '${data.file_path}')">Delete Permanently</button>
        </div>`;
    document.getElementById('delete-initial').style.display = 'none';
}

async function executeDelete(id, filePath) {
    if (!client) return;
    setLoading('btn-confirm-del', true);
    if (filePath) await client.storage.from(BUCKET_NAME).remove([filePath]);
    await client.from('posts').delete().eq('id', id);
    location.reload();
}

function openAdminModal() { document.getElementById('admin-modal').style.display = 'flex'; }
function closeAdminModal() { document.getElementById('admin-modal').style.display = 'none'; }

function verifyAdmin() {
    if (document.getElementById('admin-pass').value === ADMIN_PASS) {
        closeAdminModal();
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('admin-panel').style.display = 'block';
        loadAdmin();
    } else showAlert("Incorrect password", "error");
}

function exitAdmin() { location.reload(); }

async function loadAdmin() {
    if (!client) return;
    const { data: posts } = await client.from('posts').select('*').order('created_at', { ascending: false });
    document.getElementById('stat-total').textContent = posts ? posts.length : 0;
    document.getElementById('admin-posts').innerHTML = posts ? posts.map(p => `
        <div class="post-item">
            <span>Code: ${p.code} | Del: ${p.delete_code}</span>
            <button class="btn btn-danger" style="width:auto; float:right;" onclick="executeDelete('${p.id}', '${p.file_path}')">Del</button>
        </div>`).join('') : "<p>No posts found.</p>";
}

// --- THEME TOGGLE LOGIC ---
const themeToggle = document.getElementById('theme-toggle');
const htmlElement = document.documentElement;

// 1. Check for saved theme or system preference
const savedTheme = localStorage.getItem('theme') || 'dark';
htmlElement.setAttribute('data-theme', savedTheme);
updateToggleIcon(savedTheme);

themeToggle.addEventListener('click', () => {
    const currentTheme = htmlElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    htmlElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateToggleIcon(newTheme);
});

function updateToggleIcon(theme) {
    themeToggle.textContent = theme === 'dark' ? '🌙 Dark' : '☀️ Light';
}
