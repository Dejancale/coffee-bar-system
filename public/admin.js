let currentUser = null;
let menuItems = [];
let orders = [];
let users = [];
let orderFilters = { status: 'all', date: 'all' };

document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentUser();
    await loadStats();
    await loadMenu();
    await loadOrders();
    await loadUsers();
    
    setupEventListeners();
    setupTabs();
    setupFilters();
});

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
        const response = await fetch('/api/orders/stats');
        const stats = await response.json();
        
        document.getElementById('totalOrders').textContent = stats.totalOrders;
        document.getElementById('todayOrders').textContent = stats.todayOrders;
        document.getElementById('completedToday').textContent = stats.completedToday;
        document.getElementById('totalRevenue').textContent = `$${stats.totalRevenue}`;
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
        const total = order.items.reduce((sum, item) => sum + item.price, 0);
        return `
            <div class="order-card order-card-${order.status}">
                <div class="order-header">
                    <div>
                        <strong>Order #${order.id} - ${order.table}</strong>
                        ${order.waiter ? `<span class="order-waiter">by ${order.waiter}</span>` : ''}
                    </div>
                    <div class="order-actions-inline">
                        <span class="status-badge status-${order.status}">${order.status}</span>
                        <button onclick="printOrder(${order.id})" class="btn btn-sm btn-secondary" title="Print">🖨️</button>
                    </div>
                </div>
                <div class="order-items">
                    ${order.items.map(item => `
                        <div class="order-item">
                            <span>${item.icon} ${item.name}</span>
                            ${item.notes ? `<span class="item-note">📝 ${item.notes}</span>` : ''}
                            <span>$${item.price.toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>
                ${order.notes ? `<div class="order-notes">📝 ${order.notes}</div>` : ''}
                <div class="order-footer">
                    <div class="order-total"><strong>Total: $${total.toFixed(2)}</strong></div>
                    <div class="order-time">${new Date(order.timestamp).toLocaleString()}</div>
                </div>
            </div>
        `;
    }).join('');
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
        });
    });
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
