#!/bin/bash

# Go to current script directory
cd "$(dirname "$0")"

set -e

CONFIG="../project_config.yaml"

VENV_PATH=$(grep 'venv_path:' "$CONFIG" | awk '{print $2}')
if [ -n "$VENV_PATH" ] && [ "$VENV_PATH" != "null" ]; then
    source "$VENV_PATH/bin/activate"
fi

PORT=$(grep 'port:' "$CONFIG" | awk '{print $2}')

echo "Starting backend on port $PORT..."
uvicorn main:app --reload --port "$PORT"
