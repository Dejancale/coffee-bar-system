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
        const tableOrders = allOrders.filter(o => o.table == i && o.status !== 'completed');
        const allTableOrders = allOrders.filter(o => o.table == i);
        const hasOrders = allTableOrders.length > 0; // Occupied if ANY orders exist
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
    
    const tableOrders = allOrders.filter(o => o.table == selectedTable);
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

// Close table modal
function closeTableModal() {
    document.getElementById('tableModal').style.display = 'none';
}

// View table history
function viewTableHistory(tableNum) {
    const allTableOrders = allOrders.filter(o => o.table == tableNum);
    const modal = document.getElementById('tableModal');
    const modalTableNum = document.getElementById('modalTableNumber');
    const modalBody = document.getElementById('tableModalBody');
    
    modalTableNum.textContent = `${tableNum} - Complete History`;
    
    if (allTableOrders.length === 0) {
        modalBody.innerHTML = '<p class="empty-message">No order history for this table</p>';
    } else {
        // Group by session (orders close in time)
        const totalSpent = allTableOrders.reduce((sum, order) => {
            return sum + order.items.reduce((itemSum, item) => itemSum + item.price, 0);
        }, 0);
        
        const activeOrders = allTableOrders.filter(o => o.status !== 'completed');
        const completedOrders = allTableOrders.filter(o => o.status === 'completed');
        
        modalBody.innerHTML = `
            <div class="table-history-summary">
                <h3>Session Summary</h3>
                <div class="summary-stats">
                    <div class="stat-item">
                        <span class="stat-label">Total Orders:</span>
                        <span class="stat-value">${allTableOrders.length}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Total Spent:</span>
                        <span class="stat-value">$${totalSpent.toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Active:</span>
                        <span class="stat-value">${activeOrders.length}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Completed:</span>
                        <span class="stat-value">${completedOrders.length}</span>
                    </div>
                </div>
            </div>
            
            ${activeOrders.length > 0 ? `
                <h4 style="margin-top: 20px;">🔴 Active Orders</h4>
                ${activeOrders.map(order => createHistoryOrderCard(order)).join('')}
            ` : ''}
            
            ${completedOrders.length > 0 ? `
                <h4 style="margin-top: 20px;">✅ Completed Orders</h4>
                ${completedOrders.map(order => createHistoryOrderCard(order)).join('')}
            ` : ''}
        `;
    }
    
    modal.style.display = 'flex';
}

// Create order card for history view
function createHistoryOrderCard(order) {
    const total = order.items.reduce((sum, item) => sum + item.price, 0);
    const time = new Date(order.timestamp).toLocaleString();
    
    return `
        <div class="history-order-card">
            <div class="order-header">
                <strong>Order #${order.id}</strong>
                <span class="status-badge status-${order.status}">${order.status}</span>
            </div>
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
        </div>
    `;
}

// Clear table (delete all orders and mark as free)
async function clearTable() {
    if (!selectedTable) return;
    
    if (!confirm(`Clear Table ${selectedTable}? This will remove all orders and mark the table as free.`)) return;
    
    const allTableOrders = allOrders.filter(o => o.table == selectedTable);
    
    try {
        // Delete all orders for this table
        for (const order of allTableOrders) {
            await fetch(`/api/orders/${order.id}`, { method: 'DELETE' });
        }
        
        await loadOrders();
        renderTableGrid();
        renderTablesOverview();
        showNotification(`Table ${selectedTable} cleared and marked as free!`, 'success');
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
        const tableOrders = allOrders.filter(o => o.table == i && o.status !== 'completed');
        const allTableOrders = allOrders.filter(o => o.table == i);
        const hasActive = allTableOrders.length > 0; // Occupied if ANY orders exist
        
        let statusText = '🟢 Free';
        let orderDetails = '';
        
        // Calculate totals
        const totalSpent = allTableOrders.reduce((sum, order) => {
            return sum + order.items.reduce((itemSum, item) => itemSum + item.price, 0);
        }, 0);
        
        if (hasActive) {
            statusText = '🔴 Occupied';
            const pending = tableOrders.filter(o => o.status === 'pending').length;
            const preparing = tableOrders.filter(o => o.status === 'preparing').length;
            const completed = allTableOrders.filter(o => o.status === 'completed').length;
            const allItems = allTableOrders.flatMap(o => o.items);
            
            orderDetails = `
                <div class="table-order-summary">
                    <div class="table-stats">
                        ${pending > 0 ? `<span class="stat-badge pending">⏳ ${pending} pending</span>` : ''}
                        ${preparing > 0 ? `<span class="stat-badge preparing">👨‍🍳 ${preparing} preparing</span>` : ''}
                        ${completed > 0 ? `<span class="stat-badge completed">✅ ${completed} completed</span>` : ''}
                    </div>
                    <div class="table-drinks">
                        <strong>All Drinks on Table:</strong><br>
                        ${allItems.slice(0, 4).map(item => `${item.icon} ${item.name}`).join(', ')}
                        ${allItems.length > 4 ? ` +${allItems.length - 4} more` : ''}
                    </div>
                    <div class="table-session-info">
                        <span>📋 ${allTableOrders.length} orders</span>
                        <span>💰 $${totalSpent.toFixed(2)}</span>
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
                    ${hasActive ? `<button class="btn btn-sm btn-secondary" onclick="viewTableHistory(${i})">📜 View All</button>` : ''}
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

// Render recent orders (compact with expand)
function renderRecentOrders() {
    const container = document.getElementById('recentOrdersList');
    const recentOrders = [...allOrders].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);
    
    if (recentOrders.length === 0) {
        container.innerHTML = '<p class="empty-message">No recent orders</p>';
        return;
    }
    
    container.innerHTML = recentOrders.map(order => `
        <div class="recent-order-compact" id="recent-order-${order.id}">
            <div class="order-compact-header" onclick="toggleRecentOrder(${order.id})">
                <div class="order-compact-main">
                    <strong>Order #${order.id}</strong>
                    <span class="order-compact-table">Table ${order.table}</span>
                    <span class="status-badge status-${order.status}">${order.status}</span>
                </div>
                <span class="expand-arrow">▼</span>
            </div>
            <div class="order-compact-details" style="display: none;">
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
                    <strong>Total: $${order.items.reduce((sum, item) => sum + item.price, 0).toFixed(2)}</strong>
                </div>
                <div class="order-time">
                    ${new Date(order.timestamp).toLocaleString()}
                </div>
            </div>
        </div>
    `).join('');
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
        
        if (data.type === 'order_updated' || data.type === 'table_cleared') {
            loadOrders();
            renderTableGrid();
            if (document.querySelector('.tab-btn[data-tab="tables"]').classList.contains('active')) {
                renderTablesOverview();
            }
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
