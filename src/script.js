import { supabase } from './supabase.js';

// --- DOM Elements ---
const views = document.querySelectorAll('.view');
const bulkOrdersList = document.getElementById('bulkOrdersList');
const settingsForm = document.getElementById('settingsForm');
const sellerNameInput = document.getElementById('sellerName');

// Auth & Menu elements
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const btnAuthSubmit = document.getElementById('btnAuthSubmit');
const btnSwitchAuth = document.getElementById('btnSwitchAuth');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authFormSection = document.getElementById('authFormSection');
const authLoadingState = document.getElementById('authLoadingState');
const profileEmail = document.getElementById('profileEmail');
const btnLogout = document.getElementById('btnLogout');

const menuBtn = document.getElementById('menuBtn');
const navDropdown = document.getElementById('navDropdown');
const menuUserEmail = document.getElementById('menuUserEmail');
const btnLogoutMenu = document.getElementById('btnLogoutMenu');
const dropdownItems = document.querySelectorAll('.dropdown-item');

// Search elements
// ... (keep search elements as they were or just use document.getElementById)
const searchResults = document.getElementById('searchResults');

// Bulk Upload elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');

// Bulk Action elements
const compactActionBar = document.getElementById('compactActionBar');
const btnBulkSend = document.getElementById('btnBulkSend');
const filterSelect = document.getElementById('filterSelect');
const exportSelect = document.getElementById('exportSelect');

// --- State ---
let orders = [];
let uploads = [];
let activeUploadId = null;
let currentFilter = 'all';
let currentDeliveryFilter = 'all';
let currentRiskFilter = 'all';
let guidedActive = false;
let guidedIndex = parseInt(localStorage.getItem('orderPing_guidedIndex')) || 0;
let currentUser = null;
let isSignUp = false;

// --- Database Keys (Legacy LocalStorage support) ---
const DB_UPLOADS_KEY = 'orderping_uploads';
const DB_ORDERS_KEY = 'orderping_bulk_orders';
const DB_SETTINGS_KEY = 'orderping_settings';

const defaultSettings = {
  sellerName: '',
  activeTemplateId: 'default-1',
  templates: [
    {
      id: 'default-1',
      name: 'English COD',
      text: `Hello {name},\nYour order for {product} worth ₹{amount} is confirmed.\n\nReply YES to confirm delivery.`
    },
    {
      id: 'default-2',
      name: 'Hindi COD',
      text: `Namaste {name},\nAapka ₹{amount} ka {product} ka order confirm ho gaya hai.\n\nDelivery confirm karne ke liye YES reply karein.`
    },
    {
      id: 'default-3',
      name: 'Short WA',
      text: `Hi {name}, {product} (₹{amount}) ordered successfully! Reply YES to confirm.`
    }
  ],
  defaultMessage: '' // legacy
};

// --- Supabase Sync Helpers ---

async function fetchFromSupabase() {
  if (!currentUser) return;
  
  try {
    // 1. Fetch settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', currentUser.id)
      .single();
      
    if (settingsData) {
      localStorage.setItem(DB_SETTINGS_KEY, JSON.stringify({
        sellerName: settingsData.seller_name,
        activeTemplateId: settingsData.active_template_id,
        templates: settingsData.templates
      }));
    } else if (settingsError && settingsError.code === 'PGRST116') {
      // Not found, create default
      await saveSettingsToSupabase(defaultSettings);
    }

    // 2. Fetch uploads
    const { data: uploadsData, error: uploadsError } = await supabase
      .from('uploads')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('timestamp', { ascending: false });
      
    if (uploadsData) {
      uploads = uploadsData;
    }

    // 3. Fetch orders
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', currentUser.id);
      
    if (ordersData) {
      orders = ordersData.map(o => ({
        ...o,
        customerName: o.customer_name,
        phoneNumber: o.phone_number,
        productName: o.product_name,
        deliveryStatus: o.delivery_status
      }));
    }

    if (uploads.length > 0) {
      if (!activeUploadId || !uploads.find(u => u.id === activeUploadId)) {
        activeUploadId = uploads[0].id;
      }
    }
    
    renderUploads();
    renderOrders();
    initSettings();
  } catch (err) {
    console.error('Supabase fetch error:', err);
  }
}

async function saveSettingsToSupabase(settings) {
  if (!currentUser) {
    localStorage.setItem(DB_SETTINGS_KEY, JSON.stringify(settings));
    return;
  }
  
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: currentUser.id,
      seller_name: settings.sellerName,
      active_template_id: settings.activeTemplateId,
      templates: settings.templates
    }, { onConflict: 'user_id' });
    
  if (error) console.error('Error saving settings to Supabase:', error);
}

// Function to replace legacy loadOrders
async function loadOrders() {
  if (currentUser) {
    await fetchFromSupabase();
  } else {
    // Fallback to localStorage
    const savedOrders = localStorage.getItem(DB_ORDERS_KEY);
    orders = savedOrders ? JSON.parse(savedOrders) : [];
    
    const savedUploads = localStorage.getItem(DB_UPLOADS_KEY);
    uploads = savedUploads ? JSON.parse(savedUploads) : [];
    
    if (uploads.length > 0) {
      if (!activeUploadId || !uploads.find(u => u.id === activeUploadId)) {
        activeUploadId = uploads[0].id;
      }
    }

    renderUploads();
    renderOrders();
  }
}

// Function to replace legacy saveOrders
async function saveOrders(skipRender = false) {
  if (currentUser) {
    // We'll usually call specific updates for orders/uploads
    // But for simplicity in this migration, let's keep sync logic targeted later
  }
  
  localStorage.setItem(DB_ORDERS_KEY, JSON.stringify(orders));
  localStorage.setItem(DB_UPLOADS_KEY, JSON.stringify(uploads));
  
  if (!skipRender) {
    renderUploads();
    renderOrders();
  }
}

