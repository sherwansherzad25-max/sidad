window.addEventListener('afterprint', function() {});

let isSaleProcessed = false; 
let isReturnMode = false;
let systemUnlocked = false;
let pendingTab = '';
let html5QrCode = null; 
let currentScannerTarget = null;
let currentDebtMode = 'customer'; 
let pendingExtendDateName = '';
let currentQuickAction = '';
let typingTimer;

// --- دەنگی فرۆشتن (Beep) ---
function playSaleBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        osc.type = 'sine'; 
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.connect(audioCtx.destination); 
        osc.start(); 
        osc.stop(audioCtx.currentTime + 0.15);
    } catch(e) {}
}

// --- کاتی زیندوو و ئاماری ڕۆژانە ---
function updateLiveClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    const dateStr = now.toLocaleDateString('en-GB');
    const clockEl = document.getElementById('liveClockDisplay');
    if(clockEl) clockEl.innerText = dateStr + " | " + timeStr;

    const history = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || [];
    let startOfDay = new Date();
    startOfDay.setHours(6, 0, 0, 0);
    if (now.getHours() < 6) { startOfDay.setDate(startOfDay.getDate() - 1); }
    const todayCount = history.filter(rec => rec.timestamp >= startOfDay.getTime()).length;
    const countEl = document.getElementById('todaySalesCount');
    if(countEl) countEl.innerText = todayCount;
}
setInterval(updateLiveClock, 1000);

// --- داخستنی بازاڕ و ڕاپۆرتی شیفت ---
function closeMarketReport() {
    const history = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || [];
    const expenses = JSON.parse(localStorage.getItem('khalkhalanExpenses')) || [];
    const now = new Date();
    let startOfDay = new Date(now);
    startOfDay.setHours(6, 0, 0, 0);
    if (now.getHours() < 6) startOfDay.setDate(startOfDay.getDate() - 1);

    let tRev = 0, tProf = 0, tRet = 0, rProf = 0, tExp = 0;
    
    history.forEach(rec => {
        if (rec.timestamp >= startOfDay.getTime()) {
            if(rec.isReturn) {
                tRet += Math.abs(rec.totalNum);
                rProf += Math.abs(rec.totalProfit || 0);
            } else {
                tRev += rec.totalNum;
                tProf += (rec.totalProfit || 0);
            }
        }
    });
    
    expenses.forEach(e => {
        if(e.timestamp >= startOfDay.getTime()) tExp += e.amount;
    });

    let netRev = tRev - tRet;
    let netProf = tProf - rProf;
    let finalSafi = netProf - tExp;

    let content = `
        <div id="captureAreaDaily" class="receipt-print" dir="rtl" style="color:var(--text-color); background:var(--container-bg);">
            <h2 style="text-align:center; margin-bottom:5px; color:var(--text-color);">ڕاپۆرتی ڕۆژانە (داخستنی بازاڕ)</h2>
            <p style="text-align:center; margin-bottom:15px; font-size:12px; color:var(--text-color);">بەروار: ${now.toLocaleDateString('en-GB')} | کات: ${now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}</p>
            <div style="border: 1px dashed var(--border-color); padding:15px; margin-bottom:10px; text-align:right; font-size:14px; line-height:1.8;">
                <p style="margin:0; display:flex; justify-content:space-between; color:var(--text-color);"><span>🛒 کۆی فرۆشراو:</span> <b>${tRev.toLocaleString()} دینار</b></p>
                <p style="margin:0; display:flex; justify-content:space-between; color:var(--danger);"><span>🔄 کۆی گەڕاوە:</span> <b>${tRet.toLocaleString()} دینار</b></p>
                <p style="margin:0; display:flex; justify-content:space-between; color:var(--danger);"><span>💸 خەرجییەکان:</span> <b>${tExp.toLocaleString()} دینار</b></p>
                <hr style="border:0; border-top:1px dashed var(--border-color); margin:10px 0;">
                <p style="margin:0; display:flex; justify-content:space-between; color:var(--primary);"><span>💰 سافی داهات:</span> <b>${netRev.toLocaleString()} دینار</b></p>
                <p style="margin:0; display:flex; justify-content:space-between; color:var(--success);"><span>📈 سافی قازانج:</span> <b>${netProf.toLocaleString()} دینار</b></p>
                <div style="text-align:center; background:var(--input-bg); padding:10px; border-radius:8px; margin-top:15px; border:1px solid var(--border-color);">
                    <h3 style="margin:0; color:var(--accent);">صافی سندووق (پارەی ماوە)</h3>
                    <span style="font-size:22px; font-weight:bold; color:var(--text-color);">${finalSafi.toLocaleString()} دینار</span>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('modalBtns').innerHTML = `<button class="btn btn-print" onclick="window.print()">🖨️ پرێنت</button><button class="btn btn-close" onclick="closeModal()">داخستن</button>`;
    document.getElementById('receiptModal').style.display = 'flex';
}

// --- مۆد و شاشە ---
function toggleTheme() {
    const body = document.body;
    if (body.getAttribute('data-theme') === 'dark') {
        body.removeAttribute('data-theme');
        localStorage.setItem('khalkhalanThemePref', 'light');
    } else {
        body.setAttribute('data-theme', 'dark');
        localStorage.setItem('khalkhalanThemePref', 'dark');
    }
}
if(localStorage.getItem('khalkhalanThemePref') === 'dark') document.body.setAttribute('data-theme', 'dark');

function toggleFullScreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => {});
    else document.exitFullscreen();
}

// --- سیستەمی چوونەژوورەوە و دەسەڵاتەکان ---
function openLockModal() {
    if(systemUnlocked) {
        systemUnlocked = false;
        document.body.classList.add('locked');
        let btn = document.getElementById('lockToggleBtn');
        btn.innerHTML = '🔒 کاشێر';
        btn.style.backgroundImage = 'var(--grad-danger)';
        goHome(); 
    } else {
        document.getElementById('pinModal').style.display = 'flex';
        setTimeout(() => document.getElementById('adminPinInput').focus(), 100);
    }
}

function closePinModal() { 
    document.getElementById('pinModal').style.display = 'none'; 
    document.getElementById('adminPinInput').value = ''; 
    pendingTab = '';
}

function verifyPin() {
    const input = document.getElementById('adminPinInput').value;
    const savedPin = localStorage.getItem('khalkhalanAdminPin') || '0000';
    if(input === savedPin) {
        systemUnlocked = true;
        document.body.classList.remove('locked');
        let btn = document.getElementById('lockToggleBtn');
        btn.innerHTML = '🔓 بەڕێوەبەر';
        btn.style.backgroundImage = 'var(--grad-success)';
        closePinModal();
        if(pendingTab) { switchTab(pendingTab); pendingTab = ''; }
    } else {
        alert("پاسۆردەکە هەڵەیە!");
        document.getElementById('adminPinInput').value = '';
    }
}

function changeSystemPin() {
    const oldP = document.getElementById('oldPin').value;
    const newP = document.getElementById('newPin').value;
    const savedPin = localStorage.getItem('khalkhalanAdminPin') || '0000';
    if(oldP !== savedPin) return alert("پاسۆردە کۆنەکە هەڵەیە!");
    if(!newP || newP.length < 3) return alert("پاسۆردی نوێ زۆر کورتە!");
    
    localStorage.setItem('khalkhalanAdminPin', newP);
    document.getElementById('oldPin').value = '';
    document.getElementById('newPin').value = '';
    alert("پاسۆردەکە بە سەرکەوتوویی گۆڕدرا!");
}

function goHome() {
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'tab-sales') {
        const gtSales = unformat(document.getElementById('grandTotalSales').innerText);
        if (gtSales > 0 && !isSaleProcessed && !confirm("⚠️ وەسڵی فرۆشتنەکەت سەیڤ نەکردووە!\nدڵنیای دەتەوێت بگەڕێیتەوە سەرەتا؟")) return; 
    }
    if (activeTab && activeTab.id === 'tab-compare') {
        const gtComp = unformat(document.getElementById('grandTotal').innerText);
        if (gtComp > 0 && !confirm("⚠️ وەسڵی بەراوردەکەت سەیڤ نەکردووە!\nدڵنیای دەتەوێت بگەڕێیتەوە سەرەتا؟")) return;
    }

    document.getElementById('mainDashboard').style.display = 'grid';
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
}

function switchTab(tabId) {
    const adminTabs = ['tab-inventory', 'tab-offers', 'tab-stats', 'tab-expenses', 'tab-debts', 'tab-backup'];
    if (adminTabs.includes(tabId) && !systemUnlocked) {
        pendingTab = tabId;
        document.getElementById('pinModal').style.display = 'flex';
        setTimeout(() => document.getElementById('adminPinInput').focus(), 100);
        return;
    }

    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'tab-sales' && tabId !== 'tab-sales') {
        const gtSales = unformat(document.getElementById('grandTotalSales').innerText);
        if (gtSales > 0 && !isSaleProcessed && !confirm("⚠️ وەسڵی فرۆشتنەکەت سەیڤ نەکردووە!\nدڵنیای دەتەوێت بچیتە بەشێکی تر؟")) return; 
    }
    if (activeTab && activeTab.id === 'tab-compare' && tabId !== 'tab-compare') {
        const gtComp = unformat(document.getElementById('grandTotal').innerText);
        if (gtComp > 0 && !confirm("⚠️ وەسڵی بەراوردەکەت سەیڤ نەکردووە!\nدڵنیای دەتەوێت بچیتە بەشێکی تر؟")) return;
    }

    document.getElementById('mainDashboard').style.display = 'none';
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    if(tabId === 'tab-stats') calculateGeneralStats();
    if(tabId === 'tab-expenses') renderExpensesTable();
    if(tabId === 'tab-inventory') renderInventoryTable();
    if(tabId === 'tab-offers') renderOffersTable();
    if(tabId === 'tab-debts') {
        document.getElementById('modeCustomer').checked = true;
        switchDebtMode('customer');
    }
}

// --- یارمەتیدەرەکان ---
function unformat(val) {
    if (!val) return 0;
    return parseFloat(val.toString().replace(/,/g, '')) || 0;
}

document.addEventListener('input', function (e) {
    if (e.target.classList.contains('format-num')) {
        let val = e.target.value;
        val = val.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^0-9.]/g, '');
        if (val !== "") {
            let parts = val.split('.');
            parts[0] = parseInt(parts[0], 10).toLocaleString('en-US');
            e.target.value = parts.length > 1 ? parts[0] + '.' + parts[1] : parts[0];
        } else {
            e.target.value = "";
        }
    }
});

function numberToKurdishWords(num) {
    if (num === 0) return "سفر";
    if (num < 0) return "سالب " + numberToKurdishWords(Math.abs(num));
    const units = ["", "یەک", "دوو", "سێ", "چوار", "پێنج", "شەش", "حەوت", "هەشت", "نۆ"];
    const tens = ["", "دە", "بیست", "سی", "چل", "پەنجا", "شەست", "حەفتا", "هەشتا", "نەوەد"];
    const teans = ["دە", "یازدە", "دوازدە", "سێزدە", "چواردە", "پازدە", "شازدە", "حەڤدە", "هەژدە", "نۆزدە"];
    const hundreds = ["", "سەد", "دوو سەد", "سێ سەد", "چوار سەد", "پێنج سەد", "شەش سەد", "حەوت سەد", "هەشت سەد", "نۆ سەد"];
    
    function convertTenths(n) {
        if (n < 10) return units[n];
        if (n >= 10 && n < 20) return teans[n - 10];
        let u = n % 10; let t = Math.floor(n / 10);
        return tens[t] + (u > 0 ? " و " + units[u] : "");
    }
    function convertHundreds(n) {
        if (n < 100) return convertTenths(n);
        let u = n % 100; let h = Math.floor(n / 100);
        return hundreds[h] + (u > 0 ? " و " + convertTenths(u) : "");
    }
    if (num < 1000) return convertHundreds(num);
    if (num < 1000000) {
        let u = num % 1000; let t = Math.floor(num / 1000);
        return (t === 1 ? "" : convertHundreds(t) + " ") + "هەزار" + (u > 0 ? " و " + convertHundreds(u) : "");
    }
    if (num < 1000000000) {
        let u = num % 1000000; let m = Math.floor(num / 1000000);
        return convertHundreds(m) + " ملیۆن" + (u > 0 ? " و " + numberToKurdishWords(u) : "");
    }
    return num.toLocaleString(); 
}

window.onload = function() { 
    loadHistory(); 
    loadSalesHistory(); 
    calculateAllSales(); 
    calculateAllCompare(); 
    document.getElementById('modeCustomer').checked = true; 
    switchDebtMode('customer'); 
    renderInventoryTable(); 
    renderExpensesTable(); 
    checkLowStock(); 
    updateLiveClock();
    
    const lastBackup = localStorage.getItem('khalkhalanLastBackupReminder');
    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    if (!lastBackup || (now - parseInt(lastBackup)) > threeDays) {
        setTimeout(() => {
            const history = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || [];
            if(history.length > 10) {
                const banner = document.createElement('div');
                banner.id = 'backupReminderBanner';
                banner.innerHTML = `<span>💾 یادەوەری: ئەمڕۆ پشتیوانی (Backup) نەکردووی!</span><button onclick="document.getElementById('backupReminderBanner').remove(); localStorage.setItem('khalkhalanLastBackupReminder','${now}');" style="background:white;color:var(--warning);border:none;border-radius:8px;padding:6px 12px;font-weight:bold;cursor:pointer;">باشە</button>`;
                document.body.appendChild(banner);
            }
        }, 3000);
    }
};

// --- کامێرا و سکانەر ---
function openScanner(btnElem, targetId = null) {
    currentScannerTarget = targetId ? document.getElementById(targetId) : btnElem.previousElementSibling; 
    document.getElementById('scannerModal').style.display = 'flex';
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (decodedText) => {
        currentScannerTarget.value = decodedText; 
        closeScanner(); 
        currentScannerTarget.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => { 
            if(targetId === 'empInvCode') searchAddInventory(currentScannerTarget);
            else if(targetId === 'offerSearchCode') searchForOffer(currentScannerTarget);
            else handleItemChange(currentScannerTarget); 
        }, 300);
    }, () => {}).catch(err => { alert("نەتوانرا کامێرا بکرێتەوە!"); closeScanner(); });
}

function closeScanner() {
    if (html5QrCode) html5QrCode.stop().then(() => html5QrCode.clear()).catch(err => console.log(err));
    document.getElementById('scannerModal').style.display = 'none';
}

// --- خەرجییەکان ---
function getExpenses() { return JSON.parse(localStorage.getItem('khalkhalanExpenses')) || []; }
function saveExpense() {
    const amt = unformat(document.getElementById('expAmount').value);
    const name = document.getElementById('expName').value.trim();
    if(amt <= 0 || !name) return alert("تکایە جۆر و بڕی خەرجییەکە بە دروستی بنووسە!");
    let exp = getExpenses(); const now = new Date();
    exp.unshift({ timestamp: now.getTime(), date: now.toLocaleDateString('en-GB') + " " + now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'}), amount: amt, name: name });
    localStorage.setItem('khalkhalanExpenses', JSON.stringify(exp));
    document.getElementById('expAmount').value = ''; document.getElementById('expName').value = '';
    renderExpensesTable(); alert("خەرجییەکە تۆمارکرا.");
}

function renderExpensesTable() {
    const exp = getExpenses(); const tbody = document.getElementById('expenseTableBody'); if(!tbody) return;
    tbody.innerHTML = ''; let monthTotal = 0; const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    exp.forEach((e, idx) => {
        if(e.timestamp >= startOfMonth) { 
            monthTotal += e.amount;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="font-weight:bold;">${e.name}</td><td style="font-size:11px; direction:ltr;">${e.date}</td><td style="color:var(--danger); font-weight:bold;">${e.amount.toLocaleString()}</td><td><button class="btn-delete-row" onclick="deleteExpense(${idx})">🗑️</button></td>`;
            tbody.appendChild(tr);
        }
    });
    if(tbody.innerHTML === '') tbody.innerHTML = '<tr><td colspan="4" style="color:#999; padding:15px;">هیچ خەرجییەکی ئەم مانگە نییە</td></tr>';
    document.getElementById('totalMonthlyExpenseLabel').innerText = monthTotal.toLocaleString();
}

function deleteExpense(idx) {
    if(confirm("دڵنیای لە سڕینەوەی ئەم خەرجییە؟")) { let exp = getExpenses(); exp.splice(idx, 1); localStorage.setItem('khalkhalanExpenses', JSON.stringify(exp)); renderExpensesTable(); }
}

// --- مەخزەن و کاڵاکان ---
function getInventory() { return JSON.parse(localStorage.getItem('khalkhalanInventory')) || {}; }
function saveInventory(data) { localStorage.setItem('khalkhalanInventory', JSON.stringify(data)); renderInventoryTable(); checkLowStock(); }

function checkLowStock() {
    const inv = getInventory(); let count = 0;
    Object.values(inv).forEach(item => { if(item.qty !== undefined && item.qty <= 5) count++; });
    const badge = document.getElementById('lowStockBadge');
    if(badge) { badge.innerText = count; badge.style.display = count > 0 ? 'inline-block' : 'none'; }
}

