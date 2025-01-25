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

function groupDevices(devices: StorageDevice[]): Record<string, StorageDevice[]> {
  const groups: Record<string, StorageDevice[]> = {};
  devices.forEach(device => {
    // Extract the base device name (e.g., '/dev/disk0' from '/dev/disk0s1')
    const baseName = device.name.replace(/[sp][0-9]+$/, '');
    if (!groups[baseName]) {
      groups[baseName] = [];
    }
    groups[baseName].push(device);
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
      console.log('Storage Info:', data); // Debug log
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
      <Grid container spacing={3}>
        {/* Quick Actions */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<UpdateIcon />}
                onClick={() => updateMutation.mutate()}
              >
                Update System
              </Button>
              <Button
                variant="contained"
                color="warning"
                startIcon={<RebootIcon />}
                onClick={() => rebootMutation.mutate()}
              >
                Reboot
              </Button>
              <Button
                variant="contained"
                color="error"
                startIcon={<PowerIcon />}
                onClick={() => shutdownMutation.mutate()}
              >
                Shutdown
              </Button>
            </Stack>
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
                  <Box sx={{ height: '400px', overflowY: 'auto', mb: 2 }}>
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
                            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
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
