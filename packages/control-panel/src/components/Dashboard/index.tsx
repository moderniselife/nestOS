import {
  Grid,
  Paper,
  Typography,
  Box,
  LinearProgress,
  Card,
  CardContent,
  Stack,
  Chip
} from '@mui/material';
import {
  Memory as CpuIcon,
  Storage as RamIcon,
  Storage as DiskIcon,
  Cloud as DockerIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
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

export default function Dashboard() {
  const { data: systemInfo, isLoading } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/info?detailed=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch system info');
      }
      return response.json();
    },
    refetchInterval: 5000 // Refresh every 5 seconds
  });

  if (isLoading) {
    return <LinearProgress />;
  }

  const memoryUsagePercent = Math.round(
    (systemInfo.memory.used / systemInfo.memory.total) * 100
  );

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* System Overview */}
      <Grid container spacing={3}>
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

        {/* Resource Cards */}
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
                  Load Average
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
              <Box sx={{ mt: 2 }}>
                <Stack direction="row" spacing={1}>
                  <Chip
                    label={`${systemInfo.cpu.cores} Cores`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`${systemInfo.cpu.physicalCores} Physical`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>
              </Box>
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
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}