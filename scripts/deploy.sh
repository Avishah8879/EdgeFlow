#!/bin/bash
# =============================================================================
# Tiphub EC2 Deployment Script
# =============================================================================
# Usage:
#   ./scripts/deploy.sh install   # First-time EC2 setup (install dependencies)
#   ./scripts/deploy.sh setup     # Configure nginx, PM2, log rotation, build app
#   ./scripts/deploy.sh start     # Start all services
#   ./scripts/deploy.sh stop      # Stop all services
#   ./scripts/deploy.sh restart   # Restart all services
#   ./scripts/deploy.sh status    # Check status of all services
#   ./scripts/deploy.sh logs      # View logs (interactive menu)
#   ./scripts/deploy.sh update    # Pull latest code and rebuild
# =============================================================================

set -e

# Get script directory and cd to project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

# =============================================================================
# SWAP SETUP - Prevents OOM crashes on smaller instances
# =============================================================================
setup_swap() {
    if [ -f /swapfile ]; then
        info "Swap file already exists"
        return 0
    fi

    log "Creating 2GB swap file..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile

    # Make swap persistent
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
    fi

    log "Swap configured: 2GB"
    swapon --show
}

# =============================================================================
# INSTALL - First time EC2 dependency installation
# =============================================================================
install_deps() {
    echo ""
    echo "=========================================="
    echo "    INSTALLING EC2 DEPENDENCIES"
    echo "=========================================="
    echo ""

    # Update system
    log "Updating system packages..."
    sudo apt update && sudo apt upgrade -y

    # Install Node.js 20.x
    log "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs

    # Install other dependencies
    log "Installing nginx, redis..."
    sudo apt install -y nginx redis-server git curl jq

    # Install PM2
    log "Installing PM2..."
    sudo npm install -g pm2

    # Install uv (Python package manager)
    log "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"

    # Verify installations
    echo ""
    log "Verifying installations..."
    echo "  Node.js: $(node --version)"
    echo "  npm: $(npm --version)"
    echo "  PM2: $(pm2 --version)"
    echo "  uv: $(uv --version 2>/dev/null || echo 'restart shell to use')"
    echo "  nginx: $(nginx -v 2>&1 | cut -d'/' -f2)"
    echo "  redis: $(redis-server --version | cut -d' ' -f3)"

    echo ""
    log "Dependencies installed! Run './scripts/deploy.sh setup' next."
    warn "You may need to restart your shell for 'uv' to be available."
}

