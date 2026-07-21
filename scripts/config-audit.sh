#!/bin/bash

# Stellar Insights Configuration Audit Script
# Scans the repository for sensitive placeholders and validates configuration patterns.

COLOR_RED='\033[0;31m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[0;33m'
COLOR_RESET='\033[0m'

echo -e "${COLOR_YELLOW}🚀 Starting Repo-wide Config Audit...${COLOR_RESET}"

EXIT_CODE=0

# 1. Search for hardcoded placeholders in production-grade files
echo -e "\n${COLOR_YELLOW}🔍 Checking for placeholders...${COLOR_RESET}"
PLACEHOLDERS=("CHANGE_ME" "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" "your-vault-token")

for placeholder in "${PLACEHOLDERS[@]}"; do
    grep -r "$placeholder" . --exclude-dir={node_modules,target,.git,.next} --exclude="*.md" --exclude="*.sh"
    if [ $? -eq 0 ]; then
        echo -e "${COLOR_RED}❌ Found placeholder '$placeholder' in the codebase!${COLOR_RESET}"
        EXIT_CODE=1
    fi
done

# 2. Check for missing .env.example variables
echo -e "\n${COLOR_YELLOW}🔍 Checking .env.example consistency...${COLOR_RESET}"
REQUIRED_BACKEND_VARS=("DATABASE_URL" "ENCRYPTION_KEY" "JWT_SECRET" "APP_ENV" "VAULT_ADDR" "VAULT_TOKEN")

if [ -f "backend/.env.example" ]; then
    for var in "${REQUIRED_BACKEND_VARS[@]}"; do
        grep -q "$var" "backend/.env.example"
        if [ $? -ne 0 ]; then
            echo -e "${COLOR_RED}❌ Missing required variable '$var' in backend/.env.example${COLOR_RESET}"
            EXIT_CODE=1
        fi
    done
else
    echo -e "${COLOR_YELLOW}⚠️  backend/.env.example not found, skipping.${COLOR_RESET}"
fi

# 3. Check for mobile insecure fallbacks
echo -e "\n${COLOR_YELLOW}🔍 Checking mobile insecure fallbacks...${COLOR_RESET}"
grep -r "Config.*||.*'http://localhost" mobile/src --exclude-dir={node_modules}
if [ $? -eq 0 ]; then
    echo -e "${COLOR_YELLOW}⚠️  Found potential insecure fallbacks in mobile app. Ensure validateConfig() is active.${COLOR_RESET}"
fi

# Summary
echo -e "\n---"
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${COLOR_GREEN}✅ Audit Complete: No critical configuration leaks detected.${COLOR_RESET}"
else
    echo -e "${COLOR_RED}❌ Audit Failed: Critical issues found. Please fix before merging.${COLOR_RESET}"
fi

exit $EXIT_CODE
