import {
  Grid,
  Paper,
  Typography,
  Box,
  LinearProgress,
  Card,
  CardContent,
  Stack,
  Chip,
  Button,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Collapse,
  styled,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiUrl } from '../../App';
import {
  Memory as CpuIcon,
  Storage as RamIcon,
  Storage as DiskIcon,
  Cloud as DockerIcon,
  Refresh as UpdateIcon,
  PowerSettingsNew as PowerIcon,
  RestartAlt as RebootIcon,
  Speed as SpeedIcon,
  Check as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  NetworkCheck as NetworkIcon,
  Memory as ChipIcon,
  Build as BuildIcon,
  ViewCompact as ViewCompactIcon,
  NavigateBefore as NavigateBeforeIcon,
  NavigateNext as NavigateNextIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';

const AnimatedButton = styled(Button)(({ theme }) => ({
  position: 'relative',
  backgroundColor: '#000',
  color: 'rgba(255, 255, 255, 0.95)',
  borderRadius: '8px',
  padding: '8px 16px',
  overflow: 'hidden',
  transition: 'all 0.3s ease',
  textTransform: 'none',
  fontWeight: 500,
  letterSpacing: '0.5px',
  textShadow: '0 0 10px rgba(255, 255, 255, 0.3)',
  border: '2px solid rgba(255, 255, 255, 0.2)',
  backgroundImage: 'linear-gradient(#000, #000)',
  backgroundClip: 'padding-box',
  '&:hover': {
    transform: 'scale(1.02)',
    boxShadow: '0 0 20px rgba(0, 0, 0, 0.3)',
    border: '2px solid transparent',
    backgroundImage: 'linear-gradient(#000, #000), linear-gradient(45deg, #ff0000, #ff7300, #fffb00, #48ff00, #00ffd5, #002bff, #7a00ff, #ff00c8, #ff0000)',
    backgroundOrigin: 'border-box',
    backgroundClip: 'padding-box, border-box',
    backgroundSize: '100% 100%, 400%',
    animation: 'borderAnimation 20s linear infinite',
  },
  '& .MuiButton-startIcon': {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  '@keyframes borderAnimation': {
    '0%': {
      backgroundPosition: '0% 0%, 0 0',
    },
    '50%': {
      backgroundPosition: '0% 0%, 400% 0',
    },
    '100%': {
      backgroundPosition: '0% 0%, 0 0',
    },
  },
}));

function calculateDeviceUsage(devices: StorageDevice[]) {
  let totalUsed = 0;
  const mainDevice = devices[0];
  if (mainDevice.filesystem?.used !== undefined) {
    console.log('Using main device filesystem:', {
      name: mainDevice.name,
      used: mainDevice.filesystem.used,
      size: mainDevice.size
    });
    totalUsed = mainDevice.filesystem.used;
  } else {
    const partitions = devices.filter(dev => 
      dev.type === 'part' && 
      dev.filesystem?.used !== undefined &&
      !dev.mount?.includes('boot') && 
      !dev.mount?.includes('efi')
    );
    console.log('Using partitions:', partitions.map(p => ({
      name: p.name,
      mount: p.mount,
      used: p.filesystem?.used,
      size: p.size
    })));
    totalUsed = partitions.reduce((acc, dev) => 
      acc + dev.filesystem!.used, 0
    );
  }
  return { totalUsed, totalSize: mainDevice.size, usagePercent: Math.round((totalUsed / mainDevice.size) * 100) };
}

function groupDevices(devices: StorageDevice[]): Record<string, StorageDevice[]> {
  const groups: Record<string, StorageDevice[]> = {};
  
  // First, find all physical disk devices
  devices.forEach(device => {
    if (device.type === 'disk' && device.physical === 'SSD') {
      groups[device.name] = [device];
    }
  });

  // Then, add direct partitions to their parent disks
  devices.forEach(device => {
    if (device.type === 'part' && device.device && groups[device.device]) {
      groups[device.device].push(device);
    }
  });

  // Filter out empty groups and sort partitions by name
  Object.keys(groups).forEach(key => {
    if (groups[key].length === 0) {
      delete groups[key];
    } else {
      groups[key].sort((a, b) => a.name.localeCompare(b.name));
    }
  });

  return groups;
}

interface StorageDevice {
  name: string;
  identifier: string;
  type: string;
  fsType: string;
  mount: string;
  size: number;
  physical: string;
  uuid: string;
  label: string;
  model: string;
  serial: string;
  removable: boolean;
  protocol: string;
  group: string;
  device: string;
  smart: {
    health: string;
    attributes: string;
  } | null;
  layout: any | null;
  filesystem: {
    size: number;
    used: number;
    available: number;
    use: number;
  } | null;
}

interface StorageInfo {
  devices: StorageDevice[];
}

interface NetworkStat {
  iface: string;
  rx_sec: number;
  tx_sec: number;
}

interface NetworkStats {
  stats: NetworkStat[];
}

function formatBytes(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function formatSpeed(bytesPerSecond: number): string {
  return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`;
}

export default function Dashboard() {
  const { data: systemInfo, isLoading: systemLoading } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/info?detailed=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch system info');
      }
      return response.json();
    },
    refetchInterval: 5000,
  });

  const { data: storageInfo, isLoading: storageLoading } = useQuery<StorageInfo>({
    queryKey: ['storage-info'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/storage/devices`);
      if (!response.ok) {
        throw new Error('Failed to fetch storage info');
      }
      const data = await response.json();
      console.log('Storage Info:', JSON.stringify(data, null, 2));
      console.log('First device:', JSON.stringify(data.devices[0], null, 2));
      return data;
    },
    refetchInterval: 10000,
  });

  const { data: networkStats, isLoading: networkLoading } = useQuery<NetworkStats>({
    queryKey: ['network-stats'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/network/stats`);
      if (!response.ok) {
        throw new Error('Failed to fetch network stats');
      }
      return response.json();
    },
    refetchInterval: 2000,
  });

  const [showSystemPartitions, setShowSystemPartitions] = useState(false);
  const [compactView, setCompactView] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());
  const itemsPerPage = 4; // Number of disk groups per page

  const toggleDevice = (deviceName: string) => {
    setExpandedDevices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deviceName)) {
        newSet.delete(deviceName);
      } else {
        newSet.add(deviceName);
      }
      return newSet;
    });
  };

  const [statsDialog, setStatsDialog] = useState<{
    open: boolean;
    title: string;
    content: React.ReactNode;
  }>({ open: false, title: '', content: null });

  const dockerStatsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/docker/stats`, {
        method: 'GET',
      });
      if (!response.ok) throw new Error('Failed to fetch docker stats');
      return response.json();
    },
    onSuccess: (data) => {
      setStatsDialog({
        open: true,
        title: 'Docker Stats',
        content: (
          <List>
            {data.stats.map((stat: any) => (
              <ListItem key={stat.name}>
                <ListItemText
                  primary={stat.name}
                  secondary={
                    <Stack spacing={1}>
                      <Typography variant="body2">CPU: {stat.cpu}</Typography>
                      <Typography variant="body2">Memory: {stat.memory}</Typography>
                      <Typography variant="body2">Network I/O: {stat.network}</Typography>
                      <Typography variant="body2">Disk I/O: {stat.disk}</Typography>
                    </Stack>
                  }
                />
              </ListItem>
            ))}
          </List>
        ),
      });
    },
  });

  const networkTestMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/network/test`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to run network test');
      return response.json();
    },
    onSuccess: (data) => {
      setStatsDialog({
        open: true,
        title: 'Network Test Results',
        content: (
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Ping Test</Typography>
              <Typography>Host: {data.ping.host}</Typography>
              <Typography>Latency: {data.ping.latency.toFixed(2)}ms</Typography>
              <Typography>Packet Loss: {data.ping.packetLoss}%</Typography>
            </Box>
            {data.speedtest && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Speed Test</Typography>
                <Typography>Download: {(data.speedtest.download / 1e6).toFixed(2)} Mbps</Typography>
                <Typography>Upload: {(data.speedtest.upload / 1e6).toFixed(2)} Mbps</Typography>
                <Typography>Latency: {data.speedtest.latency}ms</Typography>
              </Box>
            )}
          </Stack>
        ),
      });
    },
  });

  const storageHealthMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/storage/health`, {
        method: 'GET',
      });
      if (!response.ok) throw new Error('Failed to check storage health');
      return response.json();
    },
    onSuccess: (data) => {
      setStatsDialog({
        open: true,
        title: 'Storage Health Status',
        content: (
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography>Overall Status:</Typography>
              <Chip
                label={data.overall}
                color={data.overall === 'healthy' ? 'success' : data.overall === 'warning' ? 'warning' : 'error'}
                size="small"
              />
            </Box>
            <List>
              {data.devices.map((device: any) => (
                <ListItem key={device.name}>
                  <ListItemText
                    primary={device.name}
                    secondary={
                      <Stack spacing={1}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2">Status:</Typography>
                          <Chip
                            label={device.status}
                            color={device.status === 'healthy' ? 'success' : device.status === 'warning' ? 'warning' : 'error'}
                            size="small"
                          />
                        </Box>
                        {device.smart && (
                          <>
                            <Typography variant="body2">SMART Health: {device.smart.health}</Typography>
                            {device.smart.temperature && (
                              <Typography variant="body2">Temperature: {device.smart.temperature}°C</Typography>
                            )}
                          </>
                        )}
                        {device.issues.length > 0 && (
                          <Typography variant="body2" color="error">
                            Issues: {device.issues.join(', ')}
                          </Typography>
                        )}
                      </Stack>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Stack>
        ),
      });
    },
  });

  const performanceTestMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/performance`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to run performance test');
      return response.json();
    },
    onSuccess: (data) => {
      setStatsDialog({
        open: true,
        title: 'Performance Test Results',
        content: (
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">CPU Performance</Typography>
              <Typography>Single Core: {data.cpu.singleCore.toFixed(2)}ms</Typography>
              <Typography>Multi Core: {data.cpu.multiCore.toFixed(2)}%</Typography>
              <Typography>Load Average: {data.cpu.loadAverage.map((load: number) => load.toFixed(2)).join(', ')}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Memory Performance</Typography>
              <Typography>Read Speed: {(data.memory.readSpeed / 1024).toFixed(2)} GB/s</Typography>
              <Typography>Write Speed: {(data.memory.writeSpeed / 1024).toFixed(2)} GB/s</Typography>
              <Typography>Latency: {data.memory.latency.toFixed(2)}ms</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Disk Performance</Typography>
              <Typography>Read Speed: {data.disk.readSpeed.toFixed(2)} GB/s</Typography>
              <Typography>Write Speed: {data.disk.writeSpeed.toFixed(2)} GB/s</Typography>
              <Typography>IOPS: {data.disk.iops.toFixed(0)}</Typography>
            </Box>
          </Stack>
        ),
      });
    },
  });

  const systemLogsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/logs`, {
        method: 'GET',
      });
      if (!response.ok) throw new Error('Failed to fetch system logs');
      return response.json();
    },
    onSuccess: (data) => {
      setStatsDialog({
        open: true,
        title: 'System Logs',
        content: (
          <Box sx={{ maxHeight: '400px', overflow: 'auto' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
              {data.logs}
            </pre>
          </Box>
        ),
      });
    },
  });

  const rebootMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/reboot`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to reboot system');
      return response.json();
    },
  });

  const shutdownMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/shutdown`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to shutdown system');
      return response.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/update`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to update system');
      return response.json();
    },
  });

  if (systemLoading || storageLoading || networkLoading) {
    return <LinearProgress />;
  }

  if (!systemInfo || !storageInfo || !networkStats) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">Failed to load system information</Typography>
      </Box>
    );
  }

  const memoryUsagePercent = Math.round((systemInfo.memory.used / systemInfo.memory.total) * 100);

  // Debug log for storage devices
  console.log('Storage Devices:', storageInfo?.devices);

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Dialog
        open={statsDialog.open}
        onClose={() => setStatsDialog({ open: false, title: '', content: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{statsDialog.title}</DialogTitle>
        <DialogContent>
          {statsDialog.content}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatsDialog({ open: false, title: '', content: null })}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Grid container spacing={3}>
        {/* Quick Actions */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(0,0,0,0.05)' }}>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6} md={3}>
                <AnimatedButton
                  startIcon={<UpdateIcon />}
                  onClick={() => updateMutation.mutate()}
                  fullWidth
                >
                  Update System
                </AnimatedButton>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <AnimatedButton
                  startIcon={<RebootIcon />}
                  onClick={() => rebootMutation.mutate()}
                  fullWidth
                >
                  Reboot
                </AnimatedButton>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <AnimatedButton
                  startIcon={<PowerIcon />}
                  onClick={() => shutdownMutation.mutate()}
                  fullWidth
                >
                  Shutdown
                </AnimatedButton>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <AnimatedButton
                  startIcon={<DockerIcon />}
                  onClick={() => dockerStatsMutation.mutate()}
                  disabled={dockerStatsMutation.isPending}
                  fullWidth
                >
                  {dockerStatsMutation.isPending ? 'Loading...' : 'Docker Stats'}
                </AnimatedButton>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <AnimatedButton
                  startIcon={<NetworkIcon />}
                  onClick={() => networkTestMutation.mutate()}
                  disabled={networkTestMutation.isPending}
                  fullWidth
                >
                  {networkTestMutation.isPending ? 'Testing...' : 'Network Test'}
                </AnimatedButton>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <AnimatedButton
                  startIcon={<DiskIcon />}
                  onClick={() => storageHealthMutation.mutate()}
                  disabled={storageHealthMutation.isPending}
                  fullWidth
                >
                  {storageHealthMutation.isPending ? 'Checking...' : 'Storage Health'}
                </AnimatedButton>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <AnimatedButton
                  startIcon={<SpeedIcon />}
                  onClick={() => performanceTestMutation.mutate()}
                  disabled={performanceTestMutation.isPending}
                  fullWidth
                >
                  {performanceTestMutation.isPending ? 'Testing...' : 'Performance Test'}
                </AnimatedButton>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <AnimatedButton
                  startIcon={<BuildIcon />}
                  onClick={() => systemLogsMutation.mutate()}
                  disabled={systemLogsMutation.isPending}
                  fullWidth
                >
                  {systemLogsMutation.isPending ? 'Loading...' : 'System Logs'}
                </AnimatedButton>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* System Overview */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              System Overview
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="subtitle2" color="text.secondary">
                  Hostname
                </Typography>
                <Typography variant="body1">{systemInfo.hostname}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="subtitle2" color="text.secondary">
                  OS
                </Typography>
                <Typography variant="body1">
                  {systemInfo.distro} {systemInfo.release}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="subtitle2" color="text.secondary">
                  Architecture
                </Typography>
                <Typography variant="body1">{systemInfo.arch}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="subtitle2" color="text.secondary">
                  Uptime
                </Typography>
                <Typography variant="body1">{formatUptime(systemInfo.uptime)}</Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* CPU and Memory */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                <CpuIcon color="primary" />
                <Typography variant="h6">CPU</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {systemInfo.cpu.brand}
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Overall Load
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={systemInfo.load?.currentLoad || 0}
                  sx={{ height: 10, borderRadius: 5 }}
                />
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {Math.round(systemInfo.load?.currentLoad || 0)}% Used
                </Typography>
              </Box>
              {systemInfo.load?.cpuLoad && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Per Core Load
                  </Typography>
                  <Grid container spacing={1} sx={{ mt: 1 }}>
                    {systemInfo.load.cpuLoad.map((load: number, index: number) => (
                      <Grid item xs={3} key={index}>
                        <Tooltip title={`Core ${index + 1}`}>
                          <Box>
                            <LinearProgress
                              variant="determinate"
                              value={load}
                              sx={{ height: 5, borderRadius: 5 }}
                            />
                            <Typography variant="caption">{Math.round(load)}%</Typography>
                          </Box>
                        </Tooltip>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                <RamIcon color="primary" />
                <Typography variant="h6">Memory</Typography>
              </Stack>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Usage
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={memoryUsagePercent}
                  sx={{ height: 10, borderRadius: 5 }}
                />
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {formatBytes(systemInfo.memory.used)} / {formatBytes(systemInfo.memory.total)} (
                  {memoryUsagePercent}%)
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Stack direction="row" spacing={1}>
                  <Chip
                    label={`${formatBytes(systemInfo.memory.free)} Free`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`${formatBytes(systemInfo.memory.available)} Available`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Storage Status */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                <DiskIcon color="primary" />
                <Typography variant="h6">Storage</Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Tooltip title="Show System Partitions">
                  <IconButton
                    size="small"
                    onClick={() => setShowSystemPartitions(!showSystemPartitions)}
                    color={showSystemPartitions ? "primary" : "default"}
                  >
                    <BuildIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Compact View">
                  <IconButton
                    size="small"
                    onClick={() => setCompactView(!compactView)}
                    color={compactView ? "primary" : "default"}
                  >
                    <ViewCompactIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
              {!storageInfo?.devices || storageInfo.devices.length === 0 ? (
                <Typography color="text.secondary">No storage devices found</Typography>
              ) : (
                <>
                  <Box sx={{ minHeight: 'auto', maxHeight: '400px', overflowY: 'auto', mb: 2 }}>
                    {Object.entries(groupDevices(storageInfo.devices))
                      .slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage)
                      .map(([diskName, devices]) => (
                        <Paper variant="outlined" sx={{ p: 2, mb: 2 }} key={diskName}>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              cursor: 'pointer'
                            }}
                            onClick={() => toggleDevice(diskName)}
                          >
                            <Box sx={{ flexGrow: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                  {devices[0].model || diskName}
                                </Typography>
                                {devices[0].smart && (
                                  <Chip
                                    size="small"
                                    sx={{ ml: 1 }}
                                    label={devices[0].smart.health}
                                    color={devices[0].smart.health === 'PASSED' ? 'success' : 'error'}
                                  />
                                )}
                              </Box>
                              {!expandedDevices.has(diskName) && (
                                <Box>
                                  <LinearProgress
                                    variant="determinate"
                                    value={(() => {
                                      let totalUsed = 0;
                                      const mainDevice = devices[0];
                                      if (mainDevice.filesystem?.used !== undefined) {
                                        console.log('Using main device filesystem:', {
                                          name: mainDevice.name,
                                          used: mainDevice.filesystem.used,
                                          size: mainDevice.size
                                        });
                                        totalUsed = mainDevice.filesystem.used;
                                      } else {
                                        const partitions = devices.filter(dev => 
                                          dev.type === 'part' && 
                                          dev.filesystem?.used !== undefined &&
                                          !dev.mount?.includes('boot') && 
                                          !dev.mount?.includes('efi')
                                        );
                                        console.log('Using partitions:', partitions.map(p => ({
                                          name: p.name,
                                          mount: p.mount,
                                          used: p.filesystem?.used,
                                          size: p.size
                                        })));
                                        totalUsed = partitions.reduce((acc, dev) => 
                                          acc + dev.filesystem!.used, 0
                                        );
                                      }
                                      return Math.round((totalUsed / mainDevice.size) * 100);
                                    })()}
                                    sx={{ height: 6, borderRadius: 3, mt: 1 }}
                                  />
                                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.75rem' }}>
                                    {(() => {
                                      let totalUsed = 0;
                                      const mainDevice = devices[0];
                                      if (mainDevice.filesystem?.used !== undefined) {
                                        console.log('Using main device filesystem:', {
                                          name: mainDevice.name,
                                          used: mainDevice.filesystem.used,
                                          size: mainDevice.size
                                        });
                                        totalUsed = mainDevice.filesystem.used;
                                      } else {
                                        const partitions = devices.filter(dev => 
                                          dev.type === 'part' && 
                                          dev.filesystem?.used !== undefined &&
                                          !dev.mount?.includes('boot') && 
                                          !dev.mount?.includes('efi')
                                        );
                                        console.log('Using partitions:', partitions.map(p => ({
                                          name: p.name,
                                          mount: p.mount,
                                          used: p.filesystem?.used,
                                          size: p.size
                                        })));
                                        totalUsed = partitions.reduce((acc, dev) => 
                                          acc + dev.filesystem!.used, 0
                                        );
                                      }
                                      return `${formatBytes(totalUsed)} / ${formatBytes(mainDevice.size)} • ${Math.round((totalUsed / mainDevice.size) * 100)}% used`;
                                    })()}
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                            {expandedDevices.has(diskName) ? (
                              <ExpandLessIcon color="action" />
                            ) : (
                              <ExpandMoreIcon color="action" />
                            )}
                          </Box>
                          <Collapse in={expandedDevices.has(diskName)} sx={{ mt: 2 }}>
                            <Grid container spacing={2}>
                              {devices
                                .filter(device => showSystemPartitions || (!device.name.includes('boot') && !device.name.includes('efi')))
                                .map((device: StorageDevice) => (
                                  <Grid item xs={12} md={compactView ? 6 : 12} key={device.name}>
                                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                                          {device.name.replace(diskName, '')}
                                          {device.label && ` (${device.label})`}
                                        </Typography>
                                        {device.mount && (
                                          <Chip
                                            size="small"
                                            label={device.mount}
                                            variant="outlined"
                                            sx={{ ml: 1 }}
                                          />
                                        )}
                                      </Box>
                                      {device.filesystem ? (
                                        <>
                                          <LinearProgress
                                            variant="determinate"
                                            value={device.filesystem.use || 0}
                                            sx={{ height: 6, borderRadius: 3, mb: 0.5 }}
                                          />
                                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                            {formatBytes(device.filesystem.used)} / {formatBytes(device.filesystem.size)}
                                            {' • '}{Math.round(device.filesystem.use)}% used
                                          </Typography>
                                        </>
                                      ) : (
                                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                          {formatBytes(device.size)} Total
                                          {device.fsType && ` • ${device.fsType}`}
                                        </Typography>
                                      )}
                                    </Paper>
                                  </Grid>
                                ))}
                            </Grid>
                          </Collapse>
                        </Paper>
                      ))}
                  </Box>
                  <Stack direction="row" spacing={2} justifyContent="center" alignItems="center">
                    <IconButton
                      onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                      disabled={currentPage === 0}
                    >
                      <NavigateBeforeIcon />
                    </IconButton>
                    <Typography>
                      Page {currentPage + 1} of {Math.ceil(Object.keys(groupDevices(storageInfo.devices)).length / itemsPerPage)}
                    </Typography>
                    <IconButton
                      onClick={() => setCurrentPage(prev => Math.min(
                        Math.ceil(Object.keys(groupDevices(storageInfo.devices)).length / itemsPerPage) - 1,
                        prev + 1
                      ))}
                      disabled={currentPage >= Math.ceil(Object.keys(groupDevices(storageInfo.devices)).length / itemsPerPage) - 1}
                    >
                      <NavigateNextIcon />
                    </IconButton>
                  </Stack>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Network Status */}
        {networkStats?.stats && networkStats.stats.length > 0 && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                  <NetworkIcon color="primary" />
                  <Typography variant="h6">Network</Typography>
                </Stack>
                {networkStats.stats.map((stat: NetworkStat) => (
                  <Box key={stat.iface} sx={{ mb: 2 }}>
                    <Typography variant="subtitle2">{stat.iface}</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">
                          Download
                        </Typography>
                        <Typography variant="body1">{formatSpeed(stat.rx_sec)}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">
                          Upload
                        </Typography>
                        <Typography variant="body1">{formatSpeed(stat.tx_sec)}</Typography>
                      </Grid>
                    </Grid>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* System Services */}
        {systemInfo.services && systemInfo.services.length > 0 && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                  <BuildIcon color="primary" />
                  <Typography variant="h6">Services</Typography>
                </Stack>
                <List>
                  {systemInfo.services.map((service: any) => (
                    <ListItem key={service.name}>
                      <ListItemIcon>
                        {service.running ? (
                          <CheckIcon color="success" />
                        ) : (
                          <ErrorIcon color="error" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={service.name}
                        secondary={`Start Mode: ${service.startmode}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Docker Status */}

        {/* System Services */}
        {systemInfo.services && systemInfo.services.length > 0 && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                  <BuildIcon color="primary" />
                  <Typography variant="h6">Services</Typography>
                </Stack>
                <List>
                  {systemInfo.services.map((service: any) => (
                    <ListItem key={service.name}>
                      <ListItemIcon>
                        {service.running ? (
                          <CheckIcon color="success" />
                        ) : (
                          <ErrorIcon color="error" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={service.name}
                        secondary={`Start Mode: ${service.startmode}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Docker Status */}
        {systemInfo.docker && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                  <DockerIcon color="primary" />
                  <Typography variant="h6">Docker</Typography>
                </Stack>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Total Containers
                    </Typography>
                    <Typography variant="h6">{systemInfo.docker.containers.total}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Running
                    </Typography>
                    <Typography variant="h6" color="success.main">
                      {systemInfo.docker.containers.running}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Paused
                    </Typography>
                    <Typography variant="h6" color="warning.main">
                      {systemInfo.docker.containers.paused}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Stopped
                    </Typography>
                    <Typography variant="h6" color="error.main">
                      {systemInfo.docker.containers.stopped}
                    </Typography>
                  </Grid>
                </Grid>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Images Available
                  </Typography>
                  <Typography variant="h6">{systemInfo.docker.images}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Hardware Information */}
        {systemInfo.system && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                  <ChipIcon color="primary" />
                  <Typography variant="h6">Hardware Information</Typography>
                </Stack>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Typography variant="subtitle2" color="text.secondary">
                      System
                    </Typography>
                    <Typography variant="body1">
                      {systemInfo.system.manufacturer} {systemInfo.system.model}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Serial: {systemInfo.system.serial}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Typography variant="subtitle2" color="text.secondary">
                      CPU Details
                    </Typography>
                    <Typography variant="body1">
                      {systemInfo.cpu.manufacturer} {systemInfo.cpu.brand}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {systemInfo.cpu.cores} Cores ({systemInfo.cpu.physicalCores} Physical)
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Memory Type
                    </Typography>
                    <Typography variant="body1">
                      {formatBytes(systemInfo.memory.total)} Total RAM
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