// Function to replace legacy getSettings
function getSettings() {
  const settings = localStorage.getItem(DB_SETTINGS_KEY);
  return settings ? { ...defaultSettings, ...JSON.parse(settings) } : defaultSettings;
}

// Function to replace legacy saveSettings
function saveSettings(settings) {
  localStorage.setItem(DB_SETTINGS_KEY, JSON.stringify(settings));
  saveSettingsToSupabase(settings);
}

// --- Auth Logic ---

// Sync UI with hash
function handleHashChange() {
  const hash = window.location.hash || '#view-home';
  const targetId = hash.replace('#', '');
  
  if (currentUser) {
    if (targetId === 'view-auth') {
      window.location.hash = '#view-home';
      return;
    }
    switchView(targetId);
  } else {
    switchView('view-auth');
  }
}

window.addEventListener('hashchange', handleHashChange);

async function updateAuthState(user) {
  console.log('Auth state update. User:', user ? user.email : 'None');
  currentUser = user;
  
  // Update UI elements
  if (profileEmail) profileEmail.textContent = user ? user.email : 'Not logged in';
  if (menuUserEmail) menuUserEmail.textContent = user ? user.email : 'Not logged in';

  if (user) {
    document.body.classList.remove('auth-mode');
    
    // Redirect if on auth page
    const currentHash = window.location.hash;
    if (!currentHash || currentHash === '#view-auth' || currentHash === '#') {
      console.log('Already logged in, redirecting to home...');
      window.location.hash = '#view-home';
    } else {
      handleHashChange();
    }
    
    // Sync data
    await fetchFromSupabase();
  } else {
    console.log('No active session. Forcing auth view.');
    document.body.classList.add('auth-mode');
    window.location.hash = '#view-auth';
    switchView('view-auth');
    
    // Clear state
    orders = [];
    uploads = [];
    activeUploadId = null;
    loadOrders(); // Load from localStorage as fallback/guest
  }
}

// Initial check
async function initAuth() {
  console.log('Initializing Auth...');
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    
    console.log('Initial session check:', session ? 'Session found' : 'No session');
    updateAuthState(session?.user || null);
  } catch (err) {
    console.error('Auth initialization error:', err);
    updateAuthState(null);
  }
}

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth status change event:', event);
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
    updateAuthState(session?.user || null);
  }
});

btnLogout?.addEventListener('click', async () => handleLogout());
btnLogoutMenu?.addEventListener('click', async () => handleLogout());

async function handleLogout() {
  vibrate(30);
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast(error.message, 'alert-circle');
  } else {
    showToast('Logged out successfully', 'log-out');
    if (navDropdown) navDropdown.classList.add('hidden');
  }
}

// Dropdown Toggle
menuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  navDropdown?.classList.toggle('hidden');
  vibrate(10);
});

document.addEventListener('click', (e) => {
  if (navDropdown && !navDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
    navDropdown.classList.add('hidden');
  }
});

dropdownItems.forEach(item => {
  const target = item.getAttribute('data-target');
  if (target) {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      switchView(target);
      vibrate(20);
      if (navDropdown) navDropdown.classList.add('hidden');
    });
  }
});

btnSwitchAuth?.addEventListener('click', () => {
  isSignUp = !isSignUp;
  vibrate(20);
  
  // Animate transition slightly
  if (authForm) {
    authForm.style.opacity = '0';
    authForm.style.transform = 'translateY(5px)';
    
    setTimeout(() => {
      authTitle.textContent = isSignUp ? 'Get Started Now' : 'Manage COD Orders Faster';
      authSubtitle.textContent = isSignUp ? 'Sync your orders across devices' : 'Secure seller dashboard';
      btnAuthSubmit.querySelector('span').textContent = isSignUp ? 'Sign Up' : 'Login';
      btnSwitchAuth.textContent = isSignUp ? 'Already have an account? Login' : 'Create Account';
      
      authForm.style.opacity = '1';
      authForm.style.transform = 'translateY(0)';
    }, 150);
  }
});

authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;
  
  if (!email || !password) {
    showToast('Please enter both email and password', 'alert-circle');
    return;
  }
  
  console.log(`Starting ${isSignUp ? 'signup' : 'login'} process for: ${email}`);
  
  // Show loading
  if (authFormSection) authFormSection.classList.add('hidden');
  if (authLoadingState) authLoadingState.classList.remove('hidden');

  try {
    let response;
    if (isSignUp) {
      response = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          emailRedirectTo: window.location.origin
        }
      });
    } else {
      console.log('Attempting sign-in with password...');
      response = await supabase.auth.signInWithPassword({ email, password });
    }
    
    const { data, error } = response;
    console.log('Auth response received:', { data, error });
    
    if (error) {
      console.error('Auth error returned from Supabase:', error.message);
      showToast(error.message, 'alert-circle');
      
      // Re-enable form
      if (authFormSection) authFormSection.classList.remove('hidden');
      if (authLoadingState) authLoadingState.classList.add('hidden');
    } else {
      console.log('Auth success:', isSignUp ? 'Signup' : 'Login');
      
      if (isSignUp && !data.session) {
        showToast('Verification email sent! Check your inbox.', 'mail');
        // Reset view for login
        isSignUp = false;
        if (authForm) {
          authTitle.textContent = 'Verify Your Email';
          authSubtitle.textContent = 'Check your inbox for a confirmation link';
          btnAuthSubmit.querySelector('span').textContent = 'Login';
          btnSwitchAuth.textContent = 'Create Account';
        }
        if (authFormSection) authFormSection.classList.remove('hidden');
        if (authLoadingState) authLoadingState.classList.add('hidden');
      } else {
        const welcomeMsg = isSignUp ? 'Account created! Welcome.' : 'Welcome back!';
        showToast(welcomeMsg, 'check-circle-2');
        
        // Session change listener will ideally handle the state update,
        // but let's be proactive if needed.
        if (data.session) {
          await updateAuthState(data.session.user);
        }
      }
    }
  } catch (err) {
    console.error('Caught exception during auth:', err);
    showToast('Authentication error. See console.', 'alert-circle');
    
    // Always clear loading
    if (authFormSection) authFormSection.classList.remove('hidden');
    if (authLoadingState) authLoadingState.classList.add('hidden');
  }
});

