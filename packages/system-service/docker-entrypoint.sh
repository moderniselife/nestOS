#!/bin/bash

log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1"
}

# Add libvirt bin to PATH
export PATH="/usr/sbin:/sbin:/usr/bin:/bin:$PATH"

# Initialize VM support variables
VM_SUPPORT=false
VM_PROVIDER="none"

# Try libvirt first
log_info "Attempting to start libvirt daemon..."
libvirtd --listen &>/dev/null &
LIBVIRT_PID=$!
sleep 2

if kill -0 $LIBVIRT_PID 2>/dev/null; then
    log_info "Libvirt daemon started successfully"
    VM_PROVIDER="libvirt"
    VM_SUPPORT=true

    # Wait for libvirt socket
    timeout=30
    while [ $timeout -gt 0 ]; do
        if [ -S /var/run/libvirt/libvirt-sock ]; then
            log_info "Libvirt socket is ready"
            break
        fi
        log_info "Waiting for libvirt socket... ($timeout seconds left)"
        sleep 1
        timeout=$((timeout - 1))
    done

    if [ $timeout -eq 0 ]; then
        log_error "Libvirt socket not available - will try QEMU"
        VM_PROVIDER="none"
        VM_SUPPORT=false
    elif virsh pool-info default >/dev/null 2>&1; then
        log_info "Default storage pool already exists"
    else
        log_info "Creating default storage pool"
        if ! virsh pool-define-as --name default --type dir --target /var/lib/libvirt/images || \
           ! virsh pool-build default || \
           ! virsh pool-start default || \
           ! virsh pool-autostart default; then
            log_error "Failed to create storage pool - will try QEMU"
            VM_PROVIDER="none"
            VM_SUPPORT=false
        fi
    fi
else
    log_error "Failed to start libvirt daemon - will try QEMU"
    VM_PROVIDER="none"
    VM_SUPPORT=false
fi

# Try QEMU if libvirt failed
if [ "$VM_PROVIDER" = "none" ]; then
    log_info "Checking for QEMU availability..."
    if command -v qemu-system-x86_64 >/dev/null 2>&1; then
        log_info "QEMU is available - using QEMU directly"
        VM_PROVIDER="qemu"
        VM_SUPPORT=true
        mkdir -p /var/lib/libvirt/images
        mkdir -p /tmp/qemu-pids
    else
        log_error "QEMU is not available - VM support will be disabled"
        VM_PROVIDER="none"
        VM_SUPPORT=false
    fi
fi

# Ensure required directories exist regardless of provider
mkdir -p /var/lib/libvirt/images

# Export VM configuration for the application
export VM_SUPPORT
export VM_PROVIDER

log_info "Starting application with VM_SUPPORT=$VM_SUPPORT and VM_PROVIDER=$VM_PROVIDER"

# Set up signal handling
cleanup() {
    log_info "Shutting down services..."
    if [ "$VM_PROVIDER" = "libvirt" ] && [ -n "$LIBVIRT_PID" ] && kill -0 $LIBVIRT_PID 2>/dev/null; then
        kill $LIBVIRT_PID
    fi
    exit 0
}

trap cleanup SIGTERM SIGINT

# Start the application and wait
"$@" &
APP_PID=$!

# Wait for the application to finish
wait $APP_PID || true