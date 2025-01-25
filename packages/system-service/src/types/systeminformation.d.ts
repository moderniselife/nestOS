declare module 'systeminformation' {
  export interface OsData extends Systeminformation.OsData {
    uptime: number;
    hostname: string;
    platform: string;
    distro: string;
    release: string;
    arch: string;
  }

  export interface BlockDevicesData extends Systeminformation.BlockDevicesData {
    name: string;
    type: string;
    model: string;
    size: number;
    serial?: string;
    removable: boolean;
    protocol?: string;
    uuid?: string;
    label?: string;
    mount?: string;
  }

  export interface DockerInfoData extends Systeminformation.DockerInfoData {
    containers: number;
    containersRunning: number;
    containersPaused: number;
    containersStopped: number;
    images: number;
    MemoryLimit: boolean;
    CpuCfsPeriod: boolean;
    CpuCfsQuota: boolean;
  }

  export interface CurrentLoadData extends Systeminformation.CurrentLoadData {
    avgLoad: number;
    currentLoad: number;
    cpus: Array<{ load: number }>;
  }

  export interface NetworkInterfaceData {
    iface: string;
    ifaceName: string;
    ip4: string;
    ip6: string;
    mac: string;
    internal: boolean;
    virtual: boolean;
    operstate: string;
    type: string;
    duplex: string;
    speed: number;
    dhcp: boolean;
  }

  export interface NetworkConnectionData {
    protocol: string;
    localAddress: string;
    localPort: string;
    peerAddress: string;
    peerPort: string;
    state: string;
  }

  export interface SystemData {
    manufacturer: string;
    model: string;
    version: string;
    serial: string;
    uuid: string;
  }

  export interface Systeminformation {
    osInfo(): Promise<OsData>;
    blockDevices(): Promise<BlockDevicesData[]>;
    dockerInfo(): Promise<DockerInfoData>;
    currentLoad(): Promise<CurrentLoadData>;
    system(): Promise<SystemData>;
    networkInterfaces(): Promise<NetworkInterfaceData[]>;
    networkGatewayDefault(): Promise<string>;
    networkInterfaceDefault(): Promise<string>;
    networkConnections(): Promise<NetworkConnectionData[]>;
  }

  const si: {
    osInfo(): Promise<OsData>;
    system(): Promise<SystemData>;
    blockDevices(): Promise<BlockDevicesData[]>;
    dockerInfo(): Promise<DockerInfoData>;
    currentLoad(): Promise<CurrentLoadData>;
    cpu(): Promise<Systeminformation.CpuData>;
    mem(): Promise<Systeminformation.MemData>;
    fsSize(): Promise<Systeminformation.FsSizeData[]>;
    networkStats(): Promise<Systeminformation.NetworkStatsData[]>;
    networkInterfaces(): Promise<NetworkInterfaceData[]>;
    networkGatewayDefault(): Promise<string>;
    networkInterfaceDefault(): Promise<string>;
    networkConnections(): Promise<NetworkConnectionData[]>;
    services(serviceName: string): Promise<Systeminformation.ServicesData[]>;
  };

  export default si;
}