import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { access, readdir } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

interface VMProvider {
  listVMs(): Promise<VM[]>;
  getVMDetails(name: string): Promise<{ info: Record<string, string>; xml?: string }>;
  createVM(vm: z.infer<typeof vmSchema>): Promise<{ status: string; name: string; accelerated: boolean }>;
  startVM(name: string): Promise<void>;
  stopVM(name: string): Promise<void>;
  restartVM(name: string): Promise<void>;
  deleteVM(name: string): Promise<void>;
  getVMStats(name: string): Promise<{ cpu: string; memory: string }>;
  listISOs(): Promise<{ path: string; name: string }[]>;
}

class LibvirtProvider implements VMProvider {
  async listVMs(): Promise<VM[]> {
    const output = await execCommand('virsh list --all');
    return output.split('\n')
      .slice(2)
      .filter((line: string) => line.trim())
      .map((line: string) => {
        const [id, name, state] = line.trim().split(/\s+/);
        return { id, name, state };
      });
  }

  async getVMDetails(name: string) {
    const [info, xml] = await Promise.all([
      execCommand(`virsh dominfo ${name}`),
      execCommand(`virsh dumpxml ${name}`)
    ]);

    const details: Record<string, string> = {};
    info.split('\n').forEach((line: string) => {
      const [key, ...values] = line.split(':').map(s => s.trim());
      if (key) { details[key] = values.join(':'); }
    });

    return { info: details, xml };
  }

  async createVM(vm: z.infer<typeof vmSchema>) {
    await execCommand(`qemu-img create -f qcow2 /var/lib/libvirt/images/${vm.name}.qcow2 ${vm.disk}G`);

    let command = `virt-install \
      --name=${vm.name} \
      --vcpus=${vm.cpu} \
      --memory=${vm.memory} \
      --disk path=/var/lib/libvirt/images/${vm.name}.qcow2,format=qcow2 \
      --os-variant=generic \
      --graphics vnc`;

    if (await isKVMAvailable()) {
      command += ' --virt-type=kvm';
    } else {
      command += ' --virt-type=qemu --cpu host';
    }

    if (vm.iso) {
      command += ` --cdrom=${vm.iso}`;
    }

    command += ' --noautoconsole';

    await execCommand(command);
    return {
      status: 'created',
      name: vm.name,
      accelerated: await isKVMAvailable()
    };
  }

  async startVM(name: string) {
    await execCommand(`virsh start ${name}`);
  }

  async stopVM(name: string) {
    await execCommand(`virsh shutdown ${name}`);
  }

  async restartVM(name: string) {
    await execCommand(`virsh reboot ${name}`);
  }

  async deleteVM(name: string) {
    await execCommand(`virsh destroy ${name} || true`);
    await execCommand(`virsh undefine ${name} --remove-all-storage`);
  }

  async getVMStats(name: string) {
    const [cpu, memory] = await Promise.all([
      execCommand(`virsh cpu-stats ${name}`),
      execCommand(`virsh dommemstat ${name}`)
    ]);
    return { cpu, memory };
  }

  async listISOs() {
    try {
      const output = await execCommand('ls -1 /var/lib/libvirt/images/*.iso');
      return output.split('\n')
        .filter(Boolean)
        .map((path: string) => ({
          path,
          name: path.split('/').pop() ?? ''
        }));
    } catch {
      return [];
    }
  }
}

class QEMUProvider implements VMProvider {
  private vmDir = '/var/lib/libvirt/images';
  private pidDir = '/tmp/qemu-pids';

  constructor() {
    // Ensure directories exist
    execCommand(`mkdir -p ${this.vmDir} ${this.pidDir}`).catch(console.error);
  }

  private async getPidFile(name: string) {
    return join(this.pidDir, `${name}.pid`);
  }

  private async isVMRunning(name: string): Promise<boolean> {
    try {
      const pidFile = await this.getPidFile(name);
      const pid = await execCommand(`cat ${pidFile}`);
      await execCommand(`kill -0 ${pid.trim()}`);
      return true;
    } catch {
      return false;
    }
  }

