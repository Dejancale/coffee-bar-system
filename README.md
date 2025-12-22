# Coffee Bar Order System

A professional, real-time order management system for coffee bars and restaurants built with Node.js and WebSockets.

## Features

- 🔐 **Secure Authentication** - Role-based access (Admin, Waiter, Barmen)
- 📊 **Visual Table Management** - Interactive 10-table grid system
- ⚡ **Real-time Updates** - WebSocket-powered live order sync
- 📝 **Per-Item Notes** - Custom specifications for each order item
- 🪑 **Smart Table Tracking** - Auto-occupy on order, manual clearing
- 📋 **Order History** - Complete session tracking per table
- 🎨 **Modern UI** - Light cyan theme with smooth animations
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile

## Tech Stack

- **Backend:** Node.js, Express, WebSockets
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Authentication:** bcrypt, express-session
- **Data Storage:** JSON file-based

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open in browser:**
   - Login: http://localhost:3000/login
   - Default credentials:
     - Admin: `admin` / `admin123`

## Deployment to Render

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **Deploy on Render:**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Settings will be auto-detected from package.json
   - Click "Create Web Service"
   - Wait for deployment to complete

3. **Access your app:**
   - Your app will be at: `https://your-app-name.onrender.com`

## Usage

### Waiter Interface
- Select table from visual grid
- Add items to order with per-item notes
- Submit order (table auto-occupied)
- Clear table when customers leave

### Barmen Interface
- View orders: Pending → Preparing → Completed
- Start preparing & mark complete
- Expandable cards for long orders

### Admin Panel
- Manage menu items & pricing
- User management
- Statistics & order filtering
- Export to CSV & print orders

## License

MIT
