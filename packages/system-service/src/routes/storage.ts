import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';

const execAsync = promisify(exec);

const mountPointSchema = z.object({
  device: z.string(),
  mountPoint: z.string(),
  fsType: z.string().optional().default('ext4')
});

const raidConfigSchema = z.object({
  level: z.enum(['0', '1', '5', '6', '10']),
  devices: z.array(z.string()),
  name: z.string()
});

interface DiskInfo {
  device: string;
  type: string;
  name: string;
  model: string;
  size: number;
  serial?: string;
  removable: boolean;
  protocol?: string;
  uuid?: string;
  label?: string;
  mount?: string;
  smart?: string;
}

export const storageRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all disks information
  fastify.get('/disks', async () => {
    try {
      const [blockDevices, fsSize] = await Promise.all([
        si.blockDevices(),
        si.fsSize()
      ]);

      const diskDetails = await Promise.all(
        blockDevices.map(async (disk): Promise<DiskInfo> => {
          const smartInfo = await execAsync(`smartctl -a ${disk.name}`).catch(() => ({ stdout: '' }));
          
          return {
            device: disk.name,
            type: disk.type,
            name: disk.name,
            model: disk.model || 'Unknown',
            size: disk.size,
            serial: disk.serial,
            removable: disk.removable || false,
            protocol: disk.protocol,
            uuid: disk.uuid,
            label: disk.label,
            mount: disk.mount,
            smart: smartInfo.stdout
          };
        })
      );

      return {
        disks: diskDetails,
        filesystems: fsSize
      };
    } catch (error) {
      throw new Error(`Failed to get disk information: ${error}`);
    }
  });

  // Mount a disk
  fastify.post('/mount', async (request) => {
    const { device, mountPoint, fsType } = mountPointSchema.parse(request.body);

    try {
      // Create mount point directory if it doesn't exist
      await execAsync(`mkdir -p ${mountPoint}`);
      
      // Mount the device
      await execAsync(`mount -t ${fsType} ${device} ${mountPoint}`);
      
      // Add to fstab for persistence
      const fstabEntry = `${device} ${mountPoint} ${fsType} defaults 0 0`;
      await execAsync(`echo "${fstabEntry}" >> /etc/fstab`);

      return { status: 'mounted', device, mountPoint };
    } catch (error) {
      throw new Error(`Failed to mount device: ${error}`);
    }
  });

  // Unmount a disk
  fastify.post('/unmount', async (request) => {
    const { mountPoint } = z.object({ mountPoint: z.string() }).parse(request.body);

    try {
      await execAsync(`umount ${mountPoint}`);
      
      // Remove from fstab
      await execAsync(`sed -i "\|${mountPoint}|d" /etc/fstab`);

      return { status: 'unmounted', mountPoint };
    } catch (error) {
      throw new Error(`Failed to unmount device: ${error}`);
    }
  });

  // Create RAID array
  fastify.post('/raid', async (request) => {
    const { level, devices, name } = raidConfigSchema.parse(request.body);

    try {
      // Create RAID array using mdadm
      const deviceList = devices.join(' ');
      await execAsync(
        `mdadm --create /dev/md/${name} --level=${level} --raid-devices=${devices.length} ${deviceList}`
      );

      // Save RAID configuration
      await execAsync('mdadm --detail --scan >> /etc/mdadm/mdadm.conf');
      
      // Update initramfs
      await execAsync('update-initramfs -u');

      return {
        status: 'created',
        name,
        level,
        devices
      };
    } catch (error) {
      throw new Error(`Failed to create RAID array: ${error}`);
    }
  });

  // Get RAID status
  fastify.get('/raid', async () => {
    try {
      const { stdout: config } = await execAsync('mdadm --detail --scan');
      const { stdout: status } = await execAsync('cat /proc/mdstat');

      return {
        configuration: config,
        status
      };
    } catch (error) {
      throw new Error(`Failed to get RAID status: ${error}`);
    }
  });

  // Format a disk
  fastify.post('/format', async (request) => {
    const { device, fsType } = z.object({
      device: z.string(),
      fsType: z.string().default('ext4')
    }).parse(request.body);

    try {
      await execAsync(`mkfs.${fsType} ${device}`);
      return { status: 'formatted', device, fsType };
    } catch (error) {
      throw new Error(`Failed to format device: ${error}`);
    }
  });
};