  async listVMs(): Promise<VM[]> {
    try {
      const files = await readdir(this.vmDir);
      const vms: VM[] = [];
      
      for (const file of files) {
        if (file.endsWith('.qcow2')) {
          const name = file.replace('.qcow2', '');
          const state = await this.isVMRunning(name) ? 'running' : 'shut off';
          vms.push({ id: '-', name, state });
        }
      }
      
      return vms;
    } catch (error) {
      console.error('Error listing VMs:', error);
      return [];
    }
  }

  async getVMDetails(name: string) {
    const running = await this.isVMRunning(name);
    return {
      info: {
        Name: name,
        State: running ? 'running' : 'shut off',
        'Disk Path': `${this.vmDir}/${name}.qcow2`
      }
    };
  }

  async createVM(vm: z.infer<typeof vmSchema>) {
    await execCommand(`qemu-img create -f qcow2 ${this.vmDir}/${vm.name}.qcow2 ${vm.disk}G`);
    const accelerated = await isKVMAvailable();
    
    return {
      status: 'created',
      name: vm.name,
      accelerated
    };
  }

  async startVM(name: string) {
    if (await this.isVMRunning(name)) {
      return;
    }

    const diskPath = `${this.vmDir}/${name}.qcow2`;
    const pidFile = await this.getPidFile(name);
    
    let command = `qemu-system-x86_64 \
      -name ${name} \
      -drive file=${diskPath},format=qcow2 \
      -m 512 \
      -smp 1 \
      -vnc :0 \
      -pidfile ${pidFile} \
      -daemonize`;

    if (await isKVMAvailable()) {
      command += ' -enable-kvm';
    }

    await execCommand(command);
  }

  async stopVM(name: string) {
    try {
      const pidFile = await this.getPidFile(name);
      const pid = await execCommand(`cat ${pidFile}`);
      await execCommand(`kill ${pid.trim()}`);
    } catch (error) {
      console.error(`Error stopping VM ${name}:`, error);
    }
  }

  async restartVM(name: string) {
    await this.stopVM(name);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.startVM(name);
  }

  async deleteVM(name: string) {
    await this.stopVM(name);
    await execCommand(`rm -f ${this.vmDir}/${name}.qcow2 ${await this.getPidFile(name)}`);
  }

  async getVMStats(name: string) {
    const running = await this.isVMRunning(name);
    return {
      cpu: running ? 'Stats not available in QEMU mode' : 'VM not running',
      memory: running ? 'Stats not available in QEMU mode' : 'VM not running'
    };
  }

  async listISOs() {
    try {
      const files = await readdir(this.vmDir);
      return files
        .filter(file => file.endsWith('.iso'))
        .map(file => ({
          path: join(this.vmDir, file),
          name: file
        }));
    } catch {
      return [];
    }
  }
}

// Helper function to check if KVM is available
async function isKVMAvailable(): Promise<boolean> {
  try {
    await access('/dev/kvm');
    return true;
  } catch {
    return false;
  }
}