// Forgot password link
document.querySelector('.forgot-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  showToast('Password reset is coming soon.', 'info');
});

// --- Utils ---
function updateBulkActionBar() {
  // No-op for now, simplified view management
}

function vibrate(pattern = 50) {
  if (isHapticEnabled() && navigator.vibrate) navigator.vibrate(pattern);
}

function showToast(message, icon = 'check-circle-2') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3000);
}

function switchView(targetViewId) {
  views.forEach(view => {
    if (!view.classList.contains('overlay-view')) {
      view.classList.remove('active');
      view.classList.add('hidden'); // Ensure hidden is applied/removed properly
      if (view.id === targetViewId) {
        view.classList.add('active');
        view.classList.remove('hidden');
      }
    }
  });

  dropdownItems.forEach(item => {
    item.classList.remove('active');
    if (item.dataset.target === targetViewId) item.classList.add('active');
  });
  
  if (navDropdown) navDropdown.classList.add('hidden');
}

function generateMessage(order) {
  const settings = getSettings();
  
  // Use new template system
  let template = settings.templates.find(t => t.id === settings.activeTemplateId);
  let msg = template ? template.text : settings.defaultMessage;
  
  msg = msg.replace(/\[Name\]|\{name\}/gi, String(order.customerName || 'Customer'));
  msg = msg.replace(/\[Product\]|\{product\}/gi, String(order.productName || 'Product'));
  msg = msg.replace(/\[Amount\]|\{amount\}|\{price\}/gi, String(order.amount || '0'));
  msg = msg.replace(/\[Phone\]|\{phone\}/gi, String(order.phoneNumber || ''));
  msg = msg.replace(/\[Date\]|\{date\}/gi, new Date().toLocaleDateString());
  return msg;
}

// --- Risk Evaluation ---
function evalRisk(order) {
  const allPhones = orders.filter(o => o.phoneNumber === order.phoneNumber);
  
  if (parseFloat(order.amount) >= 5000) {
    return { level: 'medium', label: '🟡 Medium Risk (High COD Amount)', value: 'medium' };
  }
  
  if (allPhones.length > 1) {
    // Repeated phone number
    const cancelled = allPhones.filter(o => o.deliveryStatus === 'Cancelled');
    if (cancelled.length > 0) {
      return { level: 'high', label: '🔴 High Risk (Repeated Cancellations)', value: 'high' };
    }
    return { level: 'medium', label: '🟡 Medium Risk (Repeated Customer)', value: 'medium' };
  }
  
  return { level: 'low', label: '🟢 Low Risk', value: 'low' };
}

// --- Validation Helpers ---
function isValidIndianPhone(phoneStr) {
  if (!phoneStr) return false;
  const digits = String(phoneStr).replace(/\D/g, '');
  
  let clean = digits;
  if (clean.length === 12 && clean.startsWith('91')) clean = clean.substring(2);
  else if (clean.length === 11 && clean.startsWith('0')) clean = clean.substring(1);
  
  if (clean.length !== 10) return false;
  if (!/^[6-9]\d{9}$/.test(clean)) return false;
  
  const repeats = ['0000000000','1111111111','2222222222','3333333333','4444444444','5555555555','6666666666','7777777777','8888888888','9999999999'];
  if (repeats.includes(clean)) return false;
  
  return clean;
}

function isValidAmount(amountStr) {
  if (amountStr === null || amountStr === undefined || amountStr === '') return false;
  const clean = String(amountStr).replace(/[^\d.]/g, '');
  if (!clean) return false;
  const val = parseFloat(clean);
  if (isNaN(val) || val <= 0 || val > 1000000) return false;
  if (clean.length >= 10) return false; 
  return clean;
}

// --- Parsers ---

// Setup PDF worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

async function parseFile(file) {
  try {
    showToast('Parsing file...', 'loader-2');
    let res = null;
    
    if (file.name.toLowerCase().endsWith('.pdf')) {
      res = await parsePDF(file);
    } else {
      res = await parseExcelCSV(file);
    }
    
    const { extracted, invalidCount } = res;
    
    // Create new upload entry
    const newUploadId = 'up_' + Date.now();
    
    const unique = [];
    const seenPhones = new Set();
    let dupCount = 0;
    
    extracted.forEach(o => {
      // Very basic dedup within the file
      if (!seenPhones.has(o.phoneNumber)) {
        seenPhones.add(o.phoneNumber);
        o.uploadId = newUploadId;
        unique.push(o);
      } else {
        dupCount++;
      }
    });

    if (unique.length > 0) {
      const newUpload = {
        id: newUploadId,
        filename: file.name,
        total: unique.length,
        timestamp: new Date().toISOString()
      };
      
      uploads.unshift(newUpload);
      activeUploadId = newUploadId;
      orders = [...unique, ...orders];
      
      if (currentUser) {
        // Save to Supabase
        await supabase.from('uploads').insert({
          id: newUploadId,
          user_id: currentUser.id,
          filename: file.name,
          total: unique.length,
          timestamp: newUpload.timestamp
        });
        
        await supabase.from('orders').insert(unique.map(o => ({
          id: o.id,
          user_id: currentUser.id,
          upload_id: newUploadId,
          customer_name: o.customerName,
          phone_number: o.phoneNumber,
          product_name: o.productName,
          amount: o.amount,
          status: o.status,
          delivery_status: o.deliveryStatus,
          notes: o.notes,
          timestamp: o.timestamp
        })));
      }
      
      saveOrders();
      showToast(`Added ${unique.length} new orders!`, 'check-circle-2');
      vibrate(50);
      switchView('view-orders'); // Move to dashboard on successful upload
    } else {
      showToast('No valid new orders found in file.', 'x');
    }
    
    if (dupCount > 0) {
      setTimeout(() => {
        showToast(`${dupCount} duplicate rows in file removed`, 'info');
      }, 3000);
    }
    
    if (invalidCount > 0) {
      setTimeout(() => {
        showToast(`${invalidCount} invalid rows skipped`, 'info');
      }, 4500);
    }

  } catch (err) {
    console.error(err);
    showToast('Error parsing file', 'alert-circle');
  } finally {
    fileInput.value = ''; // Reset
  }
}

