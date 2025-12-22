const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Data files
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const MENU_FILE = path.join(__dirname, 'data', 'menu.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

// Load data
let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
let menuItems = JSON.parse(fs.readFileSync(MENU_FILE, 'utf8'));
let orders = fs.existsSync(ORDERS_FILE) ? JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')) : [];
let orderIdCounter = orders.length > 0 ? Math.max(...orders.map(o => o.id)) + 1 : 1;

// Save data functions
function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function saveMenu() {
    fs.writeFileSync(MENU_FILE, JSON.stringify(menuItems, null, 2));
}

function saveOrders() {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// Store connected clients
const waiterClients = new Set();
const barmenClients = new Set();
const adminClients = new Set();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: 'coffee-bar-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true
    }
}));

// Serve static files
app.use(express.static('public'));

// Authentication middleware
function requireAuth(role = null) {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (role && req.session.user.role !== role && req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/waiter', (req, res) => {
    if (!req.session.user || (req.session.user.role !== 'waiter' && req.session.user.role !== 'admin')) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'waiter.html'));
});

app.get('/barmen', (req, res) => {
    if (!req.session.user || (req.session.user.role !== 'barmen' && req.session.user.role !== 'admin')) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'barmen.html'));
});

app.get('/admin', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Auth API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username);
    
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password with bcrypt
    let validPassword = false;
    try {
        validPassword = await bcrypt.compare(password, user.password);
    } catch (error) {
        console.error('Password verification error:', error);
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name
    };
    
    res.json({ 
        success: true, 
        user: req.session.user,
        redirectUrl: user.role === 'admin' ? '/admin' : (user.role === 'waiter' ? '/waiter' : '/barmen')
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json(req.session.user);
});

// Menu API
app.get('/api/menu', (req, res) => {
    res.json(menuItems.filter(item => item.available));
});

app.get('/api/menu/all', requireAuth('admin'), (req, res) => {
    res.json(menuItems);
});

app.post('/api/menu', requireAuth('admin'), (req, res) => {
    const newItem = {
        id: Date.now().toString(),
        ...req.body,
        available: true
    };
    menuItems.push(newItem);
    saveMenu();
    broadcastToAll({ type: 'menu_updated' });
    res.json(newItem);
});

app.put('/api/menu/:id', requireAuth('admin'), (req, res) => {
    const index = menuItems.findIndex(item => item.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'Item not found' });
    }
    menuItems[index] = { ...menuItems[index], ...req.body };
    saveMenu();
    broadcastToAll({ type: 'menu_updated' });
    res.json(menuItems[index]);
});

app.delete('/api/menu/:id', requireAuth('admin'), (req, res) => {
    const index = menuItems.findIndex(item => item.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'Item not found' });
    }
    menuItems.splice(index, 1);
    saveMenu();
    broadcastToAll({ type: 'menu_updated' });
    res.json({ success: true });
});

// Orders API
app.get('/api/orders', requireAuth(), (req, res) => {
    res.json(orders);
});

app.get('/api/orders/stats', requireAuth(), (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayOrders = orders.filter(o => new Date(o.timestamp) >= today);
    const completedToday = todayOrders.filter(o => o.status === 'completed');
    const totalRevenue = completedToday.reduce((sum, order) => {
        return sum + order.items.reduce((itemSum, item) => itemSum + item.price, 0);
    }, 0);
    
    res.json({
        totalOrders: orders.length,
        todayOrders: todayOrders.length,
        completedToday: completedToday.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        preparingOrders: orders.filter(o => o.status === 'preparing').length,
        totalRevenue: totalRevenue.toFixed(2)
    });
});

app.post('/api/orders', requireAuth(), (req, res) => {
    const { table, items, notes } = req.body;
    
    const order = {
        id: orderIdCounter++,
        table,
        items,
        notes: notes || '',
        status: 'pending',
        timestamp: new Date().toISOString(),
        completedAt: null,
        waiter: req.session.user.name
    };
    
    orders.push(order);
    saveOrders();
    
    broadcastToBarmen({ type: 'new_order', order });
    broadcastToAdmins({ type: 'new_order', order });
    
    res.json(order);
});