function openLowStockModal() {
    const inv = getInventory(); const tbody = document.getElementById('lowStockTableBody'); tbody.innerHTML = ''; let hasItems = false;
    Object.keys(inv).forEach(code => {
        const item = inv[code];
        if(item.qty !== undefined && item.qty <= 5) {
            hasItems = true; tbody.innerHTML += `<tr><td style="font-weight:bold; color:var(--primary);">${item.name}</td><td style="color:var(--danger); font-weight:bold; font-size:16px;">${item.qty}</td></tr>`;
        }
    });
    if(!hasItems) tbody.innerHTML = `<tr><td colspan="2" style="color:#999; padding:15px; text-align:center;">هیچ کاڵایەک کەم نییە. مەخزەن پڕە!</td></tr>`;
    document.getElementById('lowStockModal').style.display = 'flex';
}
function closeLowStockModal() { document.getElementById('lowStockModal').style.display = 'none'; }

function searchAddInventory(inputElem) {
    const val = inputElem.value.trim().toLowerCase();
    const listDiv = document.getElementById('addInvAutocompleteList');
    listDiv.innerHTML = '';
    if(!val) { listDiv.style.display = 'none'; document.getElementById('empInvName').value = ''; return; }

    const inv = getInventory(); let matches = [];
    Object.keys(inv).forEach(code => {
        if(code.toLowerCase().includes(val) || inv[code].name.toLowerCase().includes(val)) {
            matches.push({ code: code, name: inv[code].name, qty: inv[code].qty });
        }
    });

    if(matches.length > 0) {
        listDiv.style.display = 'block';
        matches.forEach(m => {
            const div = document.createElement('div');
            let qtyInd = m.qty !== undefined ? ` <small style="color:#999;">(${m.qty})</small>` : '';
            div.innerHTML = `<span>${m.name} - <span style="color:#888;">${m.code}</span>${qtyInd}</span>`;
            div.onmousedown = function() {
                inputElem.value = m.code;
                document.getElementById('empInvName').value = m.name;
                listDiv.style.display = 'none';
                document.getElementById('empInvQty').focus();
            };
            listDiv.appendChild(div);
        });
    } else { listDiv.style.display = 'none'; document.getElementById('empInvName').value = ''; }
}

function saveEmpInventoryQty() {
    const code = document.getElementById('empInvCode').value.trim(); const qtyVal = document.getElementById('empInvQty').value.trim(); const qty = qtyVal === "" ? 0 : parseFloat(qtyVal);
    if(!code) return alert("تکایە بارکۆد یان ناوی کاڵا لێبدە!"); if(qty <= 0) return alert("تکایە بڕی هاتووی دروست بنووسە!");
    let inv = getInventory(); if(!inv[code]) return alert("ئەم کاڵایە لە کۆگادا نییە! تکایە بەڕێوەبەر ئاگادار بکەرەوە بۆ ناساندنی کاڵاکە.");
    inv[code].qty = (inv[code].qty || 0) + qty; saveInventory(inv);
    document.getElementById('empInvCode').value = ''; document.getElementById('empInvName').value = ''; document.getElementById('empInvQty').value = ''; document.getElementById('empInvCode').style.borderColor = 'var(--border-color)';
    alert("بڕی کاڵاکە سەرکەوتوویانە خرایە سەر مەخزەن!");
}

// --- ئۆفەرەکان ---
function searchForOffer(inputElem) {
    const val = inputElem.value.trim().toLowerCase();
    const listDiv = document.getElementById('offerAutocompleteList');
    listDiv.innerHTML = '';
    if(!val) { listDiv.style.display = 'none'; return; }

    const inv = getInventory(); let matches = [];
    Object.keys(inv).forEach(code => {
        if(code.toLowerCase().includes(val) || inv[code].name.toLowerCase().includes(val)) {
            matches.push({ code: code, name: inv[code].name, sellPrice: inv[code].sellPrice, discount: inv[code].discount });
        }
    });

    if(matches.length > 0) {
        listDiv.style.display = 'block';
        matches.forEach(m => {
            const div = document.createElement('div');
            div.innerHTML = `<span>${m.name} - <span style="color:#888;">${m.code}</span></span> <span style="color:var(--success);">${m.sellPrice.toLocaleString()}</span>`;
            div.onmousedown = function() {
                addToOffers(m.code);
                inputElem.value = '';
                listDiv.style.display = 'none';
                inputElem.focus();
            };
            listDiv.appendChild(div);
        });
    } else { listDiv.style.display = 'none'; }
}

function addToOffers(code) {
    let inv = getInventory();
    let globalDisc = parseFloat(document.getElementById('globalDiscountPercent').value) || 0;
    if(inv[code]) {
        inv[code].discount = globalDisc;
        saveInventory(inv);
        renderOffersTable();
    }
}

function updateOfferDiscount(code, inputElem) {
    let inv = getInventory();
    let newDisc = parseFloat(inputElem.value) || 0;
    if(inv[code]) {
        inv[code].discount = newDisc;
        saveInventory(inv);
        renderOffersTable(); 
    }
}

function removeFromOffers(code) {
    let inv = getInventory();
    if(inv[code]) {
        inv[code].discount = 0;
        saveInventory(inv);
        renderOffersTable();
    }
}

