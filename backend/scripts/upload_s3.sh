#!/bin/bash
if [ -z "$BUCKET" ]; then
    echo "Error: BUCKET environment variable is not set."
    exit 1
fi

# Determine the absolute path to the data directory based on script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

aws s3 sync "$PROJECT_ROOT/data/raw" "s3://$BUCKET/raw/" --profile thirstcast
aws s3 sync "$PROJECT_ROOT/data/out/replay" "s3://$BUCKET/replay/" --profile thirstcast
