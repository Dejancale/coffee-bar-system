// State
let orders = [];
let ws = null;
let notificationSound = null;
let currentUser = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    notificationSound = document.getElementById('notificationSound');
    await loadCurrentUser();
    connectWebSocket();
    loadOrders();
    setupLogout();
    setupTabs();
    
    // Refresh orders every 30 seconds as backup
    setInterval(loadOrders, 30000);
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

// Setup logout
function setupLogout() {
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/login';
        } catch (error) {
            console.error('Error logging out:', error);
        }
    });
}

// Load all orders
async function loadOrders() {
    try {
        const response = await fetch('/api/orders');
        orders = await response.json();
        renderOrders();
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

// Render orders by status
function renderOrders() {
    const pending = orders.filter(o => o.status === 'pending');
    const progress = orders.filter(o => o.status === 'preparing');
    const completed = orders.filter(o => o.status === 'completed');
    
    renderOrderList('pendingOrders', pending, 'pending');
    renderOrderList('progressOrders', progress, 'preparing');
    renderOrderList('completedOrders', completed, 'completed');
    
    // Update counts
    document.getElementById('pendingCount').textContent = pending.length;
    document.getElementById('progressCount').textContent = progress.length;
    document.getElementById('completedCount').textContent = completed.length;
}

// Render order list
function renderOrderList(containerId, orderList, status) {
    const container = document.getElementById(containerId);
    
    if (orderList.length === 0) {
        container.innerHTML = '<p class="empty-message">No orders</p>';
        return;
    }
    
    // Sort by timestamp (oldest first for pending/preparing, newest first for completed)
    const sortedOrders = [...orderList].sort((a, b) => {
        if (status === 'completed') {
            return new Date(b.completedAt || b.timestamp) - new Date(a.completedAt || a.timestamp);
        }
        return new Date(a.timestamp) - new Date(b.timestamp);
    });
    
    // Use compact view for completed orders
    if (status === 'completed') {
        container.innerHTML = sortedOrders.map(order => createCompactOrderCard(order)).join('');
    } else {
        container.innerHTML = sortedOrders.map(order => createOrderCard(order, status)).join('');
    }
}

// Create order card HTML
function createOrderCard(order, status) {
    const timeAgo = getTimeAgo(order.timestamp);
    const completedTime = order.completedAt ? getTimeAgo(order.completedAt) : null;
    const hasOverflow = order.items.length > 3;
    const orderAge = Date.now() - new Date(order.timestamp).getTime();
    const isUrgent = orderAge > 10 * 60 * 1000; // 10 minutes
    
    let actionsHtml = '';
    if (status === 'pending') {
        actionsHtml = `
            <button class="btn btn-primary btn-sm btn-action-start" onclick="updateOrderStatus(${order.id}, 'preparing')">
                ⚡ Start Preparing
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteOrder(${order.id})">
                ❌ Cancel
            </button>
        `;
    } else if (status === 'preparing') {
        actionsHtml = `
            <button class="btn btn-success btn-sm btn-action-complete" onclick="updateOrderStatus(${order.id}, 'completed')">
                ✅ Mark Complete
            </button>
            <button class="btn btn-secondary btn-sm" onclick="updateOrderStatus(${order.id}, 'pending')">
                ← Back to Pending
            </button>
        `;
    }
    
    return `
        <div class="order-card order-card-${status} ${isUrgent && status === 'pending' ? 'order-urgent' : ''}" id="order-${order.id}">
            <div class="order-header">
                <div class="order-header-left">
                    <strong class="order-number">Order #${order.id}</strong>
                    <span class="order-table">🪑 Table ${order.table}</span>
                    ${status === 'pending' && isUrgent ? '<span class="urgent-badge">⚠️ Urgent</span>' : ''}
                </div>
                <span class="order-time">🕒 ${timeAgo}</span>
            </div>
            
            <div class="order-items-list-barmen">
                ${order.items.map(item => `
                    <div class="barmen-order-item">
                        <span class="barmen-item-icon">${item.icon}</span>
                        <div class="barmen-item-content">
                            <div class="barmen-item-name">${item.name} ${item.quantity > 1 ? `×${item.quantity}` : ''}</div>
                            ${item.notes ? `<div class="barmen-item-note">📝 ${item.notes}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
            
            ${order.notes ? `
                <div class="order-notes">
                    <strong>📝 Notes:</strong> ${order.notes}
                </div>
            ` : ''}
            
            <div class="order-actions">
                ${actionsHtml}
            </div>
        </div>
    `;
}

// Update order status
async function updateOrderStatus(orderId, newStatus) {
    try {
        const response = await fetch(`/api/orders/${orderId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (response.ok) {
            const updatedOrder = await response.json();
            
            // Update local state
            const index = orders.findIndex(o => o.id === orderId);
            if (index !== -1) {
                orders[index] = updatedOrder;
            }
            
            renderOrders();
            
            let message = '';
            if (newStatus === 'preparing') {
                message = `Order #${orderId} - Started preparing`;
            } else if (newStatus === 'completed') {
                message = `Order #${orderId} - Completed! ✅`;
            } else {
                message = `Order #${orderId} - Status updated`;
            }
            
            showNotification(message, 'success');
        }
    } catch (error) {
        console.error('Error updating order status:', error);
        showNotification('Failed to update order', 'error');
    }
}

// Delete order
async function deleteOrder(orderId) {
    if (!confirm('Are you sure you want to delete this order?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/orders/${orderId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            orders = orders.filter(o => o.id !== orderId);
            renderOrders();
            showNotification('Order deleted', 'success');
        }
    } catch (error) {
        console.error('Error deleting order:', error);
        showNotification('Failed to delete order', 'error');
    }
}

// WebSocket connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus(true);
        ws.send(JSON.stringify({ type: 'register', role: 'barmen' }));
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
        
        if (data.type === 'new_order') {
            // Add new order to local state
            orders.push(data.order);
            renderOrders();
            
            // Play notification sound
            playNotificationSound();
            
            // Show notification
            showNotification(`New Order #${data.order.id} from ${data.order.table}! 🔔`, 'info', 5000);
        } else if (data.type === 'order_updated') {
            // Update existing order
            const index = orders.findIndex(o => o.id === data.order.id);
            if (index !== -1) {
                orders[index] = data.order;
            }
            renderOrders();
        } else if (data.type === 'order_deleted') {
            // Remove deleted order
            orders = orders.filter(o => o.id !== data.orderId);
            renderOrders();
        } else if (data.type === 'initial_orders') {
            // Receive initial orders when connecting
            orders = data.orders;
            renderOrders();
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
function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification notification-${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, duration);
}

// Play notification sound
function playNotificationSound() {
    try {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(e => console.log('Could not play sound:', e));
    } catch (error) {
        console.log('Audio playback error:', error);
    }
}

// Get time ago string
function getTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) {
        return 'Just now';
    } else if (diffMins === 1) {
        return '1 minute ago';
    } else if (diffMins < 60) {
        return `${diffMins} minutes ago`;
    } else if (diffHours === 1) {
        return '1 hour ago';
    } else if (diffHours < 24) {
        return `${diffHours} hours ago`;
    } else {
        return time.toLocaleString();
    }
}

