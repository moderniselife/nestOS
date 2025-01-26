#!/bin/bash
set -e

# Add libvirt bin to PATH
export PATH="/usr/sbin:/sbin:/usr/bin:/bin:$PATH"

# Start libvirt daemon in foreground mode
libvirtd --listen &
sleep 2

# Try to start libvirt and set up VM support
VM_SUPPORT=true

# Wait for libvirt socket
timeout=10
while [ $timeout -gt 0 ]; do
    if [ -S /var/run/libvirt/libvirt-sock ]; then
        echo "Libvirt socket is ready"
        break
    fi
    echo "Waiting for libvirt socket... ($timeout seconds left)"
    sleep 1
    timeout=$((timeout - 1))
done

if [ $timeout -eq 0 ]; then
    echo "Libvirt socket not available - VM support will be disabled"
    VM_SUPPORT=false
elif virsh pool-info default >/dev/null 2>&1; then
    echo "Default storage pool already exists"
else
    echo "Creating default storage pool"
    if ! virsh pool-define-as --name default --type dir --target /var/lib/libvirt/images || \
       ! virsh pool-build default || \
       ! virsh pool-start default || \
       ! virsh pool-autostart default; then
        echo "Failed to create storage pool - VM support will be disabled"
        VM_SUPPORT=false
    fi
fi

# Export VM support status for the application
export VM_SUPPORT

# Start the application
exec "$@"