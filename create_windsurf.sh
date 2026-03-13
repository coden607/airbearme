#!/usr/bin/env bash
set -e

echo "[*] Creating Windsurf customizations..."

mkdir -p .windsurf/rules
mkdir -p .windsurf/memories
mkdir -p .windsurf/workflows

# ------------------- RULES -------------------

cat > .windsurf/rules/global_rules.md << 'EOR'
Be direct and code-first. Assume expert. No fluff. Fix errors silently. Auto-create, modify, or delete files when needed. Maintain PWA functionality and optimize builds automatically. When user uses "$", enhance, refactor, debug, and future-proof until flawless.
EOR

cat > .windsurf/rules/workspace_rules.md << 'EOR'
This project is AirBear, a full-stack PWA. You control and modify all workspace files. Auto-fix imports, config, TypeScript, Supabase, and build issues. Automate testing, debugging, optimizing, and deployment prep for IONOS. Never ask for permission—implement directly. Show only changed lines unless a full file is required.
EOR

# ------------------- MEMORIES -------------------

cat > .windsurf/memories/deployment_target.md << 'EOR'
Deploy AirBear to IONOS using DeployNow or FTP. Always prepare production builds.
EOR

cat > .windsurf/memories/automation_behavior.md << 'EOR'
Auto-repair all build errors and workspace issues without stopping or asking.
EOR

cat > .windsurf/memories/pwa_requirements.md << 'EOR'
Maintain service worker, manifest, icons, offline fallback, and installability.
EOR

cat > .windsurf/memories/code_output_rules.md << 'EOR'
Output code first and only changed lines unless entire file is required.
EOR

cat > .windsurf/memories/dollar_directive.md << 'EOR'
"$" means enhance, optimize, refactor, and debug until flawless.
EOR

# ------------------- WORKFLOWS -------------------

cat > .windsurf/workflows/deploy.md << 'EOR'
Build the AirBear PWA, fix any build errors automatically, optimize assets, ensure service worker and manifest are valid, then generate a production-ready folder for IONOS DeployNow or FTP upload.
EOR

cat > .windsurf/workflows/fix_build.md << 'EOR'
Scan the workspace for errors. Auto-fix imports, TypeScript, config, missing modules, and PWA issues. Retry the build until successful.
EOR

cat > .windsurf/workflows/optimize.md << 'EOR'
Perform a full optimization pass: minify, remove dead code, improve load speed, fix manifest/icons, optimize PWA caching, and tighten security.
EOR

cat > .windsurf/workflows/push.md << 'EOR'
Run format and lint, stage all changes, commit with message, push to GitHub, ensure clean state.
EOR

cat > .windsurf/workflows/enhance.md << 'EOR'
Enhance, refactor, debug, and future-proof the code until flawless. Remove tech debt and improve reliability.
EOR

echo "[✓] Windsurf configuration installed."

echo "[*] Adding to git..."
git add .windsurf || true

echo "[*] Committing..."
git commit -m "Add Windsurf custom rules, memories, and workflows" || true

echo "[*] Pushing to current branch..."
git push || true

echo "[✓] All done."
