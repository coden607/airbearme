#!/bin/bash
cd $(dirname "$0")
npm install --production
NODE_ENV=production node dist/server/index.cjs