function renderOffersTable() {
    const inv = getInventory();
    const tbody = document.getElementById('offersTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    let count = 0;

    Object.keys(inv).forEach(code => {
        const item = inv[code];
        if(item.discount && item.discount > 0) {
            count++;
            let newPrice = item.sellPrice - (item.sellPrice * item.discount / 100);
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:bold; color:var(--primary);">${item.name}</td>
                <td style="text-decoration:line-through; color:var(--danger);">${item.sellPrice.toLocaleString()}</td>
                <td>
                    <div style="display:flex; align-items:center; justify-content:center; gap:5px;">
                        <input type="number" value="${item.discount}" style="width:60px; padding:6px; border:2px solid var(--warning); border-radius:6px; text-align:center; font-weight:bold;" onchange="updateOfferDiscount('${code}', this)">
                        <span>%</span>
                    </div>
                </td>
                <td style="color:var(--success); font-weight:bold; font-size:16px;">${newPrice.toLocaleString()}</td>
                <td><button onclick="removeFromOffers('${code}')" class="btn-delete-row">🗑️</button></td>
            `;
            tbody.appendChild(tr);
        }
    });

    if(count === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:#999; padding:20px;">هیچ کاڵایەک لە لیستی ئۆفەرەکاندا نییە.</td></tr>';
    }
}

function autoFillInventory(val) {
    const inv = getInventory(); const code = val.trim();
    if(inv[code]) { 
        document.getElementById('invName').value = inv[code].name; 
        document.getElementById('invBuy').value = inv[code].buyPrice > 0 ? inv[code].buyPrice.toLocaleString('en-US') : ''; 
        document.getElementById('invSell').value = inv[code].sellPrice > 0 ? inv[code].sellPrice.toLocaleString('en-US') : ''; 
        document.getElementById('invQty').value = ''; 
        document.getElementById('invCode').style.borderColor = 'var(--success)'; 
    } else { 
        document.getElementById('invName').value = ''; 
        document.getElementById('invBuy').value = ''; 
        document.getElementById('invSell').value = ''; 
        document.getElementById('invQty').value = '';
        document.getElementById('invCode').style.borderColor = 'var(--border-color)'; 
    }
}

function saveInventoryItem() {
    const code = document.getElementById('invCode').value.trim(); 
    const name = document.getElementById('invName').value.trim(); 
    const buyPrice = unformat(document.getElementById('invBuy').value); 
    const sellPrice = unformat(document.getElementById('invSell').value); 
    const qtyVal = document.getElementById('invQty').value.trim(); 
    const qty = qtyVal === "" ? undefined : parseFloat(qtyVal);

    if(!code && !name) return alert("تکایە کۆد یان ناوێک بنووسە!"); 
    if(sellPrice <= 0) return alert("تکایە نرخی فرۆشتن بە دروستی بنووسە!");
    
    const finalCode = code || "كۆد_" + Date.now().toString().slice(-6); 
    let inv = getInventory(); 
    let newQty = qty;
    
    if (inv[finalCode] && inv[finalCode].qty !== undefined && qty !== undefined) newQty = inv[finalCode].qty + qty;
    
    let currentDisc = inv[finalCode] ? (inv[finalCode].discount || 0) : 0;
    let packCode = inv[finalCode] ? (inv[finalCode].packCode || '') : '';
    let packRatio = inv[finalCode] ? (inv[finalCode].packRatio || 10) : 10;
    let packSellPrice = inv[finalCode] ? (inv[finalCode].packSellPrice || 0) : 0;
    
    inv[finalCode] = { 
        name: name, 
        buyPrice: buyPrice, 
        sellPrice: sellPrice, 
        qty: newQty, 
        discount: currentDisc,
        packCode: packCode,
        packRatio: packRatio,
        packSellPrice: packSellPrice
    }; 
    saveInventory(inv);
    
    document.getElementById('invCode').value = ''; 
    document.getElementById('invName').value = ''; 
    document.getElementById('invBuy').value = ''; 
    document.getElementById('invSell').value = ''; 
    document.getElementById('invQty').value = ''; 
    document.getElementById('invCode').style.borderColor = 'var(--border-color)';
    
    alert("کاڵاکە بە سەرکەوتوویی ناسێنرا / نوێکرایەوە!");
}

function renderInventoryTable() {
    const inv = getInventory(); const tbody = document.getElementById('inventoryTableBody'); const searchInput = document.getElementById('searchInventoryInput'); const search = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if(!tbody) return; tbody.innerHTML = '';
    Object.keys(inv).forEach(code => {
        const item = inv[code];
        if(code.toLowerCase().includes(search) || item.name.toLowerCase().includes(search)) {
            let qtyText = item.qty !== undefined ? item.qty : '-'; 
            let rowStyle = (item.qty !== undefined && item.qty <= 5) ? 'background-color: rgba(231,76,60,0.1);' : '';
            let discText = item.discount > 0 ? `<br><small style="color:white; background:var(--warning); padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">${item.discount}% داشکاندن</small>` : '';
            
            const tr = document.createElement('tr'); if(rowStyle) tr.style = rowStyle;
            tr.innerHTML = `<td style="font-weight:bold; cursor:pointer;" onclick="editInventoryItem('${code}')">${item.name}${discText}</td><td style="font-size:11px; direction:ltr;">${code}</td><td style="color:var(--success); font-weight:bold;">${item.sellPrice.toLocaleString()}</td><td>${item.buyPrice.toLocaleString()}</td><td style="font-weight:bold;">${qtyText}</td><td style="display:flex; justify-content:center; gap:5px; border:none; padding-top:12px;"><button onclick="editInventoryItem('${code}')" class="btn-delete-row" style="background-image:var(--grad-accent);">✏️</button><button onclick="deleteInventoryItem('${code}')" class="btn-delete-row">🗑️</button></td>`;
            tbody.appendChild(tr);
        }
    });
    if(tbody.innerHTML === '') tbody.innerHTML = '<tr><td colspan="6" style="color:#999; padding:15px;">هیچ کاڵایەک نەدۆزرایەوە</td></tr>';
}

function editInventoryItem(code) {
    const inv = getInventory(); const item = inv[code];
    if (item) { 
        document.getElementById('invCode').value = code; 
        document.getElementById('invName').value = item.name; 
        document.getElementById('invBuy').value = item.buyPrice > 0 ? item.buyPrice.toLocaleString('en-US') : ''; 
        document.getElementById('invSell').value = item.sellPrice.toLocaleString('en-US'); 
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
    }
}
function deleteInventoryItem(code) { if(confirm("دڵنیای لە سڕینەوەی ئەم کاڵایە بە یەکجاری لە کۆگا؟")) { let inv = getInventory(); delete inv[code]; saveInventory(inv); } }

// --- لۆژیکی یەکخستن و فرۆشتن لە کاشێر (Auto-Merge) ---
function searchInventory(inputElem, tableType) {
    clearTimeout(typingTimer);
    const val = inputElem.value.trim().toLowerCase();
    const listDiv = inputElem.closest('td').querySelector('.item-autocomplete-list');
    const row = inputElem.closest('tr');
    const nameDisplay = row.querySelector('.item-name-input');
    
    listDiv.innerHTML = ''; 
    nameDisplay.value = ''; 
    inputElem.removeAttribute('data-item-name'); 
    row.setAttribute('data-buy-price', '0'); 
    row.setAttribute('data-multiplier', '1'); 
    row.setAttribute('data-is-pack', 'false');
    row.querySelector('.price').value = '';
    
    const tableResp = inputElem.closest('.table-responsive'); if(tableResp) tableResp.style.overflowX = 'visible';
    if(!val) { listDiv.style.display = 'none'; calculateAllSales(); return; }

    const inv = getInventory(); 
    let exactMatchCode = null; 
    let isPackMatch = false;
    let matches = [];

    Object.keys(inv).forEach(code => {
        let item = inv[code];
        if(code.toLowerCase() === val || item.name.toLowerCase() === val) {
            exactMatchCode = code;
            isPackMatch = false;
        } else if(item.packCode && item.packCode.toLowerCase() === val) {
            exactMatchCode = code;
            isPackMatch = true;
        } else {
            if(code.toLowerCase().includes(val) || item.name.toLowerCase().includes(val)) {
                matches.push({ code: code, name: item.name, sellPrice: item.sellPrice, buyPrice: item.buyPrice, qty: item.qty, discount: item.discount, isPack: false, multiplier: 1 });
            }
            if(item.packCode && item.packCode.toLowerCase().includes(val)) {
                matches.push({ code: code, packCode: item.packCode, name: item.name + " (دەستە)", sellPrice: item.packSellPrice || (item.sellPrice * (item.packRatio || 10)), buyPrice: (item.buyPrice || 0) * (item.packRatio || 10), qty: Math.floor((item.qty || 0) / (item.packRatio || 10)), discount: 0, isPack: true, multiplier: item.packRatio || 10 });
            }
        }
    });

    if(exactMatchCode) {
        let m = inv[exactMatchCode];
        if(isPackMatch) {
            let mult = m.packRatio || 10;
            let packSell = m.packSellPrice || (m.sellPrice * mult);
            let packBuy = (m.buyPrice || 0) * mult;
            previewMatch(inputElem, val, m.name, packSell, packBuy, 0, tableType, true, mult);
        } else {
            previewMatch(inputElem, exactMatchCode, m.name, m.sellPrice, m.buyPrice, m.discount, tableType, false, 1);
        }
        listDiv.style.display = 'none';
        if(document.activeElement === inputElem && inputElem.value.trim().toLowerCase() === val) {
            handleItemChange(inputElem);
        }
    } else if(matches.length > 0) {
        listDiv.style.display = 'block';
        matches.forEach(m => {
            const div = document.createElement('div'); 
            let qtyInd = m.qty !== undefined ? ` <small style="color:#999;">(${m.qty})</small>` : '';
            let priceHtml = `<span style="color:var(--success);">${m.sellPrice.toLocaleString()}</span>`;
            if(m.discount > 0 && !m.isPack) {
                let newPrice = m.sellPrice - (m.sellPrice * m.discount / 100);
                priceHtml = `<span style="color:var(--danger); text-decoration:line-through; font-size:11px;">${m.sellPrice.toLocaleString()}</span> <span style="color:var(--success); font-weight:bold;">${newPrice.toLocaleString()}</span>`;
            }
            div.innerHTML = `<span>${m.name} - <span style="color:#888;">${m.isPack ? m.packCode : m.code}</span>${qtyInd}</span> <div>${priceHtml}</div>`;
            div.onmousedown = function() {
                inputElem.value = m.isPack ? m.packCode : m.code; 
                previewMatch(inputElem, inputElem.value, m.name, m.sellPrice, m.buyPrice, m.discount, tableType, m.isPack, m.multiplier); 
                listDiv.style.display = 'none';
                finalizeRowAndAddNext(inputElem, tableType);
            };
            listDiv.appendChild(div);
        });
    } else { listDiv.style.display = 'none'; }
}

function previewMatch(inputElem, code, name, sellPrice, buyPrice, discount, tableType, isPack = false, multiplier = 1) {
    const row = inputElem.closest('tr'); const nameDisplay = row.querySelector('.item-name-input');
    
    let actualSellPrice = sellPrice;
    let displayName = isPack ? `${name} (دەستە)` : name;
    
    if(discount > 0 && !isPack) {
        actualSellPrice = sellPrice - (sellPrice * discount / 100);
        displayName = `${name} (${discount}% داشکاندن)`;
    }
    
    nameDisplay.value = displayName; 
    inputElem.setAttribute('data-item-name', displayName); 
    row.querySelector('.price').value = actualSellPrice.toLocaleString('en-US');
    row.setAttribute('data-buy-price', buyPrice || 0); 
    row.setAttribute('data-multiplier', multiplier);
    row.setAttribute('data-is-pack', isPack ? 'true' : 'false');
    
    if (tableType === 'sales') calculateAllSales(); else calculateAllCompare();
}

function handleItemInputKey(event, inputElem) {
    if(event.key === 'Enter') {
        event.preventDefault(); const tableType = inputElem.closest('table').id.includes('Sales') ? 'sales' : 'compare';
        if (inputElem.value.trim() !== '') finalizeRowAndAddNext(inputElem, tableType);
    }
}

function handleItemChange(inputElem) {
    setTimeout(() => {
        const tableType = inputElem.closest('table').id.includes('Sales') ? 'sales' : 'compare';
        if (inputElem.getAttribute('data-item-name')) finalizeRowAndAddNext(inputElem, tableType);
    }, 50);
}

// --- یەکخستنی کاڵاکان لە کاتی دووبارە سکانکردندا (Auto-Merge) ---
function finalizeRowAndAddNext(inputElem, tableType) {
    const row = inputElem.closest('tr');
    const codeVal = inputElem.value.trim();
    const isPackAttr = row.getAttribute('data-is-pack') === 'true';

    if (tableType === 'sales' && codeVal !== '') {
        const allRows = Array.from(document.querySelectorAll('#itemsBodySales tr'));
        const currentIndex = allRows.indexOf(row);
        let existingRow = null;

        for (let i = 0; i < allRows.length; i++) {
            if (i === currentIndex) continue;
            let otherCodeInput = allRows[i].querySelector('.item-code-input');
            let otherIsPack = allRows[i].getAttribute('data-is-pack') === 'true';
            if (otherCodeInput && otherCodeInput.value.trim().toLowerCase() === codeVal.toLowerCase() && otherIsPack === isPackAttr) {
                existingRow = allRows[i];
                break;
            }
        }

        if (existingRow) {
            let curQtyInput = row.querySelector('.qty');
            let addedQty = unformat(curQtyInput.value) || 1;
            
            let targetQtyInput = existingRow.querySelector('.qty');
            let targetQty = unformat(targetQtyInput.value) || 1;
            targetQtyInput.value = (targetQty + addedQty).toLocaleString('en-US');

            inputElem.value = '';
            row.querySelector('.item-name-input').value = '';
            inputElem.removeAttribute('data-item-name');
            row.querySelector('.qty').value = '';
            row.querySelector('.price').value = '';
            row.querySelector('.row-total').value = '';
            row.setAttribute('data-buy-price', '0');
            row.setAttribute('data-multiplier', '1');
            row.setAttribute('data-is-pack', 'false');

            calculateAllSales();
            inputElem.focus();
            return;
        }
    }

    const qtyInput = row.querySelector('.qty');
    if(!qtyInput.value) qtyInput.value = "1";
    
    if (tableType === 'sales') calculateAllSales(); else calculateAllCompare();

    const tbody = row.closest('tbody'); const allRows = tbody.querySelectorAll('tr');
    if(row === allRows[allRows.length - 1]) {
        if(tableType === 'sales') addRowSales(); else addRowCompare();
    } else {
        const nextRow = allRows[Array.from(allRows).indexOf(row) + 1];
        if(nextRow) {
            let nextInput = tableType === 'sales' ? nextRow.querySelector('.item-code-input') : nextRow.querySelector('.item-name-input');
            if (nextInput) nextInput.focus();
        }
    }
}

function updateRowNumbersSales() { document.querySelectorAll('#itemsBodySales tr').forEach((row, index) => { row.querySelector('.row-num-cell').innerText = index + 1; }); }

function addRowSales() {
    const tbody = document.getElementById('itemsBodySales'); const tr = document.createElement('tr'); tr.setAttribute('data-buy-price', '0'); tr.setAttribute('data-multiplier', '1'); tr.setAttribute('data-is-pack', 'false');
    tr.innerHTML = `
        <td class="row-num-cell"></td>
        <td>
            <div class="input-with-btn" style="position:relative;">
                <input type="text" class="item-code-input" placeholder="کۆد..." oninput="searchInventory(this, 'sales')" onkeydown="handleItemInputKey(event, this)" onchange="handleItemChange(this)" autocomplete="off" style="border-color: var(--accent); font-weight:bold;">
                <button class="btn-camera" onclick="openScanner(this)" style="padding: 0 8px;">📷</button>
                <div class="item-autocomplete-list"></div>
            </div>
        </td>
        <td><input type="text" class="item-name-input" readonly placeholder="..." style="background: var(--input-bg); font-weight: bold; color: var(--success); text-align: center; border: 1px dashed var(--border-color); pointer-events: none;"></td>
        <td><input type="text" class="qty format-num" placeholder="١" inputmode="decimal" oninput="calculateAllSales()"></td>
        <td><input type="text" class="price format-num" placeholder="نرخ" inputmode="decimal" oninput="calculateAllSales()"></td>
        <td><input type="text" class="row-total" placeholder="٠" readonly></td>
        <td><button class="btn-delete-row" onclick="deleteSpecificRowSales(this)">🗑️</button></td>`;
    tbody.appendChild(tr); updateRowNumbersSales();
    setTimeout(() => tr.querySelector('.item-code-input').focus(), 50);
}

function deleteSpecificRowSales(btnElem) {
    const row = btnElem.closest('tr'); const itemVal = row.querySelector('.item-code-input').value.trim(); const priceVal = unformat(row.querySelector('.price').value);
    if(itemVal !== "" || priceVal > 0) if(!confirm("⚠️ دڵنیای لە سڕینەوەی ئەم کاڵایە لە وەسڵەکە؟")) return;
    const rowsCount = document.querySelectorAll('#itemsBodySales tr').length;
    if(rowsCount > 1) { row.remove(); updateRowNumbersSales(); calculateAllSales(); }
    else { row.querySelector('.item-code-input').value = ''; row.querySelector('.item-name-input').value = ''; row.querySelector('.item-code-input').removeAttribute('data-item-name'); row.querySelector('.qty').value = ''; row.querySelector('.price').value = ''; row.querySelector('.row-total').value = ''; row.setAttribute('data-buy-price', '0'); row.setAttribute('data-multiplier', '1'); row.setAttribute('data-is-pack', 'false'); calculateAllSales(); }
}

function calculateAllSales() {
    let subTotal = 0; const rateInput = unformat(document.getElementById('dollarRateSales').value) || 150000;
    document.querySelectorAll('#itemsBodySales tr').forEach(row => {
        let qtyStr = row.querySelector('.qty').value; const qty = qtyStr === "" ? 1 : unformat(qtyStr); const price = unformat(row.querySelector('.price').value); const total = qty * price;
        row.querySelector('.row-total').value = total > 0 ? total.toLocaleString() : ""; subTotal += total;
    });
    let discountVal = unformat(document.getElementById('discountValueSales').value); let grandTotal = subTotal - discountVal; if(grandTotal < 0) grandTotal = 0; 
    document.getElementById('mainCurrencySymbolSales').innerText = 'دینار'; document.getElementById('convertedCurrencySymbolSales').innerText = 'دۆلار';
    document.getElementById('grandTotalSales').innerText = grandTotal.toLocaleString(); document.getElementById('convertedTotalSales').innerText = (grandTotal / (rateInput/100)).toFixed(2);
}

function convertUsdToIqdSales() {
    const usd = unformat(document.getElementById('calcUSDSales').value); const rate = (unformat(document.getElementById('dollarRateSales').value) || 150000) / 100;
    document.getElementById('resIQDSales').innerText = (usd * rate > 0 ? (usd * rate).toLocaleString() : "0") + " دینار";
}

function convertIqdToUsdSales() {
    const iqd = unformat(document.getElementById('calcIQDSales').value); const rate = (unformat(document.getElementById('dollarRateSales').value) || 150000) / 100;
    document.getElementById('resUSDSales').innerText = (rate > 0 ? (iqd / rate).toFixed(2) : "0") + " دۆلار";
}

function clearSalesAfterPrint() { document.getElementById('itemsBodySales').innerHTML = ''; addRowSales(); document.getElementById('grandTotalSales').innerText = '0'; document.getElementById('convertedTotalSales').innerText = '0'; document.getElementById('receiptNoteSales').value = ''; document.getElementById('discountValueSales').value = ''; isSaleProcessed = false; closeModal(); }
function clearAllSales() { if(confirm("⚠️ دڵنیای لە پاککردنەوەی هەموو خشتەی فرۆشتنەکە؟")) { document.getElementById('itemsBodySales').innerHTML = ''; addRowSales(); document.getElementById('grandTotalSales').innerText = '0'; document.getElementById('convertedTotalSales').innerText = '0'; document.getElementById('receiptNoteSales').value = ''; document.getElementById('discountValueSales').value = ''; isSaleProcessed = false; } }

function processSale() {
    if(isSaleProcessed) { openSalesReceiptModal(0, true, true); return; }
    const grandTotalRaw = unformat(document.getElementById('grandTotalSales').innerText); 
    let subTotal = 0; let items = []; let totalProfit = 0; let inv = getInventory(); let inventoryUpdated = false;
    
    document.querySelectorAll('#itemsBodySales tr').forEach(row => {
        const price = unformat(row.querySelector('.price').value);
        if(price > 0) {
            let inputElem = row.querySelector('.item-code-input'); 
            let nameElem = row.querySelector('.item-name-input'); 
            let itemName = inputElem.getAttribute('data-item-name') || nameElem.value || "کاڵای نەناسراو"; 
            let qtyStr = row.querySelector('.qty').value; 
            let qty = qtyStr === "" ? 1 : unformat(qtyStr); 
            let buyPrice = parseFloat(row.getAttribute('data-buy-price')) || 0;
            let multiplier = parseFloat(row.getAttribute('data-multiplier')) || 1;
            
            let itemTotal = qty * price; 
            let itemProfit = (price - buyPrice) * qty; 
            let baseDeductQty = qty * multiplier;

            let cleanKeyName = itemName.replace(' (گەڕاوە)', '').replace(' (دەستە)', '').replace(/\s*\([٠-٩0-9]+%\s*داشکاندن\)/, '').trim();

            if (isReturnMode) {
                subTotal -= itemTotal; 
                totalProfit -= itemProfit;
                items.push({ name: itemName + " (گەڕاوە)", qty: qty, price: price, total: -itemTotal, profit: -itemProfit });
                let itemKey = Object.keys(inv).find(k => inv[k].name === cleanKeyName || k === inputElem.value || inv[k].packCode === inputElem.value);
                if (itemKey && inv[itemKey].qty !== undefined) { inv[itemKey].qty += baseDeductQty; inventoryUpdated = true; }
            } else {
                subTotal += itemTotal; 
                totalProfit += itemProfit;
                items.push({ name: itemName, qty: qty, price: price, total: itemTotal, profit: itemProfit });
                let itemKey = Object.keys(inv).find(k => inv[k].name === cleanKeyName || k === inputElem.value || inv[k].packCode === inputElem.value);
                if (itemKey && inv[itemKey].qty !== undefined) { 
                    inv[itemKey].qty -= baseDeductQty; 
                    if(inv[itemKey].qty < 0) inv[itemKey].qty = 0; 
                    inventoryUpdated = true; 
                }
            }
        }
    });
    
    if(items.length === 0) return alert("هیچ کاڵایەک داخڵ نەکراوە!");
    
    let discountVal = unformat(document.getElementById('discountValueSales').value); 
    if(!isReturnMode) {
        totalProfit -= discountVal;
    }
    
    let grandTotal = isReturnMode ? -grandTotalRaw : grandTotalRaw;
    const currencyName = 'دینار'; const now = new Date();
    
    const receipt = { 
        timestamp: now.getTime(), 
        date: now.toLocaleDateString('en-GB') + " | " + now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'}), 
        subTotal: subTotal, 
        discount: isReturnMode ? 0 : discountVal, 
        totalNum: grandTotal, 
        totalStr: grandTotal.toLocaleString() + " " + currencyName, 
        totalProfit: totalProfit, 
        currency: currencyName, 
        items: items, 
        note: document.getElementById('receiptNoteSales').value.trim(),
        isReturn: isReturnMode
    };
    
    let salesHistory = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || []; 
    salesHistory.unshift(receipt); 
    if(salesHistory.length > 10000) salesHistory.pop(); 
    
    localStorage.setItem('khalkhalanSalesData', JSON.stringify(salesHistory));
    if(inventoryUpdated) { localStorage.setItem('khalkhalanInventory', JSON.stringify(inv)); renderInventoryTable(); checkLowStock(); }
    
    calculateGeneralStats(); 
    loadSalesHistory(); 
    isSaleProcessed = true; 
    
    playSaleBeep();
    const mainCont = document.getElementById('mainContainer');
    if(mainCont) {
        mainCont.classList.add('sale-success-flash');
        setTimeout(() => mainCont.classList.remove('sale-success-flash'), 300);
    }

    openSalesReceiptModal(0, true, true);
    
    if(isReturnMode) {
        toggleReturnMode();
    }
}

function loadSalesHistory() {
    const history = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || [];
    const salesList = document.getElementById('dailySalesList');
    const returnsList = document.getElementById('dailyReturnsList');
    
    if(!salesList || !returnsList) return;
    salesList.innerHTML = '';
    returnsList.innerHTML = '';
    
    let now = new Date(); 
    let startOfDay = new Date(now); 
    startOfDay.setHours(6, 0, 0, 0);
    if (now.getHours() < 6) {
        startOfDay.setDate(startOfDay.getDate() - 1);
    }
    
    let todaysHistory = history.filter(rec => rec.timestamp >= startOfDay.getTime());
    
    let saleCount = 1;
    let returnCount = 1;
    
    todaysHistory.slice(0, 100).forEach((rec) => { 
        const originalIdx = history.indexOf(rec);
        let timeStr = rec.date.split(' | ')[1] || rec.date;
        
        let tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.style.borderBottom = '1px dashed var(--border-color)';
        tr.onclick = () => openSalesReceiptModal(originalIdx);
        
        if (rec.isReturn) {
            tr.innerHTML = `<td style="padding:6px;">${returnCount}</td><td style="padding:6px; direction:ltr;">${timeStr}</td><td style="padding:6px; color:var(--danger); font-weight:bold;">${Math.abs(rec.totalNum).toLocaleString()}</td>`;
            returnsList.appendChild(tr);
            returnCount++;
        } else {
            tr.innerHTML = `<td style="padding:6px;">${saleCount}</td><td style="padding:6px; direction:ltr;">${timeStr}</td><td style="padding:6px; color:var(--success); font-weight:bold;">${rec.totalNum.toLocaleString()}</td>`;
            salesList.appendChild(tr);
            saleCount++;
        }
    });

    if(saleCount === 1) salesList.innerHTML = '<tr><td colspan="3" style="padding:10px; color:#999;">هیچ نییە</td></tr>';
    if(returnCount === 1) returnsList.innerHTML = '<tr><td colspan="3" style="padding:10px; color:#999;">هیچ نییە</td></tr>';
}

function openSalesReceiptModal(index, autoPrint = false, isNewSale = false) {
    const history = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || []; const rec = history[index]; if(!rec) return;
    let rows = '';
    rec.items.forEach(it => {
        let pStr = Math.abs(it.price).toLocaleString();
        let tStr = Math.abs(it.total).toLocaleString();
        rows += `<tr>
            <td style="border: 1px solid #000; padding: 4px 2px; word-break: break-word; white-space: normal; text-align: right;">${it.name}</td>
            <td style="border: 1px solid #000; padding: 4px 2px; text-align: center;">${it.qty}</td>
            <td style="border: 1px solid #000; padding: 4px 2px; text-align: center;">${pStr}</td>
            <td style="border: 1px solid #000; padding: 4px 2px; text-align: center;">${tStr}</td>
        </tr>`;
    });
    
    const noteHtml = rec.note ? `<div style="text-align:right; margin-bottom:10px; font-size:14px; border-top:1px dashed var(--border-color); padding-top:5px; color:var(--text-color);"><b>تێبینی:</b> ${rec.note}</div>` : '';
    const absTotal = Math.abs(rec.totalNum || 0); 
    const tafqeetText = numberToKurdishWords(absTotal) + " دینار"; 
    const tafqeetHtml = `<div class="tafqeet-text">تەنها: ${tafqeetText}</div>`;
    
    let totalsHtml = '';
    if (rec.discount && rec.discount > 0 && !rec.isReturn) {
        totalsHtml = `<div class="receipt-total" style="border:none; margin-top:10px; color:var(--text-color);">
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;"><span>پێش داشکاندن:</span> <span>${Math.abs(rec.subTotal || 0).toLocaleString()}</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:bold; margin-bottom:5px;"><span>داشکاندن:</span> <span>${rec.discount.toLocaleString()} -</span></div>
            <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:bold; border-top:2px dashed var(--border-color); padding-top:5px;"><span>کۆی کۆتایی:</span> <span>${absTotal.toLocaleString()} دینار</span></div>
        </div>`;
    } else {
        totalsHtml = `<div class="receipt-total" style="color:var(--text-color);">کۆی گشتی: ${absTotal.toLocaleString()} دینار</div>`;
    }
    
    const titleText = rec.isReturn ? 'وەسڵی گەڕاندنەوە' : ' جیهانی جگه‌ره‌ و ڤه‌یپی سیداد';
    const titleColor = rec.isReturn ? 'color: var(--danger);' : '';

    document.getElementById('modalBody').innerHTML = `
        <div id="captureArea" class="receipt-print" dir="rtl">
            <h2 style="text-align:center; margin: 0 0 5px 0; ${titleColor}">${titleText}</h2>
            <p style="text-align:center; margin: 0 0 15px 0;">خاوەنی:سیداد<br>ناونیشان: چه‌مچه‌ماڵ - بانی مه‌قان br><span style="direction:ltr; display:inline-block; margin-top:5px;">${rec.date}</span></p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; table-layout: fixed;">
                <thead>
                    <tr>
                        <th style="width: 50%; border: 1px solid #000; padding: 4px 2px; text-align: right;">بابەت</th>
                        <th style="width: 12%; border: 1px solid #000; padding: 4px 2px;">بڕ</th>
                        <th style="width: 19%; border: 1px solid #000; padding: 4px 2px;">نرخ</th>
                        <th style="width: 19%; border: 1px solid #000; padding: 4px 2px;">کۆ</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            ${noteHtml}${totalsHtml}${tafqeetHtml}
        </div>`;
        
    const modalBtns = document.getElementById('modalBtns');
    modalBtns.innerHTML = `<button class="btn btn-print" onclick="window.print();">🖨️ پرێنتکردن</button><button class="btn btn-download" onclick="downloadReceiptImage()">📥 مۆبایل</button><button class="btn btn-close" onclick="${isNewSale ? 'clearSalesAfterPrint()' : 'closeModal()'}">${isNewSale ? 'داخستن و پاککردنەوە' : 'داخستن'}</button>`;
    document.getElementById('receiptModal').style.display = 'flex';
    if(autoPrint) setTimeout(() => { window.print(); }, 500);
}

function closeModal() { const modal = document.getElementById('receiptModal'); if(modal) modal.style.display = 'none'; }

function downloadReceiptImage() {
    const target = document.getElementById('captureArea'); if(!target) return;
    html2canvas(target, { scale: 2, useCORS: true, backgroundColor: "#ffffff" }).then(canvas => { const link = document.createElement('a'); link.download = 'Wene_Khalkhalan.png'; link.href = canvas.toDataURL('image/png'); link.click(); }).catch(err => alert("نەتوانرا وێنەکە دابەزێنرێت."));
}

// --- ئامار و قازانج ---
function calculateDeadStock() {
    const history = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || [];
    const inv = getInventory();
    const thirtyDaysAgo = new Date().getTime() - (30 * 24 * 60 * 60 * 1000);

    let soldItemNames = new Set();
    history.forEach(rec => {
        if(rec.timestamp >= thirtyDaysAgo && !rec.isReturn) {
            rec.items.forEach(it => {
                let cleanName = it.name.replace(' (گەڕاوە)', '').replace(' (دەستە)', '').replace(/\s*\([٠-٩0-9]+%\s*داشکاندن\)/, '').trim();
                soldItemNames.add(cleanName);
            });
        }
    });

    const tbody = document.getElementById('deadStockTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    let count = 0;

    Object.keys(inv).forEach(code => {
        const item = inv[code];
        if(item.qty > 0 && !soldItemNames.has(item.name.trim())) {
            count++;
            tbody.innerHTML += `<tr><td style="font-weight:bold;">${item.name}</td><td style="color:var(--danger); font-weight:bold;">${item.qty}</td></tr>`;
        }
    });

    if(count === 0) tbody.innerHTML = '<tr><td colspan="2" style="color:var(--success); padding:10px;">هیچ کاڵایەکی خەوتوو نییە!</td></tr>';
    document.getElementById('deadStockCount').innerText = count;
}

function calculatePeakHours() {
    const history = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || [];
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);

    let hourCounts = {};
    history.forEach(rec => {
        if(rec.timestamp >= startOfDay.getTime() && !rec.isReturn) {
            let d = new Date(rec.timestamp);
            let h = d.getHours();
            hourCounts[h] = (hourCounts[h] || 0) + 1;
        }
    });

    let maxHour = -1;
    let maxCount = 0;
    for(let h in hourCounts) {
        if(hourCounts[h] > maxCount) {
            maxCount = hourCounts[h];
            maxHour = parseInt(h);
        }
    }

    const peakDiv = document.getElementById('peakHourDisplay');
    if(!peakDiv) return;
    
    if(maxHour !== -1) {
        let nextHour = maxHour + 1;
        let formatHour = (hr) => {
            let ampm = hr >= 12 ? 'ئێوارە' : 'بەیانی';
            let h12 = hr % 12;
            h12 = h12 ? h12 : 12;
            return `${h12}:00 ${ampm}`;
        };
        peakDiv.innerHTML = `🔥 قەرەباڵغترین کات: <br><span style="font-size:18px; color:var(--danger); display:block; margin:5px 0;">${formatHour(maxHour)} بۆ ${formatHour(nextHour)}</span> (${maxCount} وەسڵ)`;
    } else {
        peakDiv.innerHTML = 'هێشتا هیچ فرۆشتنێک نەکراوە ئەمڕۆ.';
    }
}

function calculateGeneralStats() {
    const history = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || []; 
    const expenses = JSON.parse(localStorage.getItem('khalkhalanExpenses')) || [];
    const now = new Date(); 
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); 
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
    
    let tRev = 0, tProf = 0, mRev = 0, mProf = 0, mExp = 0, yRev = 0, yProf = 0;
    history.forEach(rec => { 
        let val = rec.totalNum || 0; let prof = rec.totalProfit || 0; 
        if(rec.timestamp >= startOfDay) { tRev += val; tProf += prof; } 
        if(rec.timestamp >= startOfMonth) { mRev += val; mProf += prof; } 
        if(rec.timestamp >= startOfYear) { yRev += val; yProf += prof; } 
    });
    expenses.forEach(exp => { let amt = exp.amount || 0; if(exp.timestamp >= startOfMonth) mExp += amt; });
    
    if(document.getElementById('cardTodayRev')) document.getElementById('cardTodayRev').innerText = tRev.toLocaleString();
    if(document.getElementById('cardTodayProf')) document.getElementById('cardTodayProf').innerText = tProf.toLocaleString();
    if(document.getElementById('cardMonthRev')) document.getElementById('cardMonthRev').innerText = mRev.toLocaleString();
    if(document.getElementById('cardMonthProf')) document.getElementById('cardMonthProf').innerText = mProf.toLocaleString();
    if(document.getElementById('cardYearRev')) document.getElementById('cardYearRev').innerText = yRev.toLocaleString();
    if(document.getElementById('cardYearProf')) document.getElementById('cardYearProf').innerText = yProf.toLocaleString();
    if(document.getElementById('cardMonthExp')) document.getElementById('cardMonthExp').innerText = mExp.toLocaleString();
    
    let netProfit = mProf - mExp; 
    if(document.getElementById('cardMonthNet')) document.getElementById('cardMonthNet').innerText = netProfit.toLocaleString();
    if(document.getElementById('cardMonthNetWord')) document.getElementById('cardMonthNetWord').innerText = "تەنها: " + numberToKurdishWords(netProfit) + " دینار";
    
    const warningDiv = document.getElementById('negativeProfitWarning');
    if(warningDiv) warningDiv.innerHTML = netProfit < 0 ? `<div class="alert-warning">⚠️ ئاگاداربە! ئەم مانگە خەرجییەکانت لە خێرەکەت زیاتر بووە و زیانت کردووە بە بڕی ${Math.abs(netProfit).toLocaleString()} دینار.</div>` : '';
    
    calculateDeadStock();
    calculatePeakHours();
}

function filterStatsByTime() {
    const fDate = document.getElementById('filterDate').value; 
    const fMonth = document.getElementById('filterMonth').value; 
    const fYear = document.getElementById('filterYear').value; 
    const activeId = document.activeElement ? document.activeElement.id : '';
    
    if(activeId === 'filterDate') { document.getElementById('filterMonth').value = ''; document.getElementById('filterYear').value = ''; } 
    else if(activeId === 'filterMonth') { document.getElementById('filterDate').value = ''; document.getElementById('filterYear').value = ''; } 
    else if(activeId === 'filterYear') { document.getElementById('filterDate').value = ''; document.getElementById('filterMonth').value = ''; }
    
    const finalDate = document.getElementById('filterDate').value;
    const finalMonth = document.getElementById('filterMonth').value;
    const finalYear = document.getElementById('filterYear').value;
    
    const history = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || []; 
    const expenses = JSON.parse(localStorage.getItem('khalkhalanExpenses')) || [];
    
    let totalSales = 0, salesProfit = 0, totalReturns = 0, returnsProfit = 0, totalExp = 0;
    let activeFilter = finalDate || finalMonth || finalYear;
    const resDiv = document.getElementById('timeStatResult'); 
    if(!resDiv) return;
    
    if(!activeFilter) return resDiv.innerHTML = '<span style="color: #999;">تکایە کاتێک هەڵبژێرە لە سەرەوە بۆ بینینی ئامارەکان...</span>';
    
    history.forEach(rec => {
        let d = new Date(rec.timestamp);
        let recYear = d.getFullYear().toString();
        let recMonthStr = `${recYear}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        let recDateStr = `${recMonthStr}-${d.getDate().toString().padStart(2, '0')}`;
        
        if((finalDate && recDateStr === finalDate) || (finalMonth && recMonthStr === finalMonth) || (finalYear && recYear === finalYear)) { 
            if (rec.isReturn) {
                totalReturns += Math.abs(rec.totalNum || 0);
                returnsProfit += Math.abs(rec.totalProfit || 0);
            } else {
                totalSales += (rec.totalNum || 0); 
                salesProfit += (rec.totalProfit || 0); 
            }
        }
    });
    
    expenses.forEach(exp => {
        let d = new Date(exp.timestamp);
        let recYear = d.getFullYear().toString();
        let recMonthStr = `${recYear}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        let recDateStr = `${recMonthStr}-${d.getDate().toString().padStart(2, '0')}`;
        
        if((finalDate && recDateStr === finalDate) || (finalMonth && recMonthStr === finalMonth) || (finalYear && recYear === finalYear)) { 
            totalExp += (exp.amount || 0);
        }
    });
    
    let netRev = totalSales - totalReturns;
    let netProf = salesProfit - returnsProfit;
    let finalNet = netProf - totalExp;
    
    let warn = finalNet < 0 ? `<div style="color:var(--danger); font-size:13px; margin-top:5px;">(⚠️ زیان: ${Math.abs(finalNet).toLocaleString()} دینار)</div>` : '';
    
    resDiv.innerHTML = `
        <div style="background:rgba(0,122,255,0.05); padding:15px; border-radius:8px; border:1px solid rgba(0,122,255,0.2);">
            <h4 style="margin:0 0 10px 0; color:var(--primary);">📊 ئاماری گشتی بازاڕ لە (<span dir="ltr">${activeFilter}</span>)</h4>
            <div style="display:flex; justify-content:space-between; font-size:15px; margin-bottom:8px; border-bottom:1px dashed #ccc; padding-bottom:5px;">
                <span>🛒 کۆی فرۆشراو:</span> <span style="color:var(--success); font-weight:bold;">${totalSales.toLocaleString()} دينار</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:15px; margin-bottom:8px; border-bottom:1px dashed #ccc; padding-bottom:5px;">
                <span>🔄 کۆی گەڕاوە:</span> <span style="color:var(--danger); font-weight:bold;">${totalReturns.toLocaleString()} دينار</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:15px; margin-bottom:8px; border-bottom:1px dashed #ccc; padding-bottom:5px;">
                <span>💰 سافی داهات:</span> <span style="color:var(--primary); font-weight:bold;">${netRev.toLocaleString()} دينار</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:15px; margin-bottom:8px; border-bottom:1px dashed #ccc; padding-bottom:5px;">
                <span>📈 سافی قازانج:</span> <span style="color:var(--success); font-weight:bold;">${netProf.toLocaleString()} دينار</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:15px; margin-bottom:8px; border-bottom:1px dashed #ccc; padding-bottom:5px;">
                <span>💸 خەرجییەکان:</span> <span style="color:var(--danger); font-weight:bold;">${totalExp.toLocaleString()} دینار</span>
            </div>
            <div style="text-align:center; font-size:18px; font-weight:bold; margin-top:15px; padding-top:10px; background:var(--container-bg); border-radius:6px; color:var(--accent);">
                🏆 خێری کۆتایی (سافی قازانج):<br> <span style="font-size:24px;">${finalNet.toLocaleString()} دینار</span>
                <div style="font-size:13px; font-weight:normal; color:#555; margin-top:5px;">تەنها: ${numberToKurdishWords(finalNet)} دینار</div>
                ${warn}
            </div>
        </div>
    `;
}

function showStatAutocomplete() {
    const val = document.getElementById('statSearchInput').value.trim().toLowerCase(); 
    const list = document.getElementById('statAutocompleteList'); list.innerHTML = '';
    if (!val) { list.style.display = 'none'; document.getElementById('itemStatFilterContainer').style.display = 'none'; calculateItemStats(); return; }
    
    const history = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || []; 
    let itemNames = new Set();
    
    history.forEach(rec => { 
        rec.items.forEach(item => { 
            let cleanName = item.name.replace(' (گەڕاوە)', '').replace(' (دەستە)', '').replace(/\s*\([٠-٩0-9]+\%\s*داشکاندن\)/, '').trim();
            if(cleanName.toLowerCase().includes(val)) itemNames.add(cleanName); 
        }); 
    });
    
    if (itemNames.size === 0) { list.style.display = 'none'; document.getElementById('itemStatFilterContainer').style.display = 'none'; calculateItemStats(); return; }
    
    list.style.display = 'block';
    itemNames.forEach(name => {
        const div = document.createElement('div'); div.className = 'autocomplete-item'; div.innerText = name;
        div.onmousedown = function() { 
            document.getElementById('statSearchInput').value = name; 
            list.style.display = 'none'; 
            calculateItemStats(); 
        }; 
        list.appendChild(div);
    }); 
}

function calculateItemStats() {
    const query = document.getElementById('statSearchInput').value.trim().toLowerCase(); 
    const resArea = document.getElementById('statResultArea'); 
    const filterContainer = document.getElementById('itemStatFilterContainer');
    if(!resArea) return; 
    
    if(!query) { 
        filterContainer.style.display = 'none'; 
        resArea.innerHTML = '<span style="color: #999;">ئەنجامەکانی کاڵاکە لێرە دەردەکەون...</span>'; 
        return; 
    }
    
    filterContainer.style.display = 'block';
    const fDate = document.getElementById('itemFilterDate').value; const fMonth = document.getElementById('itemFilterMonth').value; const fYear = document.getElementById('itemFilterYear').value; const activeId = document.activeElement ? document.activeElement.id : '';
    if(activeId === 'itemFilterDate') { document.getElementById('itemFilterMonth').value = ''; document.getElementById('itemFilterYear').value = ''; } else if(activeId === 'itemFilterMonth') { document.getElementById('itemFilterDate').value = ''; document.getElementById('itemFilterYear').value = ''; } else if(activeId === 'itemFilterYear') { document.getElementById('itemFilterDate').value = ''; document.getElementById('itemFilterMonth').value = ''; }
    const finalDate = document.getElementById('itemFilterDate').value; const finalMonth = document.getElementById('itemFilterMonth').value; const finalYear = document.getElementById('itemFilterYear').value;
    const history = JSON.parse(localStorage.getItem('khalkhalanSalesData')) || [];
    
    let soldQty = 0, retQty = 0, netRev = 0, netProf = 0;
    let fSoldQty = 0, fRetQty = 0, fNetRev = 0, fNetProf = 0;
    let activeFilterName = finalDate || finalMonth || finalYear;
    
    history.forEach(receipt => {
        let d = new Date(receipt.timestamp);
        let recYear = d.getFullYear().toString();
        let recMonthStr = `${recYear}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        let recDateStr = `${recMonthStr}-${d.getDate().toString().padStart(2, '0')}`;
        
        let matchDate = false; 
        if((finalDate && recDateStr === finalDate) || (finalMonth && recMonthStr === finalMonth) || (finalYear && recYear === finalYear)) {
            matchDate = true;
        }
        
        receipt.items.forEach(item => {
            let cleanName = item.name.replace(' (گەڕاوە)', '').replace(' (دەستە)', '').replace(/\s*\([٠-٩0-9]+\%\s*داشکاندن\)/, '').trim();
            if(cleanName.toLowerCase() === query) {
                if (receipt.isReturn) {
                    retQty += item.qty;
                    netRev += item.total; 
                    netProf += (item.profit || 0); 
                    if(matchDate && activeFilterName) { 
                        fRetQty += item.qty; 
                        fNetRev += item.total; 
                        fNetProf += (item.profit || 0); 
                    }
                } else {
                    soldQty += item.qty; 
                    netRev += item.total; 
                    netProf += (item.profit || 0);
                    if(matchDate && activeFilterName) { 
                        fSoldQty += item.qty; 
                        fNetRev += item.total; 
                        fNetProf += (item.profit || 0); 
                    }
                }
            }
        });
    });
    
    let netQty = soldQty - retQty;
    let fNetQty = fSoldQty - fRetQty;
    
    if(soldQty > 0 || retQty > 0) {
        let filterHtml = activeFilterName ? `<div style="background:rgba(243,156,18,0.05); padding:10px; border-radius:8px; margin-bottom:15px; border:1px solid rgba(243,156,18,0.3);"><h4 style="margin:0 0 5px 0; color:var(--warning);">📅 ئامار لە کاتی دیاریکراودا (<span dir="ltr">${activeFilterName}</span>):</h4><div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:5px;"><span>سافی فرۆشراو: <b style="color:var(--success);">${fNetQty}</b> دانە</span><span>(فرۆشراو: ${fSoldQty} / گەڕاوە: ${fRetQty})</span></div><div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:5px;"><span>سافی داهات: <b style="color:var(--success);">${fNetRev.toLocaleString()}</b> دینار</span><span>سافی قازانج: <b style="color:var(--primary);">${fNetProf.toLocaleString()}</b> دینار</span></div></div>` : `<div style="color:#999; font-size:13px; margin-bottom:15px;">کاتی دیاریکراو هەڵبژێرە بۆ بینینی ئامارەکەی</div>`;
        resArea.innerHTML = `<div style="text-align: right; width: 100%;"><h3 style="color: var(--success); text-align: center; margin-top: 0; border-bottom:1px dashed var(--success); padding-bottom:10px;">ئاماری کاڵا: <span style="color:var(--primary);">${query}</span></h3>${filterHtml}<div style="background:rgba(44,62,80,0.05); padding:10px; border-radius:8px; border:1px solid rgba(44,62,80,0.2);"><h4 style="margin:0 0 5px 0; color:var(--primary);">📊 کۆی گشتی (لە سەرەتاوە تا ئێستا):</h4><p style="font-size: 15px; margin: 5px 0;">سافی فرۆشراوی گشتی: <span style="color: var(--success); font-size: 18px; font-weight: bold;">${netQty}</span> دانە</p><p style="font-size: 13px; margin: 5px 0; color:#888;">(فرۆشراو: ${soldQty} | گەڕاوە: ${retQty})</p><p style="font-size: 14px; margin: 5px 0; padding-top: 5px; border-top: 1px dashed var(--border-color);">سافی داهات: <span style="color: var(--primary); font-weight: bold;">${netRev.toLocaleString()}</span> دینار</p><p style="font-size: 14px; margin: 5px 0;">سافی قازانج: <span style="color: var(--success); font-weight: bold;">${netProf.toLocaleString()}</span> دینار</p></div></div>`;
    } else { resArea.innerHTML = `<span style="color: var(--danger); font-size: 16px;">هیچ نەدۆزرایەوە. دڵنیابە ناوەکەت بەتەواوی ڕاست نووسیوە.</span>`; }
}

// --- بەراوردی وەسڵەکان ---
function updateRowNumbersCompare() { document.querySelectorAll('#itemsBody tr').forEach((row, index) => { row.querySelector('.row-num-cell').innerText = index + 1; }); }

function addRowCompare() {
    const tbody = document.getElementById('itemsBody'); const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="row-num-cell"></td>
        <td>
            <input type="text" class="item-name-input" placeholder="ناوی کاڵا..." style="background: var(--input-bg); font-weight: bold; color: var(--primary); text-align: center; border: 1px solid var(--border-color);">
        </td>
        <td><input type="text" class="qty format-num" placeholder="١" inputmode="decimal" oninput="calculateAllCompare()"></td>
        <td><input type="text" class="price format-num" placeholder="نرخ" inputmode="decimal" oninput="calculateAllCompare()" onkeydown="if(event.key==='Enter') addRowCompare()"></td>
        <td><input type="text" class="row-total" placeholder="٠" readonly></td>
        <td><button class="btn-delete-row" onclick="deleteSpecificRowCompare(this)">🗑️</button></td>`;
    tbody.appendChild(tr); updateRowNumbersCompare(); setTimeout(() => tr.querySelector('.item-name-input').focus(), 50);
}

function deleteSpecificRowCompare(btnElem) {
    const row = btnElem.closest('tr'); const rowsCount = document.querySelectorAll('#itemsBody tr').length;
    if(rowsCount > 1) { row.remove(); updateRowNumbersCompare(); calculateAllCompare(); }
    else { row.querySelector('.item-name-input').value = ''; row.querySelector('.qty').value = ''; row.querySelector('.price').value = ''; row.querySelector('.row-total').value = ''; calculateAllCompare(); }
}

function calculateAllCompare() {
    let grandTotal = 0; const rateInput = unformat(document.getElementById('dollarRate').value) || 150000; const currencyMode = document.querySelector('input[name="currencyMode"]:checked').value;
    document.getElementById('mainCurrencySymbol').innerText = currencyMode === 'IQD' ? 'دینار' : 'دۆلار'; document.getElementById('convertedCurrencySymbol').innerText = currencyMode === 'IQD' ? 'دۆلار' : 'دینار';
    document.querySelectorAll('#itemsBody tr').forEach(row => {
        let qtyStr = row.querySelector('.qty').value; const qty = qtyStr === "" ? 1 : unformat(qtyStr); const price = unformat(row.querySelector('.price').value); const total = qty * price;
        row.querySelector('.row-total').value = total > 0 ? total.toLocaleString() : ""; grandTotal += total;
    });
    document.getElementById('grandTotal').innerText = grandTotal.toLocaleString(); document.getElementById('convertedTotal').innerText = currencyMode === 'IQD' ? (grandTotal / (rateInput/100)).toFixed(2) : Math.round(grandTotal * (rateInput/100)).toLocaleString();
}

function convertUsdToIqdCompare() { const usd = unformat(document.getElementById('calcUSD').value); const rate = (unformat(document.getElementById('dollarRate').value) || 150000) / 100; document.getElementById('resIQD').innerText = (usd * rate > 0 ? (usd * rate).toLocaleString() : "0") + " دینار"; }
function convertIqdToUsdCompare() { const iqd = unformat(document.getElementById('calcIQDSales').value); const rate = (unformat(document.getElementById('dollarRate').value) || 150000) / 100; document.getElementById('resUSD').innerText = (rate > 0 ? (iqd / rate).toFixed(2) : "0") + " دۆلار"; }
function clearAllCompare() { if(confirm("⚠️ دڵنیای لە پاککردنەوەی ئەم وەسڵە؟")) { document.getElementById('itemsBody').innerHTML = ''; addRowCompare(); document.getElementById('grandTotal').innerText = '0'; document.getElementById('convertedTotal').innerText = '0'; document.getElementById('calcUSD').value = ''; document.getElementById('calcIQD').value = ''; document.getElementById('resIQD').innerText = '0 دینار'; document.getElementById('resUSD').innerText = '0 دۆلار'; document.getElementById('receiptNote').value = ''; } }

window.pendingCompareReceipt = null;

function previewCompareReceipt() {
    const grandTotal = document.getElementById('grandTotal').innerText; if(grandTotal === "0" || grandTotal === "") return alert("وەسڵەکە بەتاڵە!");
    let items = [];
    document.querySelectorAll('#itemsBody tr').forEach(row => {
        const price = unformat(row.querySelector('.price').value);
        if(price > 0) {
            let nameElem = row.querySelector('.item-name-input'); let itemName = nameElem.value || "کاڵا"; 
            let qtyStr = row.querySelector('.qty').value; items.push({ name: itemName, qty: qtyStr === "" ? "1" : qtyStr, price: price.toLocaleString(), total: row.querySelector('.row-total').value });
        }
    });
    const currencyName = document.getElementById('mainCurrencySymbol').innerText; const numValue = unformat(grandTotal);
    window.pendingCompareReceipt = { date: new Date().toLocaleDateString('en-GB') + " | " + new Date().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'}), totalStr: grandTotal + " " + currencyName, tafqeet: numberToKurdishWords(numValue) + " " + currencyName, items: items, note: document.getElementById('receiptNote').value.trim() };
    let rows = '';
    window.pendingCompareReceipt.items.forEach(it => { rows += `<tr><td style="border: 1px solid #000; padding: 4px 2px; word-break: break-word; white-space: normal; text-align: right;">${it.name}</td><td style="border: 1px solid #000; padding: 4px 2px; text-align: center;">${it.qty}</td><td style="border: 1px solid #000; padding: 4px 2px; text-align: center;">${it.price}</td><td style="border: 1px solid #000; padding: 4px 2px; text-align: center;">${it.total}</td></tr>`; });
    const noteHtml = window.pendingCompareReceipt.note ? `<div style="text-align:right; margin-bottom:10px; font-size:14px; border-top:1px dashed var(--border-color); padding-top:5px; color:var(--text-color);"><b>تێبینی:</b> ${window.pendingCompareReceipt.note}</div>` : '';
    const tafqeetHtml = window.pendingCompareReceipt.tafqeet ? `<div class="tafqeet-text">تەنها: ${window.pendingCompareReceipt.tafqeet}</div>` : '';
    document.getElementById('modalBody').innerHTML = `<div id="captureArea" class="receipt-print" dir="rtl"><h3 style="text-align:center; color:var(--danger); margin-top:0; border-bottom:2px dashed var(--danger); padding-bottom:10px;">⚠️ پێداچوونەوەی وەسڵ ⚠️</h3><h2 style="text-align:center; margin: 0 0 5px 0;">  جیهانی جگه‌ره‌ و ڤه‌یپی سیداد</h2><p style="text-align:center; margin: 0 0 15px 0;">خاوەنی: سیداد  <br>ناونیشان: چەمچەماڵ - بانی مه‌قان<br><span style="direction:ltr; display:inline-block; margin-top:5px;">${window.pendingCompareReceipt.date}</span></p><table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; table-layout: fixed;"><thead><tr><th style="width: 50%; border: 1px solid #000; padding: 4px 2px; text-align: right;">بابەت</th><th style="width: 15%; border: 1px solid #000; padding: 4px 2px;">بڕ</th><th style="width: 17.5%; border: 1px solid #000; padding: 4px 2px;">نرخ</th><th style="width: 17.5%; border: 1px solid #000; padding: 4px 2px;">کۆ</th></tr></thead><tbody>${rows}</tbody></table>${noteHtml}<div class="receipt-total" style="color:var(--text-color);">کۆی گشتی: ${window.pendingCompareReceipt.totalStr}</div>${tafqeetHtml}</div>`;
    document.getElementById('modalBtns').innerHTML = `<button class="btn btn-save" style="flex:2;" onclick="confirmSaveCompareReceipt()">💾 پاشەکەوتکردنی یەکجاری</button><button class="btn btn-close" style="flex:1;" onclick="closeModal()">❌ پەشیمانبوونەوە</button>`;
    document.getElementById('receiptModal').style.display = 'flex';
}

function confirmSaveCompareReceipt() {
    if(!window.pendingCompareReceipt) return;
    let history = JSON.parse(localStorage.getItem('khalkhalanFull')) || []; history.unshift(window.pendingCompareReceipt); if(history.length > 100) history.pop(); 
    localStorage.setItem('khalkhalanFull', JSON.stringify(history)); loadHistory();
    document.getElementById('itemsBody').innerHTML = ''; addRowCompare(); document.getElementById('grandTotal').innerText = '0'; document.getElementById('convertedTotal').innerText = '0'; document.getElementById('calcUSD').value = ''; document.getElementById('calcIQD').value = ''; document.getElementById('resIQD').innerText = '0 دینار'; document.getElementById('resUSD').innerText = '0 دۆلار'; document.getElementById('receiptNote').value = ''; window.pendingCompareReceipt = null; closeModal(); alert("بە سەرکەوتوویی پاشەکەوت کرا!");
}

function loadHistory() {
    const list = document.getElementById('historyList'); list.innerHTML = ''; const history = JSON.parse(localStorage.getItem('khalkhalanFull')) || [];
    if(history.length === 0) { list.innerHTML = '<li style="text-align:center; color:#999; padding:10px;">هیچ وەسڵێک نییە</li>'; return; }
    history.slice(0, 50).forEach((rec, idx) => { 
        const li = document.createElement('li'); li.className = 'history-card'; li.innerHTML = `<div class="history-info" onclick="openReceiptModal(${idx})"><span class="history-date">#${idx+1} &nbsp; ${rec.date}</span><span class="history-amount">${rec.totalStr}</span></div><button class="btn-delete-receipt" onclick="deleteReceipt(event, ${idx})">🗑️</button>`; list.appendChild(li);
    });
}

function deleteReceipt(e, idx) { if(confirm("دڵنیای لە سڕینەوەی ئەم وەسڵە؟")) { let history = JSON.parse(localStorage.getItem('khalkhalanFull')) || []; history.splice(idx, 1); localStorage.setItem('khalkhalanFull', JSON.stringify(history)); loadHistory(); } }

function openReceiptModal(index) {
    const rec = (JSON.parse(localStorage.getItem('khalkhalanFull')) || [])[index]; if(!rec) return;
    let rows = '';
    rec.items.forEach(it => { rows += `<tr><td style="border: 1px solid #000; padding: 4px 2px; word-break: break-word; white-space: normal; text-align: right;">${it.name}</td><td style="border: 1px solid #000; padding: 4px 2px; text-align: center;">${it.qty}</td><td style="border: 1px solid #000; padding: 4px 2px; text-align: center;">${it.price}</td><td style="border: 1px solid #000; padding: 4px 2px; text-align: center;">${it.total}</td></tr>`; });
    const noteHtml = rec.note ? `<div style="text-align:right; margin-bottom:10px; font-size:14px; border-top:1px dashed var(--border-color); padding-top:5px; color:var(--text-color);"><b>تێبینی:</b> ${rec.note}</div>` : '';
    const tafqeetHtml = rec.tafqeet ? `<div class="tafqeet-text">تەنها: ${rec.tafqeet}</div>` : '';
    document.getElementById('modalBody').innerHTML = `<div id="captureArea" class="receipt-print" dir="rtl"><h2 style="text-align:center; margin: 0 0 5px 0;">مارکێتی خاڵخاڵان</h2><p style="text-align:center; margin: 0 0 15px 0;">خاوەنی: سیداد <br>ناونیشان: چەمچەماڵ - بانی مه‌قان<br><span style="direction:ltr; display:inline-block; margin-top:5px;">${rec.date}</span></p><table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; table-layout: fixed;"><thead><tr><th style="width: 50%; border: 1px solid #000; padding: 4px 2px; text-align: right;">بابەت</th><th style="width: 15%; border: 1px solid #000; padding: 4px 2px;">بڕ</th><th style="width: 17.5%; border: 1px solid #000; padding: 4px 2px;">نرخ</th><th style="width: 17.5%; border: 1px solid #000; padding: 4px 2px;">کۆ</th></tr></thead><tbody>${rows}</tbody></table>${noteHtml}<div class="receipt-total" style="color:var(--text-color);">کۆی گشتی: ${rec.totalStr}</div>${tafqeetHtml}</div>`;
    document.getElementById('modalBtns').innerHTML = `<button class="btn btn-print" onclick="window.print();">🖨️ پرێنتکردن</button><button class="btn btn-download" onclick="downloadReceiptImage()">📥 مۆبایل</button><button class="btn btn-close" onclick="closeModal()">داخستن</button>`;
    document.getElementById('receiptModal').style.display = 'flex';
}

// --- قەرزەکان ---
function switchDebtMode(mode) {
    currentDebtMode = mode;
    if(mode === 'customer') { 
        document.getElementById('debtTotalTitle').innerText = 'کۆی گشتی قەرزی بازاڕ:'; 
        document.getElementById('debtFormTitle').innerText = 'تۆمارکردنی مامەڵەی نوێ (کڕیار)'; 
        document.getElementById('debtorNameLabel').innerText = 'ناوی کڕیار:'; 
        document.getElementById('lblTypeAdd').innerHTML = 'قەرزی برد 🔴'; 
        document.getElementById('lblTypePay').innerHTML = 'پارەی هێنایەوە 🟢'; 
        document.getElementById('debtListTitle').innerText = 'لیستی قەرزدارەکان (کڕیار)'; 
    } else { 
        document.getElementById('debtTotalTitle').innerText = 'کۆی قەرزی کۆمپانیاکان (لەسەر من):'; 
        document.getElementById('debtFormTitle').innerText = 'تۆمارکردنی مامەڵەی نوێ (کۆمپانیا / مەندوب)'; 
        document.getElementById('debtorNameLabel').innerText = 'ناوی کۆمپانیا / مەندوب:'; 
        document.getElementById('lblTypeAdd').innerHTML = 'قەرزم کرد 🔴'; 
        document.getElementById('lblTypePay').innerHTML = 'قەرزم دایەوە 🟢'; 
        document.getElementById('debtListTitle').innerText = 'لیستی قەرزەکانی سەر خۆم'; 
    }
    document.getElementById('debtorName').value = ''; 
    document.getElementById('debtAmount').value = ''; 
    document.getElementById('debtNote').value = ''; 
    document.getElementById('debtDueDate').value = ''; 
    document.getElementById('typeAdd').checked = true; 
    toggleDueDateVisibility(); 
    renderDebtorsList();
}

function toggleDueDateVisibility() { document.getElementById('dueDateContainer').style.display = document.getElementById('typePay').checked ? 'none' : 'block'; }
function getDebts() { return JSON.parse(localStorage.getItem(currentDebtMode === 'customer' ? 'khalkhalanDebts' : 'khalkhalanCompanyDebts')) || {}; }
function saveDebts(data) { localStorage.setItem(currentDebtMode === 'customer' ? 'khalkhalanDebts' : 'khalkhalanCompanyDebts', JSON.stringify(data)); renderDebtorsList(); }

function showAutocomplete() {
    const val = document.getElementById('debtorName').value.trim().toLowerCase(); const list = document.getElementById('autocompleteList'); list.innerHTML = '';
    if (!val) { list.style.display = 'none'; return; }
    const debts = getDebts(); const names = Object.keys(debts).filter(n => n.toLowerCase().includes(val));
    if (names.length === 0) { list.style.display = 'none'; return; }
    list.style.display = 'block'; names.forEach(name => { const item = document.createElement('div'); item.className = 'autocomplete-item'; item.innerText = name; item.onmousedown = function() { document.getElementById('debtorName').value = name; list.style.display = 'none'; }; list.appendChild(item); });
}

function hideAutocompleteDelayed() { setTimeout(() => { document.getElementById('autocompleteList').style.display = 'none'; }, 200); }

function saveDebtTransaction() {
    const nameInput = document.getElementById('debtorName').value.trim(); const amountInput = unformat(document.getElementById('debtAmount').value); const type = document.querySelector('input[name="debtType"]:checked').value; const currency = document.querySelector('input[name="debtCurrency"]:checked').value; const note = document.getElementById('debtNote').value.trim(); const dueDate = document.getElementById('debtDueDate').value;
    if(!nameInput || amountInput <= 0) return alert("تکایە ناو و بڕ بە دروستی بنووسە!");
    let debts = getDebts(); if(!debts[nameInput]) debts[nameInput] = { totalIQD: 0, totalUSD: 0, history: [] };
    if(debts[nameInput].total !== undefined) { debts[nameInput].totalIQD = debts[nameInput].total; delete debts[nameInput].total; }
    let currentTotal = currency === 'IQD' ? debts[nameInput].totalIQD : debts[nameInput].totalUSD;
    if(type === 'add') currentTotal += amountInput; else { currentTotal -= amountInput; if(currentTotal < 0) currentTotal = 0; }
    if(currency === 'IQD') debts[nameInput].totalIQD = currentTotal; else debts[nameInput].totalUSD = currentTotal;
    if(type === 'add' && dueDate) debts[nameInput].dueDate = dueDate;
    debts[nameInput].history.unshift({ date: new Date().toLocaleDateString('en-GB') + " " + new Date().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'}), type: type, amount: amountInput, currency: currency, note: note, balance: currentTotal });
    saveDebts(debts); document.getElementById('debtorName').value = ''; document.getElementById('debtAmount').value = ''; document.getElementById('debtNote').value = ''; document.getElementById('debtDueDate').value = '';
    if(type === 'pay' && currentTotal > 0) { setTimeout(() => { pendingExtendDateName = nameInput; document.getElementById('extendDateText').innerText = `هێشتا بڕی ${currentTotal.toLocaleString()} ${currency === 'IQD' ? 'دینار' : 'دۆلار'} ماوە. ئایا دەتەوێت کاتەکەی بۆ درێژ بکەیتەوە؟`; document.getElementById('newExtendedDate').value = debts[nameInput].dueDate || ''; document.getElementById('extendDateModal').style.display = 'flex'; }, 100); } else { alert("مامەڵەکە بە سەرکەوتوویی تۆمارکرا."); }
}

function confirmExtendDate() {
    const newDate = document.getElementById('newExtendedDate').value;
    if(newDate && pendingExtendDateName) { let debts = getDebts(); if(debts[pendingExtendDateName]) { debts[pendingExtendDateName].dueDate = newDate; saveDebts(debts); if(document.getElementById('receiptModal').style.display === 'flex') openDebtModal(pendingExtendDateName); alert("کاتی قەرزەکە بە سەرکەوتوویی درێژکرایەوە!"); } } closeExtendDateModal();
}
function closeExtendDateModal() { document.getElementById('extendDateModal').style.display = 'none'; pendingExtendDateName = ''; }

function renderDebtorsList() {
    const debts = getDebts(); const listDiv = document.getElementById('debtorsList'); const searchTerm = document.getElementById('searchDebtor').value.trim().toLowerCase(); listDiv.innerHTML = ''; let globalIQD = 0; let globalUSD = 0; let hasResults = false; const today = new Date().toISOString().split('T')[0];
    
    const sortedNames = Object.keys(debts).sort((a, b) => { 
        let dataA = debts[a]; let dataB = debts[b]; 
        let tA = (dataA.totalIQD || 0) + ((dataA.totalUSD || 0) * 1500); 
        let tB = (dataB.totalIQD || 0) + ((dataB.totalUSD || 0) * 1500); 
        
        let getWeight = (data, t) => {
            if (t === 0) return 0;
            if (!data.dueDate) return 1;
            if (data.dueDate <= today) return 3;
            const diffTime = Math.abs(new Date(data.dueDate) - new Date(today));
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            if (diffDays <= 3) return 2.5;
            return 2;
        };

        let wA = getWeight(dataA, tA);
        let wB = getWeight(dataB, tB);

        if (wA !== wB) return wB - wA; 

        if (wA >= 2 && dataA.dueDate && dataB.dueDate) {
            if (dataA.dueDate < dataB.dueDate) return -1;
            if (dataA.dueDate > dataB.dueDate) return 1;
        }

        return tB - tA; 
    });

    sortedNames.forEach(name => {
        const data = debts[name]; let dIQD = data.totalIQD !== undefined ? data.totalIQD : (data.total || 0); let dUSD = data.totalUSD || 0; globalIQD += dIQD; globalUSD += dUSD;
        if(name.toLowerCase().includes(searchTerm)) {
            hasResults = true; const card = document.createElement('div'); card.className = 'debtor-card'; 
            
            let amountsHtml = ''; if(dIQD > 0) amountsHtml += `<span class="debtor-amount">${dIQD.toLocaleString()} دینار</span>`; if(dUSD > 0) amountsHtml += `<span class="debtor-amount usd" style="margin-top:4px;">${dUSD.toLocaleString()} دۆلار</span>`; if(dIQD === 0 && dUSD === 0) amountsHtml = `<span class="debtor-amount zero">سفر بووەتەوە</span>`;
            
            let dueHtml = '';
            if (data.dueDate && (dIQD > 0 || dUSD > 0)) {
                let isOverdue = data.dueDate <= today;
                let diffDays = Math.ceil((new Date(data.dueDate) - new Date(today)) / (1000 * 60 * 60 * 24));
                let isNear = diffDays > 0 && diffDays <= 3;
                
                let color = isOverdue ? 'var(--danger)' : (isNear ? 'var(--warning)' : 'var(--primary)');
                let text = isOverdue ? '(کاتی تێپەڕیوە!)' : (isNear ? '(نزیک بووەتەوە)' : '(کاتی دیاریکراوە)');
                
                if(isOverdue) card.classList.add('debt-overdue');
                else if(isNear) card.classList.add('debt-near');
                
                dueHtml = `<div style="font-size:12px; margin-top:5px; color:${color}; font-weight:bold;">📅 کاتی دانەوە: <span dir="ltr">${data.dueDate}</span> ${text}</div>`;
            }

            const deleteBtnHtml = (dIQD === 0 && dUSD === 0) ? `<button onclick="deleteDebtor(event, '${name}')" class="btn-delete-receipt" style="padding:6px;">🗑️</button>` : '';
            card.innerHTML = `<div style="flex-grow:1;" onclick="openDebtModal('${name}')"><span class="debtor-name">👤 ${name}</span>${dueHtml}</div><div style="display:flex; align-items:center;" onclick="openDebtModal('${name}')"><div style="margin-left:10px; text-align:left;">${amountsHtml}</div>${deleteBtnHtml}</div>`; listDiv.appendChild(card);
        }
    });
    
    document.getElementById('totalMarketDebtIQD').innerText = globalIQD.toLocaleString(); document.getElementById('totalMarketDebtUSD').innerText = globalUSD.toLocaleString(); 
    
    if(!hasResults) listDiv.innerHTML = '<p style="text-align:center; color:#999;">نەدۆزرایەوە.</p>';
}

function deleteDebtor(event, name) { event.stopPropagation(); if(confirm(currentDebtMode === 'customer' ? `دڵنیای لە سڕینەوەی مامەڵەکانی "${name}"؟` : `دڵنیای لە سڕینەوەی کۆمپانیای "${name}"؟`)) { let debts = getDebts(); delete debts[name]; saveDebts(debts); } }

function openDebtModal(name) {
    const debts = getDebts(); const data = debts[name]; if(!data) return;
    let dIQD = data.totalIQD !== undefined ? data.totalIQD : (data.total || 0); let dUSD = data.totalUSD || 0; let historyRows = '';
    const labelAdd = currentDebtMode === 'customer' ? 'قەرزی برد' : 'قەرزم کرد'; const labelPay = currentDebtMode === 'customer' ? 'پارەی هێنایەوە' : 'قەرزم دایەوە';
    data.history.forEach(h => { const typeLabel = h.type === 'add' ? `<span style="color:red;">${labelAdd}</span>` : `<span style="color:green;">${labelPay}</span>`; const curLabel = h.currency === 'USD' ? '$' : 'دینار'; const noteText = h.note ? `<br><small style="color:#777;">تێبینی: ${h.note}</small>` : ''; historyRows += `<tr><td style="font-size:11px; direction:ltr;">${h.date}</td><td>${typeLabel}</td><td><span dir="ltr">${h.amount.toLocaleString()} ${curLabel}</span></td><td><b>${h.balance.toLocaleString()}</b>${noteText}</td></tr>`; });
    const quickActionsHtml = `<div data-html2canvas-ignore="true"><div class="quick-actions"><button class="btn-quick btn-quick-add" onclick="toggleQuickForm('add')">🔴 قەرزی نوێ</button><button class="btn-quick btn-quick-pay" onclick="toggleQuickForm('pay')">🟢 ${labelPay}</button></div><div id="quickFormArea" class="quick-form-area"><select id="quickCurrency"><option value="IQD">دینار</option><option value="USD">دۆلار</option></select><input type="text" id="quickAmount" class="format-num" inputmode="decimal" placeholder="بڕی پارە..."><input type="text" id="quickNote" placeholder="تێبینی..."><div id="quickDueDateContainer" style="display:none;"><input type="date" id="quickDueDate" style="width:100%; margin-bottom:10px; padding:10px; border-radius:6px; border:1px solid var(--border-color); background:var(--container-bg); color:var(--text-color);"></div><div style="display:flex; gap:10px;"><button class="btn btn-save" id="quickSubmitBtn" onclick="submitQuickDebt('${name}')">تۆمارکردن</button><button class="btn btn-clear" onclick="toggleQuickForm('close')">داخستن</button></div></div></div>`;
    let iqdHtml = dIQD > 0 ? `<div style="font-size:22px; color:var(--danger);">${dIQD.toLocaleString()} دینار</div>` : ''; let usdHtml = dUSD > 0 ? `<div style="font-size:22px; color:var(--accent); margin-top:10px;">${dUSD.toLocaleString()} دۆلار</div>` : ''; let zeroHtml = (dIQD === 0 && dUSD === 0) ? `<div style="font-size:22px; color:var(--success);">سفر بووەتەوە</div>` : '';
    const tafqeetIqd = dIQD > 0 ? `<div class="tafqeet-text">تەنها: ${numberToKurdishWords(dIQD)} دینار</div>` : ''; const tafqeetUsd = dUSD > 0 ? `<div class="tafqeet-text">تەنها: ${numberToKurdishWords(dUSD)} دۆلار</div>` : '';
    document.getElementById('modalBody').innerHTML = `${quickActionsHtml}<div id="captureArea" class="receipt-print" dir="rtl" style="color:var(--text-color); background:var(--container-bg);"><h2 style="text-align:center; margin: 0 0 5px 0; color:var(--text-color);">جیهانی جگه‌ره‌ و ڤه‌یپی سیداد </h2><p style="text-align:center; margin: 0 0 15px 0; color:var(--text-color);">خاوەنی: سیداد   <br>${currentDebtMode === 'customer' ? 'کڕیار' : 'کۆمپانیا'}: <b>${name}</b></p><div class="receipt-total" style="text-align:center; border:none; padding:10px; background:var(--input-bg); border-radius:8px; margin-bottom:15px; color:var(--text-color);">کۆی قەرزی ماوە:<br> ${iqdHtml} ${usdHtml} ${zeroHtml}</div>${tafqeetIqd}${tafqeetUsd}<table style="margin-top:15px; width:100%; text-align:center;"><tr><th>بەروار</th><th>جۆر</th><th>بڕ</th><th>ماوە</th></tr>${historyRows}</table></div>`;
    document.getElementById('modalBtns').innerHTML = `<button class="btn btn-print" onclick="window.print();">🖨️ پرێنتکردن</button><button class="btn btn-download" onclick="downloadReceiptImage()">📥 مۆبایل</button><button class="btn btn-close" onclick="closeModal()">داخستن</button>`;
    document.getElementById('receiptModal').style.display = 'flex';
}

function toggleQuickForm(type) { const area = document.getElementById('quickFormArea'); if(type === 'close') { area.style.display = 'none'; return; } area.style.display = 'block'; currentQuickAction = type; document.getElementById('quickSubmitBtn').innerText = type === 'add' ? 'تۆمارکردن 🔴' : 'تۆمارکردن 🟢'; document.getElementById('quickDueDateContainer').style.display = type === 'add' ? 'block' : 'none'; }

function submitQuickDebt(name) {
    const amt = unformat(document.getElementById('quickAmount').value); const cur = document.getElementById('quickCurrency').value; const note = document.getElementById('quickNote').value.trim(); const dueDate = document.getElementById('quickDueDate').value;
    if(!amt || amt <= 0) return alert("بڕەکە هەڵەیە!");
    let debts = getDebts(); let currentTotal = cur === 'IQD' ? (debts[name].totalIQD !== undefined ? debts[name].totalIQD : debts[name].total || 0) : (debts[name].totalUSD || 0);
    if(currentQuickAction === 'add') currentTotal += amt; else { currentTotal -= amt; if(currentTotal < 0) currentTotal = 0; }
    if(cur === 'IQD') debts[name].totalIQD = currentTotal; else debts[name].totalUSD = currentTotal; if(currentQuickAction === 'add' && dueDate) debts[name].dueDate = dueDate;
    debts[name].history.unshift({ date: new Date().toLocaleDateString('en-GB') + " " + new Date().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'}), type: currentQuickAction, amount: amt, currency: cur, note: note, balance: currentTotal });
    saveDebts(debts); openDebtModal(name); 
    if(currentQuickAction === 'pay' && currentTotal > 0) { setTimeout(() => { pendingExtendDateName = name; document.getElementById('extendDateText').innerText = `هێشتا بڕی ${currentTotal.toLocaleString()} ${cur === 'IQD' ? 'دینار' : 'دۆلار'} ماوە. ئایا دەتەوێت کاتەکەی بۆ درێژ بکەیتەوە؟`; document.getElementById('newExtendedDate').value = debts[name].dueDate || ''; document.getElementById('extendDateModal').style.display = 'flex'; }, 100); }
}

// --- پاشەکەوتکردن و هێنانەوەی داتا (Backup & Restore) ---
function exportData() {
    const data = { receiptsCompare: localStorage.getItem('khalkhalanFull') || "[]", salesData: localStorage.getItem('khalkhalanSalesData') || "[]", debts: localStorage.getItem('khalkhalanDebts') || "{}", companyDebts: localStorage.getItem('khalkhalanCompanyDebts') || "{}", inventory: localStorage.getItem('khalkhalanInventory') || "{}", expenses: localStorage.getItem('khalkhalanExpenses') || "[]", adminPin: localStorage.getItem('khalkhalanAdminPin') || "0000" };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `Khalkhalan_Backup_${new Date().toISOString().split('T')[0]}.json`; link.click(); URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0]; if(!file) return;
    if(confirm("ئاگاداربە! داتای ئێستات دەسڕێتەوە و هی ناو فایلەکە دادەنێت. دڵنیای؟")) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const parsedData = JSON.parse(e.target.result);
                if((parsedData.receiptsCompare || parsedData.receipts) && parsedData.debts) {
                    localStorage.setItem('khalkhalanFull', parsedData.receiptsCompare || parsedData.receipts || "[]"); 
                    localStorage.setItem('khalkhalanSalesData', parsedData.salesData || "[]"); 
                    localStorage.setItem('khalkhalanDebts', parsedData.debts); 
                    if(parsedData.companyDebts) localStorage.setItem('khalkhalanCompanyDebts', parsedData.companyDebts); 
                    if(parsedData.inventory) localStorage.setItem('khalkhalanInventory', parsedData.inventory); 
                    if(parsedData.expenses) localStorage.setItem('khalkhalanExpenses', parsedData.expenses); 
                    if(parsedData.adminPin) localStorage.setItem('khalkhalanAdminPin', parsedData.adminPin); 
                    alert("داتاکان بە سەرکەوتوویی گەڕێندرانەوە!"); location.reload();
                } else { alert("فایلەکە هەڵەیە!"); }
            } catch (error) { alert("نەتوانرا فایلەکە بخوێندرێتەوە."); }
        }; reader.readAsText(file);
    } event.target.value = '';
}

/* ================================================================
   زیادکراوەکان (Modern UI + چاککردنی دۆخی گەڕاوە)
   ================================================================ */
/* ==========================================================
   modern.js  —  دەبێت دوای script.js بێت
   هیچ دێڕێکی script.js دەستکاری نەکراوە.
   ========================================================== */

/* ---------- ١. چاککردنی دۆخی گەڕاوە ----------
   فەنکشنی toggleReturnMode لە script.js دا نەبوو، بۆیە دوگمەکە کاری نەدەکرد. */
function toggleReturnMode() {
    isReturnMode = !isReturnMode;
    document.body.classList.toggle('return-mode', isReturnMode);

    const toggleBtn = document.getElementById('returnToggleBtn');
    if (toggleBtn) {
        toggleBtn.innerHTML = isReturnMode
            ? '🔄 دۆخی گەڕاندنەوە (چالاک)'
            : '🔄 دۆخی گەڕاندنەوە (ناچالاک)';
    }
    const saleBtn = document.getElementById('mainSaleBtn');
    if (saleBtn) {
        saleBtn.innerHTML = isReturnMode
            ? '🔄 گەڕاندنەوە و تۆمارکردن (پرێنت)'
            : '🛒 فرۆشتن و تۆمارکردن (پرێنت)';
    }
}

/* ---------- ٣. ئایکۆنی SVG لە جیاتی ئیمۆجی (کارتەکانی داشبۆرد) ---------- */
(function applySvgIcons() {
    const icons = {
        'card-sales':    '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
        'card-compare':  '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
        'card-add-inv':  '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
        'card-inv':      '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
        'card-offers':   '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
        'card-stats':    '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
        'card-expenses': '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
        'card-debts':    '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
        'card-backup':   '<circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
    };
    document.querySelectorAll('.menu-card').forEach(card => {
        const iconBox = card.querySelector('.icon');
        if (!iconBox) return;
        for (const cls in icons) {
            if (card.classList.contains(cls)) {
                iconBox.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[cls] + '</svg>';
                break;
            }
        }
    });
})();

/* ---------- ٤. Toast لە جیاتی alert ---------- */
(function setupToast() {
    const nativeAlert = window.alert.bind(window);

    window.showToast = function (msg, type) {
        let host = document.getElementById('toastHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'toastHost';
            document.body.appendChild(host);
        }
        const t = document.createElement('div');
        t.className = 'toast-item' + (type === 'error' ? ' error' : '');
        t.textContent = (type === 'error' ? '⚠️ ' : '✅ ') + msg;
        host.appendChild(t);
        setTimeout(() => t.classList.add('hide'), 2600);
        setTimeout(() => t.remove(), 3000);
    };

    window.alert = function (msg) {
        msg = String(msg == null ? '' : msg);
        // لە دوای هێنانەوەی داتا پەیج ڕیلۆد دەبێت، بۆیە alert ی ئاسایی دەمێنێتەوە
        if (msg.indexOf('گەڕێندرانەوە') !== -1) { nativeAlert(msg); return; }
        const bad = /هەڵە|تکایە|نەتوانرا|ئاگاداربە|هیچ|کورتە|بەتاڵە|نییە/.test(msg);
        window.showToast(msg, bad ? 'error' : 'success');
    };
})();


/* ================================================================
   سیستەمی کاشێر: یوزەر و پاسۆرد، شیفت، مووچەی ڕۆژانە، ڕاپۆرتی کاشێر
   (هەموو ئەمە زیادکراوە، هیچ دێڕێکی ئەسڵی نەگۆڕاوە)
   ================================================================ */
(function () {
    'use strict';

    const K_USERS = 'khalkhalanUsers';
    const K_SHIFTS = 'khalkhalanShifts';
    const K_SESSION = 'khalkhalanSession';
    const OWNER_USER = 'admin';
    const ADMIN_TABS = ['tab-inventory', 'tab-offers', 'tab-stats', 'tab-expenses', 'tab-debts', 'tab-backup', 'tab-cashiers'];

    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
    const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    const toast = (m, t) => (window.showToast ? window.showToast(m, t) : alert(m));
    const fmtTime = ts => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const fmtDate = ts => new Date(ts).toLocaleDateString('en-GB');
    const fmtDur = ms => { const m = Math.max(0, Math.round(ms / 60000)); return Math.floor(m / 60) + ' کاتژمێر و ' + (m % 60) + ' خولەک'; };
    const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const ownerPass = () => localStorage.getItem('khalkhalanAdminPin') || '0000';

    /* ---------- SHA-256 (بۆ پاراستنی پاسۆردی کاشێرەکان، بەبێ پێویستی بە HTTPS) ---------- */
    function sha256(ascii) {
        function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
        var maxWord = Math.pow(2, 32), result = '', i, j, words = [], bitLen = ascii.length * 8;
        var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], pc = k.length, comp = {};
        for (var c = 2; pc < 64; c++) {
            if (!comp[c]) {
                for (i = 0; i < 313; i += c) comp[i] = c;
                hash[pc] = (Math.pow(c, .5) * maxWord) | 0;
                k[pc++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
            }
        }
        ascii += '\x80';
        while (ascii.length % 64 - 56) ascii += '\x00';
        for (i = 0; i < ascii.length; i++) {
            j = ascii.charCodeAt(i);
            if (j >> 8) return '';
            words[i >> 2] |= j << ((3 - i) % 4) * 8;
        }
        words[words.length] = ((bitLen / maxWord) | 0);
        words[words.length] = (bitLen);
        for (j = 0; j < words.length;) {
            var w = words.slice(j, j += 16), old = hash;
            hash = hash.slice(0, 8);
            for (i = 0; i < 64; i++) {
                var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
                var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
                    (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
                var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
                hash = [(t1 + t2) | 0].concat(hash);
                hash[4] = (hash[4] + t1) | 0;
            }
            for (i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
        }
        for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); }
        return result;
    }
    const hashPw = (salt, pw) => sha256(unescape(encodeURIComponent(salt + ':' + pw)));
    const newSalt = () => newId() + newId();

    /* ---------- داتا ---------- */
    const getUsers = () => load(K_USERS, []);
    const saveUsers = v => save(K_USERS, v);
    const getShifts = () => load(K_SHIFTS, []);
    const saveShifts = v => save(K_SHIFTS, v);
    const getSession = () => load(K_SESSION, null);
    const setSession = s => { if (s) save(K_SESSION, s); else localStorage.removeItem(K_SESSION); };
    const isOwner = () => { const s = getSession(); return !!s && s.role === 'owner'; };

    /* ---------- خەرجی: مووچە خۆکارانە دەچێتە بەشی خەرجییەکان ---------- */
    function syncWageExpense(shift) {
        const exp = getExpenses();
        const idx = exp.findIndex(e => e.shiftId === shift.id);
        const wage = shift.wage || 0;
        if (wage > 0) {
            const ts = shift.end || Date.now();
            if (idx >= 0) { exp[idx].amount = wage; exp[idx].name = 'مووچەی ' + shift.userName; }
            else exp.unshift({ timestamp: ts, date: fmtDate(ts) + ' ' + fmtTime(ts), amount: wage, name: 'مووچەی ' + shift.userName, shiftId: shift.id, type: 'wage' });
        } else if (idx >= 0) {
            exp.splice(idx, 1);
        }
        localStorage.setItem('khalkhalanExpenses', JSON.stringify(exp));
        try { renderExpensesTable(); } catch (e) { }
        try { calculateGeneralStats(); } catch (e) { }
    }

    function closeShift(shiftId, wage, byOwner) {
        const shifts = getShifts();
        const s = shifts.find(x => x.id === shiftId);
        if (!s) return;
        s.end = Date.now();
        s.wage = wage > 0 ? wage : 0;
        if (byOwner) s.closedByOwner = true;
        saveShifts(shifts);
        syncWageExpense(s);
    }

    /* ---------- دیمەنی چوونەژوورەوە ---------- */
    function buildUI() {
        const gate = document.createElement('div');
        gate.id = 'loginGate';
        gate.innerHTML =
            '<div class="gate-box">' +
            '<div class="gate-logo">🔐</div>' +
            '<h2>چوونەژوورەوە</h2>' +
            '<p>بۆ دەستپێکردنی شیفت یوزەر و پاسۆردی خۆت بنووسە</p>' +
            '<input type="text" id="gateUser" placeholder="یوزەر" autocomplete="off" autocapitalize="off">' +
            '<input type="password" id="gatePass" placeholder="پاسۆرد" autocomplete="off">' +
            '<button class="btn btn-save" id="gateBtn">چوونەژوورەوە</button>' +
            '</div>';
        document.body.appendChild(gate);
        $('gateBtn').onclick = doLogin;
        ['gateUser', 'gatePass'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }));

        const sm = document.createElement('div');
        sm.className = 'modal';
        sm.id = 'shiftModal';
        sm.style.zIndex = '100500';
        sm.innerHTML = '<div class="modal-content" style="max-width:360px; text-align:center;"><div id="shiftModalBody"></div></div>';
        document.body.appendChild(sm);

        const bar = document.querySelector('.live-clock-bar');
        if (bar) {
            const chip = document.createElement('span');
            chip.id = 'currentUserChip';
            chip.style.display = 'none';
            bar.appendChild(chip);
        }

        const hideBtn = document.querySelector('[onclick="closeMarketReport()"]');
        if (hideBtn) hideBtn.classList.add('owner-only-ui');

        const grid = $('mainDashboard');
        if (grid) {
            const card = document.createElement('div');
            card.className = 'menu-card card-cashiers admin-only-card';
            card.setAttribute('onclick', "switchTab('tab-cashiers')");
            card.innerHTML = '<div class="admin-badge">🔐 بەڕێوەبەر</div>' +
                '<div class="icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>' +
                '<h3>کاشێرەکان</h3><div class="desc">یوزەر، شیفت و مووچە</div>';
            const backup = grid.querySelector('.card-backup');
            if (backup) grid.insertBefore(card, backup); else grid.appendChild(card);
        }

        const tab = document.createElement('div');
        tab.id = 'tab-cashiers';
        tab.className = 'tab-content admin-only';
        tab.innerHTML =
            '<button class="back-home-btn" onclick="goHome()">🏠 گەڕانەوە بۆ سەرەتا</button>' +
            '<div class="debt-form" style="border-top:3px solid var(--accent);">' +
            '<h3 style="margin-top:0; text-align:center; color:var(--primary);">👤 زیادکردنی کاشێری نوێ</h3>' +
            '<div class="debt-input-group"><label>یوزەر (ناو):</label><input type="text" id="cshNewUser" placeholder="نموونە: ئەحمەد" autocomplete="off"></div>' +
            '<div class="debt-input-group"><label>پاسۆرد:</label><input type="text" id="cshNewPass" placeholder="لانی کەم ٣ پیت یان ژمارە" autocomplete="off"></div>' +
            '<button class="btn btn-save" onclick="CSH.addUser()">➕ زیادکردنی کاشێر</button>' +
            '</div>' +
            '<div class="history-section"><h3 style="color:var(--primary);">👥 لیستی کاشێرەکان</h3><div id="cshUsersList"></div></div>' +
            '<div class="history-section" style="border-top:3px solid var(--success);">' +
            '<h3 style="color:var(--success);">📋 ڕاپۆرتی کاشێر و مووچە</h3>' +
            '<div class="date-filter-box">' +
            '<div><label>مانگ:</label><input type="month" id="cshMonth" onchange="CSH.renderReport()"></div>' +
            '<div><label>کاشێر:</label><select id="cshFilter" onchange="CSH.renderReport()" class="csh-select"></select></div>' +
            '</div>' +
            '<div id="cshReport"></div>' +
            '</div>';
        const designer = document.querySelector('.designer-name');
        if (designer && designer.parentNode) designer.parentNode.insertBefore(tab, designer);
        else document.body.appendChild(tab);
    }

    function applySession() {
        const s = getSession();
        const gate = $('loginGate');
        const body = document.body;
        const btn = $('lockToggleBtn');
        const chip = $('currentUserChip');
        body.classList.remove('role-owner', 'role-cashier', 'no-session');
        if (!s) {
            systemUnlocked = false;
            body.classList.add('locked', 'no-session');
            gate.style.display = 'flex';
            if (chip) chip.style.display = 'none';
            return;
        }
        gate.style.display = 'none';
        const owner = s.role === 'owner';
        systemUnlocked = owner;
        body.classList.toggle('locked', !owner);
        body.classList.add(owner ? 'role-owner' : 'role-cashier');
        if (btn) {
            btn.innerHTML = owner ? '🔓 چوونەدەرەوە' : '🔒 داخستنی شیفت';
            btn.style.backgroundImage = owner ? 'var(--grad-success)' : 'var(--grad-danger)';
        }
        if (chip) {
            chip.style.display = 'inline-block';
            chip.textContent = (owner ? '👑 ' : '👤 ') + s.name;
        }
    }

    function resetWorkspace() {
        try { if (typeof isReturnMode !== 'undefined' && isReturnMode) toggleReturnMode(); } catch (e) { }
        try { clearSalesAfterPrint(); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => { if (m.id !== 'shiftModal') m.style.display = 'none'; });
        $('shiftModal').style.display = 'none';
        try { window.goHome(); } catch (e) { }
    }

    function hasUnsavedSale() {
        const gt = unformat(($('grandTotalSales') || {}).innerText);
        return gt > 0 && !isSaleProcessed;
    }

    function doLogin() {
        const u = $('gateUser').value.trim();
        const p = $('gatePass').value;
        if (!u || !p) return toast('یوزەر و پاسۆرد بنووسە!', 'error');
        const fail = () => { $('gatePass').value = ''; toast('یوزەر یان پاسۆردەکە هەڵەیە!', 'error'); };

        if (u.toLowerCase() === OWNER_USER) {
            if (p !== ownerPass()) return fail();
            setSession({ id: 'owner', name: 'خاوەنکار', role: 'owner' });
        } else {
            const user = getUsers().find(x => x.username.toLowerCase() === u.toLowerCase());
            if (!user || hashPw(user.salt, p) !== user.hash) return fail();
            const shifts = getShifts();
            let sh = shifts.find(x => x.userId === user.id && !x.end);
            if (!sh) {
                sh = { id: newId(), userId: user.id, userName: user.username, start: Date.now(), end: null, wage: null };
                shifts.push(sh);
                saveShifts(shifts);
            }
            setSession({ id: user.id, name: user.username, role: 'cashier', shiftId: sh.id });
        }
        $('gateUser').value = '';
        $('gatePass').value = '';
        applySession();
        try { window.goHome(); } catch (e) { }
        if (isOwner() && ownerPass() === '0000') toast('⚠️ پاسۆردی خاوەنکار هێشتا 0000ـە، لە بەشی ڕێکخستن بیگۆڕە!', 'error');
    }

    function logoutNow() {
        setSession(null);
        resetWorkspace();
        applySession();
        $('gateUser').focus();
    }

    /* ---------- مۆداڵی مووچە ---------- */
    function showModal(html) { $('shiftModalBody').innerHTML = html; $('shiftModal').style.display = 'flex'; }
    function hideModal() { $('shiftModal').style.display = 'none'; }

    function bindAmountInput(preset) {
        const inp = $('smAmount'), words = $('smWords');
        if (!inp) return;
        if (preset > 0) inp.value = preset.toLocaleString('en-US');
        const upd = () => {
            const n = unformat(inp.value);
            words.textContent = n > 0 ? numberToKurdishWords(n) + ' دینار' : '';
        };
        inp.addEventListener('input', () => setTimeout(upd, 0));
        upd();
        setTimeout(() => inp.focus(), 80);
    }

    // کاشێر: داخستنی شیفت
    function cashierClose() {
        const s = getSession();
        if (!s || s.role !== 'cashier') return;
        if (hasUnsavedSale() && !confirm('⚠️ وەسڵی فرۆشتنەکەت سەیڤ نەکردووە!\nدڵنیای دەتەوێت شیفت دابخەیت؟')) return;
        stepAsk();

        function stepAsk() {
            showModal(
                '<h3 style="margin-top:0; color:var(--primary);">داخستنی شیفت</h3>' +
                '<p style="font-weight:bold;">مووچەی ڕۆژانەت وەردەگریت؟</p>' +
                '<div style="display:flex; gap:10px;"><button class="btn btn-save" id="smYes">بەڵێ</button><button class="btn btn-clear" id="smNo">نەخێر</button></div>' +
                '<button class="btn" id="smCancel" style="margin-top:10px; width:100%; background:var(--input-bg); color:var(--text-color); border:1px solid var(--border-color);">پاشگەزبوونەوە</button>');
            $('smYes').onclick = () => stepAmount(0);
            $('smNo').onclick = () => { closeShift(s.shiftId, 0, false); hideModal(); logoutNow(); toast('شیفت داخرا. مووچە وەرنەگیرا.'); };
            $('smCancel').onclick = hideModal;
        }
        function stepAmount(preset) {
            showModal(
                '<h3 style="margin-top:0; color:var(--primary);">مووچەی ڕۆژانە</h3>' +
                '<p style="font-size:13px;">ئەو بڕە پارەیەی ئەمڕۆ وەرتگرتووە بنووسە:</p>' +
                '<input type="text" id="smAmount" class="format-num" inputmode="decimal" placeholder="نموونە: 20,000" style="font-size:22px; font-weight:bold; margin-bottom:8px;">' +
                '<div id="smWords" class="sm-words"></div>' +
                '<div style="display:flex; gap:10px; margin-top:12px;"><button class="btn btn-save" id="smNext">بەردەوام بە</button><button class="btn btn-clear" id="smBack">گەڕانەوە</button></div>');
            bindAmountInput(preset);
            $('smBack').onclick = stepAsk;
            $('smNext').onclick = () => {
                const n = unformat($('smAmount').value);
                if (n <= 0) return toast('تکایە بڕی مووچەکە بنووسە!', 'error');
                stepConfirm(n);
            };
        }
        function stepConfirm(n) {
            showModal(
                '<h3 style="margin-top:0; color:var(--warning);">⚠️ دڵنیابوونەوە</h3>' +
                '<p>ئایا دڵنیای مووچەی ڕۆژانەت</p>' +
                '<div style="font-size:30px; font-weight:900; color:var(--danger);">' + n.toLocaleString('en-US') + ' دینار</div>' +
                '<div class="sm-words" style="margin:6px 0 12px;">' + esc(numberToKurdishWords(n)) + ' دینار</div>' +
                (n >= 500000 ? '<div style="color:var(--danger); font-weight:bold; font-size:13px; margin-bottom:10px;">⚠️ ئەم بڕە زۆر گەورەیە، تکایە بەوردی بپشکنە!</div>' : '') +
                '<p style="font-size:13px;">دوای تۆمارکردن ناتوانیت بیگۆڕیت.</p>' +
                '<div style="display:flex; gap:10px;"><button class="btn btn-save" id="smOk">بەڵێ، تۆمار بکە</button><button class="btn btn-clear" id="smFix">نەخێر، چاکی دەکەمەوە</button></div>');
            $('smFix').onclick = () => stepAmount(n);
            $('smOk').onclick = () => { closeShift(s.shiftId, n, false); hideModal(); logoutNow(); toast('شیفت داخرا و مووچەکەت تۆمارکرا.'); };
        }
    }

    // خاوەنکار: داخستنی دەستی / دەستکاریکردنی مووچە
    function ownerWageModal(title, intro, preset, onSave) {
        showModal(
            '<h3 style="margin-top:0; color:var(--primary);">' + esc(title) + '</h3>' +
            '<p style="font-size:13px;">' + esc(intro) + '</p>' +
            '<input type="text" id="smAmount" class="format-num" inputmode="decimal" placeholder="بڕی مووچە (٠ = بێ مووچە)" style="font-size:20px; font-weight:bold; margin-bottom:8px;">' +
            '<div id="smWords" class="sm-words"></div>' +
            '<div style="display:flex; gap:10px; margin-top:12px;"><button class="btn btn-save" id="smSave">تۆمارکردن</button><button class="btn btn-clear" id="smCancel">پاشگەزبوونەوە</button></div>');
        bindAmountInput(preset);
        $('smCancel').onclick = hideModal;
        $('smSave').onclick = () => { onSave(unformat($('smAmount').value)); hideModal(); };
    }

    /* ---------- تابی کاشێرەکان (تەنها خاوەنکار) ---------- */
    const CSH = {
        addUser() {
            const name = $('cshNewUser').value.trim();
            const pass = $('cshNewPass').value;
            if (!name) return toast('ناوی کاشێر بنووسە!', 'error');
            if (name.toLowerCase() === OWNER_USER) return toast('ئەم یوزەرە تایبەتە بە خاوەنکار، ناوێکی تر هەڵبژێرە!', 'error');
            if (pass.length < 3) return toast('پاسۆرد زۆر کورتە (لانی کەم ٣)!', 'error');
            const users = getUsers();
            if (users.some(u => u.username.toLowerCase() === name.toLowerCase())) return toast('ئەم یوزەرە پێشتر هەیە!', 'error');
            const salt = newSalt();
            users.push({ id: newId(), username: name, salt: salt, hash: hashPw(salt, pass), created: Date.now() });
            saveUsers(users);
            $('cshNewUser').value = '';
            $('cshNewPass').value = '';
            toast('کاشێر زیادکرا.');
            CSH.render();
        },
        deleteUser(id) {
            const u = getUsers().find(x => x.id === id);
            if (!u) return;
            if (getShifts().some(s => s.userId === id && !s.end)) return toast('ئەم کاشێرە شیفتێکی کراوەی هەیە، سەرەتا شیفتەکەی دابخە!', 'error');
            if (!confirm('دڵنیای لە سڕینەوەی یوزەر و پاسۆردی "' + u.username + '"؟\n(تۆماری شیفت و مووچەکانی دەمێنێتەوە)')) return;
            saveUsers(getUsers().filter(x => x.id !== id));
            toast('یوزەرەکە سڕایەوە.');
            CSH.render();
        },
        changePass(id) {
            const u = getUsers().find(x => x.id === id);
            if (!u) return;
            const p = prompt('پاسۆردی نوێ بۆ "' + u.username + '":');
            if (p === null) return;
            if (p.length < 3) return toast('پاسۆرد زۆر کورتە (لانی کەم ٣)!', 'error');
            const users = getUsers();
            const x = users.find(v => v.id === id);
            x.salt = newSalt();
            x.hash = hashPw(x.salt, p);
            saveUsers(users);
            toast('پاسۆردەکە گۆڕدرا.');
        },
        closeShiftManual(shiftId) {
            const s = getShifts().find(x => x.id === shiftId);
            if (!s) return;
            ownerWageModal('داخستنی شیفتی ' + s.userName,
                'ئەم شیفتە داخراو نەبوو. مووچەی ڕۆژانەی کاشێرەکە بنووسە (ئەگەر مووچەی نییە 0 بنووسە).', 0,
                n => { closeShift(shiftId, n, true); toast('شیفت داخرا.'); CSH.render(); });
        },
        editWage(shiftId) {
            const s = getShifts().find(x => x.id === shiftId);
            if (!s) return;
            ownerWageModal('دەستکاریکردنی مووچە', s.userName + ' — ' + fmtDate(s.start), s.wage || 0, n => {
                const shifts = getShifts();
                const x = shifts.find(v => v.id === shiftId);
                x.wage = n > 0 ? n : 0;
                x.edited = true;
                saveShifts(shifts);
                syncWageExpense(x);
                toast('مووچەکە نوێکرایەوە (لە خەرجییەکانیش گۆڕدرا).');
                CSH.render();
            });
        },
        deleteShift(shiftId) {
            const s = getShifts().find(x => x.id === shiftId);
            if (!s) return;
            if (!confirm('دڵنیای لە سڕینەوەی ئەم شیفتە؟\nمووچەکەشی لە بەشی خەرجییەکان دەسڕێتەوە.')) return;
            if (!s.end && getSession() && getSession().shiftId === shiftId) setSession(null);
            const dead = Object.assign({}, s, { wage: 0 });
            saveShifts(getShifts().filter(x => x.id !== shiftId));
            syncWageExpense(dead);
            if (!getSession()) applySession();
            CSH.render();
        },
        render() {
            renderUsers();
            CSH.renderReport();
        },
        renderReport: renderReport
    };
    window.CSH = CSH;

    function renderUsers() {
        const box = $('cshUsersList');
        if (!box) return;
        const users = getUsers();
        const shifts = getShifts();
        if (!users.length) { box.innerHTML = '<div style="text-align:center; color:#999; padding:12px;">هیچ کاشێرێک زیاد نەکراوە</div>'; return; }
        box.innerHTML = users.map(u => {
            const open = shifts.find(s => s.userId === u.id && !s.end);
            const status = open ? '<span class="csh-badge on">🟢 شیفتی کراوەیە لە ' + fmtTime(open.start) + '</span>' : '<span class="csh-badge">⚪ شیفتی داخراوە</span>';
            return '<div class="debtor-card" style="cursor:default; gap:8px; flex-wrap:wrap;">' +
                '<div><div class="debtor-name">👤 ' + esc(u.username) + '</div>' + status + '</div>' +
                '<div style="display:flex; gap:6px;">' +
                '<button class="btn-delete-row" style="background-image:var(--grad-warning);" onclick="CSH.changePass(\'' + u.id + '\')">🔑 پاسۆرد</button>' +
                '<button class="btn-delete-row" onclick="CSH.deleteUser(\'' + u.id + '\')">🗑️ سڕینەوە</button>' +
                '</div></div>';
        }).join('');
    }

    function renderReport() {
        const mEl = $('cshMonth'), fEl = $('cshFilter'), out = $('cshReport');
        if (!mEl || !fEl || !out) return;
        if (!mEl.value) { const n = new Date(); mEl.value = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); }
        const parts = mEl.value.split('-').map(Number);
        const start = new Date(parts[0], parts[1] - 1, 1).getTime();
        const end = new Date(parts[0], parts[1], 1).getTime();

        const users = getUsers();
        const allShifts = getShifts();
        const names = [];
        users.forEach(u => { if (!names.includes(u.username)) names.push(u.username); });
        allShifts.forEach(s => { if (!names.includes(s.userName)) names.push(s.userName); });

        const prev = fEl.value || '__all';
        fEl.innerHTML = '<option value="__all">هەموو کاشێرەکان</option>' + names.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
        fEl.value = names.includes(prev) || prev === '__all' ? prev : '__all';

        const shown = fEl.value === '__all' ? names : [fEl.value];
        const sales = load('khalkhalanSalesData', []).filter(r => r.cashier && r.timestamp >= start && r.timestamp < end);
        if (!shown.length) { out.innerHTML = '<div style="text-align:center; color:#999; padding:12px;">هێشتا هیچ کاشێرێک نییە</div>'; return; }

        out.innerHTML = shown.map(name => {
            const list = allShifts.filter(s => s.userName === name && s.start >= start && s.start < end).sort((a, b) => b.start - a.start);
            let wageSum = 0, closedCount = 0;
            const rows = list.map(s => {
                const closed = !!s.end;
                if (closed) { wageSum += s.wage || 0; closedCount++; }
                const dur = fmtDur((s.end || Date.now()) - s.start);
                const wageCell = closed
                    ? ((s.wage > 0 ? '<b style="color:var(--danger);">' + s.wage.toLocaleString('en-US') + '</b>' : '<span style="opacity:.6;">بێ مووچە</span>') + (s.edited ? ' <span title="خاوەنکار گۆڕیوێتی">✏️</span>' : ''))
                    : '—';
                const acts = closed
                    ? '<button class="btn-delete-row" style="background-image:var(--grad-warning);" onclick="CSH.editWage(\'' + s.id + '\')">✏️</button> <button class="btn-delete-row" onclick="CSH.deleteShift(\'' + s.id + '\')">🗑️</button>'
                    : '<button class="btn-delete-row" style="background-image:var(--grad-success);" onclick="CSH.closeShiftManual(\'' + s.id + '\')">داخستن</button> <button class="btn-delete-row" onclick="CSH.deleteShift(\'' + s.id + '\')">🗑️</button>';
                return '<tr><td style="direction:ltr;">' + fmtDate(s.start) + '</td><td style="direction:ltr;">' + fmtTime(s.start) + '</td>' +
                    '<td style="direction:ltr;">' + (closed ? fmtTime(s.end) : '<span class="csh-badge on">کراوەیە</span>') + '</td>' +
                    '<td style="font-size:12px;">' + dur + '</td><td>' + wageCell + '</td><td style="white-space:nowrap;">' + acts + '</td></tr>';
            }).join('');
            const mine = sales.filter(r => r.cashier === name);
            const salesTotal = mine.reduce((a, r) => a + (r.totalNum || 0), 0);
            return '<div class="csh-card"><h4>👤 ' + esc(name) + '</h4>' +
                '<div class="table-responsive"><table class="data-table"><thead><tr><th>ڕێکەوت</th><th>هاتن</th><th>چوونەدەر</th><th>ماوە</th><th>مووچە</th><th>⚙️</th></tr></thead><tbody>' +
                (rows || '<tr><td colspan="6" style="color:#999; padding:15px;">هیچ شیفتێک لەم مانگەدا نییە</td></tr>') +
                '</tbody></table></div>' +
                '<div class="csh-sum"><div>💸 کۆی مووچەی مانگ: <b style="color:var(--danger);">' + wageSum.toLocaleString('en-US') + ' دینار</b></div>' +
                '<div>📅 ژمارەی شیفتی تەواو: <b>' + closedCount + '</b></div>' +
                '<div>🛒 فرۆشتن: <b style="color:var(--success);">' + salesTotal.toLocaleString('en-US') + ' دینار</b> (' + mine.length + ' وەسڵ)</div></div></div>';
        }).join('');
    }

    /* ---------- گرێدان بە فەنکشنە ئەسڵییەکان ---------- */
    const _switchTab = window.switchTab;
    window.switchTab = function (tabId) {
        const s = getSession();
        if (!s) { applySession(); return; }
        if (s.role !== 'owner' && ADMIN_TABS.includes(tabId)) { toast('ئەم بەشە تەنها بۆ خاوەنکارە!', 'error'); return; }
        _switchTab(tabId);
        if (tabId === 'tab-cashiers') CSH.render();
    };

    window.openLockModal = function () {
        const s = getSession();
        if (!s) { applySession(); return; }
        if (s.role === 'owner') {
            if (hasUnsavedSale() && !confirm('⚠️ وەسڵی فرۆشتنەکەت سەیڤ نەکردووە!\nدڵنیای دەتەوێت دەربچیت؟')) return;
            logoutNow();
        } else {
            cashierClose();
        }
    };

    const _processSale = window.processSale;
    window.processSale = function () {
        const s = getSession();
        if (!s) { applySession(); return; }
        const before = load('khalkhalanSalesData', []);
        const t0 = before.length ? before[0].timestamp : null;
        _processSale();
        const after = load('khalkhalanSalesData', []);
        if (after.length && (after.length !== before.length || after[0].timestamp !== t0) && !after[0].cashier) {
            after[0].cashier = s.name;
            after[0].cashierId = s.id;
            localStorage.setItem('khalkhalanSalesData', JSON.stringify(after));
        }
    };

    const _deleteExpense = window.deleteExpense;
    window.deleteExpense = function (idx) {
        const e = getExpenses()[idx];
        const sid = e && e.shiftId;
        _deleteExpense(idx);
        if (sid && !getExpenses().some(x => x.shiftId === sid)) {
            const shifts = getShifts();
            const sh = shifts.find(x => x.id === sid);
            if (sh) { sh.wage = 0; sh.edited = true; saveShifts(shifts); }
        }
    };

    // پاشەکەوت و گەڕاندنەوە: یوزەر و شیفتەکانیش دەگرێتەوە
    window.exportData = function () {
        const data = { receiptsCompare: localStorage.getItem('khalkhalanFull') || "[]", salesData: localStorage.getItem('khalkhalanSalesData') || "[]", debts: localStorage.getItem('khalkhalanDebts') || "{}", companyDebts: localStorage.getItem('khalkhalanCompanyDebts') || "{}", inventory: localStorage.getItem('khalkhalanInventory') || "{}", expenses: localStorage.getItem('khalkhalanExpenses') || "[]", adminPin: localStorage.getItem('khalkhalanAdminPin') || "0000", users: localStorage.getItem(K_USERS) || "[]", shifts: localStorage.getItem(K_SHIFTS) || "[]" };
        const blob = new Blob([JSON.stringify(data)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `Khalkhalan_Backup_${new Date().toISOString().split('T')[0]}.json`; link.click(); URL.revokeObjectURL(url);
    };

    window.importData = function (event) {
        const file = event.target.files[0]; if (!file) return;
        if (confirm("ئاگاداربە! داتای ئێستات دەسڕێتەوە و هی ناو فایلەکە دادەنێت. دڵنیای؟")) {
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const parsedData = JSON.parse(e.target.result);
                    if ((parsedData.receiptsCompare || parsedData.receipts) && parsedData.debts) {
                        localStorage.setItem('khalkhalanFull', parsedData.receiptsCompare || parsedData.receipts || "[]");
                        localStorage.setItem('khalkhalanSalesData', parsedData.salesData || "[]");
                        localStorage.setItem('khalkhalanDebts', parsedData.debts);
                        if (parsedData.companyDebts) localStorage.setItem('khalkhalanCompanyDebts', parsedData.companyDebts);
                        if (parsedData.inventory) localStorage.setItem('khalkhalanInventory', parsedData.inventory);
                        if (parsedData.expenses) localStorage.setItem('khalkhalanExpenses', parsedData.expenses);
                        if (parsedData.adminPin) localStorage.setItem('khalkhalanAdminPin', parsedData.adminPin);
                        if (parsedData.users) localStorage.setItem(K_USERS, parsedData.users);
                        if (parsedData.shifts) localStorage.setItem(K_SHIFTS, parsedData.shifts);
                        localStorage.removeItem(K_SESSION);
                        alert("داتاکان بە سەرکەوتوویی گەڕێندرانەوە!"); location.reload();
                    } else { alert("فایلەکە هەڵەیە!"); }
                } catch (error) { alert("نەتوانرا فایلەکە بخوێندرێتەوە."); }
            }; reader.readAsText(file);
        } event.target.value = '';
    };

    /* ---------- دەستپێک ---------- */
    buildUI();
    const s0 = getSession();
    if (s0 && s0.role === 'cashier') {
        const okUser = getUsers().some(u => u.id === s0.id);
        const okShift = getShifts().some(x => x.id === s0.shiftId && !x.end);
        if (!okUser || !okShift) setSession(null);
    }
    applySession();
})();
/* ================================================================
   سیستەمی کڵاود و فایەربەیس (Real-Time Cloud Sync)
   ================================================================ */