// Toggle order expand/collapse
function toggleOrderExpand(orderId) {
    const orderCard = document.getElementById(`order-${orderId}`);
    const expandBtn = orderCard.querySelector('.order-expand-btn');
    const expandText = expandBtn.querySelector('.expand-text');
    
    if (orderCard.classList.contains('collapsed')) {
        orderCard.classList.remove('collapsed');
        orderCard.classList.add('expanded');
        expandText.textContent = 'Show Less';
    } else {
        orderCard.classList.remove('expanded');
        orderCard.classList.add('collapsed');
        expandText.textContent = 'View All Items';
    }
}

// Create compact order card for completed orders
function createCompactOrderCard(order) {
    const completedTime = order.completedAt ? getTimeAgo(order.completedAt) : '';
    const orderTime = new Date(order.timestamp);
    const timeStr = orderTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const itemCount = order.items.length;
    const firstItem = order.items[0];
    
    return `
        <div class="barmen-completed-card" id="completed-order-${order.id}">
            <div class="barmen-completed-header" onclick="toggleCompletedOrder(${order.id})">
                <div class="barmen-completed-info">
                    <div class="barmen-completed-details">
                        <div class="barmen-completed-title">
                            <strong>Table ${order.table}</strong>
                            <span class="barmen-item-count">${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div class="barmen-completed-subtitle">
                            ${firstItem ? firstItem.icon + ' ' + firstItem.name : 'Order'} ${itemCount > 1 ? '+ ' + (itemCount - 1) + ' more' : ''}
                        </div>
                        <div class="barmen-completed-time">${completedTime}</div>
                    </div>
                </div>
                <div class="barmen-expand-icon" id="completed-arrow-${order.id}">
                    ▼
                </div>
            </div>
            <div class="barmen-completed-content hidden" id="completed-details-${order.id}">
                <div class="barmen-items-list">
                    ${order.items.map(item => `
                        <div class="barmen-completed-item">
                            <span class="barmen-item-icon">${item.icon}</span>
                            <div class="barmen-item-info">
                                <div class="barmen-item-name">${item.name}</div>
                                ${item.quantity > 1 ? `<div class="barmen-item-qty">×${item.quantity}</div>` : ''}
                                ${item.notes ? `<div class="barmen-item-note">📝 ${item.notes}</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                ${order.notes ? `
                    <div class="barmen-order-note">
                        <strong>📝 Order Notes:</strong> ${order.notes}
                    </div>
                ` : ''}
                <div class="barmen-order-meta">
                    <div>Waiter: ${order.waiter}</div>
                    ${order.clearedBy ? `<div>Cleared by: ${order.clearedBy}</div>` : ''}
                    <div>${timeStr}</div>
                </div>
            </div>
        </div>
    `;
}

// Toggle completed order details
function toggleCompletedOrder(orderId) {
    const details = document.getElementById(`completed-details-${orderId}`);
    const arrow = document.getElementById(`completed-arrow-${orderId}`);
    
    if (details && arrow) {
        details.classList.toggle('hidden');
        if (details.classList.contains('hidden')) {
            arrow.textContent = '▼';
        } else {
            arrow.textContent = '▲';
        }
    }
}

// Setup tabs
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            // Remove active class from all tabs and contents
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            btn.classList.add('active');
            document.getElementById(`${tabName}Tab`).classList.add('active');
            
            // Load history when history tab is clicked
            if (tabName === 'history') {
                loadBarmenHistory();
            }
        });
    });
}