async function parseExcelCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet, { header: "A", defval: "" });
        
        const extracted = [];
        let invalidCount = 0;

        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          
          let nameRaw = String(row["A"] || '').trim();
          let phoneRaw = String(row["B"] || '').trim();
          let productRaw = String(row["C"] || '').trim();
          let priceRaw = String(row["D"] || '').trim();
          
          if (!nameRaw && !phoneRaw && !productRaw && !priceRaw) continue; // Empty row
          
          // Skip header row if it seems to be headers
          if (i === 0 && (nameRaw.toLowerCase().includes('name') || phoneRaw.toLowerCase().includes('phone'))) {
            continue;
          }

          const phone = isValidIndianPhone(phoneRaw);
          const price = isValidAmount(priceRaw);

          if (!nameRaw || !phone || !price || !productRaw) {
            invalidCount++;
            continue;
          }

         extracted.push({
            id: Date.now() + Math.random().toString(36).substring(2, 9),
            uploadId: null, // will be set in parseFile
            customerName: nameRaw,
            phoneNumber: phone,
            productName: productRaw,
            amount: price,
            status: 'pending',
            deliveryStatus: 'Pending',
            notes: '',
            timestamp: new Date().toISOString()
          });
        }
        
        resolve({ extracted, invalidCount });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function parsePDF(file) {
  return new Promise(async (resolve, reject) => {
    try {
      const data = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\n';
      }
      
      const lines = fullText.split(/[\n,]/).filter(l => l.trim().length > 0);
      const phoneRegex = /(?:\+?91|0)?[6-9]\d{9}/g;
      
      let parsed = [];
      let invalidCount = 0;

      lines.forEach((line) => {
        const match = line.match(phoneRegex);
        if (match) {
          const phoneRaw = match[0];
          const phone = isValidIndianPhone(phoneRaw);
          
          let priceMatch = line.match(/₹?\s*(\d+[.,]?\d*)/);
          let priceRaw = priceMatch ? priceMatch[1] : '';
          const price = isValidAmount(priceRaw);

          let name = line.replace(phoneRegex, '').replace(priceRaw, '').replace(/[₹,]/g, '').trim();
          name = name.substring(0, 30).trim();
          
          if (!phone || !price || !name) {
             invalidCount++;
             return;
          }

          parsed.push({
             id: Date.now() + Math.random().toString(36).substring(2, 9),
             uploadId: null, // will be set in parseFile
             customerName: name,
             phoneNumber: phone,
             productName: 'Ordered item',
             amount: price,
             status: 'pending',
             deliveryStatus: 'Pending',
             notes: '',
             timestamp: new Date().toISOString()
          });
        }
      });

      resolve({ extracted: parsed, invalidCount });
    } catch(err) {
      reject(err);
    }
  });
}