// ١. کۆدەکانی بەستنەوەی داتابەیسەکەی سیداد
const firebaseConfig = {
  apiKey: "AIzaSyA51P0dULPWR5J6792r-Zjz0csACfMdDo0",
  authDomain: "sidad-markit.firebaseapp.com",
  projectId: "sidad-markit",
  storageBucket: "sidad-markit.firebasestorage.app",
  messagingSenderId: "728462769174",
  appId: "1:728462769174:web:95909d17ad556a19628937",
  measurementId: "G-SZ1CFBEC1E"
};

// ٢. چالاککردنی فایەربەیس
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// ٣. چالاککردنی دۆخی ئۆفلاین (بۆ کاتی بڕانی ئینتەرنێت)
db.enablePersistence().catch(function(err) {
    console.log("Offline mode error:", err);
});

// ٤. لیستی ئەو داتایانەی کە دەبێت بڕۆنە سەر کڵاود
const syncKeys = [
    'khalkhalanInventory', 'khalkhalanSalesData', 'khalkhalanExpenses',
    'khalkhalanDebts', 'khalkhalanCompanyDebts', 'khalkhalanUsers', 
    'khalkhalanShifts', 'khalkhalanFull'
];

// ٥. ناردنی ئۆتۆماتیکی داتا بۆ فایەربەیس (بەبێ تێکدانی خێرایی سیستەمەکە)
const originalSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(key, value) {
    // خەزنکردن لەناو مۆبایل/کۆمپیوتەرەکە
    originalSetItem(key, value);

    // ناردن بۆ ئینتەرنێت (فایەربەیس)
    if (syncKeys.includes(key)) {
        try {
            const parsedData = JSON.parse(value);
            db.collection("SidadMarketDB").doc(key).set({ data: parsedData })
              .catch(err => console.log("Firebase Save Error:", err));
        } catch(e) {}
    }
};