# =============================================================================
# SETUP - Configure environment, nginx, build app
# =============================================================================
setup() {
    echo ""
    echo "=========================================="
    echo "    SETTING UP TIPHUB"
    echo "=========================================="
    echo ""

    # Ensure uv is in PATH
    export PATH="$HOME/.local/bin:$PATH"

    # Setup swap first (prevents OOM during build)
    setup_swap

    # Create logs directory
    log "Creating logs directory..."
    mkdir -p "$PROJECT_DIR/logs"

    # Stop and disable systemd Redis (PM2 will manage it)
    log "Disabling systemd Redis (PM2 will manage it)..."
    sudo systemctl stop redis-server 2>/dev/null || true
    sudo systemctl disable redis-server 2>/dev/null || true

    # Install Python dependencies
    log "Installing Python dependencies..."
    uv sync

    # Install Node dependencies
    log "Installing Node.js dependencies..."
    npm install

    # Build application
    log "Building application..."
    npm run build

    # Setup nginx
    log "Configuring nginx..."
    if [ -f "nginx/nginx.conf" ]; then
        # Copy main nginx.conf (contains rate limiting zones)
        sudo cp nginx/nginx.conf /etc/nginx/nginx.conf
    fi

    # Auto-detect SSL mode: use HTTPS config if certs exist, otherwise HTTP-only
    # Note: /etc/letsencrypt/live/ is root-only readable, so use sudo test
    if sudo test -f "/etc/letsencrypt/live/tiphub.ai/fullchain.pem"; then
        log "Let's Encrypt certificates found - using HTTPS config"
        NGINX_CONF="nginx/tiphub.conf"
    elif sudo test -f "/etc/ssl/mycerts/cloudflare.crt"; then
        log "Cloudflare certificates found - using HTTPS config"
        NGINX_CONF="nginx/tiphub.conf"
    else
        warn "No SSL certificates found - using HTTP-only config (for IP-based testing)"
        NGINX_CONF="nginx/tiphub-http.conf"
    fi

    if [ -f "$NGINX_CONF" ]; then
        # Copy site config
        sudo cp "$NGINX_CONF" /etc/nginx/sites-available/tiphub.conf
        sudo ln -sf /etc/nginx/sites-available/tiphub.conf /etc/nginx/sites-enabled/tiphub.conf
        sudo rm -f /etc/nginx/sites-enabled/default
        sudo nginx -t
        sudo systemctl enable nginx
        sudo systemctl reload nginx
    else
        warn "$NGINX_CONF not found, skipping nginx setup"
    fi

    # Install pm2-logrotate
    log "Installing pm2-logrotate..."
    pm2 install pm2-logrotate

    # Configure PM2 log rotation
    log "Configuring PM2 log rotation..."
    pm2 set pm2-logrotate:max_size 50M
    pm2 set pm2-logrotate:retain 30
    pm2 set pm2-logrotate:compress true
    pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
    pm2 set pm2-logrotate:rotateModule true
    pm2 set pm2-logrotate:workerInterval 30
    pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

    # Setup logrotate for nginx and app logs
    log "Setting up logrotate for nginx and app logs..."
    if [ -f "logrotate/tiphub" ]; then
        # Replace placeholder with actual project path
        sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" logrotate/tiphub | sudo tee /etc/logrotate.d/tiphub > /dev/null
        sudo chmod 644 /etc/logrotate.d/tiphub
    fi

    # Setup PM2 startup
    log "Setting up PM2 startup..."
    PM2_STARTUP_CMD=$(pm2 startup systemd -u $USER --hp $HOME 2>&1 | grep "sudo" | tail -1)
    if [ -n "$PM2_STARTUP_CMD" ]; then
        log "Running: $PM2_STARTUP_CMD"
        eval "$PM2_STARTUP_CMD"
    fi

    echo ""
    log "Setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Run: ./scripts/deploy.sh start"
    echo "  2. Access: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo 'YOUR_EC2_IP')"
}

# =============================================================================
# START - Start all services
# =============================================================================
start() {
    echo ""
    log "Starting all services..."

    # Ensure uv is in PATH
    export PATH="$HOME/.local/bin:$PATH"

    # Nginx
    log "Starting Nginx..."
    sudo systemctl start nginx

    # PM2 services (Redis, Node, Python, Celery)
    log "Starting PM2 services..."
    pm2 delete tiphub-redis tiphub-node tiphub-python tiphub-celery 2>/dev/null || true
    pm2 start ecosystem.config.cjs
    pm2 save

    sleep 3
    echo ""
    status
}

# =============================================================================
# STOP - Stop all services
# =============================================================================
stop() {
    echo ""
    log "Stopping all services..."

    # PM2 services (stop only app services, not pm2-logrotate)
    warn "Stopping PM2 services..."
    pm2 stop tiphub-redis tiphub-node tiphub-python tiphub-celery 2>/dev/null || true

    # Nginx (optional - keep running for maintenance page)
    # warn "Stopping Nginx..."
    # sudo systemctl stop nginx

    log "All services stopped."
}

# =============================================================================
# RESTART - Restart all services
# =============================================================================
restart() {
    log "Restarting all services..."
    stop
    sleep 2
    start
}

# =============================================================================
# STATUS - Check status of all services
# =============================================================================
status() {
    echo ""
    echo "=========================================="
    echo "         SERVICE STATUS"
    echo "=========================================="
    echo ""

    # PM2
    echo "--- PM2 Services ---"
    pm2 status 2>/dev/null || echo "PM2 not running"
    echo ""

    # Nginx
    echo "--- Nginx ---"
    if systemctl is-active --quiet nginx; then
        echo -e "${GREEN}Running${NC}"
    else
        echo -e "${RED}Not running${NC}"
    fi
    echo ""

    # Health checks
    echo "--- Health Checks ---"

    echo -n "Redis (localhost:6379): "
    if redis-cli ping 2>/dev/null | grep -q "PONG"; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAIL${NC}"
    fi

    echo -n "Node.js (localhost:5000): "
    if curl -s --max-time 3 http://localhost:5000 > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAIL${NC}"
    fi

    echo -n "Python (localhost:7860): "
    if curl -s --max-time 3 http://localhost:7860/docs > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAIL${NC}"
    fi
    echo ""

    # Show public URL
    EC2_IP=$(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null)
    if [ -n "$EC2_IP" ]; then
        echo "--- Public URL ---"
        echo "http://$EC2_IP"
        echo ""
    fi
}

