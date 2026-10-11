#!/usr/bin/env bash
# ThirstCast Amplify redeployment script
# App: d2hlw69ycq26ka (https://main.d2hlw69ycq26ka.amplifyapp.com)
set -euo pipefail

APP_ID="d2hlw69ycq26ka"
BRANCH_NAME="main"
REGION="ap-south-1"

echo "📦 1. Packaging frontend into frontend.zip..."
(cd frontend && zip -r -q ../frontend.zip . -x "node_modules/*" -x "tests/*" -x "scripts/*" -x "test-results/*" -x ".*")
echo "   frontend.zip created ($(du -h frontend.zip | cut -f1))"

echo "🚀 2. Creating deployment with AWS Amplify..."
DEPLOY_RES=$(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH_NAME" --region "$REGION" "$@")
JOB_ID=$(echo "$DEPLOY_RES" | jq -r '.jobId')
ZIP_URL=$(echo "$DEPLOY_RES" | jq -r '.zipUploadUrl')

echo "   Job ID: $JOB_ID"
echo "☁️  3. Uploading frontend.zip to S3..."
curl -s -T frontend.zip -H "Content-Type: application/zip" "$ZIP_URL"

echo "⚡ 4. Starting Amplify deployment..."
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH_NAME" --job-id "$JOB_ID" --region "$REGION" "$@"

echo "✅ Deployment triggered! Live site will update in ~60 seconds:"
echo "   👉 https://main.d2hlw69ycq26ka.amplifyapp.com"
