import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPrivilegedCommand } from '@/utils/runPrivilegedCommand.js';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import multipart from '@fastify/multipart';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const VM_DIR = '/etc/qemu/vms';
const ISO_DIR = '/etc/qemu/isos';
const VIRTIO_ISO_PATH = path.join(ISO_DIR, 'virtio-win.iso');
const VIRTIO_ISO_URL = 'https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/stable-virtio/virtio-win.iso';

const vmSchema = z.object({
    name: z.string(),
    cpu: z.number().min(1),
    memory: z.number().min(512), // MB
    disk: z.number().min(1), // GB
    iso: z.string().optional(),
    network: z.object({
        type: z.enum(['user', 'bridge']),
        bridge: z.string().optional(),
    }).optional(),
    vnc: z.boolean().optional(),
    useKvm: z.boolean().optional(),
    cpuModel: z.string().optional(),
    template: z.string().optional(),
    leechcore: z.object({
        enabled: z.boolean(),
        shmName: z.string().optional(),
        qmpSocket: z.string().optional(),
    }).optional(),
});

// Add template configurations
const VM_TEMPLATES = {
    windows10: {
        cpu: 2,
        memory: 4096,
        disk: 64,
        network: { type: 'user' },
        vnc: true,
        extraArgs: [
            '-device', 'virtio-gpu-pci',
            '-device', 'virtio-net-pci',
            '-device', 'virtio-balloon-pci',
            '-device', 'virtio-keyboard-pci',
            '-device', 'virtio-mouse-pci',
            '-usb',
            '-device', 'usb-tablet'
        ],
        useKvm: true,
        cpuModel: 'host'
    },
    debian: {
        cpu: 1,
        memory: 2048,
        disk: 20,
        network: { type: 'user' },
        vnc: true,
        extraArgs: [
            '-cpu', 'host',
            '-device', 'virtio-net-pci',
            '-device', 'virtio-balloon-pci'
        ],
        useKvm: true,
        cpuModel: 'host'
    },
    macos: {
        cpu: 4,
        memory: 8192,
        disk: 64,
        network: { type: 'user' },
        vnc: true,
        extraArgs: [
            '-machine', 'q35',
            '-global', 'ICH9-LPC.acpi-pci-hotplug-with-bridge-support=off',
            '-cpu', 'Penryn,kvm=on,vendor=GenuineIntel,+invtsc,vmware-cpuid-freq=on,+ssse3,+sse4.2,+popcnt,+avx,+aes,+xsave,+xsaveopt,check',
            '-device', 'isa-applesmc,osk="ourhardworkbythesewordsguardedpleasedontsteal(c)AppleComputerInc"',
            '-smbios', 'type=2',
            '-device', 'ich9-intel-hda',
            '-device', 'hda-duplex',
            '-device', 'ich9-ahci,id=sata',
            '-global', 'nec-usb-xhci.msi=off',
            '-global', 'ICH9-LPC.acpi-pci-hotplug-with-bridge-support=off',
            '-device', 'usb-kbd',
            '-device', 'usb-tablet'
        ],
        useKvm: true,
        cpuModel: 'Penryn'
    }
};

const MACOS_REQUIRED_FILES = {
    'BaseSystem.img': 'Base system image',
    'ESP.qcow2': 'EFI System Partition',
    'OpenCore.qcow2': 'OpenCore bootloader'
};

const MACOS_REQUIRED_CPU_FLAGS = [
    'vmx',          // Intel VT-x
    'sse4_1',      // SSE 4.1
    'sse4_2',      // SSE 4.2
    'aes',         // AES-NI
    'xsave',       // XSAVE
    'avx',         // Advanced Vector Extensions
];

const MACOS_SETUP_COMMANDS = {
    kvm_module: 'modprobe kvm',
    kvm_ignore_msrs: 'echo 1 > /sys/module/kvm/parameters/ignore_msrs',
    kvm_config: 'cp kvm.conf /etc/modprobe.d/kvm.conf',
    kvm_amd_config: 'cp kvm_amd.conf /etc/modprobe.d/kvm.conf',
    user_groups: [
        'usermod -aG kvm $USER',
        'usermod -aG libvirt $USER',
        'usermod -aG input $USER'
    ],
    required_packages: [
        'qemu-system',
        'uml-utilities',
        'virt-manager',
        'git',
        'wget',
        'libguestfs-tools',
        'p7zip-full',
        'make',
        'dmg2img',
        'tesseract-ocr',
        'tesseract-ocr-eng',
        'genisoimage',
        'vim',
        'net-tools',
        'screen'
    ]
};


