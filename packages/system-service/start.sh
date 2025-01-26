#!/bin/bash

# Enable debug output
set -x

# Add libvirt bin to PATH
export PATH="/usr/sbin:/sbin:/usr/bin:/bin:$PATH"

echo "Current PATH: $PATH"

# Debug: Show system information
echo "System information:"
uname -a
cat /etc/os-release

# Debug: Show libvirt and qemu versions
echo "Libvirt version:"
libvirtd --version || echo "libvirtd not found"
echo "QEMU version:"
qemu-system-x86_64 --version || echo "qemu not found"

# Debug: Show installed packages
echo "Installed packages:"
dpkg -l | grep -i "libvirt\|qemu\|virt"

# Debug: Show binary locations
echo "Binary locations:"
which virsh
which qemu-img
which libvirtd
which virt-install

# Debug: Show libvirt directories
echo "Libvirt directories:"
ls -la /var/run/libvirt
ls -la /var/lib/libvirt
ls -la /etc/libvirt

# Start libvirt daemon directly
echo "Starting libvirt daemon..."
libvirtd -d
sleep 2

# Wait for libvirt socket
echo "Waiting for libvirt socket..."
timeout=30
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
    echo "Timeout waiting for libvirt socket"
    echo "Current socket status:"
    ls -la /var/run/libvirt/
    exit 1
fi

# Verify virsh connectivity
echo "Testing virsh connectivity..."
virsh list --all

# Create default storage pool if it doesn't exist
echo "Setting up default storage pool..."
if ! virsh pool-info default >/dev/null 2>&1; then
    virsh pool-define-as --name default --type dir --target /var/lib/libvirt/images
    virsh pool-build default
    virsh pool-start default
    virsh pool-autostart default
fi

# Show storage pool status
echo "Storage pool status:"
virsh pool-list --all
virsh pool-info default

# Show final system status
echo "Final system status:"
ps aux | grep libvirt
ls -la /var/run/libvirt/
ls -la /var/lib/libvirt/images/

# Start the application
echo "Starting application..."
exec npm run dev