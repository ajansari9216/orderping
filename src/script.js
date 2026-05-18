import { supabase } from './supabase.js';
import Papa from 'papaparse';

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

// Order Modal elements
const orderModal = document.getElementById('orderModal');
const orderForm = document.getElementById('orderForm');
const btnAddOrder = document.getElementById('btnAddOrder');
const btnCancelOrder = document.getElementById('btnCancelOrder');
const btnCloseOrderModal = document.getElementById('btnCloseOrderModal');
const orderModalTitle = document.getElementById('orderModalTitle');
const editOrderId = document.getElementById('editOrderId');

const orderCustomerName = document.getElementById('orderCustomerName');
const orderPhone = document.getElementById('orderPhone');
const orderProduct = document.getElementById('orderProduct');
const orderAmount = document.getElementById('orderAmount');
const orderStatus = document.getElementById('orderStatus');
const orderNotes = document.getElementById('orderNotes');

// CSV Modal elements
const csvPreviewModal = document.getElementById('csvPreviewModal');
const csvPreviewHeader = document.getElementById('csvPreviewHeader');
const csvPreviewBody = document.getElementById('csvPreviewBody');
const csvImportStats = document.getElementById('csvImportStats');
const btnConfirmCsvImport = document.getElementById('btnConfirmCsvImport');
const btnCancelCsvImport = document.getElementById('btnCancelCsvImport');
const btnCloseCsvPreview = document.getElementById('btnCloseCsvPreview');

// Bulk Upload elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');

// Bulk Action elements
const compactActionBar = document.getElementById('compactActionBar');
const bulkActionBar = document.getElementById('bulkActionBar');
const bulkCount = document.getElementById('bulkCount');
const btnClearSelection = document.getElementById('btnClearSelection');
const btnSelectAll = document.getElementById('btnSelectAll');
const filterSelect = document.getElementById('filterSelect');
const exportSelect = document.getElementById('exportSelect');
const btnRefreshRisk = document.getElementById('btnRefreshRisk');
const riskIntelligenceBody = document.getElementById('riskIntelligenceBody');
const riskIntelligenceEmpty = document.getElementById('riskIntelligenceEmpty');
const topSuspiciousList = document.getElementById('topSuspiciousList');
const deliveryHealthRate = document.getElementById('deliveryHealthRate');
const deliveryHealthFill = document.getElementById('deliveryHealthFill');
const alertCount = document.getElementById('alertCount');
const riskStatHigh = document.getElementById('riskStatHigh');
const riskStatMedium = document.getElementById('riskStatMedium');
const riskStatTotal = document.getElementById('riskStatTotal');
const riskStatLow = document.getElementById('riskStatLow');

// Column Mapping elements
const columnMappingModal = document.getElementById('columnMappingModal');
const mappingFieldsContainer = document.getElementById('mappingFieldsContainer');
const btnProceedToPreview = document.getElementById('btnProceedToPreview');
const btnCancelMapping = document.getElementById('btnCancelMapping');
const btnCloseMapping = document.getElementById('btnCloseMapping');

// Analytics elements
const statAvgSuccess = document.getElementById('statAvgSuccess');
const statAvgRTO = document.getElementById('statAvgRTO');
const statTotalRevenue = document.getElementById('statTotalRevenue');
const statDeliveredCount = document.getElementById('statDeliveredCount');
const cityStatsList = document.getElementById('cityStatsList');
const riskCircleHigh = document.getElementById('riskCircleHigh');
const riskCircleMedium = document.getElementById('riskCircleMedium');
const riskCircleLow = document.getElementById('riskCircleLow');
const riskTotalCountCenter = document.getElementById('riskTotalCountCenter');

