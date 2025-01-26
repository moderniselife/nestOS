import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Stack,
  Button,
  IconButton,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  TextField,
  FormControl,
  InputLabel,
  Alert,
} from '@mui/material';
import {
  Storage as DiskIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  CheckCircle as HealthyIcon,
  Speed as SpeedIcon,
  Memory as TypeIcon,
  Link as MountIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '../../App';

interface StorageDevice {
  name: string;
  type: string;
  fstype: string;
  mount: string;
  size: number;
  model: string;
  serial: string;
  removable: boolean;
  protocol: string;
  smart?: {
    health: string;
    attributes: string;
  };
  layout?: {
    vendor: string;
    type: string;
    interfaceType: string;
    temperature: number;
    firmwareRevision: string;
  };
  filesystem?: {
    size: number;
    used: number;
    available: number;
    use: number;
  };
  bus?: string;
  path?: string;
}

interface Volume {
  name: string;
  type: string;
  devices: string[];
  mountPoint?: string;
  filesystem?: string;
}

interface NBD {
  name: string;
  device: string;
  host: string;
  port: number;
  size: number;
  connected: boolean;
}

function formatBytes(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) {
    return '0 B';
  }
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function getDeviceIcon(device: StorageDevice) {
  if (device.protocol === 'USB') {
    return 'usb';
  }
  if (device.protocol === 'NVMe') {
    return 'nvme';
  }
  if (device.bus === 'scsi') {
    return 'scsi';
  }
  return 'sata';
}

export default function Storage(): JSX.Element {
  const [createVolumeOpen, setCreateVolumeOpen] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [volumeType, setVolumeType] = useState<string>('single');
  const [volumeName, setVolumeName] = useState('');
  const [mountPoint, setMountPoint] = useState('');
  const [filesystem, setFilesystem] = useState('ext4');
  const queryClient = useQueryClient();

  const { data: storageData, isLoading: storageLoading } = useQuery({
    queryKey: ['storage-devices'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/storage/devices`);
      if (!response.ok) {
        throw new Error('Failed to fetch storage devices');
      }
      return response.json();
    },
    refetchInterval: 5000,
  });

  const {
    data: volumeData,
    isLoading: volumeLoading,
    isError: volumeError,
  } = useQuery({
    queryKey: ['storage-volumes'],
    queryFn: async () => {
      try {
        const response = await fetch(`${apiUrl}/api/storage/volumes`);
        if (!response.ok) {
          if (response.status === 500) {
            return { raids: [], mounts: [], nbds: [] };
          }
          throw new Error('Failed to fetch volumes');
        }
        return response.json();
      } catch (error) {
        return { raids: [], mounts: [], nbds: [] };
      }
    },
    refetchInterval: 5000,
    retry: false,
  });

  const handleCreateVolume = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/storage/volumes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: volumeName,
          type: volumeType,
          devices: selectedDevices,
          mountPoint,
          filesystem,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create volume');
      }

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['storage-volumes'] });
      await queryClient.invalidateQueries({ queryKey: ['storage-devices'] });

      setCreateVolumeOpen(false);
      setSelectedDevices([]);
      setVolumeName('');
      setMountPoint('');
    } catch (error) {
      console.error('Failed to create volume:', error);
    }
  };

  if (storageLoading) {
    return <LinearProgress />;
  }

  const raids = volumeData?.raids || [];
  const mounts = volumeData?.mounts || [];
  const nbds = volumeData?.nbds || [];

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Storage Management</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateVolumeOpen(true)}
        >
          Create Volume
        </Button>
      </Stack>

      {/* Physical Devices */}
      <Typography variant="h6" gutterBottom>
        Physical Devices
      </Typography>
      <Grid container spacing={3} mb={4}>
        {storageData?.devices.map((device: StorageDevice) => (
          <Grid item xs={12} md={6} key={device.name}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <DiskIcon color="primary" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6">
                      {device.model || device.name}
                      <Chip
                        size="small"
                        label={getDeviceIcon(device)}
                        color="primary"
                        sx={{ ml: 1 }}
                      />
                      {device.removable && (
                        <Chip size="small" label="Removable" variant="outlined" sx={{ ml: 1 }} />
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatBytes(device.size)} • {device.serial}
                    </Typography>
                  </Box>
                  {device.smart && (
                    <Tooltip title={`SMART Status: ${device.smart.health}`}>
                      {device.smart.health === 'PASSED' ? (
                        <HealthyIcon color="success" />
                      ) : (
                        <WarningIcon color="error" />
                      )}
                    </Tooltip>
                  )}
                </Stack>

                <Stack direction="row" spacing={2} mt={2}>
                  <Chip
                    icon={<TypeIcon />}
                    label={device.layout?.interfaceType || device.protocol}
                    variant="outlined"
                    size="small"
                  />
                  {device.layout?.temperature && (
                    <Chip
                      icon={<SpeedIcon />}
                      label={`${device.layout.temperature}°C`}
                      variant="outlined"
                      size="small"
                    />
                  )}
                  {device.mount && (
                    <Chip
                      icon={<MountIcon />}
                      label={device.mount}
                      variant="outlined"
                      size="small"
                    />
                  )}
                </Stack>

                {device.filesystem && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Usage
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={device.filesystem.use}
                      sx={{
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor:
                            device.filesystem.use > 90
                              ? 'error.main'
                              : device.filesystem.use > 75
                              ? 'warning.main'
                              : 'success.main',
                        },
                      }}
                    />
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {formatBytes(device.filesystem.used)} / {formatBytes(device.filesystem.size)}{' '}
                      ({device.filesystem.use}%)
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Volumes Section */}
      <Typography variant="h6" gutterBottom>
        Volumes
      </Typography>
      {volumeError ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          Volume management is not available in the current environment.
        </Alert>
      ) : (
        <Grid container spacing={3} mb={4}>
          {raids.map((volume: Volume) => (
            <Grid item xs={12} md={6} key={volume.name}>
              <Card>
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <DiskIcon color="primary" />
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="h6">
                        {volume.name}
                        <Chip size="small" label={volume.type} color="primary" sx={{ ml: 1 }} />
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {volume.devices.length} devices
                      </Typography>
                    </Box>
                    <IconButton
                      color="error"
                      onClick={async () => {
                        try {
                          await fetch(`${apiUrl}/api/storage/volumes/${volume.name}`, {
                            method: 'DELETE',
                          });
                          // Invalidate queries to refresh data
                          await queryClient.invalidateQueries({ queryKey: ['storage-volumes'] });
                          await queryClient.invalidateQueries({ queryKey: ['storage-devices'] });
                        } catch (error) {
                          console.error('Failed to delete volume:', error);
                        }
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Stack>

                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Devices
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {volume.devices.map((device) => (
                        <Chip key={device} label={device} variant="outlined" size="small" />
                      ))}
                    </Stack>
                  </Box>

                  {volume.mountPoint && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Mount Point
                      </Typography>
                      <Typography variant="body2">{volume.mountPoint}</Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* NBD Devices Section */}
      <Typography variant="h6" gutterBottom>
        Network Block Devices
      </Typography>
      <Grid container spacing={3} mb={4}>
        {nbds.map((nbd: NBD) => (
          <Grid item xs={12} md={6} key={nbd.name}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <DiskIcon color="primary" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6">
                      {nbd.name}
                      <Chip
                        size="small"
                        label={nbd.connected ? 'Connected' : 'Disconnected'}
                        color={nbd.connected ? 'success' : 'error'}
                        sx={{ ml: 1 }}
                      />
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {nbd.host}:{nbd.port} • {formatBytes(nbd.size)}
                    </Typography>
                  </Box>
                  <IconButton
                    color="error"
                    onClick={async () => {
                      try {
                        await fetch(`${apiUrl}/api/storage/nbd/${nbd.name}`, {
                          method: 'DELETE',
                        });
                        await queryClient.invalidateQueries({ queryKey: ['storage-volumes'] });
                      } catch (error) {
                        console.error('Failed to delete NBD:', error);
                      }
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Mounts Section */}
      <Typography variant="h6" gutterBottom>
        Mounts
      </Typography>
      <Grid container spacing={3} mb={4}>
        {mounts.map((mount: Volume) => (
          <Grid item xs={12} md={6} key={mount.name}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <MountIcon color="primary" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6">
                      {mount.name}
                      <Chip size="small" label={mount.type} color="primary" sx={{ ml: 1 }} />
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {mount.mountPoint}
                    </Typography>
                  </Box>
                  <IconButton
                    color="error"
                    onClick={async () => {
                      try {
                        await fetch(`${apiUrl}/api/storage/mounts/${mount.name}`, {
                          method: 'DELETE',
                        });
                        await queryClient.invalidateQueries({ queryKey: ['storage-volumes'] });
                      } catch (error) {
                        console.error('Failed to unmount:', error);
                      }
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Create Volume Dialog */}
      <Dialog
        open={createVolumeOpen}
        onClose={() => setCreateVolumeOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Volume</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 2 }}>
            <TextField
              label="Volume Name"
              value={volumeName}
              onChange={(e) => setVolumeName(e.target.value)}
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel>Volume Type</InputLabel>
              <Select
                value={volumeType}
                label="Volume Type"
                onChange={(e) => setVolumeType(e.target.value)}
              >
                <MenuItem value="single">Single Disk</MenuItem>
                <MenuItem value="raid0">RAID 0 (Stripe)</MenuItem>
                <MenuItem value="raid1">RAID 1 (Mirror)</MenuItem>
                <MenuItem value="raid5">RAID 5</MenuItem>
                <MenuItem value="raid6">RAID 6</MenuItem>
                <MenuItem value="raid10">RAID 10</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Devices</InputLabel>
              <Select
                multiple
                value={selectedDevices}
                label="Devices"
                onChange={(e) => {
                  const { value } = e.target;
                  setSelectedDevices(typeof value === 'string' ? value.split(',') : value);
                }}
              >
                {storageData?.devices.map((device: StorageDevice) => (
                  <MenuItem key={device.name} value={device.name}>
                    {device.name} ({formatBytes(device.size)})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Filesystem</InputLabel>
              <Select
                value={filesystem}
                label="Filesystem"
                onChange={(e) => setFilesystem(e.target.value)}
              >
                <MenuItem value="ext4">ext4</MenuItem>
                <MenuItem value="xfs">XFS</MenuItem>
                <MenuItem value="btrfs">Btrfs</MenuItem>
                <MenuItem value="zfs">ZFS</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Mount Point"
              value={mountPoint}
              onChange={(e) => setMountPoint(e.target.value)}
              fullWidth
            />

            {volumeType !== 'single' && (
              <Alert severity="info">
                {volumeType === 'raid0' &&
                  'RAID 0 stripes data across disks for performance but offers no redundancy.'}
                {volumeType === 'raid1' && 'RAID 1 mirrors data across disks for redundancy.'}
                {volumeType === 'raid5' &&
                  'RAID 5 requires at least 3 disks and provides single disk failure protection.'}
                {volumeType === 'raid6' &&
                  'RAID 6 requires at least 4 disks and provides dual disk failure protection.'}
                {volumeType === 'raid10' &&
                  'RAID 10 requires at least 4 disks and combines mirroring and striping.'}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateVolumeOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateVolume}
            disabled={!volumeName || selectedDevices.length === 0}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
