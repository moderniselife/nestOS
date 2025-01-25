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
const volumeSchema = z.object({
  name: z.string(),
  type: z.enum(['single', 'raid0', 'raid1', 'raid5', 'raid6', 'raid10']),
  devices: z.array(z.string()),
  mountPoint: z.string().optional(),
  filesystem: z.enum(['ext4', 'xfs', 'btrfs', 'zfs']).optional()
});

export const storageRoutes: FastifyPluginAsync = async (fastify) => {
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
          const fs = fsSize.find(f => f.fs === device.mount);
          
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