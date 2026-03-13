#!/bin/bash

# Create a clean deployment directory
rm -rf airbear-deployment
mkdir -p airbear-deployment

# Copy necessary files
cp -r dist airbear-deployment/
cp package*.json airbear-deployment/
cp .env.production airbear-deployment/.env

# Create a start script
cat > airbear-deployment/start.sh << 'EOL'
#!/bin/bash
cd $(dirname "$0")
npm install --production
NODE_ENV=production node dist/server/index.cjs
EOL

# Make the start script executable
chmod +x airbear-deployment/start.sh

# Create a tarball
tar -czvf airbear-pwa.tar.gz -C airbear-deployment .

echo "Deployment package created: airbear-pwa.tar.gz"
