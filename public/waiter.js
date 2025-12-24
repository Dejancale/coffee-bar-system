// Menu items will be loaded from server
let menuItems = [];

// State
let selectedItems = [];
let selectedTable = null;
let ws = null;
let currentUser = null;
let allOrders = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentUser();
    await loadMenu();
    renderTableGrid();
    renderMenu();
    setupEventListeners();
    setupTabs();
    connectWebSocket();
    await loadOrders();
});

// Load current user
async function loadCurrentUser() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            currentUser = await response.json();
            document.getElementById('userName').textContent = `Hello, ${currentUser.name}`;
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}

// Load menu from server
async function loadMenu() {
    try {
        const response = await fetch('/api/menu');
        if (response.ok) {
            menuItems = await response.json();
        }
    } catch (error) {
        console.error('Error loading menu:', error);
    }
}

// Logout
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
    } catch (error) {
        console.error('Error logging out:', error);
    }
}

// Setup tabs
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            // Update active tab button
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update active tab content
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(`${tab}Tab`).classList.add('active');
            
            // Refresh data based on tab
            if (tab === 'tables') {
                renderTablesOverview();
            } else if (tab === 'history') {
                renderRecentOrders();
            }
        });
    });
}

// Render table grid (10 clickable table squares)
function renderTableGrid() {
    const grid = document.getElementById('tableGrid');
    let html = '';
    
    for (let i = 1; i <= 10; i++) {
        // Table is occupied if it has any orders that haven't been cleared by waiter
        const tableOrders = allOrders.filter(o => o.table == i && !o.clearedBy);
        const hasOrders = tableOrders.length > 0;
        const status = hasOrders ? 'occupied' : 'free';
        
        html += `
            <div class="table-square ${status} ${selectedTable == i ? 'selected' : ''}">
                <div class="table-square-header" onclick="selectTable(${i})">
                    <div class="table-number">${i}</div>
                    <div class="table-status-text">${hasOrders ? '🔴 Occupied' : '🟢 Free'}</div>
                </div>
                ${hasOrders ? `
                    <div class="table-square-actions">
                        <button class="table-mini-btn" onclick="event.stopPropagation(); viewTableQuick(${i})" title="View drinks">👁️</button>
                        <button class="table-mini-btn clear" onclick="event.stopPropagation(); clearTableQuick(${i})" title="Clear table">🧹</button>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    grid.innerHTML = html;
}

// Select table
function selectTable(tableNum) {
    selectedTable = tableNum;
    renderTableGrid();
    showNotification(`Table ${tableNum} selected`, 'info');
}

// View table details
function viewTableDetails() {
    if (!selectedTable) return;
    // Only show orders for this table that are NOT cleared
    const tableOrders = allOrders.filter(o => o.table == selectedTable && !o.clearedBy);
    const modal = document.getElementById('tableModal');
    const modalTableNum = document.getElementById('modalTableNumber');
    const modalBody = document.getElementById('tableModalBody');
    
    modalTableNum.textContent = selectedTable;
    
    if (tableOrders.length === 0) {
        modalBody.innerHTML = '<p class="empty-message">No orders for this table</p>';
    } else {
        modalBody.innerHTML = tableOrders.map(order => `
            <div class="order-card order-card-${order.status}">
                <div class="order-header">
                    <strong>Order #${order.id}</strong>
                    <span class="status-badge status-${order.status}">${order.status}</span>
                </div>
                <div class="order-items">
                    ${order.items.map(item => `
                        <div class="order-item">
                            ${item.icon} ${item.name} - $${item.price.toFixed(2)}
                            ${item.notes ? `<div class="item-note">📝 ${item.notes}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
                <div class="order-total">
                    <strong>Total: $${order.items.reduce((sum, item) => sum + item.price, 0).toFixed(2)}</strong>
                </div>
            </div>
        `).join('');
    }
    
    modal.style.display = 'flex';
}

// Toggle order card expansion
function toggleOrderCard(orderId) {
    const details = document.getElementById(`details-${orderId}`);
    const arrow = document.getElementById(`arrow-${orderId}`);
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        arrow.textContent = '▲';
    } else {
        details.style.display = 'none';
        arrow.textContent = '▼';
    }
}

// Print receipt
function printReceipt(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;
    
    const total = order.items.reduce((sum, item) => {
        const qty = item.quantity || 1;
        const price = item.price || 0;
        return sum + (price * qty);
    }, 0);
    const date = new Date(order.timestamp);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();
    
    // Create receipt window
    const receiptWindow = window.open('', '', 'width=400,height=600');
    receiptWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Receipt - Order #${order.id}</title>
            <style>
                body {
                    font-family: 'Courier New', monospace;
                    max-width: 400px;
                    margin: 20px auto;
                    padding: 20px;
                    background: white;
                }
                .receipt {
                    border: 2px solid #000;
                    padding: 20px;
                }
                .header {
                    text-align: center;
                    border-bottom: 2px dashed #000;
                    padding-bottom: 15px;
                    margin-bottom: 15px;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .header p {
                    margin: 5px 0;
                    font-size: 12px;
                }
                .info-line {
                    display: flex;
                    justify-content: space-between;
                    margin: 5px 0;
                    font-size: 14px;
                }
                .items {
                    border-top: 2px dashed #000;
                    border-bottom: 2px dashed #000;
                    padding: 15px 0;
                    margin: 15px 0;
                }
                .item {
                    display: flex;
                    justify-content: space-between;
                    margin: 8px 0;
                    font-size: 14px;
                }
                .item-name {
                    flex: 1;
                }
                .item-price {
                    font-weight: bold;
                }
                .item-note {
                    font-size: 11px;
                    color: #666;
                    margin-left: 10px;
                    font-style: italic;
                }
                .total {
                    font-size: 18px;
                    font-weight: bold;
                    text-align: right;
                    margin-top: 15px;
                    padding-top: 10px;
                    border-top: 2px solid #000;
                }
                .footer {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 12px;
                    border-top: 2px dashed #000;
                    padding-top: 15px;
                }
                @media print {
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    .receipt {
                        border: none;
                    }
                }
            </style>
        </head>
        <body>
            <div class="receipt">
                <div class="header">
                    <h1>☕ COFFEE BAR</h1>
                    <p>123 Main Street, City</p>
                    <p>Tel: (555) 123-4567</p>
                </div>
                
                <div class="info-line">
                    <span>Order #:</span>
                    <span><strong>${order.id}</strong></span>
                </div>
                <div class="info-line">
                    <span>Table:</span>
                    <span><strong>${order.table}</strong></span>
                </div>
                <div class="info-line">
                    <span>Date:</span>
                    <span>${dateStr}</span>
                </div>
                <div class="info-line">
                    <span>Time:</span>
                    <span>${timeStr}</span>
                </div>
                <div class="info-line">
                    <span>Server:</span>
                    <span>${order.waiter || 'N/A'}</span>
                </div>
                
                <div class="items">
                    ${order.items.map(item => {
                        const qty = item.quantity || 1;
                        const price = item.price || 0;
                        return `
                        <div class="item">
                            <span class="item-name">${item.name} ${qty > 1 ? `x${qty}` : ''}</span>
                            <span class="item-price">$${(price * qty).toFixed(2)}</span>
                        </div>
                        ${item.notes ? `<div class="item-note">Note: ${item.notes}</div>` : ''}
                        `;
                    }).join('')}
                </div>
                
                ${order.notes ? `
                    <div class="info-line">
                        <span>Order Notes:</span>
                    </div>
                    <div style="font-size: 12px; font-style: italic; margin-bottom: 10px;">
                        ${order.notes}
                    </div>
                ` : ''}
                
                <div class="total">
                    TOTAL: $${total.toFixed(2)}
                </div>
                
                <div class="footer">
                    <p>Thank you for your visit!</p>
                    <p>Please come again ❤️</p>
                </div>
            </div>
            <script>
                window.onload = function() {
                    window.print();
                }
            </script>
        </body>
        </html>
    `);
    receiptWindow.document.close();
}

// Close table modal
function closeTableModal() {
    document.getElementById('tableModal').style.display = 'none';
}

// View table history
function viewTableHistory(tableNum) {
    const allTableOrders = allOrders.filter(o => o.table == tableNum).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const modal = document.getElementById('tableModal');
    const modalTableNum = document.getElementById('modalTableNumber');
    const modalBody = document.getElementById('tableModalBody');
    
    modalTableNum.textContent = tableNum;
    
    if (allTableOrders.length === 0) {
        modalBody.innerHTML = '<p class="empty-message">No order history for this table</p>';
    } else {
        const totalSpent = allTableOrders.reduce((sum, order) => {
            return sum + order.items.reduce((itemSum, item) => itemSum + item.price, 0);
        }, 0);
        
        modalBody.innerHTML = `
            <div class="history-summary">
                <div class="summary-item">
                    <span>Total Orders:</span>
                    <strong>${allTableOrders.length}</strong>
                </div>
                <div class="summary-item">
                    <span>Total Spent:</span>
                    <strong>$${totalSpent.toFixed(2)}</strong>
                </div>
            </div>
            
            <div class="orders-history-list">
                ${allTableOrders.map(order => createCollapsibleOrderCard(order)).join('')}
            </div>
        `;
    }
    
    modal.style.display = 'flex';
}

// Create collapsible order card with print option
function createCollapsibleOrderCard(order) {
    const total = order.items.reduce((sum, item) => sum + item.price, 0);
    const time = new Date(order.timestamp).toLocaleString();
    const statusIcon = {
        'pending': '⏱️',
        'in-progress': '⚡',
        'completed': '✅'
    }[order.status] || '📋';
    
    return `
        <div class="collapsible-order-card">
            <div class="order-card-header" onclick="toggleOrderCard(${order.id})">
                <div class="order-card-info">
                    <span class="order-card-id">Order #${order.id}</span>
                    <span class="order-card-status">${statusIcon} ${order.status}</span>
                </div>
                <div class="order-card-meta">
                    <span class="order-card-total">$${total.toFixed(2)}</span>
                    <span class="expand-arrow" id="arrow-${order.id}">▼</span>
                </div>
            </div>
            <div class="order-card-details" id="details-${order.id}" style="display: none;">
                <div class="order-timestamp">🕒 ${time}</div>
                ${order.waiter ? `<div class="order-waiter">👤 ${order.waiter}</div>` : ''}
                <div class="order-items-list">
                    ${order.items.map(item => `
                        <div class="order-item-detail">
                            <span class="item-icon">${item.icon || '🍽️'}</span>
                            <span class="item-name">${item.name}</span>
                            <span class="item-price">$${item.price.toFixed(2)}</span>
                            ${item.notes ? `<div class="item-note-small">📝 ${item.notes}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
                ${order.notes ? `<div class="order-notes-box">💬 ${order.notes}</div>` : ''}
                <div class="order-actions">
                    <button class="btn btn-sm btn-primary" onclick="printReceipt(${order.id})">🖨️ Print Receipt</button>
                </div>
            </div>
        </div>
    `;
}

// Clear table (mark orders as completed and keep in history)
async function clearTable() {
    if (!selectedTable) return;
    
    if (!confirm(`Clear Table ${selectedTable}? This will mark all orders as completed and free the table. Orders will remain in history.`)) return;
    
    try {
        // Use the server endpoint that marks orders as completed
        const response = await fetch(`/api/tables/${selectedTable}/clear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            await loadOrders();
            renderTableGrid();
            renderTablesOverview();
            showNotification(`Table ${selectedTable} cleared! Orders saved to history.`, 'success');
        } else {
            throw new Error('Failed to clear table');
        }
    } catch (error) {
        console.error('Error clearing table:', error);
        showNotification('Error clearing table', 'error');
    }
}

// Quick view from table square
function viewTableQuick(tableNum) {
    selectedTable = tableNum;
    viewTableDetails();
}

// Quick clear from table square
async function clearTableQuick(tableNum) {
    selectedTable = tableNum;
    await clearTable();
}

// Render tables overview
function renderTablesOverview() {
    const container = document.getElementById('tablesOverview');
    let html = '';
    
    for (let i = 1; i <= 10; i++) {
        // Table is occupied if has orders not cleared by waiter
        const tableOrders = allOrders.filter(o => o.table == i && !o.clearedBy);
        const completedOrders = allOrders.filter(o => o.table == i && o.clearedBy);
        const hasActive = tableOrders.length > 0;
        
        let statusText = '🟢 Free';
        let orderDetails = '';
        
        if (hasActive) {
            statusText = '🔴 Occupied';
            const pending = tableOrders.filter(o => o.status === 'pending').length;
            const preparing = tableOrders.filter(o => o.status === 'preparing' || o.status === 'in-progress').length;
            const completed = tableOrders.filter(o => o.status === 'completed').length;
            const allItems = tableOrders.flatMap(o => o.items);
            
            // Calculate total for active orders
            const totalSpent = tableOrders.reduce((sum, order) => {
                return sum + order.items.reduce((itemSum, item) => itemSum + item.price, 0);
            }, 0);
            
            orderDetails = `
                <div class="table-order-summary">
                    <div class="table-stats">
                        ${pending > 0 ? `<span class="stat-badge pending">⏳ ${pending} pending</span>` : ''}
                        ${preparing > 0 ? `<span class="stat-badge preparing">👨‍🍳 ${preparing} preparing</span>` : ''}
                        ${completed > 0 ? `<span class="stat-badge completed">✅ ${completed} ready</span>` : ''}
                    </div>
                    <div class="table-drinks">
                        <strong>Current Drinks:</strong><br>
                        ${allItems.slice(0, 4).map(item => `${item.icon} ${item.name}`).join(', ')}
                        ${allItems.length > 4 ? ` +${allItems.length - 4} more` : ''}
                    </div>
                    <div class="table-session-info">
                        <span>📋 ${tableOrders.length} order${tableOrders.length !== 1 ? 's' : ''}</span>
                        <span>💰 $${totalSpent.toFixed(2)}</span>
                    </div>
                </div>
            `;
        } else if (completedOrders.length > 0) {
            // Show history info if table is free but has completed orders
            const totalSpent = completedOrders.reduce((sum, order) => {
                return sum + order.items.reduce((itemSum, item) => itemSum + item.price, 0);
            }, 0);
            orderDetails = `
                <div class="table-order-summary">
                    <div class="table-session-info">
                        <span>📋 ${completedOrders.length} cleared order${completedOrders.length !== 1 ? 's' : ''}</span>
                        <span>💰 $${totalSpent.toFixed(2)} total</span>
                    </div>
                </div>
            `;
        }
        
        html += `
            <div class="table-overview-card ${hasActive ? 'occupied' : 'free'}">
                <div class="table-overview-header">
                    <h3>Table ${i}</h3>
                    <span class="table-status-badge">${statusText}</span>
                </div>
                ${orderDetails}
                <div class="table-card-actions">
                    <button class="btn btn-sm btn-primary" onclick="selectTableFromOverview(${i})">📝 New Order</button>
                    ${completedOrders.length > 0 ? `<button class="btn btn-sm btn-secondary" onclick="viewTableHistory(${i})">📜 View History</button>` : ''}
                    ${hasActive ? `<button class="btn btn-sm btn-danger" onclick="clearTableFromOverview(${i})">🧹 Clear Table</button>` : ''}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// Select table from overview and switch to order tab
function selectTableFromOverview(tableNum) {
    selectTable(tableNum);
    document.querySelector('.tab-btn[data-tab="order"]').click();
}

// Clear table from overview
async function clearTableFromOverview(tableNum) {
    selectedTable = tableNum;
    await clearTable();
}

// Load all orders
async function loadOrders() {
    try {
        const response = await fetch('/api/orders');
        if (response.ok) {
            allOrders = await response.json();
            renderTableGrid();
        }
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

// Render order history (all orders)
function renderRecentOrders() {
    const container = document.getElementById('recentOrdersList');
    const sortedOrders = [...allOrders].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (sortedOrders.length === 0) {
        container.innerHTML = '<p class="empty-message">No order history</p>';
        return;
    }
    
    container.innerHTML = sortedOrders.map(order => {
        const total = order.items.reduce((sum, item) => sum + item.price, 0);
        const time = new Date(order.timestamp).toLocaleString();
        const statusIcon = {
            'pending': '⏱️',
            'in-progress': '⚡',
            'completed': '✅'
        }[order.status] || '📋';
        
        return `
            <div class="recent-order-compact" id="recent-order-${order.id}">
                <div class="order-compact-header" onclick="toggleRecentOrder(${order.id})">
                    <div class="order-compact-main">
                        <strong>Order #${order.id}</strong>
                        <span class="order-compact-table">Table ${order.table}</span>
                        <span class="status-badge status-${order.status}">${statusIcon} ${order.status}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <strong>$${total.toFixed(2)}</strong>
                        <span class="expand-arrow">▼</span>
                    </div>
                </div>
                <div class="order-compact-details" style="display: none;">
                    <div class="order-time">${time}</div>
                    <div class="order-items">
                        ${order.items.map(item => `
                            <div class="order-item">
                                ${item.icon} ${item.name} - $${item.price.toFixed(2)}
                                ${item.notes ? `<div class="item-note">📝 ${item.notes}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    ${order.notes ? `<div class="order-notes"><strong>Notes:</strong> ${order.notes}</div>` : ''}
                    <div class="order-total">
                        <strong>Total: $${total.toFixed(2)}</strong>
                    </div>
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 2px solid var(--border-color);">
                        <button class="btn btn-sm btn-primary" onclick="printReceipt(${order.id}); event.stopPropagation();">🖨️ Print Receipt</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Toggle recent order details
function toggleRecentOrder(orderId) {
    const orderEl = document.getElementById(`recent-order-${orderId}`);
    const details = orderEl.querySelector('.order-compact-details');
    const arrow = orderEl.querySelector('.expand-arrow');
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        arrow.textContent = '▲';
    } else {
        details.style.display = 'none';
        arrow.textContent = '▼';
    }
}

// Render menu grid
function renderMenu() {
    const menuGrid = document.getElementById('menuGrid');
    const categories = [...new Set(menuItems.map(item => item.category))];
    
    menuGrid.innerHTML = categories.map(category => `
        <div class="menu-category">
            <h3 class="category-title">${category}</h3>
            <div class="menu-items">
                ${menuItems.filter(item => item.category === category).map(item => `
                    <button class="menu-item" onclick='addItem(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
                        <span class="item-icon">${item.icon}</span>
                        <span class="item-name">${item.name}</span>
                        <span class="item-price">$${item.price.toFixed(2)}</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Add item to order
function addItem(item) {
    selectedItems.push({ ...item, orderId: Date.now() + Math.random() });
    renderSelectedItems();
    showNotification(`Added ${item.name}`, 'success');
}

// Remove item from order
function removeItem(orderId) {
    const orderIdStr = String(orderId);
    selectedItems = selectedItems.filter(item => String(item.orderId) !== orderIdStr);
    renderSelectedItems();
    showNotification('Item removed', 'success');
}

// Update item note
function updateItemNote(orderId, note) {
    const item = selectedItems.find(i => i.orderId === orderId);
    if (item) {
        item.notes = note;
    }
}

// Render selected items
function renderSelectedItems() {
    const container = document.getElementById('selectedItems');
    
    if (selectedItems.length === 0) {
        container.innerHTML = '<p class="empty-message">No items selected</p>';
        return;
    }
    
    const itemsHtml = selectedItems.map(item => `
        <div class="selected-item-wrapper" data-order-id="${item.orderId}">
            <div class="selected-item">
                <span class="item-icon">${item.icon}</span>
                <div class="item-details">
                    <span class="item-name">${item.name}</span>
                    <input type="text" 
                           class="item-notes-input" 
                           placeholder="Add notes (e.g., no sugar, extra hot)" 
                           value="${item.notes || ''}"
                           onchange="updateItemNote('${item.orderId}', this.value)">
                </div>
                <span class="item-price">$${item.price.toFixed(2)}</span>
                <button class="btn-remove" data-order-id="${item.orderId}">×</button>
            </div>
        </div>
    `).join('');
    
    const total = selectedItems.reduce((sum, item) => sum + item.price, 0);
    
    container.innerHTML = `
        ${itemsHtml}
        <div class="order-total">
            <strong>Total:</strong>
            <strong>$${total.toFixed(2)}</strong>
        </div>
    `;
    
    document.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', function() {
            const orderId = this.getAttribute('data-order-id');
            removeItem(orderId);
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('submitOrder').addEventListener('click', submitOrder);
    document.getElementById('logoutBtn').addEventListener('click', logout);
}

// Submit order
async function submitOrder() {
    const notes = document.getElementById('orderNotes').value;
    
    if (!selectedTable) {
        showNotification('Please select a table', 'error');
        return;
    }
    
    if (selectedItems.length === 0) {
        showNotification('Please add items to the order', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                table: selectedTable,
                items: selectedItems,
                notes: notes
            })
        });
        
        if (response.ok) {
            showNotification('Order submitted successfully!', 'success');
            selectedItems = [];
            document.getElementById('orderNotes').value = '';
            renderSelectedItems();
            await loadOrders();
            renderTableGrid();
        } else {
            showNotification('Failed to submit order', 'error');
        }
    } catch (error) {
        console.error('Error submitting order:', error);
        showNotification('Error submitting order', 'error');
    }
}

// WebSocket connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus(true);
        ws.send(JSON.stringify({ type: 'register', role: 'waiter' }));
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'order_updated' || data.type === 'table_cleared' || data.type === 'new_order') {
            loadOrders().then(() => {
                renderTableGrid();
                renderTablesOverview();
            });
        } else if (data.type === 'menu_updated') {
            loadMenu().then(() => {
                renderMenu();
                showNotification('Menu updated', 'info');
            });
        }
    };
}

// Update connection status
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    
    if (connected) {
        indicator.className = 'status-indicator connected';
        text.textContent = 'Connected';
    } else {
        indicator.className = 'status-indicator disconnected';
        text.textContent = 'Disconnected';
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification notification-${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}
