#!/bin/bash
set -e

# Build the test container
docker build -t iso-builder-test -f Dockerfile.test .

# Run the container with privileged mode
docker run --privileged \
    -v "$(pwd)/templates:/app/templates" \
    --rm -v "$(pwd):/app" \
    -v /app/node_modules \
    -v /app/build \
    -v "$(pwd)/output:/output" \
    iso-builder-test npm run build:iso