// ٦. وەرگرتنەوەی ڕاستەوخۆی داتا بۆ ئامێرەکانی تر (Live Sync)
syncKeys.forEach(key => {
    db.collection("SidadMarketDB").doc(key).onSnapshot((doc) => {
        if (doc.exists) {
            const serverData = doc.data().data;
            const localData = localStorage.getItem(key);
            
            // ئەگەر داتای ئینتەرنێتەکە نوێتر بوو، ئەوا ئامێرەکەش نوێ بکەرەوە
            if (JSON.stringify(serverData) !== localData) {
                originalSetItem(key, JSON.stringify(serverData));
                refreshUI(); // ڕیفرێشکردنی شاشەکان
            }
        }
    });
});

// ٧. فەنکشنی ڕیفرێشکردنی شاشەکان لە کاتی گۆڕانکاری
function refreshUI() {
    if(typeof renderInventoryTable === 'function') renderInventoryTable();
    if(typeof calculateGeneralStats === 'function') calculateGeneralStats();
    if(typeof renderExpensesTable === 'function') renderExpensesTable();
    if(typeof renderDebtorsList === 'function') renderDebtorsList();
    if(typeof CSH !== 'undefined' && CSH.render) CSH.render();
    if(typeof checkLowStock === 'function') checkLowStock();
}
