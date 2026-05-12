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

// Bulk Action elements
const bulkActionBar = document.getElementById('bulkActionBar');
const bulkProgressText = document.getElementById('bulkProgressText');
const bulkProgressBar = document.getElementById('bulkProgressBar');
const progressFill = document.querySelector('.progress-fill');
const btnBulkSend = document.getElementById('btnBulkSend');
const btnBulkStop = document.getElementById('btnBulkStop');

// --- State ---
let orders = [];
let currentFilter = 'all';
let bulkSendActive = false;

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
  updateBulkActionBar();
}

function saveOrders(skipRender = false) {
  // Let's cap history at a reasonable limit like 500
  if (orders.length > 500) orders = orders.slice(0, 500);
  localStorage.setItem(DB_ORDERS_KEY, JSON.stringify(orders));
  if (!skipRender) {
    renderOrders();
  }
  updateBulkActionBar();
}

function getSettings() {
  const settings = localStorage.getItem(DB_SETTINGS_KEY);
  return settings ? { ...defaultSettings, ...JSON.parse(settings) } : defaultSettings;
}

function saveSettings(settings) {
  localStorage.setItem(DB_SETTINGS_KEY, JSON.stringify(settings));
}

// --- Utils ---
function updateBulkActionBar() {
  const floatingActions = document.getElementById('floatingActions');
  if (orders.length === 0) {
    if (bulkActionBar) bulkActionBar.classList.add('hidden');
    if (floatingActions) floatingActions.classList.add('hidden');
    return;
  }
  
  if (floatingActions) floatingActions.classList.remove('hidden');
  if (!bulkActionBar) return;
  
  bulkActionBar.classList.remove('hidden');
  
  const pendingOrders = orders.filter(o => o.status === 'pending');
  if (!bulkSendActive) {
    bulkProgressText.textContent = `${pendingOrders.length} pending order${pendingOrders.length === 1 ? '' : 's'}`;
    if (pendingOrders.length === 0) {
      btnBulkSend.style.display = 'none';
      bulkProgressText.textContent = 'All pending orders processed!';
    } else {
      btnBulkSend.style.display = 'flex';
    }
  }
}

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
    
    const unique = [];
    const seenPhones = new Set(orders.map(o => o.phoneNumber));
    let dupCount = 0;
    
    extracted.forEach(o => {
      if (!seenPhones.has(o.phoneNumber)) {
        seenPhones.add(o.phoneNumber);
        unique.push(o);
      } else {
        dupCount++;
      }
    });

    if (unique.length > 0) {
      orders = [...unique, ...orders];
      saveOrders();
      showToast(`Added ${unique.length} new orders!`, 'check-circle-2');
      vibrate(50);
    } else {
      showToast('No valid new orders found in file.', 'x');
    }
    
    if (dupCount > 0) {
      setTimeout(() => {
        showToast(`${dupCount} duplicate orders removed`, 'info');
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
            customerName: nameRaw,
            phoneNumber: phone,
            productName: productRaw,
            amount: price,
            status: 'pending',
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
             customerName: name,
             phoneNumber: phone,
             productName: 'Ordered item',
             amount: price,
             status: 'pending',
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
function renderOrders(filter = currentFilter) {
  currentFilter = filter;
  let filtered = orders;
  if (filter === 'pending') filtered = orders.filter(o => o.status === 'pending');
  if (filter === 'opened') filtered = orders.filter(o => o.status === 'opened');
  if (filter === 'confirmed') filtered = orders.filter(o => o.status === 'confirmed');

  if (filtered.length === 0) {
    if (orders.length === 0) {
      // Complete empty state
      bulkOrdersList.innerHTML = `
        <div class="empty-state" style="padding: 48px 20px;">
          <div class="text-[#3b82f6] opacity-80 mb-6 flex justify-center">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </div>
          <h3 class="text-xl font-bold mb-2">No orders uploaded yet</h3>
          <p class="text-slate-400 mb-6">Upload an Excel or PDF file to start bulk processing.</p>
          <button class="btn primary-btn w-full max-w-[240px] mx-auto shadow-lg shadow-blue-500/20" onclick="document.getElementById('fileUpload').click()">
            <i data-lucide="upload"></i> Upload File
          </button>
        </div>`;
    } else {
      // Filter empty state
      bulkOrdersList.innerHTML = `
        <div class="empty-state" style="padding: 48px 20px;">
          <i data-lucide="filter" class="mb-4 opacity-50 block mx-auto w-12 h-12 text-slate-500"></i>
          <p class="text-lg">No ${filter} orders found.</p>
        </div>`;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  bulkOrdersList.innerHTML = filtered.map(order => `
    <div class="bulk-order-card ${order.status}" data-id="${order.id}">
      <div class="status-badge ${order.status}">${order.status}</div>
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
    saveOrders(true);
    vibrate(30);
    
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

window.sendWA = (id) => {
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

async function startBulkSend() {
  const pendingOrders = orders.filter(o => o.status === 'pending');
  if (pendingOrders.length === 0) return;
  
  bulkSendActive = true;
  btnBulkSend.classList.add('hidden');
  btnBulkStop.classList.remove('hidden');
  bulkProgressBar.classList.remove('hidden');
  
  for (let i = 0; i < pendingOrders.length; i++) {
    if (!bulkSendActive) break; // Check for stop
    
    const order = pendingOrders[i];
    
    // Update UI
    bulkProgressText.textContent = `Sending ${i + 1} of ${pendingOrders.length}...`;
    progressFill.style.width = `${((i + 1) / pendingOrders.length) * 100}%`;
    
    // Open WA
    const msg = generateMessage(order);
    let ph = order.phoneNumber.replace(/\D/g, '');
    if (ph.length === 10) ph = '91' + ph;
    const url = `https://wa.me/${ph}?text=${encodeURIComponent(msg)}`;
    
    window.open(url, '_blank');
    
    // Mark as opened
    if (order.status !== 'confirmed') {
      order.status = 'opened';
      saveOrders(true);
      
      const card = document.querySelector(`.bulk-order-card[data-id="${order.id}"]`);
      if (card) {
        card.className = `bulk-order-card ${order.status}`;
        const badge = card.querySelector('.status-badge');
        if (badge) {
          badge.className = `status-badge ${order.status}`;
          badge.textContent = order.status;
        }
      }
    }
    
    // Delay 2 seconds, unless it's the last one
    if (i < pendingOrders.length - 1 && bulkSendActive) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  bulkSendActive = false;
  btnBulkSend.classList.remove('hidden');
  btnBulkStop.classList.add('hidden');
  bulkProgressBar.classList.add('hidden');
  progressFill.style.width = '0%';
  updateBulkActionBar();
  showToast('Bulk send completed!');
}

function stopBulkSend() {
  bulkSendActive = false;
  btnBulkSend.classList.remove('hidden');
  btnBulkStop.classList.add('hidden');
  bulkProgressBar.classList.add('hidden');
  progressFill.style.width = '0%';
  updateBulkActionBar();
  showToast('Bulk send stopped', 'square');
}

btnBulkSend.addEventListener('click', startBulkSend);
btnBulkStop.addEventListener('click', stopBulkSend);

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

document.getElementById('btnExportPending')?.addEventListener('click', () => {
  const pendingOrders = orders.filter(o => o.status === 'pending');
  exportToCSV(pendingOrders, 'pending_orders.csv');
});

document.getElementById('btnExportConfirmed')?.addEventListener('click', () => {
  const confirmedOrders = orders.filter(o => o.status === 'confirmed');
  exportToCSV(confirmedOrders, 'confirmed_orders.csv');
});

// --- Delete All Functionality ---
const btnDeleteAll = document.getElementById('btnDeleteAll');
const deleteModal = document.getElementById('deleteModal');
const btnCancelDelete = document.getElementById('btnCancelDelete');
const btnConfirmDelete = document.getElementById('btnConfirmDelete');

btnDeleteAll?.addEventListener('click', () => {
  if (bulkSendActive) {
    showToast('Stop bulk sending before deleting.', 'alert-triangle');
    vibrate([50, 50, 50]);
    return;
  }
  deleteModal.classList.remove('hidden');
  vibrate(20);
});

btnCancelDelete?.addEventListener('click', () => {
  deleteModal.classList.add('hidden');
});

btnConfirmDelete?.addEventListener('click', () => {
  deleteModal.classList.add('hidden');
  
  // Fade out cards first
  const cards = document.querySelectorAll('.bulk-order-card');
  cards.forEach(card => card.classList.add('card-fade-out'));
  
  setTimeout(() => {
    // Reset state
    orders = [];
    currentFilter = 'all';
    
    // Update active filter button visually
    document.querySelectorAll('.filter-btn').forEach(btn => {
      if (btn.dataset.filter === 'all') {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    saveOrders();
    vibrate([40, 50, 40]);
    showToast('All orders deleted', 'check-circle-2');
  }, 300);
});


