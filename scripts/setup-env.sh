#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 AirBear Environment Setup${NC}"
echo -e "${YELLOW}===========================${NC}\n"

# Function to create .env file
setup_env() {
    local env_file=$1
    local is_production=$2
    
    if [ -f "$env_file" ]; then
        echo -e "${YELLOW}⚠️  $env_file already exists. Backing up to ${env_file}.bak${NC}"
        cp "$env_file" "${env_file}.bak"
    fi
    
    echo -e "\n${GREEN}🔧 Setting up $env_file${NC}"
    
    # Common variables
    NODE_ENV=$([ "$is_production" = true ] && echo "production" || echo "development")
    PORT=$([ "$is_production" = true ] && echo "3000" || echo "5000")
    
    # Prompt for Supabase
    read -p "Enter Supabase URL: " SUPABASE_URL
    read -p "Enter Supabase Anon Key: " SUPABASE_ANON_KEY
    read -p "Enter Supabase Service Role Key: " SUPABASE_SERVICE_ROLE_KEY
    
    # Prompt for Stripe
    read -p "Enter Stripe Public Key: " STRIPE_PUBLIC_KEY
    read -p "Enter Stripe Secret Key: " STRIPE_SECRET_KEY
    
    # Prompt for JWT secret
    read -p "Enter JWT Secret (press enter to generate a random one): " JWT_SECRET
    if [ -z "$JWT_SECRET" ]; then
        JWT_SECRET=$(openssl rand -base64 32)
        echo -e "${GREEN}🔑 Generated JWT Secret: $JWT_SECRET${NC}"
    fi
    
    # For production, ask for additional settings
    if [ "$is_production" = true ]; then
        read -p "Enter Production Database URL: " DATABASE_URL
        read -p "Enter Allowed CORS Origins (comma-separated): " CORS_ORIGINS
        read -p "Enter Mapbox Access Token (optional): " MAPBOX_ACCESS_TOKEN
    fi
    
    # Write to .env file
    cat > "$env_file" <<EOL
# ===========================================================================
# ${env_file} - ${NODE_ENV} Environment
# ===========================================================================

# Server Configuration
# ===================
NODE_ENV=${NODE_ENV}
PORT=${PORT}
HOST=0.0.0.0

# Supabase Configuration
# ====================
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}

# Stripe Configuration
# ===================
STRIPE_PUBLIC_KEY=${STRIPE_PUBLIC_KEY}
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}

# JWT Configuration
# ================
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=30d

# CORS Configuration
# =================
CORS_ORIGIN=${CORS_ORIGINS:-http://localhost:${PORT},http://localhost:5173}
EOL

    # Add production-specific settings
    if [ "$is_production" = true ]; then
        cat >> "$env_file" <<EOL

# Production Configuration
# =======================
DATABASE_URL="${DATABASE_URL}"

# Map Services
# ============
MAPBOX_ACCESS_TOKEN=${MAPBOX_ACCESS_TOKEN}

# Security
# ========
COOKIE_SECURE=true
COOKIE_HTTP_ONLY=true

# Logging
# =======
LOG_LEVEL=info

# Feature Flags
# ============
ENABLE_MAINTENANCE_MODE=false
EOL
    else
        # Development specific settings
        cat >> "$env_file" <<EOL

# Development Configuration
# ========================
DATABASE_URL="${DATABASE_URL}"

# Map Services
# ============
MAPBOX_ACCESS_TOKEN=${MAPBOX_ACCESS_TOKEN:-your_mapbox_token}

# Logging
# =======
LOG_LEVEL=debug

# Development Tools
# ================
DEBUG=app:*,api:*,db:*
EOL
    fi
    
    echo -e "\n${GREEN}✅ Successfully created ${env_file}${NC}"
}

# Main script
if [ "$1" = "--production" ] || [ "$1" = "-p" ]; then
    setup_env ".env.production" true
else
    setup_env ".env" false
fi

# Make the script executable
chmod +x "$0"

echo -e "\n${GREEN}✨ Environment setup complete!${NC}"
echo -e "\nNext steps:"
echo "1. Review the generated .env file(s)"
echo "2. Start the development server: npm run dev"
echo -e "3. For production, make sure to set up your web server (Nginx/Apache) to serve the app\n"
