import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Typography,
  Alert,
  Chip,
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RestartIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Speed as AcceleratedIcon,
  SlowMotionVideo as EmulatedIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '../../App';

interface VM {
  id: string;
  name: string;
  state: string;
}

interface CreateVMForm {
  name: string;
  cpu: number;
  memory: number;
  disk: number;
  iso?: string;
}

interface Capabilities {
  kvm: boolean;
  emulation: boolean;
  provider: string;
}

export default function VM(): JSX.Element {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateVMForm>({
    name: '',
    cpu: 1,
    memory: 1024,
    disk: 10,
  });

  // Fetch virtualization capabilities
  const { data: capabilities } = useQuery<Capabilities>({
    queryKey: ['vm-capabilities'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/vm/capabilities`);
      if (!response.ok) {
        throw new Error('Failed to fetch capabilities');
      }
      return response.json();
    },
  });

  // Fetch VMs
  const { data: vms, isLoading } = useQuery({
    queryKey: ['vms'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/vm/list`);
      if (!response.ok) {
        throw new Error('Failed to fetch VMs');
      }
      return response.json();
    },
  });

  // Fetch available ISOs
  const { data: isos } = useQuery({
    queryKey: ['isos'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/vm/isos`);
      if (!response.ok) {
        throw new Error('Failed to fetch ISOs');
      }
      return response.json();
    },
  });

  // VM actions mutation
  const vmAction = useMutation({
    mutationFn: async ({ name, action }: { name: string; action: string }) => {
      const response = await fetch(`${apiUrl}/api/vm/${name}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        throw new Error(`Failed to ${action} VM`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
    },
  });

  // Create VM mutation
  const createVM = useMutation({
    mutationFn: async (data: CreateVMForm) => {
      const response = await fetch(`${apiUrl}/api/vm/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to create VM');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      setCreateDialogOpen(false);
      setCreateForm({
        name: '',
        cpu: 1,
        memory: 1024,
        disk: 10,
      });
    },
  });

  const handleAction = (name: string, action: string) => {
    vmAction.mutate({ name, action });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createVM.mutate(createForm);
  };

  if (isLoading) {
    return (
      <Box p={3}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" component="h1" gutterBottom>
            Virtual Machines
          </Typography>
          {capabilities && (
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                icon={capabilities.kvm ? <AcceleratedIcon /> : <EmulatedIcon />}
                label={`Using ${capabilities.provider}`}
                color={capabilities.kvm ? 'success' : 'warning'}
                variant="outlined"
              />
              {!capabilities.kvm && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  KVM acceleration is not available. VMs will run in emulation mode, which may be
                  slower.
                </Alert>
              )}
            </Box>
          )}
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create VM
        </Button>
      </Box>

      <Grid container spacing={3}>
        {vms?.vms.map((vm: VM) => (
          <Grid item xs={12} md={6} lg={4} key={vm.id}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {vm.name}
                </Typography>
                <Typography color="textSecondary" gutterBottom>
                  Status: {vm.state}
                </Typography>
                <Box mt={2} display="flex" gap={1}>
                  <IconButton
                    onClick={() => handleAction(vm.name, 'start')}
                    disabled={vm.state === 'running'}
                    color="primary"
                    size="small"
                  >
                    <StartIcon />
                  </IconButton>
                  <IconButton
                    onClick={() => handleAction(vm.name, 'stop')}
                    disabled={vm.state !== 'running'}
                    color="primary"
                    size="small"
                  >
                    <StopIcon />
                  </IconButton>
                  <IconButton
                    onClick={() => handleAction(vm.name, 'restart')}
                    disabled={vm.state !== 'running'}
                    color="primary"
                    size="small"
                  >
                    <RestartIcon />
                  </IconButton>
                  <IconButton
                    onClick={() => handleAction(vm.name, 'delete')}
                    color="error"
                    size="small"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <form onSubmit={handleCreateSubmit}>
          <DialogTitle>Create Virtual Machine</DialogTitle>
          <DialogContent>
            {capabilities && !capabilities.kvm && (
              <Alert severity="info" sx={{ mb: 2 }}>
                This VM will run in emulation mode using QEMU TCG.
              </Alert>
            )}
            <Box display="flex" flexDirection="column" gap={2} mt={2}>
              <TextField
                label="Name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                required
              />
              <TextField
                label="CPU Cores"
                type="number"
                value={createForm.cpu}
                onChange={(e) => setCreateForm({ ...createForm, cpu: parseInt(e.target.value) })}
                required
                inputProps={{ min: 1 }}
              />
              <TextField
                label="Memory (MB)"
                type="number"
                value={createForm.memory}
                onChange={(e) => setCreateForm({ ...createForm, memory: parseInt(e.target.value) })}
                required
                inputProps={{ min: 512 }}
              />
              <TextField
                label="Disk Size (GB)"
                type="number"
                value={createForm.disk}
                onChange={(e) => setCreateForm({ ...createForm, disk: parseInt(e.target.value) })}
                required
                inputProps={{ min: 1 }}
              />
              {isos?.isos.length > 0 && (
                <Select
                  value={createForm.iso || ''}
                  onChange={(e) => setCreateForm({ ...createForm, iso: e.target.value })}
                  displayEmpty
                >
                  <MenuItem value="">
                    <em>No ISO</em>
                  </MenuItem>
                  {isos.isos.map((iso: { path: string; name: string }) => (
                    <MenuItem key={iso.path} value={iso.path}>
                      {iso.name}
                    </MenuItem>
                  ))}
                </Select>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" color="primary">
              Create
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