// Add to existing qemuRoutes
export const qemuRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // Register multipart support
    await fastify.register(multipart, {
        limits: {
            fileSize: 10737418240 // 10GB limit for ISO files
        }
    });

    // List VMs
    fastify.get('/vms', async () => {
        try {
            await fs.mkdir(VM_DIR, { recursive: true });
            const vms = await fs.readdir(VM_DIR);
            const vmList = await Promise.all(
                vms.map(async (vm) => {
                    try {
                        const configPath = path.join(VM_DIR, vm, 'config.json');
                        const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
                        const status = await getVMStatus(vm);
                        return { ...config, status };
                    } catch (error) {
                        // Clean up corrupted VM directory
                        await fs.rm(path.join(VM_DIR, vm), { recursive: true, force: true });
                        console.warn(`Removed corrupted VM directory "${vm}"`);
                        return null;
                    }
                })
            );
            return vmList.filter(vm => vm !== null);
        } catch (error) {
            throw new Error(`Failed to list VMs: ${error}`);
        }
    });

    // Create VM
    fastify.post('/vms', async (request) => {
        const vm = vmSchema.parse(request.body);
        // Sanitize VM name to be filesystem-friendly
        const sanitizedName = vm.name.replace(/\s+/g, '-');
        const vmPath = path.join(VM_DIR, sanitizedName);

        if (vm.leechcore?.enabled) {
            try {
                await setupLeechCorePlugins();
            } catch (error) {
                throw new Error(`Failed to setup LeechCore and plugins: ${error}`);
            }
        }

        // Check if virtio drivers exist
        if (!fsSync.existsSync(VIRTIO_ISO_PATH)) {
            try {
                await downloadVirtIODrivers();
            } catch (error) {
                console.warn('Failed to download VirtIO drivers:', error);
            }
        }

        try {
            // Create VM directory
            await fs.mkdir(vmPath, { recursive: true });

            // Create disk image with proper size format
            await runPrivilegedCommand(
                `qemu-img create -f qcow2 ${path.join(vmPath, 'disk.qcow2')} ${vm.disk}G`
            );

            // Save VM configuration with original name
            await fs.writeFile(
                path.join(vmPath, 'config.json'),
                JSON.stringify({ ...vm, path: vmPath }, null, 2)
            );

            const logPath = path.join(vmPath, 'qemu.log');
            const config = JSON.parse(await fs.readFile(path.join(vmPath, 'config.json'), 'utf-8'));
            const qemuCmd = await buildQEMUCommand(vm.name, config);

            // Log the command being executed
            await fs.appendFile(logPath, `[${new Date().toISOString()}] Starting VM with command:\n${qemuCmd}\n\n`);

            // Run QEMU in background and redirect output to log file
            await runPrivilegedCommand(`${qemuCmd} > ${logPath} 2>&1`);

            // Wait a moment and check if the process started
            await new Promise(resolve => setTimeout(resolve, 1000));
            const isRunning = await getVMStatus(vm.name);

            if (isRunning !== 'running') {
                throw new Error('Failed to start VM: QEMU process not found after launch');
            }

            return { status: 'created and started', name: vm.name };
        } catch (error) {
            throw new Error(`Failed to create VM: ${error}`);
        }
    });

    // fastify.get('/cpus', async () => {
    //     try {
    //         // Run the QEMU commands that output the available CPU models
    //         const x86Output = await runPrivilegedCommand('qemu-system-x86_64 -cpu help');
    //         const armOutput = await runPrivilegedCommand('qemu-system-arm -cpu help');

    //         const cpus: Array<{ model: string; architecture: 'x86_64' | 'arm'; description: string }> = [];

    //         // Process x86 CPUs
    //         const x86Lines = x86Output.split('\n');
    //         for (const line of x86Lines) {
    //             const trimmed = line.trim();
    //             if (!trimmed || trimmed.toLowerCase().includes('supported') || trimmed.toLowerCase().includes('usage')) {
    //                 continue;
    //             }

    //             const parts = trimmed.split(/\s{2,}/);
    //             if (parts.length >= 1) {
    //                 const model = parts[0];
    //                 const description = parts.slice(1).join(' ');
    //                 cpus.push({
    //                     model: model.replace('x86 ', ''),
    //                     architecture: 'x86_64',
    //                     description
    //                 });
    //             }
    //         }

    //         // Process ARM CPUs
    //         const armLines = armOutput.split('\n');
    //         for (const line of armLines) {
    //             const trimmed = line.trim();
    //             if (!trimmed || trimmed.toLowerCase().includes('available') || trimmed === 'CPUs:') {
    //                 continue;
    //             }

    //             cpus.push({
    //                 model: trimmed,
    //                 architecture: 'arm',
    //                 description: 'ARM processor'
    //             });
    //         }

    //         return {
    //             status: 'CPUs Available',
    //             cpus: cpus.sort((a, b) => a.model.localeCompare(b.model))
    //         };
    //     } catch (error: any) {
    //         console.error('Error getting CPU list:', error);
    //         throw new Error('Failed to get CPU list: ' + error.message);
    //     }
    // });

    fastify.get('/cpus', async () => {
        try {
            const x86Output = await runPrivilegedCommand('qemu-system-x86_64 -cpu help');
            const armOutput = await runPrivilegedCommand('qemu-system-arm -cpu help');

            type CPU = {
                model: string;
                architecture: 'x86_64' | 'arm';
                description: string;
            };

            const cpuCategories = {
                'x86 Common': [] as CPU[],
                'x86 Intel': [] as CPU[],
                'x86 AMD': [] as CPU[],
                'ARM Cortex-A': [] as CPU[],
                'ARM Cortex-M': [] as CPU[],
                'ARM Cortex-R': [] as CPU[],
                'ARM Legacy': [] as CPU[],
            };

            type CPUCategory = keyof typeof cpuCategories;
            const baseModelCategories = new Map<string, CPUCategory>();

            // Process x86 CPUs
            const x86Lines = x86Output.split('\n');
            let skipRemaining = false;

            // First pass: collect base models and their categories
            for (const line of x86Lines) {
                const trimmed = line.trim();
                if (trimmed.toLowerCase().includes('recognized cpuid flags:')) {
                    skipRemaining = true;
                    continue;
                }
                if (skipRemaining || !trimmed ||
                    trimmed.toLowerCase().includes('available') ||
                    trimmed.toLowerCase().includes('supported') ||
                    trimmed.toLowerCase().includes('usage')) {
                    continue;
                }

                const parts = trimmed.split(/\s{2,}/);
                if (parts.length >= 1) {
                    const model = parts[0].replace('x86 ', '');
                    const description = parts.slice(1).join(' ');

                    // If this is a base model (not an alias), determine its category
                    if (!description.includes('(alias of')) {
                        if (model.toLowerCase().includes('intel') || description.toLowerCase().includes('intel')) {
                            baseModelCategories.set(model, 'x86 Intel');
                        } else if (model.toLowerCase().includes('amd') || description.toLowerCase().includes('amd')) {
                            baseModelCategories.set(model, 'x86 AMD');
                        } else {
                            baseModelCategories.set(model, 'x86 Common');
                        }
                    }
                }
            }

            // Second pass: categorize all CPUs including aliases
            skipRemaining = false;
            for (const line of x86Lines) {
                const trimmed = line.trim();
                if (trimmed.toLowerCase().includes('recognized cpuid flags:')) {
                    skipRemaining = true;
                    continue;
                }
                if (skipRemaining || !trimmed ||
                    trimmed.toLowerCase().includes('available') ||
                    trimmed.toLowerCase().includes('supported') ||
                    trimmed.toLowerCase().includes('usage')) {
                    continue;
                }

                const parts = trimmed.split(/\s{2,}/);
                if (parts.length >= 1) {
                    const model = parts[0].replace('x86 ', '');
                    const description = parts.slice(1).join(' ');
                    const cpu = {
                        model,
                        architecture: 'x86_64' as const,
                        description
                    };

                    const aliasMatch = description.match(/\(alias of ([^)]+)\)/);
                    if (aliasMatch) {
                        const baseModel = aliasMatch[1].trim();
                        const category = baseModelCategories.get(baseModel);
                        if (category) {
                            cpuCategories[category].push(cpu);
                            continue;
                        }
                    }

                    // If not an alias or base model not found, categorize normally
                    if (model.toLowerCase().includes('intel') || description.toLowerCase().includes('intel')) {
                        cpuCategories['x86 Intel'].push(cpu);
                    } else if (model.toLowerCase().includes('amd') || description.toLowerCase().includes('amd')) {
                        cpuCategories['x86 AMD'].push(cpu);
                    } else {
                        cpuCategories['x86 Common'].push(cpu);
                    }
                }
            }

            // Process ARM CPUs
            const armLines = armOutput.split('\n');
            for (const line of armLines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.toLowerCase().includes('available') || trimmed === 'CPUs:') {
                    continue;
                }

                const cpu = {
                    model: trimmed,
                    architecture: 'arm' as const,
                    description: 'ARM processor'
                };

                if (trimmed.startsWith('cortex-a')) {
                    cpuCategories['ARM Cortex-A'].push(cpu);
                } else if (trimmed.startsWith('cortex-m')) {
                    cpuCategories['ARM Cortex-M'].push(cpu);
                } else if (trimmed.startsWith('cortex-r')) {
                    cpuCategories['ARM Cortex-R'].push(cpu);
                } else {
                    cpuCategories['ARM Legacy'].push(cpu);
                }
            }

            // Remove empty categories
            const filteredCategories = Object.fromEntries(
                Object.entries(cpuCategories).filter(([_, cpus]) => cpus.length > 0)
            );

            return {
                status: 'CPUs Available',
                categories: filteredCategories
            };
        } catch (error: any) {
            console.error('Error getting CPU list:', error);
            throw new Error('Failed to get CPU list: ', error.message);
        }
    });

    fastify.post('/vms/:name/start', async (request) => {
        const { name } = z.object({ name: z.string() }).parse(request.params);
        const vmPath = path.join(VM_DIR, name);
        const configPath = path.join(vmPath, 'config.json');
        const logPath = path.join(vmPath, 'qemu.log');

        // Check if virtio drivers exist
        if (!fsSync.existsSync(VIRTIO_ISO_PATH)) {
            try {
                await downloadVirtIODrivers();
            } catch (error) {
                console.warn('Failed to download VirtIO drivers:', error);
            }
        }

        try {
            const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
            const qemuCmd = await buildQEMUCommand(name, config);

            if (config.leechcore?.enabled) {
                try {
                    await setupLeechCorePlugins();
                } catch (error) {
                    throw new Error(`Failed to setup LeechCore and plugins: ${error}`);
                }
            }

            // Log the command being executed
            await fs.appendFile(logPath, `[${new Date().toISOString()}] Starting VM with command:\n${qemuCmd}\n\n`);

            // Run QEMU in background and redirect output to log file
            await runPrivilegedCommand(`${qemuCmd} > ${logPath} 2>&1`);

            // Wait a moment and check if the process started
            await new Promise(resolve => setTimeout(resolve, 1000));
            const isRunning = await getVMStatus(name);

            if (isRunning !== 'running') {
                throw new Error('Failed to start VM: QEMU process not found after launch');
            }

            return { status: 'started', name };
        } catch (error) {
            throw new Error(`Failed to start VM: ${error}`);
        }
    });

    // Update the logs endpoint to include the QEMU log file
    fastify.get('/vms/:name/logs', async (request) => {
        const { name } = z.object({ name: z.string() }).parse(request.params);
        try {
            const vmPath = path.join(VM_DIR, name);
            const logPath = path.join(vmPath, 'qemu.log');

            // Get QEMU process ID
            const pid = await runPrivilegedCommand(`pgrep -f "qemu.*${name}"`);
            const status = pid ? 'running' : 'stopped';

            // Read the log file if it exists
            let qemuLogs = '';
            try {
                qemuLogs = await fs.readFile(logPath, 'utf-8');
            } catch {
                qemuLogs = 'No QEMU logs available';
            }

            const logs = [
                `VM Status: ${status}`,
                '---',
                'QEMU Logs:',
                qemuLogs
            ].join('\n');

            return { logs };
        } catch (error) {
            throw new Error(`Failed to get VM logs: ${error}`);
        }
    });

    // Stop VM
    fastify.post('/vms/:name/stop', async (request) => {
        const { name } = z.object({ name: z.string() }).parse(request.params);
        try {
            // First try to get the PID
            const pid = await runPrivilegedCommand(`pgrep -f "qemu.*${name}"`);
            if (!pid) {
                return { status: 'stopped', name }; // VM is already stopped
            }

            try {
                // Try SIGTERM first
                await runPrivilegedCommand(`kill ${pid}`);
            } catch (error) {
                // If process is already gone, consider it stopped
                if ((error as Error).message.includes('No such process')) {
                    return { status: 'stopped', name };
                }
                throw error;
            }

            // Wait a moment and check if process is still running
            await new Promise(resolve => setTimeout(resolve, 2000));

            try {
                const stillRunning = await runPrivilegedCommand(`pgrep -f "qemu.*${name}"`);
                if (stillRunning) {
                    // If still running, force kill
                    await runPrivilegedCommand(`kill -9 ${pid}`);
                }
            } catch {
                // If any error occurs here, the process is probably gone
            }

            return { status: 'stopped', name };
        } catch (error) {
            throw new Error(`Failed to stop VM: ${error}`);
        }
    });

    // Delete VM
    fastify.delete('/vms/:name', async (request) => {
        const { name } = z.object({ name: z.string() }).parse(request.params);
        const vmPath = path.join(VM_DIR, name);

        try {
            await runPrivilegedCommand(`rm -rf ${vmPath}`);
            return { status: 'deleted', name };
        } catch (error) {
            throw new Error(`Failed to delete VM: ${error}`);
        }
    });

    // Get VM status
    fastify.get('/vms/:name/status', async (request) => {
        const { name } = z.object({ name: z.string() }).parse(request.params);
        try {
            const status = await getVMStatus(name);
            return { status };
        } catch (error) {
            throw new Error(`Failed to get VM status: ${error}`);
        }
    });

    // List available ISOs
    fastify.get('/isos', async () => {
        try {
            await fs.mkdir(ISO_DIR, { recursive: true });
            const isos = await fs.readdir(ISO_DIR);
            return isos;
        } catch (error) {
            throw new Error(`Failed to list ISOs: ${error}`);
        }
    });

    // Upload ISO
    fastify.post('/isos', async (request) => {
        const file = await request.file();
        if (!file) {
            throw new Error('No file uploaded');
        }

        const { filename } = file;
        const filepath = path.join(ISO_DIR, filename);

        try {
            await fs.mkdir(ISO_DIR, { recursive: true });
            const writeStream = fsSync.createWriteStream(filepath);

            for await (const chunk of file.file) {
                await new Promise((resolve, reject) => {
                    writeStream.write(chunk, (error) => {
                        if (error) { reject(error); }
                        else { resolve(undefined); }
                    });
                });
            }

            await new Promise((resolve, reject) => {
                writeStream.end((error: unknown) => {
                    if (error) { reject(error); }
                    else { resolve(undefined); }
                });
            });

            return { status: 'success', filename };
        } catch (error) {
            try {
                await fs.unlink(filepath);
                console.error('Failed to upload ISO, cleaned up temporary file:', error);
            } catch (cleanupError) {
                console.error('Failed to upload ISO and cleanup failed:', error, cleanupError);
            }
            throw new Error(`Failed to upload ISO: ${error}`);
        }
    });

    // Delete ISO
    fastify.delete('/isos/:name', async (request) => {
        const { name } = request.params as { name: string };
        const filepath = path.join(ISO_DIR, name);

        try {
            await fs.unlink(filepath);
            return { status: 'success' };
        } catch (error) {
            throw new Error(`Failed to delete ISO: ${error}`);
        }
    });

    // Get VM templates
    fastify.get('/templates', async () => {
        return {
            templates: Object.keys(VM_TEMPLATES).map(id => ({
                id,
                ...VM_TEMPLATES[id as keyof typeof VM_TEMPLATES]
            }))
        };
    });

    // Edit VM configuration
    fastify.put('/vms/:name', async (request) => {
        const { name } = z.object({ name: z.string() }).parse(request.params);
        const vm = vmSchema.parse(request.body);
        const vmPath = path.join(VM_DIR, name);
        const configPath = path.join(vmPath, 'config.json');

        try {
            await fs.writeFile(configPath, JSON.stringify(vm, null, 2));
            return { status: 'updated', name };
        } catch (error) {
            throw new Error(`Failed to update VM: ${error}`);
        }
    });

    fastify.get('/macos/check', async () => {
        const required = [
            'BaseSystem.img',
            'ESP.qcow2',
            'OpenCore.qcow2'
        ];

        const missing = [];
        for (const file of required) {
            if (!fsSync.existsSync(path.join(ISO_DIR, file))) {
                missing.push(file);
            }
        }

        return {
            ready: missing.length === 0,
            missing
        };
    });

    fastify.get('/macos/setup/requirements', async () => {
        try {
            // Check installed packages
            const missingPackages = [];
            for (const pkg of MACOS_SETUP_COMMANDS.required_packages) {
                try {
                    await runPrivilegedCommand(`which ${pkg.split(' ')[0]}`);
                } catch {
                    missingPackages.push(pkg);
                }
            }

            // Check QEMU version
            let qemuVersion = '';
            try {
                qemuVersion = await runPrivilegedCommand('qemu-system-x86_64 --version');
            } catch (error) {
                throw new Error('QEMU is not installed');
            }

            // Check CPU virtualization support
            const cpuInfo = await fs.readFile('/proc/cpuinfo', 'utf-8');
            const hasVT = cpuInfo.includes('vmx') || cpuInfo.includes('svm');
            const hasSSE41 = cpuInfo.includes('sse4_1');
            const hasAVX2 = cpuInfo.includes('avx2');

            // Check KVM configuration
            const kvmExists = fsSync.existsSync('/dev/kvm');
            const kvmMsrsIgnored = fsSync.existsSync('/sys/module/kvm/parameters/ignore_msrs') &&
                (await fs.readFile('/sys/module/kvm/parameters/ignore_msrs', 'utf-8')).trim() === '1';

            return {
                packages: {
                    installed: missingPackages.length === 0,
                    missing: missingPackages,
                    installCommand: missingPackages.length > 0 ?
                        `sudo apt-get install ${missingPackages.join(' ')} -y` : undefined
                },
                qemu: {
                    version: qemuVersion,
                    supported: qemuVersion.includes('8.2') || parseFloat(qemuVersion) >= 8.2
                },
                cpu: {
                    virtualization: hasVT,
                    sse41: hasSSE41,
                    avx2: hasAVX2,
                    supported: hasVT && hasSSE41 && hasAVX2
                },
                kvm: {
                    exists: kvmExists,
                    msrsIgnored: kvmMsrsIgnored,
                    needsConfiguration: !kvmExists || !kvmMsrsIgnored
                }
            };
        } catch (error) {
            throw new Error(`Failed to check macOS requirements: ${error}`);
        }
    });

    fastify.post('/macos/setup/initialize', async () => {
        try {
            // Configure KVM
            await runPrivilegedCommand(MACOS_SETUP_COMMANDS.kvm_module);
            await runPrivilegedCommand(MACOS_SETUP_COMMANDS.kvm_ignore_msrs);

            // Determine CPU type and copy appropriate config
            const cpuInfo = await fs.readFile('/proc/cpuinfo', 'utf-8');
            if (cpuInfo.includes('AMD')) {
                await runPrivilegedCommand(MACOS_SETUP_COMMANDS.kvm_amd_config);
            } else {
                await runPrivilegedCommand(MACOS_SETUP_COMMANDS.kvm_config);
            }

            // Configure user groups
            for (const cmd of MACOS_SETUP_COMMANDS.user_groups) {
                await runPrivilegedCommand(cmd);
            }

            // Create necessary directories
            await fs.mkdir(ISO_DIR, { recursive: true });

            return {
                status: 'success',
                message: 'macOS environment initialized successfully. Please re-login for group changes to take effect.',
                nextSteps: [
                    'Re-login to apply group changes',
                    'Download macOS installer using /macos/setup/fetch',
                    'Convert BaseSystem.dmg to img using /macos/setup/convert'
                ]
            };
        } catch (error) {
            throw new Error(`Failed to initialize macOS environment: ${error}`);
        }
    });

    fastify.post('/macos/setup/fetch', async (request) => {
        const { version } = request.body as { version: string };
        try {
            // Download macOS installer
            await runPrivilegedCommand(`./fetch-macOS-v2.py "${version}"`);

            if (!fsSync.existsSync(path.join(ISO_DIR, 'BaseSystem.dmg'))) {
                throw new Error('BaseSystem.dmg not found after download');
            }

            return {
                status: 'success',
                message: 'macOS installer downloaded successfully',
                nextStep: 'Convert BaseSystem.dmg to img using /macos/setup/convert'
            };
        } catch (error) {
            throw new Error(`Failed to fetch macOS installer: ${error}`);
        }
    });

    fastify.post('/macos/setup/convert', async () => {
        try {
            const baseDmg = path.join(ISO_DIR, 'BaseSystem.dmg');
            const baseImg = path.join(ISO_DIR, 'BaseSystem.img');

            if (!fsSync.existsSync(baseDmg)) {
                throw new Error('BaseSystem.dmg not found. Please download it first.');
            }

            await runPrivilegedCommand(`dmg2img -i ${baseDmg} ${baseImg}`);

            return {
                status: 'success',
                message: 'BaseSystem.dmg converted to img successfully',
                nextStep: 'Create VM using the macOS template'
            };
        } catch (error) {
            throw new Error(`Failed to convert BaseSystem.dmg: ${error}`);
        }
    });

    fastify.get('/macos/requirements', async () => {
        try {
            // Check CPU flags
            const cpuInfo = await fs.readFile('/proc/cpuinfo', 'utf-8');
            const flags = cpuInfo.match(/flags\s+: (.+)/)?.[1]?.split(' ') || [];
            const missingFlags = MACOS_REQUIRED_CPU_FLAGS.filter(flag => !flags.includes(flag));

            // Check KVM
            const kvmExists = fsSync.existsSync('/dev/kvm');
            const kvmPermissions = kvmExists ?
                (await runPrivilegedCommand('ls -l /dev/kvm')).includes('kvm') : false;

            // Check required files
            const missingFiles = [];
            for (const [file, description] of Object.entries(MACOS_REQUIRED_FILES)) {
                if (!fsSync.existsSync(path.join(ISO_DIR, file))) {
                    missingFiles.push({ file, description });
                }
            }

            return {
                cpu: {
                    supported: missingFlags.length === 0,
                    missingFlags
                },
                kvm: {
                    exists: kvmExists,
                    properPermissions: kvmPermissions,
                    fix: kvmExists && !kvmPermissions ?
                        'Run: sudo usermod -aG kvm $USER && sudo chmod 666 /dev/kvm' :
                        undefined
                },
                files: {
                    ready: missingFiles.length === 0,
                    missing: missingFiles
                }
            };
        } catch (error) {
            throw new Error(`Failed to check macOS requirements: ${error}`);
        }
    });

    fastify.post('/macos/setup', async () => {
        try {
            // Set up KVM permissions if needed
            if (fsSync.existsSync('/dev/kvm')) {
                await runPrivilegedCommand('usermod -aG kvm $USER');
                await runPrivilegedCommand('chmod 666 /dev/kvm');
            }

            // Create required directories
            await fs.mkdir(ISO_DIR, { recursive: true });

            return {
                status: 'success',
                message: 'KVM permissions configured. Please upload the required macOS files.',
                requiredFiles: MACOS_REQUIRED_FILES
            };
        } catch (error) {
            throw new Error(`Failed to set up macOS environment: ${error}`);
        }
    });

    fastify.post('/macos/files/:type', async (request) => {
        const { type } = request.params as { type: keyof typeof MACOS_REQUIRED_FILES };
        if (!MACOS_REQUIRED_FILES[type]) {
            throw new Error('Invalid file type');
        }

        const file = await request.file();
        if (!file) {
            throw new Error('No file uploaded');
        }

        const filepath = path.join(ISO_DIR, type);

        try {
            const writeStream = fsSync.createWriteStream(filepath);
            for await (const chunk of file.file) {
                await new Promise((resolve, reject) => {
                    writeStream.write(chunk, (error) => {
                        if (error) { reject(error); }
                        else { resolve(undefined); }
                    });
                });
            }

            await new Promise((resolve, reject) => {
                writeStream.end((error: unknown) => {
                    if (error) { reject(error); }
                    else { resolve(undefined); }
                });
            });

            return {
                status: 'success',
                message: `${MACOS_REQUIRED_FILES[type]} uploaded successfully`
            };
        } catch (error) {
            try {
                await fs.unlink(filepath);
                console.error('Failed to upload file, cleaned up temporary file:', error);
            } catch (cleanupError) {
                console.error('Failed to upload file and cleanup failed:', error, cleanupError);
            }
            throw new Error(`Failed to upload ${MACOS_REQUIRED_FILES[type]}: ${error}`);
        }
    });

};

