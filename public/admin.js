let currentUser = null;
let menuItems = [];
let orders = [];
let users = [];
let orderFilters = { status: 'all', date: 'all' };
let selectedDate = new Date(); // For calendar filtering

document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentUser();
    await loadStats();
    await loadMenu();
    await loadOrders();
    await loadUsers();
    
    setupEventListeners();
    setupTabs();
    setupFilters();
    initializeDateFilter();
    
    // Refresh stats and table management every 10 seconds
    setInterval(async () => {
        await loadStats();
        // If on tables tab, refresh it
        const tablesTab = document.getElementById('tables');
        if (tablesTab && tablesTab.classList.contains('active')) {
            renderTableManagement();
        }
    }, 10000);
});

function initializeDateFilter() {
    const dateInput = document.getElementById('dateFilter');
    if (dateInput) {
        // Set today as default
        dateInput.valueAsDate = new Date();
    }
}

function filterByDate() {
    const dateInput = document.getElementById('dateFilter');
    if (dateInput && dateInput.value) {
        selectedDate = new Date(dateInput.value);
        loadStats();
    }
}

function resetToToday() {
    selectedDate = new Date();
    const dateInput = document.getElementById('dateFilter');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }
    loadStats();
}

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

async function loadStats() {
    try {
        const response = await fetch('/api/orders');
        orders = await response.json();
        
        const selectedDay = new Date(selectedDate).setHours(0, 0, 0, 0);
        const dayOrders = orders.filter(o => new Date(o.timestamp).setHours(0, 0, 0, 0) === selectedDay);
        
        // Active orders (not cleared by waiter)
        const activeOrders = dayOrders.filter(o => !o.clearedBy).length;
        
        // Occupied tables (orders not cleared)
        const occupiedTables = new Set(
            orders.filter(o => !o.clearedBy).map(o => o.table)
        ).size;
        
        // Completed orders (cleared by waiter)
        const completedOrders = dayOrders.filter(o => o.clearedBy).length;
        
        // Total revenue (only from cleared orders)
        const totalRevenue = dayOrders
            .filter(o => o.clearedBy)
            .reduce((sum, order) => {
                const orderTotal = order.items.reduce((itemSum, item) => {
                    const qty = item.quantity || 1;
                    const price = item.price || 0;
                    return itemSum + (price * qty);
                }, 0);
                return sum + orderTotal;
            }, 0);
        
        document.getElementById('totalOrders').textContent = dayOrders.length;
        document.getElementById('activeOrders').textContent = activeOrders;
        document.getElementById('occupiedTables').textContent = `${occupiedTables}/10`;
        document.getElementById('completedOrders').textContent = completedOrders;
        document.getElementById('totalRevenue').textContent = `$${totalRevenue.toFixed(2)}`;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadMenu() {
    try {
        const response = await fetch('/api/menu/all');
        menuItems = await response.json();
        renderMenuList();
    } catch (error) {
        console.error('Error loading menu:', error);
    }
}

function renderMenuList() {
    const container = document.getElementById('menuList');
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Icon</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${menuItems.map(item => `
                    <tr>
                        <td>${item.icon}</td>
                        <td>${item.name}</td>
                        <td>${item.category}</td>
                        <td>$${item.price.toFixed(2)}</td>
                        <td>
                            <span class="badge ${item.available ? 'badge-success' : 'badge-danger'}">
                                ${item.available ? 'Available' : 'Unavailable'}
                            </span>
                        </td>
                        <td>
                            <button onclick="editMenuItem('${item.id}')" class="btn btn-sm btn-primary">Edit</button>
                            <button onclick="deleteMenuItem('${item.id}')" class="btn btn-sm btn-danger">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadOrders() {
    try {
        const response = await fetch('/api/orders');
        orders = await response.json();
        renderOrdersList();
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

function renderOrdersList() {
    const container = document.getElementById('ordersList');
    
    if (orders.length === 0) {
        container.innerHTML = '<p class="empty-message">No orders yet</p>';
        return;
    }
    
    // Apply filters
    let filteredOrders = [...orders];
    
    if (orderFilters.status !== 'all') {
        filteredOrders = filteredOrders.filter(o => o.status === orderFilters.status);
    }
    
    if (orderFilters.date === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        filteredOrders = filteredOrders.filter(o => new Date(o.timestamp) >= today);
    } else if (orderFilters.date === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        filteredOrders = filteredOrders.filter(o => new Date(o.timestamp) >= weekAgo);
    } else if (orderFilters.date === 'month') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        filteredOrders = filteredOrders.filter(o => new Date(o.timestamp) >= monthAgo);
    }
    
    const sortedOrders = filteredOrders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    container.innerHTML = sortedOrders.map(order => {
        const total = order.items.reduce((sum, item) => {
            const qty = item.quantity || 1;
            const price = item.price || 0;
            return sum + (price * qty);
        }, 0);
        const statusIcon = order.clearedBy ? '✅' : (order.status === 'completed' ? '🔄' : (order.status === 'in-progress' ? '⚡' : '⏱️'));
        
        return `
            <div class="collapsible-order-item" id="admin-order-${order.id}">
                <div class="collapsible-order-header" onclick="toggleAdminOrder(${order.id})">
                    <div class="order-summary">
                        <span class="order-icon">${statusIcon}</span>
                        <strong>Order #${order.id}</strong>
                        <span class="order-table">Table ${order.table}</span>
                        <span class="status-badge status-${order.status}">${order.status}</span>
                        ${order.clearedBy ? '<span class="cleared-badge">✓ Cleared</span>' : ''}
                    </div>
                    <div class="order-total-right">
                        <strong>$${total.toFixed(2)}</strong>
                        <span class="collapse-arrow">▼</span>
                    </div>
                </div>
                <div class="collapsible-order-details" id="admin-order-details-${order.id}" style="display: none;">
                    <div class="order-meta">
                        <span>👤 ${order.waiter}</span>
                        <span>🕐 ${new Date(order.timestamp).toLocaleString()}</span>
                        ${order.completedAt ? `<span>✅ Completed: ${new Date(order.completedAt).toLocaleTimeString()}</span>` : ''}
                        ${order.clearedBy ? `<span>🧹 Cleared by: ${order.clearedBy}</span>` : ''}
                    </div>
                    <div class="order-items-list">
                        <h4>Items:</h4>
                        <ul>
                            ${order.items.map(item => {
                                const qty = item.quantity || 1;
                                const price = item.price || 0;
                                return `
                                <li>
                                    ${item.icon} ${item.name} ${qty > 1 ? `x${qty}` : ''} - $${(price * qty).toFixed(2)}
                                    ${item.notes ? `<br><span class="item-note">📝 ${item.notes}</span>` : ''}
                                </li>
                                `;
                            }).join('')}
                        </ul>
                    </div>
                    ${order.notes ? `<div class="order-notes">📝 Order Notes: ${order.notes}</div>` : ''}
                    <div class="order-actions">
                        <button onclick="printOrder(${order.id})" class="btn btn-sm btn-secondary">🖨️ Print</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleAdminOrder(orderId) {
    const details = document.getElementById(`admin-order-details-${orderId}`);
    const arrow = document.querySelector(`#admin-order-${orderId} .collapse-arrow`);
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        arrow.textContent = '▲';
    } else {
        details.style.display = 'none';
        arrow.textContent = '▼';
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        users = await response.json();
        renderUsersList();
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function renderUsersList() {
    const container = document.getElementById('usersList');
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(user => `
                    <tr>
                        <td>${user.name}</td>
                        <td>${user.username}</td>
                        <td><span class="badge badge-primary">${user.role}</span></td>
                        <td>
                            ${user.role !== 'admin' ? 
                                `<button onclick="deleteUser(${user.id})" class="btn btn-sm btn-danger">Delete</button>` :
                                '<span class="text-muted">Protected</span>'
                            }
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('addItemBtn').addEventListener('click', () => openMenuModal());
    document.getElementById('addUserBtn').addEventListener('click', () => openUserModal());
    document.getElementById('menuForm').addEventListener('submit', saveMenuItem);
    document.getElementById('userForm').addEventListener('submit', createUser);
    document.getElementById('exportOrdersBtn').addEventListener('click', exportOrders);
    
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
}

function setupFilters() {
    document.getElementById('orderStatusFilter').addEventListener('change', (e) => {
        orderFilters.status = e.target.value;
        renderOrdersList();
    });
    
    document.getElementById('orderDateFilter').addEventListener('change', (e) => {
        orderFilters.date = e.target.value;
        renderOrdersList();
    });
}

// Print order function
function printOrder(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const total = order.items.reduce((sum, item) => sum + item.price, 0);
    
    const printWindow = window.open('', '', 'height=600,width=400');
    printWindow.document.write(`
        <html>
        <head>
            <title>Order #${order.id}</title>
            <style>
                body { font-family: Arial; padding: 20px; max-width: 400px; }
                h2 { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
                .header { margin-bottom: 20px; }
                .items { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 15px 0; }
                .item { display: flex; justify-content: space-between; margin: 8px 0; }
                .item-notes { font-size: 0.85em; color: #666; margin-left: 20px; font-style: italic; }
                .total { font-size: 1.3em; font-weight: bold; text-align: right; margin-top: 15px; }
                .footer { margin-top: 20px; text-align: center; font-size: 0.9em; }
            </style>
        </head>
        <body>
            <h2>☕ Coffee Bar</h2>
            <div class="header">
                <strong>Order #${order.id}</strong><br>
                Table: ${order.table}<br>
                ${order.waiter ? `Waiter: ${order.waiter}<br>` : ''}
                Time: ${new Date(order.timestamp).toLocaleString()}<br>
                Status: ${order.status.toUpperCase()}
            </div>
            <div class="items">
                ${order.items.map(item => `
                    <div class="item">
                        <span>${item.icon} ${item.name}</span>
                        <span>$${item.price.toFixed(2)}</span>
                    </div>
                    ${item.notes ? `<div class="item-notes">📝 ${item.notes}</div>` : ''}
                `).join('')}
            </div>
            ${order.notes ? `<div style="margin-top: 15px;"><strong>Notes:</strong> ${order.notes}</div>` : ''}
            <div class="total">TOTAL: $${total.toFixed(2)}</div>
            <div class="footer">Thank you for your order!</div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
    }, 250);
}

// Export orders to CSV
function exportOrders() {
    let exportData = [...orders];
    
    if (orderFilters.status !== 'all') {
        exportData = exportData.filter(o => o.status === orderFilters.status);
    }
    
    if (orderFilters.date === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        exportData = exportData.filter(o => new Date(o.timestamp) >= today);
    }
    
    const csv = ['Order ID,Table,Waiter,Items,Total,Status,Timestamp'];
    
    exportData.forEach(order => {
        const total = order.items.reduce((sum, item) => sum + item.price, 0);
        const items = order.items.map(i => `${i.name}${i.notes ? ' (' + i.notes + ')' : ''}`).join('; ');
        csv.push(`${order.id},${order.table},${order.waiter || 'N/A'},"${items}",${total.toFixed(2)},${order.status},${order.timestamp}`);
    });
    
    const blob = new Blob([csv.join('\\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    showNotification('Orders exported successfully!', 'success');
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(tabName).classList.add('active');
            
            // Load table management when clicking tables tab
            if (tabName === 'tables') {
                renderTableManagement();
            }
        });
    });
}

// Render table management view
function renderTableManagement() {
    const tableGrid = document.getElementById('adminTableGrid');
    const tableDetail = document.getElementById('tableOrdersDetail');
    
    // Get table statuses from current orders (not cleared by waiter)
    const tableOrders = {};
    orders.filter(o => !o.clearedBy).forEach(order => {
        if (!tableOrders[order.table]) {
            tableOrders[order.table] = [];
        }
        tableOrders[order.table].push(order);
    });
    
    // Render 10 tables
    tableGrid.innerHTML = Array.from({ length: 10 }, (_, i) => {
        const tableNum = i + 1;
        const tableOrderList = tableOrders[tableNum] || [];
        const isOccupied = tableOrderList.length > 0;
        const orderCount = tableOrderList.length;
        
        return `
            <div class="table-square ${isOccupied ? 'occupied' : 'free'}" onclick="showTableDetail(${tableNum})">
                <div class="table-square-header">
                    <div class="table-number">${tableNum}</div>
                    <div class="table-status-text">${isOccupied ? 'Occupied' : 'Free'}</div>
                    ${isOccupied ? `<div class="table-order-count">${orderCount} order${orderCount !== 1 ? 's' : ''}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // Clear initial detail view
    tableDetail.innerHTML = '<p class="empty-message">Click on a table to view details</p>';
}

// Show table detail (for click interaction)
async function showTableDetail(tableNum) {
    const tableOrdersDetail = document.getElementById('tableOrdersDetail');
    
    // Fetch all orders for this table (including history)
    try {
        const response = await fetch('/api/orders');
        const allOrders = await response.json();
        
        // Filter orders for this table
        const tableOrders = allOrders.filter(o => o.table == tableNum);
        // Only show orders that are not cleared and not completed
        const currentOrders = tableOrders.filter(o => !o.clearedBy && o.status !== 'completed');
        const historyOrders = tableOrders.filter(o => o.clearedBy || o.status === 'completed');
        
        const isFree = currentOrders.length === 0;
        
        tableOrdersDetail.innerHTML = `
            <div class="table-detail-full">
                <div class="table-detail-header-full">
                    <h3>🪑 Table ${tableNum}</h3>
                    <span class="table-status-badge ${isFree ? 'status-free' : 'status-occupied'}">
                        ${isFree ? '✓ Free' : `⚠ Occupied (${currentOrders.length} order${currentOrders.length !== 1 ? 's' : ''})`}
                    </span>
                </div>
                
                ${!isFree ? `
                    <div class="table-current-section">
                        <h4>📋 Current Orders</h4>
                        ${currentOrders.map(order => {
                            const total = order.items.reduce((sum, item) => {
                                const qty = item.quantity || 1;
                                const price = item.price || 0;
                                return sum + (price * qty);
                            }, 0);
                            const statusBadge = {
                                'pending': '<span class="status-badge status-pending">⏱️ Pending</span>',
                                'preparing': '<span class="status-badge status-in-progress">⚡ Preparing</span>',
                                'completed': '<span class="status-badge status-completed">✅ Completed</span>'
                            }[order.status] || '';
                            
                            const time = new Date(order.timestamp).toLocaleTimeString('en-US', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                            });
                            
                            return `
                                <div class="table-order-card">
                                    <div class="table-order-header">
                                        <div>
                                            <strong>Order #${order.id}</strong> ${statusBadge}
                                        </div>
                                        <strong>$${total.toFixed(2)}</strong>
                                    </div>
                                    <div class="table-order-meta">
                                        👤 ${order.waiter} • ⏰ ${time}
                                    </div>
                                    <div class="table-order-items">
                                        ${order.items.map(item => {
                                            const qty = item.quantity || 1;
                                            const price = item.price || 0;
                                            return `
                                            <div class="table-order-item">
                                                ${item.icon || '🍽️'} ${item.name} ${qty > 1 ? `×${qty}` : ''} - $${(price * qty).toFixed(2)}
                                                ${item.notes ? `<div class="item-note-small">📝 ${item.notes}</div>` : ''}
                                            </div>
                                            `;
                                        }).join('')}
                                    </div>
                                    ${order.notes ? `<div class="order-notes-small">📝 ${order.notes}</div>` : ''}
                                    <div class="table-order-actions">
                                        <button class="btn btn-sm btn-secondary" onclick="printReceipt(${order.id})">🖨️ Print Receipt</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : '<p class="table-free-message">✓ This table is currently free and available</p>'}
                
                ${historyOrders.length > 0 ? `
                    <div class="table-history-section">
                        <h4>📜 Table History (${historyOrders.length} orders)</h4>
                        <div class="table-history-list">
                            ${historyOrders.slice(0, 10).reverse().map(order => {
                                const total = order.items.reduce((sum, item) => {
                                    const qty = item.quantity || 1;
                                    const price = item.price || 0;
                                    return sum + (price * qty);
                                }, 0);
                                const date = new Date(order.timestamp).toLocaleDateString();
                                const time = new Date(order.timestamp).toLocaleTimeString('en-US', { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                });
                                
                                return `
                                    <div class="table-history-item" onclick="toggleTableHistoryOrder(${order.id})">
                                        <div class="table-history-header">
                                            <div>
                                                <strong>Order #${order.id}</strong> • ${order.items.length} items
                                                <div class="table-history-time">${date} ${time}</div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 10px;">
                                                <strong>$${total.toFixed(2)}</strong>
                                                <button class="btn btn-xs btn-secondary" onclick="printReceipt(${order.id}); event.stopPropagation();" title="Print Receipt">🖨️</button>
                                                <span class="expand-arrow" id="history-arrow-${order.id}">▼</span>
                                            </div>
                                        </div>
                                        <div class="table-history-details" id="history-details-${order.id}" style="display: none;">
                                            <div class="history-meta">👤 ${order.waiter} • 🧹 Cleared by ${order.clearedBy}</div>
                                            <div class="history-items">
                                                ${order.items.map(item => {
                                                    const qty = item.quantity || 1;
                                                    const price = item.price || 0;
                                                    return `<div>${item.icon || '🍽️'} ${item.name} ${qty > 1 ? `×${qty}` : ''} - $${(price * qty).toFixed(2)}</div>`;
                                                }).join('')}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Scroll to detail
        tableOrdersDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
    } catch (error) {
        console.error('Error loading table details:', error);
        tableOrdersDetail.innerHTML = '<p class="error-message">Error loading table details</p>';
    }
}

function toggleTableHistoryOrder(orderId) {
    const details = document.getElementById(`history-details-${orderId}`);
    const arrow = document.getElementById(`history-arrow-${orderId}`);
    
    if (details && arrow) {
        if (details.style.display === 'none') {
            details.style.display = 'block';
            arrow.textContent = '▲';
        } else {
            details.style.display = 'none';
            arrow.textContent = '▼';
        }
    }
}

function openMenuModal(itemId = null) {
    const modal = document.getElementById('menuModal');
    const form = document.getElementById('menuForm');
    form.reset();
    
    if (itemId) {
        const item = menuItems.find(i => i.id === itemId);
        document.getElementById('menuModalTitle').textContent = 'Edit Menu Item';
        document.getElementById('itemId').value = item.id;
        document.getElementById('itemName').value = item.name;
        document.getElementById('itemCategory').value = item.category;
        document.getElementById('itemPrice').value = item.price;
        document.getElementById('itemIcon').value = item.icon;
        document.getElementById('itemDescription').value = item.description || '';
    } else {
        document.getElementById('menuModalTitle').textContent = 'Add Menu Item';
    }
    
    modal.style.display = 'flex';
}

function openUserModal() {
    document.getElementById('userModal').style.display = 'flex';
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

async function saveMenuItem(e) {
    e.preventDefault();
    
    const itemId = document.getElementById('itemId').value;
    const itemData = {
        name: document.getElementById('itemName').value,
        category: document.getElementById('itemCategory').value,
        price: parseFloat(document.getElementById('itemPrice').value),
        icon: document.getElementById('itemIcon').value,
        description: document.getElementById('itemDescription').value
    };
    
    try {
        const url = itemId ? `/api/menu/${itemId}` : '/api/menu';
        const method = itemId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemData)
        });
        
        if (response.ok) {
            showNotification(`Item ${itemId ? 'updated' : 'added'} successfully`, 'success');
            closeModals();
            await loadMenu();
        } else {
            showNotification('Failed to save item', 'error');
        }
    } catch (error) {
        console.error('Error saving item:', error);
        showNotification('Error saving item', 'error');
    }
}

function editMenuItem(itemId) {
    openMenuModal(itemId);
}

async function deleteMenuItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
        const response = await fetch(`/api/menu/${itemId}`, { method: 'DELETE' });
        
        if (response.ok) {
            showNotification('Item deleted successfully', 'success');
            await loadMenu();
        } else {
            showNotification('Failed to delete item', 'error');
        }
    } catch (error) {
        console.error('Error deleting item:', error);
        showNotification('Error deleting item', 'error');
    }
}

async function createUser(e) {
    e.preventDefault();
    
    const userData = {
        name: document.getElementById('userFullName').value,
        username: document.getElementById('userUsername').value,
        password: document.getElementById('userPassword').value,
        role: document.getElementById('userRole').value
    };
    
    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        
        if (response.ok) {
            showNotification('User created successfully', 'success');
            closeModals();
            await loadUsers();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to create user', 'error');
        }
    } catch (error) {
        console.error('Error creating user:', error);
        showNotification('Error creating user', 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
        const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
        
        if (response.ok) {
            showNotification('User deleted successfully', 'success');
            await loadUsers();
        } else {
            showNotification('Failed to delete user', 'error');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showNotification('Error deleting user', 'error');
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
    } catch (error) {
        console.error('Error logging out:', error);
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification notification-${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function printReceipt(orderId) {
    const order = orders.find(o => o.id === orderId);
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
                    <p>Please come again</p>
                </div>
            </div>
            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `);
    receiptWindow.document.close();
}
