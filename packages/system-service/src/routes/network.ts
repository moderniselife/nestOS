import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';

const execAsync = promisify(exec);

const interfaceSchema = z.object({
  iface: z.string(),
  ip4: z.string().optional(),
  ip6: z.string().optional(),
  gateway: z.string().optional(),
  netmask: z.string().optional(),
  dhcp: z.boolean().optional()
});

export const networkRoutes: FastifyPluginAsync = async (fastify) => {
  // Get network interfaces
  fastify.get('/interfaces', async () => {
    try {
      const [interfaces, defaultGateway, defaultInterface] = await Promise.all([
        si.networkInterfaces(),
        si.networkGatewayDefault(),
        si.networkInterfaceDefault()
      ]);

      // Transform the interfaces into our expected format
      const formattedInterfaces = interfaces.map((iface) => ({
        iface: iface.iface,
        ifaceName: iface.ifaceName,
        ip4: iface.ip4,
        ip6: iface.ip6,
        mac: iface.mac,
        internal: iface.internal,
        virtual: iface.virtual,
        operstate: iface.operstate,
        type: iface.type,
        duplex: iface.duplex,
        speed: iface.speed,
        dhcp: iface.dhcp,
        default: iface.iface === defaultInterface,
        gateway: iface.iface === defaultInterface ? defaultGateway : undefined
      }));

      return { interfaces: formattedInterfaces };
    } catch (error) {
      throw new Error(`Failed to get network interfaces: ${error}`);
    }
  });

  // Configure interface
  fastify.post('/interfaces/:iface', async (request) => {
    const { iface } = z.object({
      iface: z.string()
    }).parse(request.params);

    const config = interfaceSchema.parse(request.body);

    try {
      // Generate network configuration
      let configContent = `auto ${iface}\n`;
      
      if (config.dhcp) {
        configContent += `iface ${iface} inet dhcp\n`;
      } else if (config.ip4) {
        configContent += `iface ${iface} inet static\n`;
        configContent += `  address ${config.ip4}\n`;
        if (config.netmask) {
          configContent += `  netmask ${config.netmask}\n`;
        }
        if (config.gateway) {
          configContent += `  gateway ${config.gateway}\n`;
        }
      }

      // Write configuration
      await execAsync(`echo '${configContent}' > /etc/network/interfaces.d/${iface}`);
      
      // Apply configuration
      await execAsync(`ifdown ${iface} && ifup ${iface}`);

      return { status: 'configured', iface };
    } catch (error) {
      throw new Error(`Failed to configure interface: ${error}`);
    }
  });

  // Get network connections
  fastify.get('/connections', async () => {
    try {
      const connections = await si.networkConnections();
      return { connections };
    } catch (error) {
      throw new Error(`Failed to get network connections: ${error}`);
    }
  });

  // Scan network
  fastify.post('/scan', async () => {
    try {
      const { stdout } = await execAsync('nmap -sn 192.168.1.0/24');
      return {
        status: 'completed',
        results: stdout
      };
    } catch (error) {
      throw new Error(`Failed to scan network: ${error}`);
    }
  });

  // Get network statistics
  fastify.get('/stats', async () => {
    try {
      const stats = await si.networkStats();
      return { stats };
    } catch (error) {
      throw new Error(`Failed to get network statistics: ${error}`);
    }
  });
};