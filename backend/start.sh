#!/bin/bash

# Go to current script directory
cd "$(dirname "$0")"

set -e

source /Users/michi/.uv/uv_venvs/mana_back/bin/activate

PORT=$(grep 'port:' "$(dirname "$0")/../project_config.yaml" | awk '{print $2}')

echo "Starting backend on port $PORT..."
uvicorn main:app --reload --port "$PORT"
