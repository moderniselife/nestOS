import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';

const execAsync = promisify(exec);

const networkInterfaceSchema = z.object({
  interface: z.string(),
  ipAddress: z.string(),
  netmask: z.string(),
  gateway: z.string().optional(),
  dns: z.array(z.string()).optional()
});

const sambaShareSchema = z.object({
  name: z.string(),
  path: z.string(),
  readonly: z.boolean().optional().default(false),
  browseable: z.boolean().optional().default(true),
  guestOk: z.boolean().optional().default(false),
  users: z.array(z.string()).optional()
});

const nfsShareSchema = z.object({
  path: z.string(),
  allowedHosts: z.array(z.string()),
  options: z.string().optional().default('rw,sync,no_subtree_check')
});

export const networkRoutes: FastifyPluginAsync = async (fastify) => {
  // Get network interfaces
  fastify.get('/interfaces', async () => {
    const [networkInterfaces, defaultGateway, defaultInterface] = await Promise.all([
      si.networkInterfaces(),
      si.networkGatewayDefault(),
      si.networkInterfaceDefault()
    ]);

    return {
      interfaces: networkInterfaces,
      defaultGateway,
      defaultInterface
    };
  });

  // Configure network interface
  fastify.post('/interfaces/configure', async (request) => {
    const config = networkInterfaceSchema.parse(request.body);
    
    try {
      // Generate network interface configuration
      const interfaceConfig = [
        'auto ' + config.interface,
        'iface ' + config.interface + ' inet static',
        '    address ' + config.ipAddress,
        '    netmask ' + config.netmask
      ];

      if (config.gateway) {
        interfaceConfig.push('    gateway ' + config.gateway);
      }

      if (config.dns?.length) {
        interfaceConfig.push('    dns-nameservers ' + config.dns.join(' '));
      }

      // Write to interfaces file
      await execAsync(`echo "${interfaceConfig.join('\n')}" > /etc/network/interfaces.d/${config.interface}`);
      
      // Restart networking
      await execAsync(`systemctl restart networking`);

      return { status: 'configured', interface: config.interface };
    } catch (error) {
      throw new Error(`Failed to configure network interface: ${error}`);
    }
  });

  // Configure Samba share
  fastify.post('/shares/samba', async (request) => {
    const config = sambaShareSchema.parse(request.body);

    try {
      const shareConfig = [
        `[${config.name}]`,
        `   path = ${config.path}`,
        `   read only = ${config.readonly}`,
        `   browseable = ${config.browseable}`,
        `   guest ok = ${config.guestOk}`
      ];

      if (config.users?.length) {
        shareConfig.push(`   valid users = ${config.users.join(',')}`);
      }

      // Add share to smb.conf
      await execAsync(`echo "${shareConfig.join('\n')}" >> /etc/samba/smb.conf`);
      
      // Restart Samba
      await execAsync('systemctl restart smbd');

      return { status: 'configured', share: config.name };
    } catch (error) {
      throw new Error(`Failed to configure Samba share: ${error}`);
    }
  });

  // Configure NFS share
  fastify.post('/shares/nfs', async (request) => {
    const config = nfsShareSchema.parse(request.body);

    try {
      const exportLine = `${config.path} ${config.allowedHosts.join(' ')}(${config.options})`;
      
      // Add export to exports file
      await execAsync(`echo "${exportLine}" >> /etc/exports`);
      
      // Update NFS exports
      await execAsync('exportfs -ra');

      return { status: 'configured', path: config.path };
    } catch (error) {
      throw new Error(`Failed to configure NFS share: ${error}`);
    }
  });

  // Get network shares
  fastify.get('/shares', async () => {
    try {
      const [sambaShares, nfsShares] = await Promise.all([
        execAsync('pdbedit -L -v'),
        execAsync('showmount --no-headers -e localhost')
      ]);

      return {
        samba: sambaShares.stdout,
        nfs: nfsShares.stdout
      };
    } catch (error) {
      throw new Error(`Failed to get network shares: ${error}`);
    }
  });

  // Get network statistics
  fastify.get('/stats', async () => {
    try {
      const [networkStats, connections] = await Promise.all([
        si.networkStats(),
        si.networkConnections()
      ]);

      return {
        stats: networkStats,
        connections
      };
    } catch (error) {
      throw new Error(`Failed to get network statistics: ${error}`);
    }
  });

  // Configure firewall rule
  fastify.post('/firewall', async (request) => {
    const rule = z.object({
      chain: z.enum(['INPUT', 'OUTPUT', 'FORWARD']),
      action: z.enum(['ACCEPT', 'DROP', 'REJECT']),
      protocol: z.enum(['tcp', 'udp', 'icmp']).optional(),
      source: z.string().optional(),
      destination: z.string().optional(),
      port: z.number().optional()
    }).parse(request.body);

    try {
      let command = `iptables -A ${rule.chain} `;
      
      if (rule.protocol) {
        command += `-p ${rule.protocol} `;
      }
      if (rule.source) {
        command += `-s ${rule.source} `;
      }
      if (rule.destination) {
        command += `-d ${rule.destination} `;
      }
      if (rule.port) {
        command += `--dport ${rule.port} `;
      }
      
      command += `-j ${rule.action}`;

      await execAsync(command);
      await execAsync('iptables-save > /etc/iptables/rules.v4');

      return { status: 'configured', rule };
    } catch (error) {
      throw new Error(`Failed to configure firewall rule: ${error}`);
    }
  });
};