# =============================================================================
# LOGS - View logs (interactive menu)
# =============================================================================
logs() {
    echo ""
    echo "Select log to view:"
    echo "  1) PM2 all services (live)     ~/.pm2/logs/"
    echo "  2) Redis                       ~/.pm2/logs/tiphub-redis-*.log"
    echo "  3) Node.js                     ~/.pm2/logs/tiphub-node-*.log"
    echo "  4) Python (uvicorn)            ~/.pm2/logs/tiphub-python-*.log"
    echo "  5) Celery                      ~/.pm2/logs/tiphub-celery-*.log"
    echo "  6) Nginx access                /var/log/nginx/access.log"
    echo "  7) Nginx error                 /var/log/nginx/error.log"
    echo "  8) PM2 logrotate               ~/.pm2/logs/pm2-logrotate-*.log"
    echo ""
    read -p "Enter choice [1-8]: " choice

    case $choice in
        1) pm2 logs --lines 100 ;;
        2) pm2 logs tiphub-redis --lines 100 ;;
        3) pm2 logs tiphub-node --lines 100 ;;
        4) pm2 logs tiphub-python --lines 100 ;;
        5) pm2 logs tiphub-celery --lines 100 ;;
        6) sudo tail -f /var/log/nginx/access.log ;;
        7) sudo tail -f /var/log/nginx/error.log ;;
        8) pm2 logs pm2-logrotate --lines 100 ;;
        *) error "Invalid choice" ;;
    esac
}

# =============================================================================
# UPDATE - Pull latest and rebuild
# =============================================================================
update() {
    echo ""
    log "Updating Tiphub..."

    # Ensure uv is in PATH
    export PATH="$HOME/.local/bin:$PATH"

    log "Pulling latest code..."
    git pull

    log "Installing dependencies..."
    npm install
    uv sync

    log "Building..."
    if ! npm run build; then
        error "Build failed! Aborting update — current version is still running."
        exit 1
    fi

    # Sync nginx config if changed
    log "Syncing nginx config..."
    if [ -f "nginx/nginx.conf" ]; then
        sudo cp nginx/nginx.conf /etc/nginx/nginx.conf
    fi
    if sudo test -f "/etc/letsencrypt/live/tiphub.ai/fullchain.pem"; then
        NGINX_CONF="nginx/tiphub.conf"
    elif sudo test -f "/etc/ssl/mycerts/cloudflare.crt"; then
        NGINX_CONF="nginx/tiphub.conf"
    else
        NGINX_CONF="nginx/tiphub-http.conf"
    fi
    if [ -f "$NGINX_CONF" ]; then
        sudo cp "$NGINX_CONF" /etc/nginx/sites-available/tiphub.conf
        sudo nginx -t && sudo systemctl reload nginx
        log "Nginx config updated and reloaded"
    fi

    log "Restarting services..."
    restart

    log "Update complete!"
}

# =============================================================================
# HELP
# =============================================================================
show_help() {
    echo ""
    echo "Tiphub Deployment Script"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  install  - Install EC2 dependencies (Node, nginx, Redis, PM2, uv)"
    echo "  setup    - Configure nginx, PM2, log rotation, build app"
    echo "  start    - Start all services"
    echo "  stop     - Stop all services"
    echo "  restart  - Restart all services"
    echo "  status   - Check status of all services"
    echo "  logs     - View logs (interactive menu)"
    echo "  update   - Pull latest code and rebuild"
    echo ""
    echo "First-time deployment:"
    echo "  1. ./scripts/deploy.sh install"
    echo "  2. ./scripts/deploy.sh setup"
    echo "  3. ./scripts/deploy.sh start"
    echo ""
}

# =============================================================================
# MAIN
# =============================================================================
case "${1:-help}" in
    install) install_deps ;;
    setup)   setup ;;
    start)   start ;;
    stop)    stop ;;
    restart) restart ;;
    status)  status ;;
    logs)    logs ;;
    update)  update ;;
    help|--help|-h) show_help ;;
    *)
        error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