app.patch('/api/orders/:id/status', requireAuth(), (req, res) => {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;
    
    const order = orders.find(o => o.id === orderId);
    
    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }
    
    order.status = status;
    if (status === 'completed') {
        order.completedAt = new Date().toISOString();
    }
    
    saveOrders();
    broadcastToAll({ type: 'order_updated', order });
    
    res.json(order);
});

app.delete('/api/orders/:id', requireAuth(), (req, res) => {
    const orderId = parseInt(req.params.id);
    const index = orders.findIndex(o => o.id === orderId);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Order not found' });
    }
    
    orders.splice(index, 1);
    saveOrders();
    broadcastToAll({ type: 'order_deleted', orderId });
    
    res.json({ success: true });
});

// Table management - Clear table (mark as unoccupied but keep history)
app.post('/api/tables/:tableNum/clear', requireAuth(), (req, res) => {
    const tableNum = req.params.tableNum;
    
    // Mark all active orders for this table as completed
    const tableOrders = orders.filter(o => o.table == tableNum && o.status !== 'completed');
    
    tableOrders.forEach(order => {
        order.status = 'completed';
        order.completedAt = new Date().toISOString();
        order.clearedBy = req.session.user.name;
    });
    
    saveOrders();
    broadcastToAll({ type: 'table_cleared', tableNum });
    
    res.json({ success: true, clearedOrders: tableOrders.length });
});

// Users API
app.get('/api/users', requireAuth('admin'), (req, res) => {
    res.json(users.map(u => ({ id: u.id, username: u.username, role: u.role, name: u.name })));
});

app.post('/api/users', requireAuth('admin'), async (req, res) => {
    const { username, password, role, name } = req.body;
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: users.length + 1,
        username,
        password: hashedPassword,
        role,
        name
    };
    
    users.push(newUser);
    saveUsers();
    
    res.json({ id: newUser.id, username: newUser.username, role: newUser.role, name: newUser.name });
});

app.delete('/api/users/:id', requireAuth('admin'), (req, res) => {
    const userId = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === userId);
    
    if (index === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (users[index].role === 'admin') {
        return res.status(400).json({ error: 'Cannot delete admin user' });
    }
    
    users.splice(index, 1);
    saveUsers();
    res.json({ success: true });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'register') {
                if (data.role === 'waiter') {
                    waiterClients.add(ws);
                    console.log('Waiter registered');
                } else if (data.role === 'barmen') {
                    barmenClients.add(ws);
                    console.log('Barmen registered');
                    // Send current orders to newly connected barmen
                    ws.send(JSON.stringify({
                        type: 'initial_orders',
                        orders: orders.filter(o => o.status !== 'completed')
                    }));
                } else if (data.role === 'admin') {
                    adminClients.add(ws);
                    console.log('Admin registered');
                }
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
    
    ws.on('close', () => {
        waiterClients.delete(ws);
        barmenClients.delete(ws);
        adminClients.delete(ws);
        console.log('Client disconnected');
    });
});

// Broadcast functions
function broadcastToBarmen(data) {
    const message = JSON.stringify(data);
    barmenClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function broadcastToWaiters(data) {
    const message = JSON.stringify(data);
    waiterClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function broadcastToAdmins(data) {
    const message = JSON.stringify(data);
    adminClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function broadcastToAll(data) {
    broadcastToBarmen(data);
    broadcastToWaiters(data);
    broadcastToAdmins(data);
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════════════════════════╗`);
    console.log(`║  🚀 Coffee Bar Order System - Professional Edition       ║`);
    console.log(`╠════════════════════════════════════════════════════════════╣`);
    console.log(`║                                                            ║`);
    console.log(`║  📱 Login Page:    http://localhost:${PORT}/login          ║`);
    console.log(`║  👨‍💼 Admin Panel:   http://localhost:${PORT}/admin          ║`);
    console.log(`║  📝 Waiter:        http://localhost:${PORT}/waiter         ║`);
    console.log(`║  👨‍🍳 Barmen:        http://localhost:${PORT}/barmen         ║`);
    console.log(`║                                                            ║`);
    console.log(`╠════════════════════════════════════════════════════════════╣`);
    console.log(`║  Default Credentials:                                      ║`);
    console.log(`║  Admin:   admin/admin123                                   ║`);
    console.log(`║  Waiter:  waiter1/admin123                                 ║`);
    console.log(`║  Barmen:  barmen1/admin123                                 ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝\n`);
});
