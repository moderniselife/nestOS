import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Stack,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import {
  Storage as DiskIcon,
  PlayArrow as MountIcon,
  Stop as UnmountIcon,
  Delete as FormatIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '../../App';

function formatBytes(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

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

export default function Storage() {
  const { data: storageInfo, isLoading } = useQuery({
    queryKey: ['storage-info'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/storage/disks`);
      if (!response.ok) {
        throw new Error('Failed to fetch storage info');
      }
      return response.json();
    },
    refetchInterval: 5000
  });

  if (isLoading) {
    return <LinearProgress />;
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h5" gutterBottom>
        Storage Management
      </Typography>

      <Grid container spacing={3}>
        {storageInfo?.disks.map((disk: DiskInfo) => (
          <Grid item xs={12} key={disk.device}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <DiskIcon color="primary" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6">
                      {disk.model || disk.name}
                      {disk.removable && (
                        <Chip
                          size="small"
                          label="Removable"
                          color="info"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {disk.device} • {formatBytes(disk.size)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Tooltip title={disk.mount ? 'Unmount' : 'Mount'}>
                      <IconButton color={disk.mount ? 'error' : 'success'}>
                        {disk.mount ? <UnmountIcon /> : <MountIcon />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Format">
                      <IconButton color="warning">
                        <FormatIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>

                {disk.smart && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      S.M.A.R.T Status
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <WarningIcon
                        color={disk.smart.includes('PASSED') ? 'success' : 'error'}
                        fontSize="small"
                      />
                      <Typography variant="body2">
                        {disk.smart.includes('PASSED')
                          ? 'Healthy'
                          : 'Issues Detected'}
                      </Typography>
                    </Stack>
                  </Box>
                )}

                {disk.mount && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Mount Point
                    </Typography>
                    <Typography variant="body2">{disk.mount}</Typography>
                  </Box>
                )}

                {storageInfo?.filesystems
                  .filter((fs: any) => fs.mount === disk.mount)
                  .map((fs: any) => {
                    const usedPercent = (fs.used / fs.size) * 100;
                    return (
                      <Box key={fs.mount} sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Usage
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={usedPercent}
                          sx={{
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            '& .MuiLinearProgress-bar': {
                              backgroundColor:
                                usedPercent > 90
                                  ? 'error.main'
                                  : usedPercent > 75
                                  ? 'warning.main'
                                  : 'success.main'
                            }
                          }}
                        />
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          {formatBytes(fs.used)} / {formatBytes(fs.size)} (
                          {Math.round(usedPercent)}%)
                        </Typography>
                      </Box>
                    );
                  })}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}