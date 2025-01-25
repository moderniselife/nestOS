import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';

const execAsync = promisify(exec);

interface RaidArray {
  name: string;
  type: string;
  devices: string[];
}

interface MountPoint {
  device: string;
  mountPoint: string;
  type: string;
}

// Validation schemas
const healthResponseSchema = z.object({
  overall: z.enum(['healthy', 'warning', 'critical']),
  devices: z.array(z.object({
    name: z.string(),
    status: z.enum(['healthy', 'warning', 'critical']),
    smart: z.object({
      health: z.string(),
      temperature: z.number().optional(),
      powerOnHours: z.number().optional(),
      reallocatedSectors: z.number().optional()
    }).optional(),
    issues: z.array(z.string())
  }))
});

const volumeSchema = z.object({
  name: z.string(),
  type: z.enum(['single', 'raid0', 'raid1', 'raid5', 'raid6', 'raid10']),
  devices: z.array(z.string()),
  mountPoint: z.string().optional(),
  filesystem: z.enum(['ext4', 'xfs', 'btrfs', 'zfs']).optional()
});

function parseSmartOutput(stdout: string) {
  const temperature = stdout.match(/Temperature_Celsius.*?(\d+)/)?.[1];
  const powerOnHours = stdout.match(/Power_On_Hours.*?(\d+)/)?.[1];
  const reallocatedSectors = stdout.match(/Reallocated_Sector_Ct.*?(\d+)/)?.[1];

  return {
    temperature: temperature ? parseInt(temperature) : undefined,
    powerOnHours: powerOnHours ? parseInt(powerOnHours) : undefined,
    reallocatedSectors: reallocatedSectors ? parseInt(reallocatedSectors) : undefined
  };
}

