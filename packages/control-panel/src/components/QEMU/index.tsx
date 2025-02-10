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
  Chip,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  MenuItem,
  FormControlLabel,
  Switch,
  FormControl,
  InputLabel,
  ListSubheader,
  Select,
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Monitor as ConsoleIcon,
  Edit as EditIcon,
  Article as LogsIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiUrl } from '../../App';
import { CreateVMDialog } from './CreateVMDialog';

interface VM {
  name: string;
  cpu: number;
  memory: number;
  disk: number;
  status: 'running' | 'stopped';
  network?: {
    type: 'user' | 'bridge';
    bridge?: string;
  };
  vnc?: boolean;
  useKvm?: boolean;
  cpuModel?: string;
  cpuSearchQuery?: string;
  leechcore?: {
    enabled: boolean;
    shmName?: string;
    qmpSocket?: string;
  };
}

export default function QEMU(): JSX.Element {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedVM, setSelectedVM] = useState<VM | null>(null);
  const queryClient = useQueryClient();

  const { data: cpusData } = useQuery({
    queryKey: ['vm-cpus'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/qemu/cpus`);
      if (!response.ok) {
        throw new Error('Failed to fetch CPU models');
      }
      return response.json();
    },
  });

  const { data: vmLogs, error: logsError } = useQuery({
    queryKey: ['vm-logs', selectedVM?.name],
    queryFn: async () => {
      if (!selectedVM) {
        return '';
      }
      const response = await fetch(`${apiUrl}/api/qemu/vms/${selectedVM.name}/logs`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch logs');
      }
      const data = await response.json();
      return data.logs;
    },
    enabled: !!selectedVM,
    refetchInterval: 5000,
  });

  const updateVM = useMutation({
    mutationFn: async (data: VM) => {
      const response = await fetch(`${apiUrl}/api/qemu/vms/${data.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to update VM');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      setEditDialogOpen(false);
    },
  });

  const startVM = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch(`${apiUrl}/api/qemu/vms/${name}/start`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to start VM');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
    },
  });

  const stopVM = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch(`${apiUrl}/api/qemu/vms/${name}/stop`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to stop VM');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
    },
  });

  const deleteVM = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch(`${apiUrl}/api/qemu/vms/${name}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete VM');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
    },
  });

  const {
    data: vms,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['vms'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/qemu/vms`);
      if (!response.ok) {
        throw new Error('Failed to fetch VMs');
      }
      return response.json();
    },
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <LinearProgress />;
  }

  if (error) {
    return (
      <Box sx={{ flexGrow: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5">Virtual Machines</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create VM
          </Button>
        </Stack>
        <Alert severity="error" sx={{ mt: 2 }}>
          Failed to load virtual machines. Please try again.
        </Alert>
        <CreateVMDialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} />
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Virtual Machines</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create VM
        </Button>
      </Stack>

      <Grid container spacing={3}>
        {vms?.map((vm: VM) => (
          <Grid item xs={12} key={vm.name}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6">
                      {vm.name}
                      <Chip
                        size="small"
                        label={vm.status}
                        color={vm.status === 'running' ? 'success' : 'error'}
                        sx={{ ml: 1 }}
                      />
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      CPU: {vm.cpu} cores | Memory: {vm.memory}MB | Disk: {vm.disk}GB
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    {vm.status === 'running' ? (
                      <>
                        {vm.vnc && (
                          <Tooltip title="Open Console">
                            <IconButton
                              color="primary"
                              onClick={() =>
                                window.open(
                                  `http://${window.location.hostname}:6080/vnc.html?host=${window.location.hostname}&port=5900`
                                )
                              }
                            >
                              <ConsoleIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="View Logs">
                          <IconButton color="info" onClick={() => setSelectedVM(vm)}>
                            <LogsIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Stop">
                          <IconButton color="error" onClick={() => stopVM.mutate(vm.name)}>
                            <StopIcon />
                          </IconButton>
                        </Tooltip>
                      </>
                    ) : (
                      <Tooltip title="Start">
                        <IconButton color="success" onClick={() => startVM.mutate(vm.name)}>
                          <StartIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Edit">
                      <IconButton
                        onClick={() => {
                          setSelectedVM(vm);
                          setEditDialogOpen(true);
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton color="error" onClick={() => deleteVM.mutate(vm.name)}>
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>

                {vm.network && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Network
                    </Typography>
                    <Typography variant="body2">
                      Type: {vm.network.type}
                      {vm.network.bridge && ` | Bridge: ${vm.network.bridge}`}
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <CreateVMDialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} />
      {selectedVM && (
        <>
          <Dialog
            open={editDialogOpen}
            onClose={() => setEditDialogOpen(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Edit VM: {selectedVM.name}</DialogTitle>
            <DialogContent>
              <Stack spacing={3} sx={{ mt: 1 }}>
                <FormControl fullWidth>
                  <InputLabel>CPU Model</InputLabel>
                  <Select
                    value={selectedVM.cpuModel || ''}
                    label="CPU Model"
                    onChange={(e) =>
                      setSelectedVM({
                        ...selectedVM,
                        cpuModel: e.target.value,
                      })
                    }
                    onOpen={() => setSelectedVM({ ...selectedVM, cpuSearchQuery: '' })}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <MenuItem>
                      <TextField
                        size="small"
                        autoFocus
                        placeholder="Search CPU models..."
                        fullWidth
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setSelectedVM({ ...selectedVM, cpuSearchQuery: e.target.value })
                        }
                        value={selectedVM.cpuSearchQuery || ''}
                      />
                    </MenuItem>
                    <MenuItem value="">Default</MenuItem>
                    {cpusData?.categories &&
                      Object.entries(cpusData.categories).map(([category, cpus]) => {
                        const filteredCPUs = (cpus as any[]).filter(
                          (cpu) =>
                            !selectedVM.cpuSearchQuery ||
                            cpu.model
                              .toLowerCase()
                              .includes(selectedVM.cpuSearchQuery.toLowerCase()) ||
                            cpu.description
                              .toLowerCase()
                              .includes(selectedVM.cpuSearchQuery.toLowerCase())
                        );

                        if (filteredCPUs.length === 0) {
                          return null;
                        }

                        return [
                          <ListSubheader key={category}>{category}</ListSubheader>,
                          filteredCPUs.map((cpu: { model: string; description: string }) => (
                            <MenuItem key={cpu.model} value={cpu.model}>
                              {cpu.model} {cpu.description ? `- ${cpu.description}` : ''}
                            </MenuItem>
                          )),
                        ];
                      })}
                  </Select>
                </FormControl>
                <TextField
                  label="CPU Cores"
                  type="number"
                  fullWidth
                  value={selectedVM.cpu}
                  onChange={(e) =>
                    setSelectedVM({
                      ...selectedVM,
                      cpu: parseInt(e.target.value),
                    })
                  }
                  inputProps={{ min: 1 }}
                />
                <TextField
                  label="Memory (MB)"
                  type="number"
                  fullWidth
                  value={selectedVM.memory}
                  onChange={(e) =>
                    setSelectedVM({
                      ...selectedVM,
                      memory: parseInt(e.target.value),
                    })
                  }
                  inputProps={{ min: 512 }}
                />
                <TextField
                  label="Disk Size (GB)"
                  type="number"
                  fullWidth
                  value={selectedVM.disk}
                  onChange={(e) =>
                    setSelectedVM({
                      ...selectedVM,
                      disk: parseInt(e.target.value),
                    })
                  }
                  inputProps={{ min: 1 }}
                />
                {selectedVM.network && (
                  <TextField
                    label="Network Type"
                    select
                    fullWidth
                    value={selectedVM.network.type}
                    onChange={(e) =>
                      setSelectedVM({
                        ...selectedVM,
                        network: {
                          type: e.target.value as 'user' | 'bridge',
                          ...(e.target.value === 'bridge'
                            ? { bridge: selectedVM.network?.bridge || '' }
                            : {}),
                        },
                      })
                    }
                  >
                    <MenuItem value="user">User (NAT)</MenuItem>
                    <MenuItem value="bridge">Bridge</MenuItem>
                  </TextField>
                )}
                {selectedVM.network && (
                  <TextField
                    label="Bridge Interface"
                    fullWidth
                    value={selectedVM.network.bridge || ''}
                    onChange={(e) =>
                      setSelectedVM({
                        ...selectedVM,
                        network: {
                          type: selectedVM?.network?.type || 'bridge',
                          ...selectedVM.network,
                          bridge: e.target.value,
                        },
                      })
                    }
                  />
                )}
                <FormControlLabel
                  control={
                    <Switch
                      checked={selectedVM.vnc || false}
                      onChange={(e) =>
                        setSelectedVM({
                          ...selectedVM,
                          vnc: e.target.checked,
                        })
                      }
                    />
                  }
                  label="Enable VNC Console"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={selectedVM.useKvm ?? true}
                      onChange={(e) =>
                        setSelectedVM({
                          ...selectedVM,
                          useKvm: e.target.checked,
                        })
                      }
                    />
                  }
                  label="Use KVM"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={selectedVM.leechcore?.enabled || false}
                      onChange={(e) =>
                        setSelectedVM({
                          ...selectedVM,
                          leechcore: {
                            enabled: e.target.checked,
                            shmName: selectedVM.leechcore?.shmName || '',
                            qmpSocket: selectedVM.leechcore?.qmpSocket || '',
                          },
                        })
                      }
                    />
                  }
                  label="Enable LeechCore Memory Access"
                />

                {selectedVM.leechcore?.enabled && (
                  <>
                    <TextField
                      label="Shared Memory Name"
                      fullWidth
                      value={selectedVM.leechcore?.shmName || ''}
                      onChange={(e) =>
                        setSelectedVM({
                          ...selectedVM,
                          leechcore: {
                            enabled: selectedVM.leechcore?.enabled || false,
                            shmName: e.target.value,
                            qmpSocket: selectedVM.leechcore?.qmpSocket || '',
                          },
                        })
                      }
                      helperText="Name of the shared memory file in /dev/shm/"
                      required={selectedVM.leechcore?.enabled}
                    />

                    <TextField
                      label="QMP Socket Path"
                      fullWidth
                      value={selectedVM.leechcore?.qmpSocket || ''}
                      onChange={(e) =>
                        setSelectedVM({
                          ...selectedVM,
                          leechcore: {
                            enabled: selectedVM.leechcore?.enabled || false,
                            shmName: selectedVM.leechcore?.shmName || '',
                            qmpSocket: e.target.value,
                          },
                        })
                      }
                      helperText="Path to QMP socket for memory range queries"
                      required={selectedVM.leechcore?.enabled}
                    />
                  </>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => updateVM.mutate(selectedVM)} variant="contained">
                Save Changes
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={!!selectedVM && !editDialogOpen}
            onClose={() => setSelectedVM(null)}
            maxWidth="lg"
            fullWidth
          >
            <DialogTitle>VM Logs: {selectedVM?.name}</DialogTitle>
            <DialogContent>
              {logsError ? (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No logs available. The VM might not have started yet.
                </Alert>
              ) : (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    backgroundColor: '#f5f5f5',
                    padding: 2,
                    borderRadius: 1,
                    maxHeight: '60vh',
                    overflow: 'auto',
                  }}
                >
                  {vmLogs || 'No logs available'}
                </pre>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedVM(null)}>Close</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Box>
  );
}
