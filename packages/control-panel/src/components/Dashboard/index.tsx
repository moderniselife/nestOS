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
  Divider
} from '@mui/material';
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
  Build as BuildIcon
} from '@mui/icons-material';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiUrl } from '../../App';

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
    refetchInterval: 5000
  });

  const { data: storageInfo, isLoading: storageLoading } = useQuery({
    queryKey: ['storage-info'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/storage/devices`);
      if (!response.ok) {
        throw new Error('Failed to fetch storage info');
      }
      return response.json();
    },
    refetchInterval: 10000
  });

  const { data: networkStats, isLoading: networkLoading } = useQuery({
    queryKey: ['network-stats'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/network/stats`);
      if (!response.ok) {
        throw new Error('Failed to fetch network stats');
      }
      return response.json();
    },
    refetchInterval: 2000
  });

  const rebootMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/reboot`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to reboot system');
      return response.json();
    }
  });

  const shutdownMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/shutdown`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to shutdown system');
      return response.json();
    }
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/update`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to update system');
      return response.json();
    }
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

  const memoryUsagePercent = Math.round(
    (systemInfo.memory.used / systemInfo.memory.total) * 100
  );

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
                <Typography variant="body1">
                  {formatUptime(systemInfo.uptime)}
                </Typography>
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
                            <Typography variant="caption">
                              {Math.round(load)}%
                            </Typography>
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
                  {formatBytes(systemInfo.memory.used)} /{' '}
                  {formatBytes(systemInfo.memory.total)} ({memoryUsagePercent}%)
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
        {storageInfo?.devices && storageInfo.devices.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                  <DiskIcon color="primary" />
                  <Typography variant="h6">Storage</Typography>
                </Stack>
                <Grid container spacing={2}>
                  {storageInfo.devices.map((device: any) => (
                    device.filesystem && (
                      <Grid item xs={12} md={6} key={device.name}>
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="subtitle2">
                            {device.name} ({device.type})
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={device.filesystem.use}
                            sx={{ height: 8, borderRadius: 4, mt: 1 }}
                          />
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {formatBytes(device.filesystem.used)} / {formatBytes(device.filesystem.size)}
                            {device.smart && (
                              <Chip
                                size="small"
                                sx={{ ml: 1 }}
                                label={device.smart.health}
                                color={device.smart.health === 'PASSED' ? 'success' : 'error'}
                              />
                            )}
                          </Typography>
                        </Box>
                      </Grid>
                    )
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Network Status */}
        {networkStats?.stats && networkStats.stats.length > 0 && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                  <NetworkIcon color="primary" />
                  <Typography variant="h6">Network</Typography>
                </Stack>
                {networkStats.stats.map((stat: any) => (
                  <Box key={stat.iface} sx={{ mb: 2 }}>
                    <Typography variant="subtitle2">{stat.iface}</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">
                          Download
                        </Typography>
                        <Typography variant="body1">
                          {formatSpeed(stat.rx_sec)}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">
                          Upload
                        </Typography>
                        <Typography variant="body1">
                          {formatSpeed(stat.tx_sec)}
                        </Typography>
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
                    <Typography variant="h6">
                      {systemInfo.docker.containers.total}
                    </Typography>
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
                  <Typography variant="h6">
                    {systemInfo.docker.images}
                  </Typography>
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