export const storageRoutes: FastifyPluginAsync = async (fastify) => {
  // Get storage health status
  fastify.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            overall: { type: 'string', enum: ['healthy', 'warning', 'critical'] },
            devices: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'string', enum: ['healthy', 'warning', 'critical'] },
                  smart: {
                    type: 'object',
                    properties: {
                      health: { type: 'string' },
                      temperature: { type: 'number' },
                      powerOnHours: { type: 'number' },
                      reallocatedSectors: { type: 'number' }
                    }
                  },
                  issues: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                },
                required: ['name', 'status', 'issues']
              }
            }
          },
          required: ['overall', 'devices']
        }
      }
    }
  }, async () => {
    try {
      const blockDevices = await si.blockDevices();
      const devices = await Promise.all(blockDevices.map(async (device) => {
        const issues: string[] = [];
        let smartData = null;
        let status: 'healthy' | 'warning' | 'critical' = 'healthy';

        try {
          const { stdout } = await execAsync(`smartctl -H -A /dev/${device.name}`);
          const health = stdout.includes('PASSED') ? 'PASSED' : 'FAILED';
          const smartInfo = parseSmartOutput(stdout);

          if (health !== 'PASSED') {
            status = 'critical';
            issues.push('SMART health check failed');
          }

          if (smartInfo.temperature && smartInfo.temperature > 60) {
            status = status === 'critical' ? 'critical' : 'warning';
            issues.push(`High temperature: ${smartInfo.temperature}°C`);
          }

          if (smartInfo.reallocatedSectors && smartInfo.reallocatedSectors > 0) {
            status = status === 'critical' ? 'critical' : 'warning';
            issues.push(`Reallocated sectors: ${smartInfo.reallocatedSectors}`);
          }

          smartData = {
            health,
            ...smartInfo
          };
        } catch (error) {
          // SMART might not be available
          issues.push('SMART data not available');
        }

        return {
          name: device.name,
          status,
          smart: smartData,
          issues
        };
      }));

      // Determine overall system status
      const overall = devices.some(d => d.status === 'critical') ? 'critical' :
                     devices.some(d => d.status === 'warning') ? 'warning' : 'healthy';

      return {
        overall,
        devices
      };
    } catch (error) {
      throw new Error(`Failed to check storage health: ${error}`);
    }
  });

  // Get all storage devices
  fastify.get('/devices', async () => {
    try {
      const [blockDevices, diskLayout, fsSize] = await Promise.all([
        si.blockDevices(),
        si.diskLayout(),
        si.fsSize()
      ]);

      // Enhance block devices with additional information
      const enhancedDevices = await Promise.all(
        blockDevices.map(async (device) => {
          const layout = diskLayout.find(d => d.device === device.name);
          // Match filesystem by device name or mount point
          const fs = fsSize.find(f =>
            f.fs === `/dev/${device.name}` ||
            f.fs === device.name ||
            f.fs === device.mount
          );
          console.log(`Device ${device.name}:`, {
            mount: device.mount,
            fsSize: fsSize.map(f => ({ fs: f.fs, size: f.size, used: f.used })),
            matchedFs: fs
          });
          
          // Get SMART data if available
          let smart = null;
          try {
            const { stdout } = await execAsync(`smartctl -H -A ${device.name}`);
            smart = {
              health: stdout.includes('PASSED') ? 'PASSED' : 'FAILED',
              attributes: stdout
            };
          } catch (error) {
            // SMART might not be available for all devices
          }

          // Get additional device information
          let additional = {};
          try {
            const { stdout: udevInfo } = await execAsync(`udevadm info --query=all --name=${device.name}`);
            additional = {
              bus: udevInfo.match(/ID_BUS=(.*)/)?.[1],
              path: udevInfo.match(/ID_PATH=(.*)/)?.[1],
              serial: udevInfo.match(/ID_SERIAL=(.*)/)?.[1]
            };
          } catch (error) {
            // Additional info might not be available
          }

          return {
            ...device,
            smart,
            layout: layout ? {
              vendor: layout.vendor,
              type: layout.type,
              size: layout.size,
              interfaceType: layout.interfaceType,
              temperature: layout.temperature,
              serialNum: layout.serialNum,
              firmwareRevision: layout.firmwareRevision
            } : null,
            filesystem: fs ? {
              size: fs.size,
              used: fs.used,
              available: fs.available,
              use: fs.use
            } : null,
            ...additional
          };
        })
      );

      return { devices: enhancedDevices };
    } catch (error) {
      throw new Error(`Failed to get storage devices: ${error}`);
    }
  });

  // Create volume
  fastify.post('/volumes', async (request) => {
    const config = volumeSchema.parse(request.body);
    
    try {
      switch (config.type) {
        case 'single': {
          // Format single disk
          await execAsync(`mkfs.${config.filesystem || 'ext4'} ${config.devices[0]}`);
          if (config.mountPoint) {
            await execAsync(`mount ${config.devices[0]} ${config.mountPoint}`);
          }
          break;
        }
        case 'raid0':
        case 'raid1':
        case 'raid5':
        case 'raid6':
        case 'raid10': {
          // Create RAID array
          const level = config.type.replace('raid', '');
          await execAsync(
            `mdadm --create /dev/md/${config.name} --level=${level} --raid-devices=${config.devices.length} ${config.devices.join(' ')}`
          );
          if (config.filesystem) {
            await execAsync(`mkfs.${config.filesystem} /dev/md/${config.name}`);
          }
          if (config.mountPoint) {
            await execAsync(`mount /dev/md/${config.name} ${config.mountPoint}`);
          }
          break;
        }
      }

      return { status: 'created', name: config.name };
    } catch (error) {
      throw new Error(`Failed to create volume: ${error}`);
    }
  });

  // Get volume information
  fastify.get('/volumes', async () => {
    try {
      let raids: RaidArray[] = [];
      let mounts: MountPoint[] = [];

      // Try to get RAID information if available
      try {
        const { stdout: mdstat } = await execAsync('cat /proc/mdstat');
        raids = mdstat
          .split('\n')
          .filter(line => line.includes(' : '))
          .map(line => {
            const [name, info] = line.split(' : ');
            const [type, devices] = info.split(' ');
            return {
              name,
              type,
              devices: devices.split(' ').filter(Boolean)
            };
          });
      } catch (error) {
        // mdstat not available, return empty array
        raids = [];
      }

      // Try to get mount information
      try {
        const { stdout: mountInfo } = await execAsync('mount');
        mounts = mountInfo
          .split('\n')
          .filter(Boolean)
          .map(line => {
            const [device, mountPoint, type] = line.split(' ');
            return { device, mountPoint, type };
          });
      } catch (error) {
        // mount info not available, return empty array
        mounts = [];
      }

      return {
        raids,
        mounts
      };
    } catch (error) {
      // Return empty arrays if we can't get volume information
      return {
        raids: [] as RaidArray[],
        mounts: [] as MountPoint[]
      };
    }
  });

  // Delete volume
  fastify.delete('/volumes/:name', async (request) => {
    const { name } = z.object({
      name: z.string()
    }).parse(request.params);

    try {
      // Unmount first if mounted
      try {
        await execAsync(`umount /dev/md/${name}`);
      } catch (error) {
        // Might not be mounted
      }

      // Stop and remove the array
      await execAsync(`mdadm --stop /dev/md/${name}`);
      await execAsync(`mdadm --remove /dev/md/${name}`);

      return { status: 'deleted', name };
    } catch (error) {
      throw new Error(`Failed to delete volume: ${error}`);
    }
  });

  // Get SMART information
  fastify.get('/smart/:device', async (request) => {
    const { device } = z.object({
      device: z.string()
    }).parse(request.params);

    try {
      const { stdout } = await execAsync(`smartctl -a ${device}`);
      return { data: stdout };
    } catch (error) {
      // Return null if SMART data is not available
      return { data: null };
    }
  });
};