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
    const total = order.items.reduce((sum, item) => sum + item.price, 0);
    const timeAgo = getTimeAgo(order.timestamp);
    const completedTime = order.completedAt ? getTimeAgo(order.completedAt) : null;
    const hasOverflow = order.items.length > 3; // Show expand button if more than 3 items
    
    let actionsHtml = '';
    if (status === 'pending') {
        actionsHtml = `
            <button class="btn btn-primary btn-sm" onclick="updateOrderStatus(${order.id}, 'preparing')">
                Start Preparing
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteOrder(${order.id})">
                Cancel
            </button>
        `;
    } else if (status === 'preparing') {
        actionsHtml = `
            <button class="btn btn-success btn-sm" onclick="updateOrderStatus(${order.id}, 'completed')">
                Mark Complete
            </button>
            <button class="btn btn-secondary btn-sm" onclick="updateOrderStatus(${order.id}, 'pending')">
                Back to Pending
            </button>
        `;
    } else {
        actionsHtml = `
            <button class="btn btn-danger btn-sm" onclick="deleteOrder(${order.id})">
                Remove
            </button>
        `;
    }
    
    return `
        <div class="order-card order-card-${status} ${hasOverflow ? 'has-overflow collapsed' : ''}" id="order-${order.id}">
            <div class="order-header">
                <div>
                    <strong class="order-number">Order #${order.id}</strong>
                    <span class="order-table">${order.table}</span>
                </div>
                <span class="order-time">${timeAgo}</span>
            </div>
            
            <div class="order-items-wrapper">
                <div class="order-items">
                    ${order.items.map(item => `
                        <div class="order-item">
                            <span class="item-icon">${item.icon}</span>
                            <div class="item-info">
                                <span class="item-name">${item.name}</span>
                                ${item.notes ? `<span class="item-note">📝 ${item.notes}</span>` : ''}
                            </div>
                            <span class="item-price">$${item.price.toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            ${hasOverflow ? `
                <button class="order-expand-btn" onclick="toggleOrderExpand(${order.id})">
                    <span class="expand-text">View All Items</span>
                    <span class="expand-icon">▼</span>
                </button>
            ` : ''}
            
            ${order.notes ? `
                <div class="order-notes">
                    <strong>📝 Notes:</strong> ${order.notes}
                </div>
            ` : ''}
            
            <div class="order-footer">
                <div class="order-total">
                    <strong>Total:</strong>
                    <strong>$${total.toFixed(2)}</strong>
                </div>
                ${completedTime ? `<div class="completed-time">Completed ${completedTime}</div>` : ''}
            </div>
            
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
    const total = order.items.reduce((sum, item) => sum + item.price, 0);
    const completedTime = order.completedAt ? getTimeAgo(order.completedAt) : '';
    
    return `
        <div class="recent-order-compact" id="completed-order-${order.id}">
            <div class="order-compact-header" onclick="toggleCompletedOrder(${order.id})">
                <div class="order-compact-main">
                    <strong>Order #${order.id}</strong>
                    <span class="order-compact-table">Table ${order.table}</span>
                    <span class="order-time-small">${completedTime}</span>
                </div>
                <span class="expand-arrow">▼</span>
            </div>
            <div class="order-compact-details" style="display: none;">
                <div class="order-items">
                    ${order.items.map(item => `
                        <div class="order-item">
                            <span class="item-icon">${item.icon}</span>
                            <div class="item-info">
                                <span class="item-name">${item.name}</span>
                                ${item.notes ? `<span class="item-note">📝 ${item.notes}</span>` : ''}
                            </div>
                            <span class="item-price">$${item.price.toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>
                ${order.notes ? `
                    <div class="order-notes">
                        <strong>📝 Notes:</strong> ${order.notes}
                    </div>
                ` : ''}
                <div class="order-footer">
                    <div class="order-total">
                        <strong>Total: $${total.toFixed(2)}</strong>
                    </div>
                </div>
                <div class="order-actions">
                    <button class="btn btn-danger btn-sm" onclick="deleteOrder(${order.id})">Remove</button>
                </div>
            </div>
        </div>
    `;
}

// Toggle completed order details
function toggleCompletedOrder(orderId) {
    const orderEl = document.getElementById(`completed-order-${orderId}`);
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