// Helper function to execute commands with better error handling
async function execCommand(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
      console.error(`Command stderr: ${stderr}`);
    }
    return stdout;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Command failed: ${command}`);
      console.error(`Error: ${error.message}`);
      if ('stderr' in error) {
        console.error(`stderr: ${(error as any).stderr}`);
      }
    }
    throw error;
  }
}

function getVMProvider(): VMProvider {
  const provider = process.env.VM_PROVIDER || 'libvirt';
  console.log(`Using VM provider: ${provider}`);
  return provider === 'qemu' ? new QEMUProvider() : new LibvirtProvider();
}

const vmSchema = z.object({
  name: z.string(),
  cpu: z.number().min(1),
  memory: z.number().min(512),
  disk: z.number().min(1),
  iso: z.string().optional(),
});

const vmActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'delete'])
});

interface VM {
  id: string;
  name: string;
  state: string;
}

export const vmRoutes: FastifyPluginAsync = async (fastify) => {
  // Check if VM support is enabled
  const vmSupport = process.env.VM_SUPPORT === 'true';
  if (!vmSupport) {
    console.log('VM support is disabled');
    // Return error response for all VM routes when VM support is disabled
    const vmDisabledError = {
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'VM support is currently disabled'
    };

    fastify.get('/list', {}, async () => { throw vmDisabledError; });
    fastify.get('/:name', {}, async () => { throw vmDisabledError; });
    fastify.post('/create', {}, async () => { throw vmDisabledError; });
    fastify.post('/:name/action', {}, async () => { throw vmDisabledError; });
    fastify.get('/:name/stats', {}, async () => { throw vmDisabledError; });
    fastify.get('/isos', {}, async () => { throw vmDisabledError; });
    fastify.get('/capabilities', async () => ({
      kvm: false,
      emulation: false,
      provider: 'disabled',
      available: false
    }));

    return;
  }

  // Initialize VM provider
  const provider = getVMProvider();
  const hasKVM = await isKVMAvailable();
  console.log(`KVM support: ${hasKVM ? 'available' : 'not available, using QEMU TCG'}`);

  // List all VMs
  fastify.get('/list', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            vms: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  state: { type: 'string' }
                },
                required: ['id', 'name', 'state']
              }
            }
          },
          required: ['vms']
        }
      }
    }
  }, async () => {
    try {
      const vms = await provider.listVMs();
      return { vms };
    } catch (error) {
      throw new Error(`Failed to list VMs: ${error}`);
    }
  });

  // Get VM details
  fastify.get('/:name', {
    schema: {
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        required: ['name']
      }
    }
  }, async (request) => {
    const { name } = request.params as { name: string };
    try {
      return await provider.getVMDetails(name);
    } catch (error) {
      throw new Error(`Failed to get VM details: ${error}`);
    }
  });

  // Create new VM
  fastify.post('/create', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cpu: { type: 'number', minimum: 1 },
          memory: { type: 'number', minimum: 512 },
          disk: { type: 'number', minimum: 1 },
          iso: { type: 'string', nullable: true }
        },
        required: ['name', 'cpu', 'memory', 'disk']
      }
    }
  }, async (request) => {
    const vm = vmSchema.parse(request.body);
    try {
      return await provider.createVM(vm);
    } catch (error) {
      throw new Error(`Failed to create VM: ${error}`);
    }
  });

  // Perform VM action (start, stop, restart, delete)
  fastify.post('/:name/action', {
    schema: {
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        required: ['name']
      },
      body: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['start', 'stop', 'restart', 'delete'] }
        },
        required: ['action']
      }
    }
  }, async (request) => {
    const { name } = request.params as { name: string };
    const { action } = vmActionSchema.parse(request.body);

    try {
      switch (action) {
        case 'start':
          await provider.startVM(name);
          break;
        case 'stop':
          await provider.stopVM(name);
          break;
        case 'restart':
          await provider.restartVM(name);
          break;
        case 'delete':
          await provider.deleteVM(name);
          break;
      }

      return { status: 'success', action, name };
    } catch (error) {
      throw new Error(`Failed to ${action} VM: ${error}`);
    }
  });

  // Get VM stats
  fastify.get('/:name/stats', {
    schema: {
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        required: ['name']
      }
    }
  }, async (request) => {
    const { name } = request.params as { name: string };
    try {
      const stats = await provider.getVMStats(name);
      return {
        ...stats,
        accelerated: hasKVM
      };
    } catch (error) {
      throw new Error(`Failed to get VM stats: ${error}`);
    }
  });

  // Get available ISO images
  fastify.get('/isos', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            isos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  name: { type: 'string' }
                },
                required: ['path', 'name']
              }
            }
          },
          required: ['isos']
        }
      }
    }
  }, async () => {
    try {
      const isos = await provider.listISOs();
      return { isos };
    } catch (error) {
      return { isos: [] };
    }
  });

  // Get virtualization capabilities
  fastify.get('/capabilities', async () => {
    return {
      kvm: hasKVM,
      emulation: true, // QEMU TCG is always available
      provider: process.env.VM_PROVIDER || 'libvirt',
      available: true
    };
  });
};