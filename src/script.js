// --- DOM Elements ---
const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const bulkOrdersList = document.getElementById('bulkOrdersList');
const settingsForm = document.getElementById('settingsForm');
const defaultMessageInput = document.getElementById('defaultMessage');
const sellerNameInput = document.getElementById('sellerName');

// Search elements
const searchToggleBtn = document.getElementById('searchToggleBtn');
const searchOverlay = document.getElementById('search-overlay');
const globalSearchInput = document.getElementById('globalSearchInput');
const closeSearchBtn = document.getElementById('closeSearchBtn');
const searchResults = document.getElementById('searchResults');

// Bulk Upload elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const filterBtns = document.querySelectorAll('.filter-btn');

// --- State ---
let orders = [];
let currentFilter = 'all';

// --- Database (LocalStorage) ---
const DB_ORDERS_KEY = 'orderping_bulk_orders';
const DB_SETTINGS_KEY = 'orderping_settings';

const defaultSettings = {
  sellerName: '',
  defaultMessage: `Hi [Name],
Your order for [Product] worth ₹[Amount] is confirmed.

Reply YES to confirm delivery.`
};

function loadOrders() {
  const saved = localStorage.getItem(DB_ORDERS_KEY);
  orders = saved ? JSON.parse(saved) : [];
  renderOrders();
}

function saveOrders() {
  // Let's cap history at a reasonable limit like 500
  if (orders.length > 500) orders = orders.slice(0, 500);
  localStorage.setItem(DB_ORDERS_KEY, JSON.stringify(orders));
  renderOrders();
}

function getSettings() {
  const settings = localStorage.getItem(DB_SETTINGS_KEY);
  return settings ? { ...defaultSettings, ...JSON.parse(settings) } : defaultSettings;
}

function saveSettings(settings) {
  localStorage.setItem(DB_SETTINGS_KEY, JSON.stringify(settings));
}

// --- Utils ---
function vibrate(pattern = 50) {
  if (navigator.vibrate) navigator.vibrate(pattern);
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
      if (view.id === targetViewId) view.classList.add('active');
    }
  });

  navItems.forEach(item => {
    item.classList.remove('active');
    if (item.dataset.target === targetViewId) item.classList.add('active');
  });
}

function generateMessage(order) {
  const settings = getSettings();
  let msg = settings.defaultMessage;
  msg = msg.replace(/\[Name\]|\{name\}/gi, order.customerName || 'Customer');
  msg = msg.replace(/\[Product\]|\{product\}/gi, order.productName || 'Product');
  msg = msg.replace(/\[Amount\]|\{price\}/gi, order.amount || '0');
  return msg;
}

// --- Parsers ---

// Setup PDF worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

async function parseFile(file) {
  try {
    showToast('Parsing file...', 'loader-2');
    let newOrders = [];
    
    if (file.name.toLowerCase().endsWith('.pdf')) {
      newOrders = await parsePDF(file);
    } else {
      newOrders = await parseExcelCSV(file);
    }
    
    if (newOrders.length > 0) {
      // Prepend to orders
      orders = [...newOrders, ...orders];
      saveOrders();
      showToast(`Added ${newOrders.length} orders!`);
      vibrate(50);
    } else {
      showToast('No valid orders found in file.', 'x');
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
        const json = XLSX.utils.sheet_to_json(firstSheet);
        
        const extracted = json.map(row => {
          const findKey = (kws) => {
            const key = Object.keys(row).find(k => kws.some(kw => k.toLowerCase().includes(kw)));
            return key ? row[key] : '';
          };
          
          let name = findKey(['name', 'customer', 'buyer']);
          let phone = findKey(['phone', 'mobile', 'contact', 'whatsapp']);
          let product = findKey(['product', 'item', 'title']);
          let price = findKey(['price', 'amount', 'total', 'cod', 'value']);
          
          if (!name) name = "Customer";
          if (!product) product = "Various items";
          if (!price) price = "0";

          // clean phone
          phone = String(phone).replace(/\D/g, '');

          if (phone && phone.length >= 10) {
            return {
              id: Date.now() + Math.random().toString(36).substring(2, 9),
              customerName: String(name),
              phoneNumber: phone,
              productName: String(product),
              amount: String(price),
              status: 'pending',
              timestamp: new Date().toISOString()
            };
          }
          return null;
        }).filter(o => o !== null);
        
        resolve(extracted);
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
      
      // Basic heuristic: split by lines, look for phones
      const lines = fullText.split(/[\n,]/).filter(l => l.trim().length > 0);
      const phoneRegex = /(?:\+?91|0)?[6-9]\d{9}/g;
      
      let parsed = [];
      lines.forEach((line, index) => {
        const match = line.match(phoneRegex);
        if (match) {
          const phone = match[0].replace(/\D/g, '');
          // Very naive extraction for demo
          let name = line.replace(phoneRegex, '').trim() || 'Customer';
          let priceMatch = line.match(/₹?\s*(\d+[.,]?\d*)/);
          let price = priceMatch ? priceMatch[1] : '0';
          let product = 'Ordered item';

          parsed.push({
             id: Date.now() + Math.random().toString(36).substring(2, 9),
             customerName: name.substring(0, 20),
             phoneNumber: phone,
             productName: product,
             amount: price,
             status: 'pending',
             timestamp: new Date().toISOString()
          });
        }
      });
      // Deduplicate by phone
      const unique = [];
      const seen = new Set();
      parsed.forEach(p => {
        if(!seen.has(p.phoneNumber)) {
          seen.add(p.phoneNumber);
          unique.push(p);
        }
      });
      resolve(unique);
    } catch(err) {
      reject(err);
    }
  });
}