async function getVMStatus(name: string): Promise<'running' | 'stopped'> {
    try {
        const result = await runPrivilegedCommand(`pgrep -f "[q]emu.*${name}"`);
        return result ? 'running' : 'stopped';
    } catch {
        return 'stopped';
    }
}

async function downloadVirtIODrivers(): Promise<void> {
    if (fsSync.existsSync(VIRTIO_ISO_PATH)) { return; }

    await fs.mkdir(ISO_DIR, { recursive: true });
    const file = fsSync.createWriteStream(VIRTIO_ISO_PATH);

    return new Promise((resolve, reject) => {
        https.get(VIRTIO_ISO_URL, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', async (err) => {
            await fs.unlink(VIRTIO_ISO_PATH);
            reject(err);
        });
    });
}

async function isLeechCoreInstalled(): Promise<boolean> {
    try {
        // Check for required libraries
        await execAsync('ls /usr/local/lib/leechcore.so');
        await execAsync('ls /usr/local/lib/vmm.so');
        await execAsync('ls /usr/local/lib/leechcore_device_qemu.so');

        // Check for MemProcFS binary
        await execAsync('ls /usr/local/bin/memprocfs');

        // Check for proper permissions
        const leechcorePerms = (await execAsync('stat -c %a /usr/local/lib/leechcore.so')).stdout;
        const vmmPerms = (await execAsync('stat -c %a /usr/local/lib/vmm.so')).stdout;
        const qemuPluginPerms = (await execAsync('stat -c %a /usr/local/lib/leechcore_device_qemu.so')).stdout;
        const memprocfsPerms = (await execAsync('stat -c %a /usr/local/bin/memprocfs')).stdout;

        // Verify permissions (should be 755 or similar)
        if (!leechcorePerms.trim().startsWith('7') ||
            !vmmPerms.trim().startsWith('7') ||
            !qemuPluginPerms.trim().startsWith('7') ||
            !memprocfsPerms.trim().startsWith('7')) {
            return false;
        }

        // Check if /dev/shm exists and has correct permissions
        await execAsync('test -d /dev/shm');
        const shmPerms = (await execAsync('stat -c %a /dev/shm')).stdout;
        if (!shmPerms.trim().startsWith('7')) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

async function setupLeechCorePlugins(): Promise<void> {
    // Check if already installed
    if (await isLeechCoreInstalled()) {
        console.log('LeechCore and plugins already installed, skipping setup');
        return;
    }

    try {
        // Clean up any failed previous installations
        await execAsync('rm -rf LeechCore MemProcFS LeechCore-plugins');

        // Install build dependencies
        await execAsync('apt-get update');
        await execAsync('apt-get install -y build-essential git gcc cmake pkg-config sudo libusb-1.0 libusb-1.0-0-dev libfuse2 libfuse-dev libpython3-dev lz4 liblz4-dev');

        // Clone LeechCore and MemProcFS
        await execAsync(`
            git clone https://github.com/ufrisk/LeechCore.git && 
            git clone https://github.com/ufrisk/MemProcFS.git
        `);

        // Build LeechCore first
        await execAsync(`
            cd LeechCore/leechcore && 
            make && 
            sudo mkdir -p /usr/local/lib && 
            sudo cp ../files/leechcore.so /usr/local/lib/ &&
            sudo ldconfig
        `);

        // Build MemProcFS components in order
        await execAsync(`
            cd MemProcFS/vmm && 
            make &&
            cd ../memprocfs &&
            cp ../files/vmm.so . &&
            cp /usr/local/lib/leechcore.so . &&
            make &&
            sudo cp ../files/memprocfs /usr/local/bin/ &&
            cd ../vmmpyc &&
            cp ../files/vmm.so . &&
            cp /usr/local/lib/leechcore.so . &&
            make &&
            sudo ldconfig
        `);

        // Clone and build LeechCore plugins
        await execAsync(`
            git clone https://github.com/ufrisk/LeechCore-plugins.git && 
            cd LeechCore-plugins && 
            mkdir -p files &&
            cp /usr/local/lib/leechcore.so . &&
            cp /usr/local/lib/leechcore.so ./files/ &&
            make -C leechcore_ft601_driver_linux && 
            make -C leechcore_device_rawtcp && 
            make -C leechcore_device_qemu && 
            sudo cp files/leechcore_ft601_driver_linux.so /usr/local/lib/ && 
            sudo cp files/leechcore_device_rawtcp.so /usr/local/lib/ && 
            sudo cp files/leechcore_device_qemu.so /usr/local/lib/ && 
            sudo chmod 755 /usr/local/lib/leechcore_device_qemu.so &&
            sudo chmod 755 /usr/local/lib/leechcore_ft601_driver_linux.so &&
            sudo chmod 755 /usr/local/lib/leechcore_device_rawtcp.so &&
            sudo chmod 755 /usr/local/lib/leechcore.so &&
            sudo chmod 755 /usr/local/bin/memprocfs &&
            sudo chmod 666 /dev/shm/* &&
            sudo ldconfig && 
            sudo mkdir -p /tmp &&
            sudo chmod 777 /tmp
        `);

        // Clean up after successful installation
        // await execAsync('rm -rf LeechCore MemProcFS LeechCore-plugins');

    } catch (error) {
        // Clean up on failure
        await execAsync('rm -rf LeechCore MemProcFS LeechCore-plugins').catch(() => { });
        console.error('Failed to setup LeechCore and plugins:', error);
        throw new Error(`LeechCore setup failed: ${error}`);
    }
}

async function buildQEMUCommand(name: string, config: z.infer<typeof vmSchema>): Promise<string> {
    const vmPath = path.join(VM_DIR, name);
    const isWindowsISO = config.iso?.toLowerCase().includes('win');
    const isMacOS = config.template === 'macos';

    const cmd = [
        'qemu-system-x86_64',
        '-name', name,
    ];

    if (isMacOS) {
        // macOS-specific configuration
        cmd.push(
            '-machine', 'q35',
            '-global', 'ICH9-LPC.acpi-pci-hotplug-with-bridge-support=off',
            '-cpu', 'Penryn,kvm=on,vendor=GenuineIntel,+invtsc,vmware-cpuid-freq=on,+ssse3,+sse4.2,+popcnt,+avx,+aes,+xsave,+xsaveopt,check',
            '-device', 'isa-applesmc,osk="ourhardworkbythesewordsguardedpleasedontsteal(c)AppleComputerInc"',
            '-smbios', 'type=2',
            '-device', 'ich9-intel-hda',
            '-device', 'hda-duplex',
            '-device', 'ich9-ahci,id=sata',
            '-global', 'nec-usb-xhci.msi=off',
            '-device', 'usb-kbd',
            '-device', 'usb-tablet'
        );
    } else if (isWindowsISO) {
        cmd.push(
            '-machine', 'type=pc,vmport=off',
            '-accel', 'accel=tcg,thread=multi',
            '-device', 'intel-hda',
            '-device', 'hda-duplex',
            '-device', 'qemu-xhci',
            '-device', 'usb-tablet',
            '-device', 'virtio-serial',
            '-vga', 'virtio',
            '-usb',
            '-rtc', 'base=localtime'
        );
    }


    if (!isMacOS && config.cpuModel) {
        // For Windows VMs, append Hyper-V enlightenments to the CPU model
        if (isWindowsISO) {
            cmd.push('-cpu', `"${config.cpuModel},hv_relaxed,hv_spinlocks=0x1fff,hv_vapic,hv_time"`);
        } else {
            cmd.push('-cpu', `"${config.cpuModel}"`);
        }
    } else if (!isMacOS) {
        // Only set default if no CPU model is specified
        const defaultCpuModel = process.env.CONTAINER_ENV ? 'qemu64' : 'host';
        const cpuModel = isWindowsISO ? 'Nehalem' : defaultCpuModel;
        if (isWindowsISO) {
            cmd.push('-cpu', `"${cpuModel},hv_relaxed,hv_spinlocks=0x1fff,hv_vapic,hv_time"`);
        } else {
            cmd.push('-cpu', `"${cpuModel}"`);
        }
    }

    // CPU and memory configuration
    cmd.push(
        '-smp', config.cpu.toString(),
    );

    // KVM configuration
    const useKvm = config.useKvm !== false;
    if (useKvm && fsSync.existsSync('/dev/kvm')) {
        cmd.push('-enable-kvm');
    } else {
        console.warn('KVM not available or disabled in config; running without -enable-kvm');
    }

    // Drive configuration
    if (isMacOS) {
        cmd.push(
            '-drive', `id=SystemDisk,if=none,file=${path.join(vmPath, 'disk.qcow2')},format=qcow2`,
            '-device', 'ide-hd,bus=sata.4,drive=SystemDisk'
        );

        if (config.iso) {
            const isoPath = path.join(ISO_DIR, config.iso);
            cmd.push(
                '-drive', `id=InstallMedia,if=none,file=${isoPath},format=raw`,
                '-device', 'ide-hd,bus=sata.2,drive=InstallMedia'
            );
        }
    } else if (config.iso) {
        const isoPath = path.join(ISO_DIR, config.iso);
        if (isWindowsISO) {
            // Windows-specific drive configuration
            cmd.push(
                '-drive', `file=${path.join(vmPath, 'disk.qcow2')},if=virtio`,
                '-drive', `file=${isoPath},media=cdrom,index=1`
            );

            if (fsSync.existsSync(VIRTIO_ISO_PATH)) {
                cmd.push('-drive', `media=cdrom,file=${VIRTIO_ISO_PATH}`);
            }
        } else {
            // Standard drive configuration for other OSes
            cmd.push(
                '-drive', `file=${path.join(vmPath, 'disk.qcow2')},if=virtio,format=qcow2,media=disk`,
                '-drive', `file=${isoPath},media=cdrom`
            );

            if (fsSync.existsSync(VIRTIO_ISO_PATH)) {
                cmd.push('-drive', `file=${VIRTIO_ISO_PATH},media=cdrom`);
            }
        }
    } else {
        cmd.push('-drive', `file=${path.join(vmPath, 'disk.qcow2')},if=virtio,format=qcow2,media=disk`);
    }

    if (config.leechcore?.enabled) {
        const shmName = config.leechcore.shmName || `qemu-${name}-ram`;
        const qmpSocket = config.leechcore.qmpSocket || `/tmp/qmp-${name}.sock`;

        // Create QMP socket directory if it doesn't exist
        await fs.mkdir(path.dirname(qmpSocket), { recursive: true });

        // Set up shared memory configuration first
        cmd.push(
            '-m', `${config.memory}M`,
            '-object', `memory-backend-ram,id=pc.ram,size=${config.memory}M`,
            '-machine', 'pc,memory-backend=pc.ram',
            '-object', `memory-backend-file,id=mem,size=${config.memory}M,mem-path=/dev/shm/${shmName},share=on,prealloc=off`,
            '-qmp', `unix:${qmpSocket},server,nowait`
        );

        // Ensure shared memory and QMP socket permissions before starting QEMU
        try {
            await execAsync('sudo mkdir -p /dev/shm');
            await execAsync('sudo chmod 777 /dev/shm');

            // Clean up and create shared memory file
            await execAsync(`sudo rm -f /dev/shm/${shmName}`);
            await execAsync(`sudo touch /dev/shm/${shmName}`);
            await execAsync(`sudo chmod 666 /dev/shm/${shmName}`);

            // Clean up and create QMP socket
            await execAsync(`sudo rm -f ${qmpSocket}`);
            await execAsync(`sudo touch ${qmpSocket}`);
            await execAsync(`sudo chmod 666 ${qmpSocket}`);

            // Create symlink for compatibility
            await execAsync(`sudo ln -sf /dev/shm/${shmName} /dev/shm/qemu-${name}-ram`);
        } catch (error) {
            console.warn('Failed to set permissions:', error);
        }
    } else {
        // If leechcore is not enabled, just add regular memory configuration
        cmd.push('-m', `${config.memory}M`);
    }

    // Network configuration
    if (config.network) {
        if (isMacOS) {
            cmd.push(
                '-device', 'vmxnet3,netdev=net0',
                '-netdev', config.network.type === 'user' ?
                'user,id=net0' :
                `bridge,id=net0,br=${config.network.bridge}`
            );
        } if (config.network.type === 'user') {
            if (isWindowsISO) {
                cmd.push(
                    '-device', 'e1000,netdev=net0',
                    '-netdev', 'user,id=net0'
                );
            } else {
                cmd.push(
                    '-device', 'virtio-net-pci,netdev=net0,romfile=',
                    '-netdev', 'user,id=net0'
                );
            }
        } else if (config.network.type === 'bridge' && config.network.bridge) {
            cmd.push(
                '-device', isWindowsISO ? 'e1000,netdev=net0' : 'virtio-net-pci,netdev=net0,romfile=',
                '-netdev', `bridge,id=net0,br=${config.network.bridge}`
            );
        }
    }

    if (config.vnc) {
        cmd.push('-vnc', ':0,websocket=on');
    }

    // Add template extra args if available
    if (config.template && VM_TEMPLATES[config.template as keyof typeof VM_TEMPLATES]?.extraArgs) {
        cmd.push(...VM_TEMPLATES[config.template as keyof typeof VM_TEMPLATES].extraArgs);
    }

    cmd.push('-daemonize');

    return cmd.join(' ');
}