// --- State ---
let orders = [];
let uploads = [];
let pendingCsvRows = [];
let pendingCsvRawData = [];
let pendingCsvHeaders = [];
let pendingCsvFilename = '';
let currentMapping = {};
let activeUploadId = null;
let selectedOrdersIds = new Set();
let currentDeliveryFilter = 'all';
let currentRiskFilter = 'all';
let guidedActive = false;
let guidedIndex = parseInt(localStorage.getItem('orderPing_guidedIndex')) || 0;
let currentUser = null;
let isSignUp = false;
let riskIntelligence = {}; // { phone: { risk: 'low'|'medium'|'high', reasons: [], fails: 0, total: 0 } }

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
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
      
    if (ordersData) {
      orders = ordersData.map(o => ({
        ...o,
        customerName: o.customer_name,
        phoneNumber: o.phone,
        productName: o.product,
        status: o.status
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
  if (selectedOrdersIds.size > 0) {
    bulkActionBar.classList.remove('hidden');
    bulkCount.textContent = selectedOrdersIds.size;
  } else {
    bulkActionBar.classList.add('hidden');
  }
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
  
  // Handle both legacy {name} and new {{name}}
  msg = msg.replace(/\[Name\]|\{name\}|\{\{name\}\}/gi, String(order.customerName || 'Customer'));
  msg = msg.replace(/\[Product\]|\{product\}|\{\{product\}\}/gi, String(order.productName || 'Product'));
  msg = msg.replace(/\[Amount\]|\{amount\}|\{\{amount\}\}|\{price\}|\{\{price\}\}/gi, String(order.amount || '0'));
  msg = msg.replace(/\[Phone\]|\{phone\}|\{\{phone\}\}/gi, String(order.phoneNumber || ''));
  msg = msg.replace(/\[Date\]|\{date\}|\{\{date\}\}/gi, new Date().toLocaleDateString());
  return msg;
}

// --- Risk Evaluation & Analytics ---
function runRiskAnalysis() {
  const intel = {};
  let highRiskCount = 0;
  let mediumRiskCount = 0;
  let lowRiskCount = 0;
  let totalFails = 0;
  let totalDelivered = 0;
  let totalRevenue = 0;
  const cities = {};

  orders.forEach(o => {
    const p = o.phoneNumber;
    if (!p) return;
    
    if (!intel[p]) {
      intel[p] = {
        name: o.customerName,
        phone: p,
        total: 0,
        fails: 0,
        success: 0,
        reasons: new Set(),
        amountTotal: 0,
        lastStatus: o.status,
        fraudScore: 0
      };
    }
    
    intel[p].total++;
    const amt = parseFloat(o.amount || 0);
    intel[p].amountTotal += amt;
    
    if (o.status === 'Delivered') {
      intel[p].success++;
      totalDelivered++;
      totalRevenue += amt;
    } else if (o.status === 'Returned' || o.status === 'Cancelled') {
      intel[p].fails++;
      totalFails++;
    }

    // City tracking
    const city = o.city || 'Unknown';
    if (!cities[city]) cities[city] = { total: 0, success: 0, fails: 0 };
    cities[city].total++;
    if (o.status === 'Delivered') cities[city].success++;
    if (o.status === 'Returned' || o.status === 'Cancelled') cities[city].fails++;
  });

  Object.values(intel).forEach(item => {
    item.rtoRate = item.total > 0 ? (item.fails / item.total) * 100 : 0;
    
    // Calculate Advanced Fraud Score (0-100)
    let score = 0;
    if (item.fails > 0) score += 20 * item.fails;
    if (item.rtoRate > 30) score += 15;
    if (item.rtoRate > 60) score += 25;
    if (item.amountTotal > 10000) score += 10;
    if (item.total > 5 && item.success === 0) score += 30;
    
    item.fraudScore = Math.min(score, 100);

    // Smart Risk Logic
    if (item.fails >= 2 || (item.fails > 0 && item.success === 0 && item.total > 1)) {
      item.risk = 'high';
      item.label = 'High Risk';
      highRiskCount++;
    } else if (item.success > 0 && item.fails > 0) {
      item.risk = 'medium';
      item.label = 'Medium Risk';
      mediumRiskCount++;
    } else if (item.fails === 1 && item.total === 1) {
      item.risk = 'medium';
      item.label = 'Medium Risk';
      mediumRiskCount++;
    } else {
      item.risk = 'low';
      item.label = 'Low Risk';
      lowRiskCount++;
    }
    
    if (item.amountTotal > 5000) item.reasons.add('High COD Value');
    if (item.total > 3) item.reasons.add('Frequent Buyer');
    if (item.fraudScore > 50) item.reasons.add('High Fraud Score');
    
    item.dominantReason = Array.from(item.reasons).join(', ') || 'Clean Profile';
  });

  riskIntelligence = intel;
  
  // Dashboard Mini Stats
  if (riskStatHigh) riskStatHigh.textContent = highRiskCount;
  if (riskStatMedium) riskStatMedium.textContent = mediumRiskCount;
  if (riskStatLow) riskStatLow.textContent = lowRiskCount;
  if (riskStatTotal) riskStatTotal.textContent = Object.keys(intel).length;
  if (alertCount) alertCount.textContent = highRiskCount;
  
  const healthRate = (totalDelivered + totalFails) > 0 
    ? Math.round((totalDelivered / (totalDelivered + totalFails)) * 100) 
    : 100;
  
  if (deliveryHealthRate) deliveryHealthRate.textContent = healthRate + '%';
  if (deliveryHealthFill) deliveryHealthFill.style.width = healthRate + '%';

  // Analytics View Update
  if (statAvgSuccess) statAvgSuccess.textContent = healthRate + '%';
  if (statAvgRTO) statAvgRTO.textContent = (100 - healthRate) + '%';
  if (statTotalRevenue) statTotalRevenue.textContent = '₹' + totalRevenue.toLocaleString();
  if (statDeliveredCount) statDeliveredCount.textContent = totalDelivered;

  renderRiskDashboard();
  renderCityStats(cities);
  renderRiskPie(highRiskCount, mediumRiskCount, lowRiskCount);
}

function renderCityStats(cities) {
  if (!cityStatsList) return;
  const sorted = Object.entries(cities).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  
  if (sorted.length === 0) {
    cityStatsList.innerHTML = '<div class="empty-state py-8">No geographical data available.</div>';
    return;
  }

  cityStatsList.innerHTML = sorted.map(([city, data]) => {
    const rate = data.total > 0 ? Math.round((data.success / data.total) * 100) : 0;
    return `
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-xs font-bold mb-1">
          <span>${city}</span>
          <span class="${rate > 70 ? 'text-emerald-400' : 'text-amber-400'}">${rate}% Success</span>
        </div>
        <div class="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
          <div class="h-full bg-emerald-500" style="width: ${rate}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderRiskPie(high, med, low) {
  const total = high + med + low;
  if (total === 0 || !riskCircleHigh) return;

  const highP = (high / total) * 100;
  const medP = (med / total) * 100;
  const lowP = (low / total) * 100;

  riskCircleHigh.style.strokeDasharray = `${highP} 100`;
  riskCircleMedium.style.strokeDasharray = `${medP} 100`;
  riskCircleMedium.style.strokeDashoffset = `-${highP}`;
  riskCircleLow.style.strokeDasharray = `${lowP} 100`;
  riskCircleLow.style.strokeDashoffset = `-${highP + medP}`;

  if (riskTotalCountCenter) riskTotalCountCenter.textContent = total;
}

function evalRisk(order) {
  const p = order.phoneNumber;
  const pIntel = riskIntelligence[p];
  
  if (!pIntel) {
    // Fallback if not yet analyzed
    if (parseFloat(order.amount) >= 5000) {
      return { level: 'medium', label: '🟡 Medium Risk (High amount)', value: 'medium' };
    }
    return { level: 'low', label: '🟢 Low Risk', value: 'low' };
  }

  const isRepeat = pIntel.total > 1;
  let finalLabel = '';

  if (pIntel.risk === 'high') {
    finalLabel = `🔴 Fraud Risk (${pIntel.dominantReason})`;
  } else if (isRepeat && pIntel.risk === 'low') {
    finalLabel = `🟢 Repeat Customer`;
  } else {
    const prefix = pIntel.risk === 'medium' ? '🟡 ' : '🟢 ';
    finalLabel = `${prefix}${pIntel.label}`;
  }

  return { 
    level: pIntel.risk, 
    label: finalLabel, 
    value: pIntel.risk 
  };
}

function renderRiskDashboard() {
  if (!riskIntelligenceBody) return;
  
  const entries = Object.values(riskIntelligence).sort((a, b) => b.fails - a.fails);
  const highRisk = entries.filter(e => e.risk === 'high');
  
  if (highRisk.length === 0) {
    riskIntelligenceEmpty.classList.remove('hidden');
    riskIntelligenceBody.innerHTML = '';
  } else {
    riskIntelligenceEmpty.classList.add('hidden');
    riskIntelligenceBody.innerHTML = highRisk.slice(0, 50).map(e => `
      <tr class="hover:bg-white/5 transition-colors">
        <td class="py-4 px-2">
          <div class="font-bold text-white">${e.phone}</div>
          <div class="text-xs text-slate-400">${e.name || 'Unknown'}</div>
        </td>
        <td class="py-4 px-2">
          <span class="status-badge high">${e.label}</span>
        </td>
        <td class="py-4 px-2 text-center font-mono">${Math.round(e.rtoRate)}%</td>
        <td class="py-4 px-2 text-xs text-slate-400">${e.dominantReason}</td>
      </tr>
    `).join('');
  }

  if (topSuspiciousList) {
    topSuspiciousList.innerHTML = entries.slice(0, 5).map(e => `
      <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-${e.risk === 'high' ? 'red' : 'amber'}-500/20 flex items-center justify-center">
            <i data-lucide="user" class="w-4 h-4 text-${e.risk === 'high' ? 'red' : 'amber'}-400"></i>
          </div>
          <div>
            <div class="text-xs font-bold text-white">${e.phone}</div>
            <div class="text-[10px] text-slate-400">${e.total} total orders</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs font-bold ${e.risk === 'high' ? 'text-red-400' : 'text-amber-400'}">${e.fails} RTO</div>
          <div class="text-[10px] text-slate-500">${Math.round(e.rtoRate)}% rate</div>
        </div>
      </div>
    `).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: topSuspiciousList });
  }
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

let isUploading = false;

const updateOverlay = (text) => {
  const el = document.getElementById('uploadStatusText');
  if (el) el.textContent = text;
  console.log(`[UPLOAD STAGE] ${text}`);
};

async function parseFile(file) {
  if (isUploading) return;
  isUploading = true;
  console.log('[UPLOAD START] Initializing upload timeline');
  
  // Setup Fallback Timeout
  const uploadTimeout = setTimeout(() => {
    if (isUploading) {
      console.error('[UPLOAD ERROR] Parsing timed out');
      showToast('Upload failed due to timeout. Please try a simpler file.', 'alert-triangle');
      cleanupUploadState();
    }
  }, 10000); // 10 second timeout

  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const allowed = ['csv', 'xlsx', 'xls', 'pdf'];
    if (!allowed.includes(ext)) {
      console.error(`[UPLOAD ERROR] Unsupported file extension: ${ext}`);
      showToast('Unsupported file format', 'alert-circle');
      cleanupUploadState();
      return;
    }
    
    if (file.size === 0) {
      console.warn('[UPLOAD ERROR] File is empty');
      showToast('File is empty', 'alert-circle');
      cleanupUploadState();
      return;
    }

    const uploadOverlay = document.getElementById('uploadOverlay');
    if (uploadOverlay) {
      uploadOverlay.style.display = 'flex';
      uploadOverlay.classList.remove('hidden');
    }
    const uploadArea = document.getElementById('uploadArea');
    if (uploadArea) {
      uploadArea.style.pointerEvents = 'none';
      uploadArea.classList.add('border-emerald-500');
    }

    updateOverlay('STEP 1: Reading file...');
    console.log(`[FILE READ] Name: ${file.name}, Size: ${(file.size/1024).toFixed(2)} KB`);

    let res = null;
    if (ext === 'pdf') {
      res = await parsePDF(file);
    } else {
      res = await parseSpreadsheet(file);
    }
    
    if (!res || !res.extracted) {
       throw new Error('No data returned from parser');
    }

    updateOverlay('STEP 3: Validating orders...');
    await processImportedData(res.extracted, res.invalidCount, file.name);

  } catch (err) {
    console.error('[UPLOAD ERROR] Parse error:', err);
    showToast('Failed to parse file or corrupted data', 'alert-circle');
  } finally {
    clearTimeout(uploadTimeout);
    cleanupUploadState();
  }
}

function cleanupUploadState() {
  isUploading = false;
  const uploadArea = document.getElementById('uploadArea');
  const uploadOverlay = document.getElementById('uploadOverlay');
  if (uploadOverlay) {
    uploadOverlay.style.display = 'none';
    uploadOverlay.classList.add('hidden');
  }
  if (uploadArea) {
    uploadArea.style.pointerEvents = 'auto';
    uploadArea.classList.remove('border-emerald-500');
  }
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = ''; // Reset input
}

async function parseSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        updateOverlay('STEP 2: Parsing rows...');
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        
        const rawJson = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
        if (rawJson.length === 0) {
          console.warn('[UPLOAD ERROR] No data found in the spreadsheet');
          resolve({ extracted: [], invalidCount: 0 });
          return;
        }

        console.log(`[ROWS PARSED] Total rows in first sheet: ${rawJson.length}`);

        // Find header row gracefully
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(rawJson.length, 10); i++) {
          const rowStr = rawJson[i].join(' ').toLowerCase();
          if (rowStr.includes('name') || rowStr.includes('customer') || rowStr.includes('phone') || rowStr.includes('mobile')) {
            headerRowIdx = i;
            break;
          }
        }
        
        if (headerRowIdx === -1) {
             headerRowIdx = 0;
        }

        const headers = rawJson[headerRowIdx].map(String);
        
        const mapping = { name: -1, phone: -1, product: -1, amount: -1, address: -1, status: -1 };
        headers.forEach((h, idx) => {
          const low = h.toLowerCase().trim();
          if (low.includes('name') || low.includes('customer')) { if (mapping.name === -1) mapping.name = idx; }
          else if (low.includes('phone') || low.includes('mobile') || low.includes('contact')) { if (mapping.phone === -1) mapping.phone = idx; }
          else if (low.includes('product') || low.includes('item')) { if (mapping.product === -1) mapping.product = idx; }
          else if (low.includes('amount') || low.includes('price') || low.includes('total') || low.includes('val')) { if (mapping.amount === -1) mapping.amount = idx; }
          else if (low.includes('city') || low.includes('location') || low.includes('address')) { if (mapping.address === -1) mapping.address = idx; }
          else if (low.includes('status')) { if(mapping.status === -1) mapping.status = idx; }
        });

        // Fallbacks if mapping fails
        if (mapping.name === -1) mapping.name = 0;
        if (mapping.phone === -1) mapping.phone = 1;
        if (mapping.product === -1) mapping.product = 2;
        if (mapping.amount === -1) mapping.amount = 3;

        const extracted = [];
        let invalidCount = 0;
        const seenInFile = new Set();

        for (let i = headerRowIdx + 1; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row || row.length === 0 || row.join('').trim() === '') continue;

          let nameRaw = String(row[mapping.name] || '').trim();
          let phoneRaw = String(row[mapping.phone] || '').trim();
          let productRaw = mapping.product !== -1 ? String(row[mapping.product] || '').trim() : 'Order Item';
          let amountRaw = mapping.amount !== -1 ? String(row[mapping.amount] || '').trim() : '0';
          let addressRaw = mapping.address !== -1 ? String(row[mapping.address] || '').trim() : 'Unknown';
          let statusRaw = mapping.status !== -1 ? String(row[mapping.status] || '').trim() : 'Pending';
          
          if (!statusRaw) statusRaw = 'Pending';
          
          const phone = isValidIndianPhone(phoneRaw);
          const amount = isValidAmount(amountRaw);

          if (!nameRaw && !phoneRaw && !productRaw && !amountRaw) continue;

          if (!phone) {
             invalidCount++;
             continue;
          }
          
          const finalAmount = amount || '0';

          if (seenInFile.has(phone)) {
             invalidCount++;
             continue;
          }
          seenInFile.add(phone);

          extracted.push({
            id: 'ord_' + Math.random().toString(36).substr(2, 9),
            uploadId: null,
            customerName: nameRaw || 'Customer',
            phoneNumber: phone,
            productName: productRaw || 'Order Item',
            amount: finalAmount,
            city: addressRaw, // Mapped to address
            status: statusRaw,
            notes: '',
            timestamp: new Date().toISOString()
          });
        }
        
        console.log(`[VALID ORDERS] Found ${extracted.length} valid orders. Excluded ${invalidCount} invalid rows.`);
        resolve({ extracted, invalidCount });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function processImportedData(extracted, invalidCount, filename) {
  try {
    const newUploadId = 'up_' + Date.now();
    const unique = [];
    const seenPhones = new Set();
    
    // Pre-populate seenPhones from prior orders to detect repeats
    orders.forEach(o => seenPhones.add(o.phoneNumber));

    let dupCount = 0;
    
    // Ensure risk intel is calculated before using it
    runRiskAnalysis();

    extracted.forEach(o => {
      // Allow repeat orders for analytics, we just append all of them
      o.uploadId = newUploadId;
      unique.push(o);
    });

    if (unique.length > 0) {
      updateOverlay('STEP 4: Saving to database...');
      console.log(`[SUPABASE INSERT] Saving ${unique.length} new orders to db`);
      const newUpload = {
        id: newUploadId,
        filename: filename,
        total: unique.length,
        timestamp: new Date().toISOString()
      };
      
      uploads.unshift(newUpload);
      activeUploadId = newUploadId;
      orders = [...unique, ...orders];
      
      if (currentUser) {
        await supabase.from('uploads').insert({
          id: newUploadId,
          user_id: currentUser.id,
          filename: filename,
          total: unique.length,
          timestamp: newUpload.timestamp
        });
        
        // chunk inserts to prevent huge payload sizes freezing supabase
        const chunkSize = 500;
        for (let i = 0; i < unique.length; i += chunkSize) {
          const chunk = unique.slice(i, i + chunkSize);
          await supabase.from('orders').insert(chunk.map(o => {
            const history = seenPhones.has(o.phoneNumber);
            // Default assumes no history
            let calculatedRisk = 'low';
            if (history && riskIntelligence[o.phoneNumber]) {
               calculatedRisk = riskIntelligence[o.phoneNumber].risk;
            }
            return {
              id: o.id,
              user_id: currentUser.id,
              upload_id: newUploadId,
              customer_name: o.customerName,
              phone: o.phoneNumber,
              product: o.productName,
              amount: o.amount,
              status: o.status,
              notes: o.notes,
              city: o.city,
              risk_level: calculatedRisk,
              repeat_customer: history
            };
          }));
        }
      }
      
      saveOrders(); // Save to local storage and trigger renders
      updateOverlay('STEP 5: Upload complete ✅');
      console.log(`[UPLOAD SUCCESS] Processed ${unique.length} records. Found ${dupCount} duplicates. Skipped ${invalidCount} invalids.`);
      showToast(`${unique.length} Orders Imported Successfully`, 'check-circle-2');
      vibrate(50);
      
      // Delay slightly for user to read success message before hiding overlay via cleanup
      setTimeout(() => {
         switchView('view-orders');
      }, 500);

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
    } else {
      console.warn('[UPLOAD ERROR] No valid new orders found in file (likely all duplicates)');
      showToast('No valid new orders found.', 'alert-circle');
    }
  } catch (err) {
     console.error('[SUPABASE INSERT ERROR]', err);
     throw err;
  }
}

window.loadDemoOrders = async () => {
  try {
     showToast('Loading Demo Orders...', 'loader-2');
     const demoExtracted = [
       {
          id: 'ord_' + Math.random().toString(36).substr(2, 9),
          uploadId: null,
          customerName: "Rahul Sharma",
          phoneNumber: "9876543210",
          productName: "Premium Wireless Headphones",
          amount: "1499",
          city: "Mumbai",
          status: "Pending",
          notes: "",
          timestamp: new Date().toISOString()
       },
       {
          id: 'ord_' + Math.random().toString(36).substr(2, 9),
          uploadId: null,
          customerName: "Priya Desai",
          phoneNumber: "9876543211",
          productName: "Smart Fitness Watch",
          amount: "999",
          city: "Delhi",
          status: "Pending",
          notes: "",
          timestamp: new Date().toISOString()
       },
       {
          id: 'ord_' + Math.random().toString(36).substr(2, 9),
          uploadId: null,
          customerName: "Karan Singh",
          phoneNumber: "9876543212",
          productName: "Gaming Mouse RGB",
          amount: "499",
          city: "Bangalore",
          status: "Pending",
          notes: "",
          timestamp: new Date().toISOString()
       }
     ];
     await processImportedData(demoExtracted, 0, "Demo_Orders.csv");
  } catch (e) {
     console.error(e);
     showToast('Failed to load demo data', 'alert-circle');
  }
};

// Use robust parseSpreadsheet instead
// async function parseExcelCSV(file) { ... removed for brevity }

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
             status: 'Pending',
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
    <div class="upload-history-card bg-[#111827] border border-white/5 rounded-xl p-4 mb-3 flex items-center justify-between cursor-pointer hover:bg-white/5 hover:border-white/10 transition-all ${u.id === activeUploadId ? 'border-emerald-500/30 bg-emerald-500/5' : ''}" onclick="reopenUpload('${u.id}')">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center ${u.id === activeUploadId ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}">
          <i data-lucide="file-spreadsheet" class="w-5 h-5"></i>
        </div>
        <div>
          <div class="flex items-center gap-2 mb-1">
            <h4 class="text-sm font-semibold text-white/90 truncate max-w-[150px] sm:max-w-xs">${u.filename}</h4>
            ${u.id === activeUploadId ? `<span class="bg-emerald-500 text-[#020617] text-[9px] font-bold px-1.5 py-0.5 rounded-sm tracking-wider">ACTIVE</span>` : ''}
          </div>
          <p class="text-xs text-slate-400 opacity-80 flex items-center gap-1.5">
            <span>${new Date(u.timestamp).toLocaleDateString(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</span>
            <span class="opacity-50">•</span>
            <span class="font-medium text-slate-300">${u.total} orders</span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="action-icon-mini hover:bg-red-500/10 hover:text-red-400" onclick="event.stopPropagation(); deleteUpload('${u.id}')" title="Delete">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
        <button class="action-icon-mini" title="Open">
          <i data-lucide="chevron-right" class="w-4 h-4"></i>
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

  // Trigger Risk Analysis before rendering dashboard stats
  runRiskAnalysis();

  // Update Stats
  if (statTotal) statTotal.textContent = activeOrders.length;
  if (statPending) {
    statPending.textContent = activeOrders.filter(o => o.status === 'Pending').length;
  }
  if (statConfirmed) {
    statConfirmed.textContent = activeOrders.filter(o => o.status === 'Confirmed').length;
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
    // Note: status filter might be 'Pending', 'Confirmed' etc from deliveryFilter
    if (waFilter !== 'all' && o.status !== waFilter) return false; 
    if (deliveryFilter !== 'all' && o.status !== deliveryFilter) return false;
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
    const isSelected = selectedOrdersIds.has(order.id);
    const pIntel = riskIntelligence[order.phoneNumber];
    const intelStats = pIntel && pIntel.total > 1 ? `
        <div class="flex items-center gap-2 mt-1.5 text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
           <span>Orders: <b class="text-white">${pIntel.total}</b></span>
           <span class="text-emerald-500/80">Del: <b class="text-emerald-400">${pIntel.success}</b></span>
           <span class="text-red-500/80">Ret: <b class="text-red-400">${pIntel.fails}</b></span>
        </div>` : '';

    return `
    <div class="bulk-order-card saas-compact-card ${order.status} ${isSelected ? 'selected' : ''}" data-id="${order.id}">
      <!-- Selection Area Overlay -->
      <div class="card-selection-area" onclick="event.stopPropagation(); toggleSelection('${order.id}')">
        <div class="card-checkbox ${isSelected ? 'checked' : ''}">
          <i data-lucide="check" class="w-3 h-3 ${isSelected ? '' : 'hidden'}"></i>
        </div>
      </div>
      
      <!-- Top Row: Name + Phone & Badges -->
      <div class="card-top-row flex justify-between items-start mb-2 relative z-10">
        <div>
          <div class="flex items-center gap-2 mb-0.5">
            <h3 class="customer-name font-semibold text-white/90 text-sm tracking-tight">${order.customerName}</h3>
            <div class="status-dot ${order.status.toLowerCase()}"></div>
          </div>
          <p class="customer-phone text-xs font-mono text-slate-400/80">${order.phoneNumber} <span class="opacity-40 px-1">•</span> ${order.city || 'Unknown'}</p>
          ${intelStats}
        </div>
        <div class="flex flex-col items-end gap-1">
          <div class="risk-pill minimal-risk risk-${risk.level}">${risk.label}</div>
        </div>
      </div>
      
      <!-- Middle Row: Product & Amount -->
      <div class="card-mid-row bg-white/[0.02] rounded-lg p-2.5 mb-2 relative z-10 flex justify-between items-center border border-white/5">
        <div class="min-w-0 flex-1 mr-3">
          <p class="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-0.5">Product</p>
          <p class="truncate text-xs text-white/80 font-medium">${order.productName}</p>
        </div>
        <div class="flex-none text-right">
          <p class="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-0.5">Amount</p>
          <p class="text-sm font-semibold text-emerald-400">₹${order.amount}</p>
        </div>
      </div>

      <!-- Notes Area (Conditional) -->
      <div class="order-notes-wrapper ${hasNotes ? '' : 'hidden'} mb-2 relative z-10" id="notes_wrapper_${order.id}">
        <textarea id="notes_text_${order.id}" class="order-notes-textarea compact-textarea" placeholder="Add seller notes..." onblur="saveNotes('${order.id}', this.value)">${order.notes || ''}</textarea>
      </div>

      <!-- Bottom Row: Deliver Status & Actions -->
      <div class="card-bottom-actions flex items-center justify-between gap-2 relative z-10">
        <div class="compact-delivery-select" aria-label="Update Delivery Status">
          <select class="delivery-dropdown text-xs delivery-status-${order.status.toLowerCase()}" onchange="updateDeliveryStatus('${order.id}', this.value)" aria-label="Delivery Status">
            <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Confirmed" ${order.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
            <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
            <option value="Returned" ${order.status === 'Returned' ? 'selected' : ''}>Returned</option>
          </select>
          <i data-lucide="chevron-down" class="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"></i>
        </div>
        
        <div class="flex items-center gap-1.5">
          <button class="action-btn-mini btn-wa-mini" onclick="sendWA('${order.id}')" title="Send WhatsApp Message" aria-label="Send WhatsApp Message to ${order.customerName}">
            <i data-lucide="message-circle" class="w-4 h-4"></i> <span>Send</span>
          </button>
          <button class="action-icon-mini" onclick="copyMessage('${order.id}')" title="Copy Message" aria-label="Copy Order Message">
            <i data-lucide="copy" class="w-4 h-4"></i>
          </button>
          <button class="action-icon-mini ${order.status === 'Confirmed' ? 'text-emerald-400 bg-emerald-400/10' : ''}" onclick="toggleStatus('${order.id}')" title="Toggle Confirmed Status" aria-label="Toggle Confirmed Status">
            <i data-lucide="check" class="w-4 h-4"></i>
          </button>
          <button class="action-icon-mini" onclick="editOrder('${order.id}')" title="Edit Order" aria-label="Edit Order Details">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
          <button class="action-icon-mini text-slate-500 opacity-60 hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all duration-200" onclick="deleteOrder('${order.id}')" title="Delete Order" aria-label="Delete Order">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    </div>
  `}).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}


// --- Global Actions ---
window.viewHistory = (phone) => {
  const intel = riskIntelligence[phone];
  if (!intel) {
    showToast('No history available for this number', 'info');
    return;
  }
  
  // Navigate to risk view and highlight the specific intelligence
  switchView('view-risk');
  vibrate(30);
  
  // Future: Show a specific timeline modal
  showToast(`Loading history for ${phone}...`, 'history');
};

window.toggleSelection = (id) => {
  if (selectedOrdersIds.has(id)) {
    selectedOrdersIds.delete(id);
  } else {
    selectedOrdersIds.add(id);
  }
  vibrate(10);
  renderOrders();
  updateBulkActionBar();
};

window.bulkAction = async (actionType) => {
  if (selectedOrdersIds.size === 0) return;
  
  const selectedList = orders.filter(o => selectedOrdersIds.has(o.id));
  vibrate(50);

  if (actionType.startsWith('wa-')) {
    const total = selectedOrdersIds.size;
    showToast(`Initializing WhatsApp Workflow for ${total} orders...`, 'zap');
    
    // Workflow simulation
    let processed = 0;
    const interval = setInterval(() => {
      processed++;
      if (processed <= total) {
        showToast(`Sending ${processed}/${total}...`, 'message-circle');
        vibrate(20);
      } else {
        clearInterval(interval);
        showToast(`Bulk message campaign completed!`, 'check-circle-2');
        
        // Update statuses to 'opened'
        selectedList.forEach(async (o) => {
          o.status = 'opened';
          if (currentUser) {
            await supabase.from('orders').update({ status: 'opened' }).eq('id', o.id);
          }
        });
        saveOrders(true);
        selectedOrdersIds.clear();
        renderOrders();
        updateBulkActionBar();
      }
    }, 400);

    return;
  }

  if (actionType.startsWith('status-')) {
    const newStatus = actionType.replace('status-', '').charAt(0).toUpperCase() + actionType.replace('status-', '').slice(1);
    showToast(`Updating status to ${newStatus} for ${selectedOrdersIds.size} orders...`, 'loader-2');

    for (const order of selectedList) {
      order.status = newStatus;
      if (currentUser) {
        await supabase.from('orders').update({ status: newStatus }).eq('id', order.id);
      }
    }

    saveOrders(true);
    showToast(`Updated ${selectedOrdersIds.size} orders!`, 'check');
    selectedOrdersIds.clear();
    renderOrders();
    updateBulkActionBar();
  }
};

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
      }
    }
  }
};

window.updateDeliveryStatus = async (id, value) => {
  const order = orders.find(o => o.id === id);
  if (order) {
    order.status = value;
    saveOrders(true);
    
    if (currentUser) {
      await supabase.from('orders').update({ status: value }).eq('id', id);
    }
    
    showToast(`Status updated to ${value}`, 'check');
    
    // Re-render for status updates
    renderOrders();
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
    const newStatus = order.status === 'Confirmed' ? 'Pending' : 'Confirmed';
    order.status = newStatus;
    saveOrders(true);
    vibrate(30);
    
    if (currentUser) {
      await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    }
    
    renderOrders();
  }
};

window.editOrder = (id) => {
  const order = orders.find(o => o.id === id);
  if (!order) return;
  
  editOrderId.value = order.id;
  orderCustomerName.value = order.customerName;
  orderPhone.value = order.phoneNumber;
  orderProduct.value = order.productName;
  orderAmount.value = order.amount;
  orderStatus.value = order.status;
  orderNotes.value = order.notes || '';
  
  orderModalTitle.textContent = 'Edit Order';
  orderModal.classList.remove('hidden');
  vibrate(10);
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
document.getElementById('uploadBtnUI')?.addEventListener('click', (e) => {
  e.stopPropagation(); // prevent double clicking if inside uploadArea
  fileInput.click();
});

// Drag and drop support
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('border-emerald-500', 'bg-white/5');
});

uploadArea.addEventListener('dragleave', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('border-emerald-500', 'bg-white/5');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('border-emerald-500', 'bg-white/5');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    parseFile(file);
  }
});

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

btnSelectAll?.addEventListener('click', () => {
  const activeOrders = orders.filter(o => o.uploadId === activeUploadId);
  const allSelected = activeOrders.every(o => selectedOrdersIds.has(o.id));
  
  if (allSelected) {
    activeOrders.forEach(o => selectedOrdersIds.delete(o.id));
  } else {
    activeOrders.forEach(o => selectedOrdersIds.add(o.id));
  }
  
  vibrate(30);
  renderOrders();
  updateBulkActionBar();
});

btnClearSelection?.addEventListener('click', () => {
  selectedOrdersIds.clear();
  vibrate(10);
  renderOrders();
  updateBulkActionBar();
});

// Navigation handled via dropdown items

// Modal listeners
btnAddOrder?.addEventListener('click', () => {
  editOrderId.value = '';
  orderModalTitle.textContent = 'Add New Order';
  orderForm.reset();
  orderModal.classList.remove('hidden');
  vibrate(10);
});

[btnCancelOrder, btnCloseOrderModal].forEach(btn => {
  btn?.addEventListener('click', () => {
    orderModal.classList.add('hidden');
  });
});

orderForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = editOrderId.value || 'ord_' + Math.random().toString(36).substr(2, 9);
  const data = {
    customerName: orderCustomerName.value,
    phoneNumber: orderPhone.value,
    productName: orderProduct.value,
    amount: orderAmount.value,
    status: orderStatus.value.charAt(0).toUpperCase() + orderStatus.value.slice(1),
    notes: orderNotes.value
  };

  try {
    if (currentUser) {
      const payload = {
        id,
        user_id: currentUser.id,
        customer_name: data.customerName,
        phone: data.phoneNumber,
        product: data.productName,
        amount: data.amount,
        status: data.status,
        notes: data.notes
      };

      const { error } = await supabase
        .from('orders')
        .upsert(payload);

      if (error) throw error;
    }

    if (editOrderId.value) {
      const index = orders.findIndex(o => o.id === id);
      if (index >= 0) orders[index] = { ...orders[index], ...data };
    } else {
      orders.unshift({
        id,
        uploadId: activeUploadId, // current context
        ...data,
        timestamp: new Date().toISOString()
      });
    }

    orderModal.classList.add('hidden');
    saveOrders();
    showToast(editOrderId.value ? 'Order updated' : 'Order added', 'check');
    vibrate(30);
  } catch (err) {
    console.error('Error saving order:', err);
    showToast('Failed to save order', 'alert-circle');
  }
});

btnCloseCsvPreview?.addEventListener('click', () => {
  csvPreviewModal.classList.add('hidden');
});

btnCancelCsvImport?.addEventListener('click', () => {
  csvPreviewModal.classList.add('hidden');
  pendingCsvRows = [];
});

btnConfirmCsvImport?.addEventListener('click', async () => {
  const validRows = pendingCsvRows.filter(r => r.phoneNumber);
  if (validRows.length > 0) {
    showToast('Importing orders...', 'loader-2');
    csvPreviewModal.classList.add('hidden');
    await processImportedData(validRows, pendingCsvRows.length - validRows.length, pendingCsvFilename);
    pendingCsvRows = [];
  } else {
    showToast('No valid rows to import', 'alert-circle');
  }
});

// --- Template & Settings Logic ---
const templateSelect = document.getElementById('templateSelect');
const templateIdInput = document.getElementById('templateId');
const templateNameInput = document.getElementById('templateName');
const templateTextInput = document.getElementById('templateText');
const templatesList = document.getElementById('templatesList');
const templateEditor = document.getElementById('templateEditor');
const templateForm = document.getElementById('templateForm');

window.insertToken = (token) => {
  const start = templateTextInput.selectionStart;
  const end = templateTextInput.selectionEnd;
  const text = templateTextInput.value;
  templateTextInput.value = text.substring(0, start) + token + text.substring(end);
  templateTextInput.focus();
  templateTextInput.selectionStart = templateTextInput.selectionEnd = start + token.length;
};

function renderTemplates() {
  if (!templatesList) return;
  const s = getSettings();
  
  if (s.templates.length === 0) {
    templatesList.innerHTML = '<div class="empty-state">No templates found.</div>';
    return;
  }
  
  templatesList.innerHTML = s.templates.map(t => `
    <div class="card glass-card p-4 cursor-pointer hover:border-emerald-500/30 transition-all ${t.id === s.activeTemplateId ? 'border-emerald-500/50' : ''}" onclick="editTemplate('${t.id}')">
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-bold text-white">${t.name}</h4>
        ${t.id === s.activeTemplateId ? '<span class="badge">ACTIVE</span>' : ''}
      </div>
      <p class="text-xs text-slate-400 line-clamp-2">${t.text.replace(/\n/g, ' ')}</p>
    </div>
  `).join('');
}

window.editTemplate = (id) => {
  const s = getSettings();
  const t = s.templates.find(x => x.id === id);
  if (t) {
    templateIdInput.value = t.id;
    templateNameInput.value = t.name;
    templateTextInput.value = t.text;
    document.getElementById('templateModalTitle').textContent = 'Edit Template';
    templateEditor.classList.remove('hidden');
    vibrate(10);
  }
};

document.getElementById('btnNewTemplate')?.addEventListener('click', () => {
  templateIdInput.value = '';
  templateNameInput.value = '';
  templateTextInput.value = '';
  document.getElementById('templateModalTitle').textContent = 'New Template';
  templateEditor.classList.remove('hidden');
  vibrate(10);
});

document.getElementById('btnCloseTemplateModal')?.addEventListener('click', () => {
  templateEditor.classList.add('hidden');
});

templateForm?.addEventListener('submit', (e) => {
  e.preventDefault();
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
  
  // If this was the only template or active template id is empty, set it as active
  if (!s.activeTemplateId) s.activeTemplateId = id;
  
  saveSettings(s);
  renderTemplates();
  populateTemplateSelect(s);
  templateEditor.classList.add('hidden');
  
  vibrate(30);
  showToast('Template saved', 'check');
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
    if (s.activeTemplateId === id) s.activeTemplateId = s.templates[0].id;
    saveSettings(s);
    renderTemplates();
    populateTemplateSelect(s);
    templateEditor.classList.add('hidden');
    showToast('Template deleted', 'trash');
  }
});

function initSettings() {
  const s = getSettings();
  if (sellerNameInput) sellerNameInput.value = s.sellerName;
  populateTemplateSelect(s);
  renderTemplates();
}

function populateTemplateSelect(s) {
  if (!templateSelect) return;
  templateSelect.innerHTML = s.templates.map(t => 
    `<option value="${t.id}" ${t.id === s.activeTemplateId ? 'selected' : ''}>${t.name}</option>`
  ).join('');
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

document.getElementById('btnBulkSend')?.addEventListener('click', startGuidedWorkflow);

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

  currentDeliveryFilter = 'all';
  currentRiskFilter = 'all';
  if (document.getElementById('filterSelect')) document.getElementById('filterSelect').value = 'all';
  if (document.getElementById('deliveryFilter')) document.getElementById('deliveryFilter').value = 'all';
  if (document.getElementById('riskFilter')) document.getElementById('riskFilter').value = 'all';
  if (document.getElementById('smartSearchInput')) document.getElementById('smartSearchInput').value = '';

  saveOrders();
  vibrate([40, 50, 40]);
  showToast('All data deleted', 'check-circle-2');
  switchView('view-home');
});

// --- Dashboard Filter Listeners ---
document.getElementById('smartSearchInput')?.addEventListener('input', () => renderOrders());
document.getElementById('filterSelect')?.addEventListener('change', () => renderOrders());
document.getElementById('deliveryFilter')?.addEventListener('change', () => renderOrders());
document.getElementById('riskFilter')?.addEventListener('change', () => renderOrders());
document.getElementById('exportSelect')?.addEventListener('change', (e) => {
  const type = e.target.value;
  if (!type) return;
  
  let toExport = [];
  if (type === 'all') toExport = orders.filter(o => o.uploadId === activeUploadId);
  else if (type === 'pending') toExport = orders.filter(o => o.uploadId === activeUploadId && o.status === 'Pending');
  else if (type === 'confirmed') toExport = orders.filter(o => o.uploadId === activeUploadId && o.status === 'Confirmed');
  
  exportToCSV(toExport, `orderping_export_${type}.csv`);
  e.target.value = ''; // reset
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

// --- Risk Engine Listeners ---
btnRefreshRisk?.addEventListener('click', () => {
  vibrate(50);
  showToast('Re-analyzing customer intelligence...', 'loader-2');
  setTimeout(() => {
    runRiskAnalysis();
    showToast('Risk analysis complete', 'shield-check');
  }, 1000);
});

// Run initial risk analysis on start
setTimeout(() => {
  runRiskAnalysis();
}, 2000);

// Close mapping and preview modals
[btnCancelMapping, btnCloseMapping].forEach(btn => {
  btn?.addEventListener('click', () => {
    columnMappingModal.classList.add('hidden');
  });
});