// --- Renderers ---
function renderOrders(filter = currentFilter) {
  currentFilter = filter;
  let filtered = orders;
  if (filter === 'pending') filtered = orders.filter(o => o.status !== 'confirmed');
  if (filter === 'confirmed') filtered = orders.filter(o => o.status === 'confirmed');

  if (filtered.length === 0) {
    bulkOrdersList.innerHTML = `
      <div class="empty-state">
        <i data-lucide="inbox" class="mb-2 opacity-50 block mx-auto w-12 h-12"></i>
        <p>No ${filter !== 'all' ? filter : ''} orders found.</p>
      </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  bulkOrdersList.innerHTML = filtered.map(order => `
    <div class="bulk-order-card ${order.status === 'confirmed' ? 'confirmed' : ''}" data-id="${order.id}">
      <div class="bulk-order-header">
        <div>
          <h3 class="customer-name">${order.customerName}</h3>
          <p class="customer-phone">${order.phoneNumber}</p>
        </div>
        <button class="icon-action-btn btn-delete" onclick="deleteOrder('${order.id}')">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
      
      <div class="bulk-order-details">
        <div class="detail-col">
          <label>Product</label>
          <p>${order.productName}</p>
        </div>
        <div class="detail-col">
          <label>Amount</label>
          <p class="price-text">₹${order.amount}</p>
        </div>
      </div>

      <div class="bulk-order-actions">
        <button class="action-btn btn-wa" onclick="sendWA('${order.id}')">
          <i data-lucide="message-circle"></i> WhatsApp
        </button>
        <button class="action-btn btn-copy" onclick="copyMessage('${order.id}')">
          <i data-lucide="copy"></i>
        </button>
        <button class="icon-action-btn btn-toggle ${order.status === 'confirmed' ? 'active' : ''}" onclick="toggleStatus('${order.id}')">
          <i data-lucide="check"></i>
        </button>
      </div>
    </div>
  `).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderSearch(query) {
  if (!query) {
    searchResults.innerHTML = '';
    return;
  }
  
  const q = query.toLowerCase();
  const filtered = orders.filter(o => 
    (o.customerName && o.customerName.toLowerCase().includes(q)) || 
    (o.productName && o.productName.toLowerCase().includes(q)) ||
    (o.phoneNumber && o.phoneNumber.includes(q))
  );
  
  if (filtered.length === 0) {
    searchResults.innerHTML = '<div class="empty-state">No matches found.</div>';
    return;
  }
  
  // Reuse same card markup for search results
  searchResults.innerHTML = filtered.map(order => `
    <div class="bulk-order-card bg-[#1e293b] border-[#334155] p-4 rounded-xl mb-3 shadow">
       <div class="flex justify-between items-center mb-2">
         <h3 class="font-bold text-white text-lg">${order.customerName}</h3>
         <span class="text-xs bg-[#0f172a] px-2 py-1 rounded text-[#94a3b8]">${order.phoneNumber}</span>
       </div>
       <div class="flex justify-between text-sm text-[#94a3b8]">
         <span>${order.productName}</span>
         <span class="font-bold text-[#22c55e]">₹${order.amount}</span>
       </div>
    </div>
  `).join('');
}


// --- Global Actions (attached to window for onclick) ---
window.deleteOrder = (id) => {
  if (confirm("Are you sure you want to delete this order?")) {
    orders = orders.filter(o => o.id !== id);
    saveOrders();
    vibrate(30);
  }
};

window.toggleStatus = (id) => {
  const order = orders.find(o => o.id === id);
  if (order) {
    order.status = order.status === 'confirmed' ? 'pending' : 'confirmed';
    saveOrders();
    vibrate(30);
  }
};

window.sendWA = (id) => {
  const order = orders.find(o => o.id === id);
  if (!order) return;
  
  const msg = generateMessage(order);
  let ph = order.phoneNumber.replace(/\D/g, '');
  if (ph.length === 10) ph = '91' + ph;
  
  const url = `https://wa.me/${ph}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
  
  // Auto-mark as confirmed? Optional.
  // order.status = 'confirmed'; saveOrders();
  
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

filterBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    filterBtns.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderOrders(e.target.dataset.filter);
  });
});

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(e.currentTarget.dataset.target);
    vibrate(20);
  });
});

// Settings init
function initSettings() {
  const s = getSettings();
  sellerNameInput.value = s.sellerName;
  defaultMessageInput.value = s.defaultMessage;
}

settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  saveSettings({
    sellerName: sellerNameInput.value,
    defaultMessage: defaultMessageInput.value
  });
  vibrate(40);
  showToast('Settings saved!');
});

// Search functionality
function openSearch() {
  searchOverlay.classList.remove('hidden');
  globalSearchInput.focus();
  renderSearch(globalSearchInput.value);
}

function closeSearch() {
  searchOverlay.classList.add('hidden');
  globalSearchInput.value = '';
  searchResults.innerHTML = '';
}

searchToggleBtn.addEventListener('click', openSearch);
closeSearchBtn.addEventListener('click', closeSearch);

globalSearchInput.addEventListener('input', (e) => {
  renderSearch(e.target.value);
});

// INIT
initSettings();
loadOrders();