// --- Renderers ---
function renderUploads() {
  const list = document.getElementById('recentUploadsList');
  if (!list) return;

  if (uploads.length === 0) {
    list.innerHTML = `<div class="empty-state">No upload history found.</div>`;
    return;
  }

  list.innerHTML = uploads.map(u => `
    <div class="upload-history-card" onclick="reopenUpload('${u.id}')">
      <div class="uh-info">
        <h4>${u.filename}</h4>
        <p>${new Date(u.timestamp).toLocaleString()} • ${u.total} orders</p>
      </div>
      <div class="uh-actions">
        ${u.id === activeUploadId ? `<span class="badge" style="background:var(--primary);color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;">ACTIVE</span>` : ''}
        <button class="icon-action-btn btn-delete" onclick="event.stopPropagation(); deleteUpload('${u.id}')">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    </div>
  `).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderOrders() {
  const statTotal = document.getElementById('statTotal');
  const statPending = document.getElementById('statPending');
  const statConfirmed = document.getElementById('statConfirmed');
  const statRisk = document.getElementById('statRisk');

  if (!orders || orders.length === 0) {
    if (statTotal) statTotal.textContent = '--';
    if (statPending) statPending.textContent = '--';
    if (statConfirmed) statConfirmed.textContent = '--';
    if (statRisk) statRisk.textContent = '--';
    
    bulkOrdersList.innerHTML = `
      <div class="dashboard-empty-state">
        <div class="de-icon-wrap">
          <i data-lucide="package-open" class="de-icon"></i>
        </div>
        <h3 class="de-title">Awaiting Orders</h3>
        <p class="de-subtitle">Upload your first batch to start tracking and messaging customers instantly.</p>
        <button class="de-action-btn" onclick="switchView('view-home')">
          Go to Home
        </button>
      </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  // Filter based on currently active upload
  const activeOrders = orders.filter(o => o.uploadId === activeUploadId);

  // Update Stats
  if (statTotal) statTotal.textContent = activeOrders.length;
  if (statPending) {
    statPending.textContent = activeOrders.filter(o => o.deliveryStatus === 'Pending').length;
  }
  if (statConfirmed) {
    statConfirmed.textContent = activeOrders.filter(o => o.deliveryStatus === 'Confirmed').length;
  }
  if (statRisk) {
    statRisk.textContent = activeOrders.filter(o => evalRisk(o).level === 'high').length;
  }

  // Apply filters
  const waFilter = document.getElementById('filterSelect')?.value || 'all';
  const deliveryFilter = document.getElementById('deliveryFilter')?.value || 'all';
  const riskFilter = document.getElementById('riskFilter')?.value || 'all';
  const q = document.getElementById('smartSearchInput')?.value.toLowerCase() || '';

  const filtered = activeOrders.filter(o => {
    if (waFilter !== 'all' && o.status !== waFilter) return false;
    if (deliveryFilter !== 'all' && o.deliveryStatus !== deliveryFilter) return false;
    if (riskFilter !== 'all') {
      const riskLevel = evalRisk(o).level;
      if (riskLevel !== riskFilter) return false;
    }
    if (q) {
      if (!((o.customerName && o.customerName.toLowerCase().includes(q)) || 
            (o.productName && o.productName.toLowerCase().includes(q)) ||
            (o.phoneNumber && o.phoneNumber.includes(q)))) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    bulkOrdersList.innerHTML = `
      <div class="empty-state" style="padding: 48px 20px;">
        <i data-lucide="filter" class="mb-4 opacity-50 block mx-auto w-12 h-12 text-slate-500"></i>
        <p class="text-lg">No orders match these filters.</p>
      </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  bulkOrdersList.innerHTML = filtered.map(order => {
    const risk = evalRisk(order);
    const hasNotes = !!order.notes;
    return `
    <div class="bulk-order-card ${order.status}" data-id="${order.id}">
      <div class="card-top-badges">
        <div class="status-badge ${order.status}">${order.status}</div>
        <div class="risk-badge risk-${risk.level}">${risk.label}</div>
      </div>
      
      <div class="bulk-order-header border-b border-[#334155] border-opacity-50 pb-3 mb-3">
        <div>
          <h3 class="customer-name" style="font-size:1.125rem">${order.customerName}</h3>
          <p class="customer-phone" style="font-family:monospace">${order.phoneNumber}</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="icon-action-btn ${hasNotes ? 'bg-blue-500/20 text-blue-400' : ''}" onclick="toggleNotes('${order.id}')">
            <i data-lucide="file-edit"></i>
          </button>
          <button class="icon-action-btn btn-delete" onclick="deleteOrder('${order.id}')">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
      
      <div class="bulk-order-details" style="grid-template-columns: 1fr 1fr;">
        <div class="detail-col">
          <label>Product & Amount</label>
          <p class="truncate text-sm text-white">${order.productName}</p>
          <p class="price-text mt-1 text-sm">₹${order.amount}</p>
        </div>
        <div class="detail-col">
          <label>Delivery Status</label>
          <div class="delivery-select-wrap mt-1">
            <select class="delivery-select" onchange="updateDeliveryStatus('${order.id}', this.value)">
              <option value="Pending" ${order.deliveryStatus === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="Confirmed" ${order.deliveryStatus === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
              <option value="Packed" ${order.deliveryStatus === 'Packed' ? 'selected' : ''}>Packed</option>
              <option value="Shipped" ${order.deliveryStatus === 'Shipped' ? 'selected' : ''}>Shipped</option>
              <option value="Delivered" ${order.deliveryStatus === 'Delivered' ? 'selected' : ''}>Delivered</option>
              <option value="Cancelled" ${order.deliveryStatus === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
            <i data-lucide="chevron-down"></i>
          </div>
        </div>
      </div>

      <div class="order-notes-wrapper ${hasNotes ? '' : 'hidden'}" id="notes_wrapper_${order.id}">
        <textarea id="notes_text_${order.id}" class="order-notes-textarea" placeholder="Add seller notes here..." onblur="saveNotes('${order.id}', this.value)">${order.notes || ''}</textarea>
      </div>

      <div class="bulk-order-actions mt-3 pt-3 border-t border-[#334155] border-opacity-50">
        <button class="action-btn btn-wa flex-1" onclick="sendWA('${order.id}')">
          <i data-lucide="message-circle"></i> Send WA
        </button>
        <button class="action-btn btn-copy" onclick="copyMessage('${order.id}')">
          <i data-lucide="copy"></i>
        </button>
        <button class="icon-action-btn btn-toggle ${order.status === 'confirmed' ? 'active' : ''}" onclick="toggleStatus('${order.id}')">
          <i data-lucide="check"></i>
        </button>
      </div>
    </div>
  `}).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}


// --- Global Actions (attached to window for onclick) ---
window.toggleNotes = (id) => {
  const el = document.getElementById(`notes_wrapper_${id}`);
  if (el) {
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) {
      const ta = document.getElementById(`notes_text_${id}`);
      if (ta) ta.focus();
    }
  }
};

window.saveNotes = async (id, text) => {
  const order = orders.find(o => o.id === id);
  if (order) {
    order.notes = text;
    saveOrders(true); // skip render to keep focus
    
    if (currentUser) {
      await supabase.from('orders').update({ notes: text }).eq('id', id);
    }
    
    // Update icon highlight
    const card = document.querySelector(`.bulk-order-card[data-id="${id}"]`);
    if (card) {
      const btn = card.querySelector('button[onclick*="toggleNotes"]');
      if (text) {
        btn.classList.add('bg-blue-500/20', 'text-blue-400');
      } else {
        btn.classList.remove('bg-blue-500/20', 'text-blue-400');
        document.getElementById(`notes_wrapper_${id}`).classList.add('hidden');
      }
    }
  }
};

window.updateDeliveryStatus = async (id, value) => {
  const order = orders.find(o => o.id === id);
  if (order) {
    order.deliveryStatus = value;
    saveOrders(true);
    
    if (currentUser) {
      await supabase.from('orders').update({ delivery_status: value }).eq('id', id);
    }
    
    showToast(`Status updated to ${value}`, 'check');
    
    // If it was cancelled, re-render to update the risk badge immediately
    if (value === 'Cancelled' || order.deliveryStatus === 'Cancelled') {
       renderOrders();
    }
  }
};

window.setDeliveryFilter = (val) => {
  const el = document.getElementById('deliveryFilter');
  if (el) {
    el.value = val;
    renderOrders();
    vibrate(15);
  }
};

window.setRiskFilter = (val) => {
  const el = document.getElementById('riskFilter');
  if (el) {
    el.value = val;
    renderOrders();
    vibrate(15);
  }
};

window.deleteUpload = async (id) => {
  if (confirm("Are you sure you want to delete this upload and all its orders?")) {
    uploads = uploads.filter(u => u.id !== id);
    orders = orders.filter(o => o.uploadId !== id);
    if (activeUploadId === id) {
      activeUploadId = uploads.length > 0 ? uploads[0].id : null;
    }
    
    if (currentUser) {
      await supabase.from('orders').delete().eq('upload_id', id);
      await supabase.from('uploads').delete().eq('id', id);
    }
    
    saveOrders();
    vibrate(30);
  }
};

window.reopenUpload = (id) => {
  activeUploadId = id;
  switchView('view-orders');
  renderUploads();
  renderOrders();
};

window.deleteOrder = async (id) => {
  if (confirm("Are you sure you want to delete this order?")) {
    orders = orders.filter(o => o.id !== id);
    if (currentUser) {
      await supabase.from('orders').delete().eq('id', id);
    }
    saveOrders();
    vibrate(30);
  }
};

window.toggleStatus = async (id) => {
  const order = orders.find(o => o.id === id);
  if (order) {
    order.status = order.status === 'confirmed' ? 'pending' : 'confirmed';
    saveOrders(true);
    vibrate(30);
    
    if (currentUser) {
      await supabase.from('orders').update({ status: order.status }).eq('id', id);
    }
    
    // Update DOM directly instead of full renderOrders to save performance
    const card = document.querySelector(`.bulk-order-card[data-id="${id}"]`);
    if (card) {
      card.className = `bulk-order-card ${order.status}`;
      const badge = card.querySelector('.status-badge');
      if (badge) {
        badge.className = `status-badge ${order.status}`;
        badge.textContent = order.status;
      }
      const toggleBtn = card.querySelector('.btn-toggle');
      if (toggleBtn) {
        if (order.status === 'confirmed') {
          toggleBtn.classList.add('active');
        } else {
          toggleBtn.classList.remove('active');
        }
      }
    }
  }
};

window.sendWA = async (id) => {
  const order = orders.find(o => o.id === id);
  if (!order) return;
  
  const msg = generateMessage(order);
  let ph = order.phoneNumber.replace(/\D/g, '');
  if (ph.length === 10) ph = '91' + ph;
  
  const url = `https://wa.me/${ph}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
  
  // Mark as opened
  if (order.status !== 'confirmed') {
    order.status = 'opened'; 
    saveOrders(true);
    
    if (currentUser) {
      await supabase.from('orders').update({ status: 'opened' }).eq('id', id);
    }
    
    // Update DOM directly instead of full re-render
    const card = document.querySelector(`.bulk-order-card[data-id="${id}"]`);
    if (card) {
      card.className = `bulk-order-card ${order.status}`;
      const badge = card.querySelector('.status-badge');
      if (badge) {
        badge.className = `status-badge ${order.status}`;
        badge.textContent = order.status;
      }
    }
  }
  
  showToast('WhatsApp opened', 'message-circle');
  vibrate(40);
};

window.copyMessage = (id) => {
  const order = orders.find(o => o.id === id);
  if (!order) return;
  
  const msg = generateMessage(order);
  navigator.clipboard.writeText(msg).then(() => {
    vibrate(40);
    showToast('Message copied!', 'copy');
  }).catch(err => {
    console.error(err);
    showToast('Copy failed', 'x');
  });
};


// --- Listeners ---
uploadArea.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) parseFile(file);
});

document.getElementById('filterSelect')?.addEventListener('change', () => renderOrders());
document.getElementById('deliveryFilter')?.addEventListener('change', () => renderOrders());
document.getElementById('riskFilter')?.addEventListener('change', () => renderOrders());
document.getElementById('smartSearchInput')?.addEventListener('input', () => renderOrders());

exportSelect?.addEventListener('change', (e) => {
  const val = e.target.value;
  if (!val) return;
  
  const activeOrders = orders.filter(o => o.uploadId === activeUploadId);
  const ordersToExport = val === 'all' ? activeOrders : activeOrders.filter(o => o.status === val);
  exportToCSV(ordersToExport, `${val}_orders.csv`);
  
  exportSelect.value = "";
});

// Navigation handled via dropdown items

// --- Template & Settings Logic ---
const templateSelect = document.getElementById('templateSelect');
const templateIdInput = document.getElementById('templateId');
const templateNameInput = document.getElementById('templateName');
const templateTextInput = document.getElementById('templateText');

function initSettings() {
  const s = getSettings();
  if (sellerNameInput) sellerNameInput.value = s.sellerName;
  populateTemplateSelect(s);
  loadTemplateForm(s.activeTemplateId, s);
}

function populateTemplateSelect(s) {
  if (!templateSelect) return;
  templateSelect.innerHTML = s.templates.map(t => 
    `<option value="${t.id}" ${t.id === s.activeTemplateId ? 'selected' : ''}>${t.name}</option>`
  ).join('');
}

function loadTemplateForm(id, s) {
  const t = s.templates.find(x => x.id === id);
  if (t) {
    templateIdInput.value = t.id;
    templateNameInput.value = t.name;
    templateTextInput.value = t.text;
  }
}

templateSelect?.addEventListener('change', (e) => {
  const s = getSettings();
  s.activeTemplateId = e.target.value;
  saveSettings(s);
  loadTemplateForm(s.activeTemplateId, s);
  vibrate(20);
});

document.getElementById('btnSaveTemplate')?.addEventListener('click', () => {
  if (!templateNameInput.value || !templateTextInput.value) {
    showToast('Name and Content are required', 'alert-circle');
    return;
  }
  
  const s = getSettings();
  const id = templateIdInput.value || ('tpl_' + Date.now());
  const index = s.templates.findIndex(t => t.id === id);
  
  const tpl = {
    id,
    name: templateNameInput.value,
    text: templateTextInput.value
  };
  
  if (index >= 0) {
    s.templates[index] = tpl;
  } else {
    s.templates.push(tpl);
  }
  
  s.activeTemplateId = id;
  saveSettings(s);
  populateTemplateSelect(s);
  loadTemplateForm(id, s);
  
  vibrate(30);
  showToast('Template saved', 'check');
});

document.getElementById('btnNewTemplate')?.addEventListener('click', () => {
  templateIdInput.value = '';
  templateNameInput.value = '';
  templateTextInput.value = '';
  templateNameInput.focus();
});

document.getElementById('btnDeleteTemplate')?.addEventListener('click', () => {
  const id = templateIdInput.value;
  if (!id) return;
  
  const s = getSettings();
  if (s.templates.length <= 1) {
    showToast('Cannot delete the last template', 'alert-circle');
    return;
  }
  
  if (confirm('Delete this template?')) {
    s.templates = s.templates.filter(t => t.id !== id);
    s.activeTemplateId = s.templates[0].id;
    saveSettings(s);
    populateTemplateSelect(s);
    loadTemplateForm(s.activeTemplateId, s);
    showToast('Template deleted', 'trash');
  }
});

settingsForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const s = getSettings();
  s.sellerName = sellerNameInput.value;
  saveSettings(s);
  vibrate(40);
  showToast('Store settings saved!');
});

// INIT
initSettings();
initAuth();

// Settings extra listeners
const hapticToggle = document.getElementById('hapticToggle');
if (hapticToggle) {
  hapticToggle.checked = localStorage.getItem('orderPing_haptic') !== 'false';
  hapticToggle.addEventListener('change', (e) => {
    localStorage.setItem('orderPing_haptic', e.target.checked);
    if (e.target.checked) vibrate(20);
  });
}

const isHapticEnabled = () => localStorage.getItem('orderPing_haptic') !== 'false';

function startGuidedWorkflow() {
  if (orders.length === 0) return;
  
  guidedActive = true;
  document.body.classList.add('guided-active');
  
  // Show Guided UI
  const progContainer = document.getElementById('guidedProgressContainer');
  const botBar = document.getElementById('guidedBottomBar');
  if (progContainer) progContainer.classList.remove('hidden');
  if (botBar) {
    botBar.classList.remove('hidden');
    setTimeout(() => botBar.classList.add('active'), 10);
  }
  
  if (filterSelect) filterSelect.value = 'all';
  renderOrders('all');
  
  if (isNaN(guidedIndex) || guidedIndex < 0 || guidedIndex >= orders.length) {
    guidedIndex = 0;
  }
  
  // Skip to first unconfirmed
  let startIndex = guidedIndex;
  while(startIndex < orders.length && orders[startIndex].status === 'confirmed') {
    startIndex++;
  }
  
  if (startIndex < orders.length) {
    guidedIndex = startIndex;
  } else {
    startIndex = 0;
    while(startIndex < orders.length && orders[startIndex].status === 'confirmed') {
      startIndex++;
    }
    if (startIndex < orders.length) {
      guidedIndex = startIndex;
    } else {
      guidedIndex = 0;
    }
  }
  
  localStorage.setItem('orderPing_guidedIndex', guidedIndex);
  updateGuidedUI();
  
  // Open WA for the first one automatically
  openWhatsAppForGuided();
}

function stopGuidedWorkflow() {
  guidedActive = false;
  document.body.classList.remove('guided-active');
  
  const progContainer = document.getElementById('guidedProgressContainer');
  const botBar = document.getElementById('guidedBottomBar');
  
  if (progContainer) progContainer.classList.add('hidden');
  if (botBar) {
    botBar.classList.remove('active');
    setTimeout(() => botBar.classList.add('hidden'), 300);
  }
  
  document.querySelectorAll('.bulk-order-card').forEach(c => c.classList.remove('guided-highlight'));
  updateBulkActionBar();
}

function updateGuidedUI() {
  if (!guidedActive) return;
  
  const confirmedCount = orders.filter(o => o.status === 'confirmed').length;
  const totalCount = orders.length;
  
  const progressText = document.getElementById('guidedProgressText');
  const progressFill = document.getElementById('guidedProgressFill');
  
  if (progressText) progressText.textContent = `${confirmedCount} of ${totalCount} orders processed`;
  if (progressFill) {
    const pct = totalCount === 0 ? 0 : (confirmedCount / totalCount) * 100;
    progressFill.style.width = `${pct}%`;
  }
  
  document.querySelectorAll('.bulk-order-card').forEach(c => c.classList.remove('guided-highlight'));
  if (guidedIndex < orders.length) {
    const currentOrder = orders[guidedIndex];
    const card = document.querySelector(`.bulk-order-card[data-id="${currentOrder.id}"]`);
    if (card) {
      card.classList.add('guided-highlight');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function openWhatsAppForGuided() {
  if (guidedIndex >= orders.length) return;
  const order = orders[guidedIndex];
  
  if (order.status === 'pending') {
    order.status = 'opened';
    saveOrders(true);
    
    const card = document.querySelector(`.bulk-order-card[data-id="${order.id}"]`);
    if (card) {
      card.className = `bulk-order-card ${order.status} guided-highlight`;
      const badge = card.querySelector('.status-badge');
      if (badge) {
        badge.className = `status-badge ${order.status}`;
        badge.textContent = order.status;
      }
    }
  }
  
  const msg = generateMessage(order);
  let ph = order.phoneNumber.replace(/\D/g, '');
  if (ph.length === 10) ph = '91' + ph;
  const url = `https://wa.me/${ph}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

document.getElementById('btnGuidedNext')?.addEventListener('click', () => {
  if (guidedIndex < orders.length - 1) {
    guidedIndex++;
    localStorage.setItem('orderPing_guidedIndex', guidedIndex);
    updateGuidedUI();
    openWhatsAppForGuided();
  } else {
    showToast('You reached the end of the list.');
  }
});

document.getElementById('btnGuidedPrev')?.addEventListener('click', () => {
  if (guidedIndex > 0) {
    guidedIndex--;
    localStorage.setItem('orderPing_guidedIndex', guidedIndex);
    updateGuidedUI();
  } else {
    showToast('Already at the first order.');
  }
});

document.getElementById('btnGuidedConfirm')?.addEventListener('click', () => {
  if (guidedIndex >= orders.length) return;
  const order = orders[guidedIndex];
  
  if (order.status !== 'confirmed') {
    order.status = 'confirmed';
    saveOrders(true);
    
    const card = document.querySelector(`.bulk-order-card[data-id="${order.id}"]`);
    if (card) {
      card.className = `bulk-order-card ${order.status} guided-highlight`;
      const badge = card.querySelector('.status-badge');
      if (badge) {
        badge.className = `status-badge ${order.status}`;
        badge.textContent = order.status;
      }
    }
    
    updateGuidedUI();
    vibrate(20);
    showToast('Order confirmed', 'check');
  } else {
    showToast('Order already confirmed');
  }
});

document.getElementById('btnExitGuided')?.addEventListener('click', stopGuidedWorkflow);

btnBulkSend?.addEventListener('click', startGuidedWorkflow);

// --- Export Functionality ---
function exportToCSV(ordersToExport, filename) {
  if (!ordersToExport || ordersToExport.length === 0) {
    showToast('No orders to export', 'info');
    return;
  }
  
  const headers = ['Name', 'Phone', 'Product', 'Amount', 'Status', 'Date'];
  const rows = ordersToExport.map(o => [
    `"${o.customerName || ''}"`,
    `"${o.phoneNumber || ''}"`,
    `"${o.productName || ''}"`,
    `"${o.amount || ''}"`,
    `"${o.status || ''}"`,
    `"${new Date(o.timestamp).toLocaleString()}"`
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- Delete All Functionality ---
const btnSettingsDeleteAll = document.getElementById('btnSettingsDeleteAll');
const deleteModal = document.getElementById('deleteModal');
const btnCancelDelete = document.getElementById('btnCancelDelete');
const btnConfirmDelete = document.getElementById('btnConfirmDelete');

btnSettingsDeleteAll?.addEventListener('click', () => {
  if (guidedActive) {
    showToast('Stop guided workflow before deleting.', 'alert-triangle');
    vibrate([50, 50, 50]);
    return;
  }
  deleteModal.classList.remove('hidden');
  vibrate(20);
});

btnCancelDelete?.addEventListener('click', () => {
  deleteModal.classList.add('hidden');
});

btnConfirmDelete?.addEventListener('click', async () => {
  deleteModal.classList.add('hidden');
  
  // Reset state completely
  orders = [];
  uploads = [];
  activeUploadId = null;
  
  if (currentUser) {
    await supabase.from('orders').delete().eq('user_id', currentUser.id);
    await supabase.from('uploads').delete().eq('user_id', currentUser.id);
  }

  currentFilter = 'all';
  if (document.getElementById('filterSelect')) document.getElementById('filterSelect').value = 'all';
  if (document.getElementById('deliveryFilter')) document.getElementById('deliveryFilter').value = 'all';
  if (document.getElementById('riskFilter')) document.getElementById('riskFilter').value = 'all';
  if (document.getElementById('smartSearchInput')) document.getElementById('smartSearchInput').value = '';

  saveOrders();
  vibrate([40, 50, 40]);
  showToast('All data deleted', 'check-circle-2');
  switchView('view-home');
});

// --- Smart Auto-Hide Header on Scroll ---
let lastScrollY = window.scrollY;
let upScrollAccumulator = 0;
let isScrolling = false;
const UP_SCROLL_THRESHOLD = 60;

window.addEventListener('scroll', () => {
  if (!isScrolling) {
    window.requestAnimationFrame(() => {
      const dashboardControls = document.querySelector('.dashboard-controls');
      if (!dashboardControls) {
        isScrolling = false;
        return;
      }
      
      // Only apply when in orders view and not in guided mode
      const viewOrders = document.getElementById('view-orders');
      if (viewOrders && !viewOrders.classList.contains('active')) {
        isScrolling = false;
        return;
      }
      if (document.body.classList.contains('guided-active')) {
        isScrolling = false;
        return;
      }

      const currentScrollY = window.scrollY;
      const deltaY = currentScrollY - lastScrollY;
      
      if (currentScrollY <= 80) {
        // Always show at the very top
        dashboardControls.classList.remove('hidden-scroll');
        upScrollAccumulator = 0;
      } else if (deltaY > 0) {
        // Scrolling down
        dashboardControls.classList.add('hidden-scroll');
        upScrollAccumulator = 0; // Reset UP count
      } else if (deltaY < 0) {
        // Scrolling up
        upScrollAccumulator += Math.abs(deltaY);
        if (upScrollAccumulator >= UP_SCROLL_THRESHOLD) {
          dashboardControls.classList.remove('hidden-scroll');
        }
      }
      
      lastScrollY = currentScrollY;
      isScrolling = false;
    });
    isScrolling = true;
  }
}, { passive: true });
