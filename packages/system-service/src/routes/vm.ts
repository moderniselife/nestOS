import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { access } from 'fs/promises';

const execAsync = promisify(exec);

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

  // If VM support is enabled, check KVM availability
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
      const output = await execCommand('virsh list --all');
      const vms: VM[] = output.split('\n')
        .slice(2) // Skip header
        .filter((line: string) => line.trim())
        .map((line: string) => {
          const [id, name, state] = line.trim().split(/\s+/);
          return { id, name, state };
        });

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
      const [info, xml] = await Promise.all([
        execCommand(`virsh dominfo ${name}`),
        execCommand(`virsh dumpxml ${name}`)
      ]);

      // Parse dominfo output
      const details: Record<string, string> = {};
      info.split('\n').forEach((line: string) => {
        const [key, ...values] = line.split(':').map(s => s.trim());
        if (key) { details[key] = values.join(':'); }
      });

      return {
        info: details,
        xml
      };
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
      // Create VM disk
      await execCommand(`qemu-img create -f qcow2 /var/lib/libvirt/images/${vm.name}.qcow2 ${vm.disk}G`);

      // Build virt-install command
      let command = `virt-install \
        --name=${vm.name} \
        --vcpus=${vm.cpu} \
        --memory=${vm.memory} \
        --disk path=/var/lib/libvirt/images/${vm.name}.qcow2,format=qcow2 \
        --os-variant=generic \
        --graphics vnc`;

      // Add virtualization type based on KVM availability
      if (hasKVM) {
        command += ' --virt-type=kvm';
      } else {
        command += ' --virt-type=qemu';
        // Add TCG acceleration when KVM is not available
        command += ' --cpu host';
      }

      if (vm.iso) {
        command += ` --cdrom=${vm.iso}`;
      }

      command += ' --noautoconsole';

      await execCommand(command);

      return {
        status: 'created',
        name: vm.name,
        accelerated: hasKVM
      };
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
          await execCommand(`virsh start ${name}`);
          break;
        case 'stop':
          await execCommand(`virsh shutdown ${name}`);
          break;
        case 'restart':
          await execCommand(`virsh reboot ${name}`);
          break;
        case 'delete':
          await execCommand(`virsh destroy ${name} || true`);
          await execCommand(`virsh undefine ${name} --remove-all-storage`);
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
      const [cpu, mem] = await Promise.all([
        execCommand(`virsh cpu-stats ${name}`),
        execCommand(`virsh dommemstat ${name}`)
      ]);

      return {
        cpu,
        memory: mem,
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
      const output = await execCommand('ls -1 /var/lib/libvirt/images/*.iso');
      return {
        isos: output.split('\n')
          .filter(Boolean)
          .map((path: string) => ({
            path,
            name: path.split('/').pop() ?? ''
          }))
      };
    } catch (error) {
      // Return empty list if no ISOs found
      return { isos: [] };
    }
  });

  // Get virtualization capabilities
  fastify.get('/capabilities', async () => {
    return {
      kvm: hasKVM,
      emulation: true, // QEMU TCG is always available
      provider: hasKVM ? 'KVM' : 'QEMU TCG'
    };
  });
};