// Load barmen order history
async function loadBarmenHistory() {
    try {
        const response = await fetch('/api/orders');
        const allOrders = await response.json();
        renderBarmenHistory(allOrders);
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// Render barmen order history
function renderBarmenHistory(allOrders) {
    const historyContainer = document.getElementById('barmenHistory');
    
    if (allOrders.length === 0) {
        historyContainer.innerHTML = '<p class="no-orders">No orders yet</p>';
        return;
    }
    
    // Sort orders by date (newest first)
    const sortedOrders = [...allOrders].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    historyContainer.innerHTML = sortedOrders.map(order => {
        const orderDate = new Date(order.timestamp);
        const dateStr = orderDate.toLocaleDateString();
        const timeStr = orderDate.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const statusIcon = order.clearedBy ? '✅' : (order.status === 'completed' ? '🔄' : (order.status === 'preparing' ? '⚡' : '⏱️'));
        const statusText = order.clearedBy ? 'Cleared' : order.status;
        
        return `
            <div class="history-order-card" onclick="toggleSimpleOrder(${order.id})">
                <div class="history-order-header">
                    <div class="history-order-left">
                        <span class="history-status-icon">${statusIcon}</span>
                        <div class="history-order-info">
                            <div class="history-order-title"><strong>Order #${order.id}</strong> · Table ${order.table}</div>
                            <div class="history-order-meta">${dateStr} ${timeStr} · ${order.waiter}</div>
                        </div>
                    </div>
                    <div class="history-order-right">
                        <span class="history-status-badge status-${order.status}">${statusText}</span>
                        <span class="expand-arrow" id="simple-arrow-${order.id}">▼</span>
                    </div>
                </div>
                <div class="history-order-details" id="simple-details-${order.id}" style="display: none;">
                    <div class="history-items-list">
                        ${order.items.map(item => `
                            <div class="history-item">
                                <span class="history-item-icon">${item.icon || '🍽️'}</span>
                                <span class="history-item-name">${item.name} ${item.quantity > 1 ? `×${item.quantity}` : ''}</span>
                                ${item.notes ? `<div class="history-item-note">📝 ${item.notes}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    ${order.notes ? `<div class="history-order-note"><strong>📝 Order Note:</strong> ${order.notes}</div>` : ''}
                    ${order.clearedBy ? `<div class="history-cleared-info">✓ Cleared by ${order.clearedBy}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Toggle simple order details
function toggleSimpleOrder(orderId) {
    const details = document.getElementById(`simple-details-${orderId}`);
    const arrow = document.getElementById(`simple-arrow-${orderId}`);
    
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

// Get status badge HTML
function getStatusBadge(status) {
    const badges = {
        'pending': '<span class="status-badge status-pending">⏱️ Pending</span>',
        'in-progress': '<span class="status-badge status-in-progress">⚡ In Progress</span>',
        'completed': '<span class="status-badge status-completed">✅ Completed</span>'
    };
    return badges[status] || '';
}
