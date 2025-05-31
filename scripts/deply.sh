# scripts/deploy.sh
#!/bin/bash

# Workflow Engine Production Deployment Script

set -e

echo "🚀 Starting Workflow Engine Deployment..."

# Configuration
PROJECT_ROOT=$(pwd)
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
DEPLOY_USER=${DEPLOY_USER:-"workflow"}
DEPLOY_HOST=${DEPLOY_HOST:-"your-server.com"}
DEPLOY_PATH=${DEPLOY_PATH:-"/opt/workflow-engine"}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 is not installed"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

# Build frontend
build_frontend() {
    log_info "Building frontend..."
    cd "$FRONTEND_DIR"
    
    # Install dependencies
    npm ci --production
    
    # Build for production
    npm run build
    
    cd "$PROJECT_ROOT"
    log_info "Frontend build completed"
}

# Prepare backend
prepare_backend() {
    log_info "Preparing backend..."
    cd "$BACKEND_DIR"
    
    # Create virtual environment
    python3 -m venv venv
    source venv/bin/activate
    
    # Install dependencies
    pip install --upgrade pip
    pip install -r requirements.txt
    
    # Run migrations (if using SQLAlchemy)
    # alembic upgrade head
    
    cd "$PROJECT_ROOT"
    log_info "Backend preparation completed"
}

# Deploy to server
deploy_to_server() {
    log_info "Deploying to server..."
    
    # Create deployment package
    tar -czf workflow-engine.tar.gz \
        --exclude='*.pyc' \
        --exclude='__pycache__' \
        --exclude='venv' \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='*.log' \
        backend frontend scripts config data
    
    # Copy to server
    scp workflow-engine.tar.gz $DEPLOY_USER@$DEPLOY_HOST:/tmp/
    
    # Execute deployment on server
    ssh $DEPLOY_USER@$DEPLOY_HOST << 'EOF'
        set -e
        
        # Create deployment directory
        sudo mkdir -p $DEPLOY_PATH
        sudo chown $DEPLOY_USER:$DEPLOY_USER $DEPLOY_PATH
        
        # Extract files
        cd $DEPLOY_PATH
        tar -xzf /tmp/workflow-engine.tar.gz
        rm /tmp/workflow-engine.tar.gz
        
        # Set up backend
        cd backend
        python3 -m venv venv
        source venv/bin/activate
        pip install -r requirements.txt
        
        # Create necessary directories
        mkdir -p ../data/{projects,references,samples,cache,lora_datasets,models}
        mkdir -p ../logs
        mkdir -p ../config/{nodes,workflows}
        
        echo "Deployment completed on server"
EOF
    
    log_info "Server deployment completed"
}

# Main execution
main() {
    check_prerequisites
    build_frontend
    prepare_backend
    
    if [ "$1" == "--local" ]; then
        log_info "Local deployment completed"
    else
        deploy_to_server
        log_info "Remote deployment completed"
    fi
}

main "$@"