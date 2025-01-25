declare module 'systeminformation' {
  export interface CpuData {
    manufacturer: string;
    brand: string;
    cores: number;
    physicalCores: number;
    speed: number;
    temperature: number;
  }

  export interface MemData {
    total: number;
    free: number;
    used: number;
    active: number;
    available: number;
    swaptotal: number;
    swapused: number;
    swapfree: number;
  }

  export interface OsData {
    platform: string;
    distro: string;
    release: string;
    hostname: string;
    arch: string;
    uptime: number;
  }

  export interface SystemData {
    manufacturer: string;
    model: string;
    version: string;
    serial: string;
    uuid: string;
  }

  export interface BlockDevice {
    name: string;
    type: string;
    fstype: string;
    mount: string;
    size: number;
    physical: string;
    uuid: string;
    label: string;
    model: string;
    serial: string;
    removable: boolean;
    protocol: string;
  }

  export interface DiskLayout {
    device: string;
    type: string;
    name: string;
    vendor: string;
    size: number;
    bytesPerSector: number;
    totalCylinders: number;
    totalHeads: number;
    totalSectors: number;
    totalTracks: number;
    tracksPerCylinder: number;
    sectorsPerTrack: number;
    firmwareRevision: string;
    serialNum: string;
    interfaceType: string;
    smartStatus: string;
    temperature: number;
  }

  export interface FSSize {
    fs: string;
    type: string;
    size: number;
    used: number;
    available: number;
    use: number;
    mount: string;
  }

  export interface NetworkInterface {
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

  export interface NetworkStats {
    iface: string;
    operstate: string;
    rx_bytes: number;
    rx_dropped: number;
    rx_errors: number;
    tx_bytes: number;
    tx_dropped: number;
    tx_errors: number;
    rx_sec: number;
    tx_sec: number;
  }

  export interface NetworkConnection {
    protocol: string;
    localAddress: string;
    localPort: string;
    peerAddress: string;
    peerPort: string;
    state: string;
  }

  export interface CurrentLoad {
    avgLoad: number;
    currentLoad: number;
    currentLoadUser: number;
    currentLoadSystem: number;
    cpus: Array<{
      load: number;
      loadUser: number;
      loadSystem: number;
    }>;
  }

  export interface DockerInfo {
    containers: number;
    containersRunning: number;
    containersPaused: number;
    containersStopped: number;
    images: number;
  }

  export interface Service {
    name: string;
    running: boolean;
    startmode: string;
    pids: number[];
    cpu: number;
    mem: number;
  }

  export interface SystemInfo {
    cpu(): Promise<CpuData>;
    mem(): Promise<MemData>;
    osInfo(): Promise<OsData>;
    system(): Promise<SystemData>;
    blockDevices(): Promise<BlockDevice[]>;
    diskLayout(): Promise<DiskLayout[]>;
    fsSize(): Promise<FSSize[]>;
    networkInterfaces(): Promise<NetworkInterface[]>;
    networkStats(): Promise<NetworkStats[]>;
    networkConnections(): Promise<NetworkConnection[]>;
    networkGatewayDefault(): Promise<string>;
    networkInterfaceDefault(): Promise<string>;
    currentLoad(): Promise<CurrentLoad>;
    dockerInfo(): Promise<DockerInfo>;
    services(serviceName: string): Promise<Service[]>;
  }

  const si: SystemInfo;
  export default si;
}