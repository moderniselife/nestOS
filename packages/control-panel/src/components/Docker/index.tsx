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
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Refresh as RestartIcon,
  Add as AddIcon,
  Terminal as LogsIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiUrl } from '../../App';
import { CreateContainerDialog } from './CreateContainerDialog';
// Add to imports
import { ImageSearchDialog } from './ImageSearchDialog';
// Add to imports
import { LogsDialog } from './LogsDialog';
import { EditContainerDialog } from './EditContainerDialog';

interface Port {
  PublicPort?: number;
  PrivatePort: number;
  Type: string;
}

// interface Container {
//   Id: string;
//   Names: string[];
//   Image: string;
//   State: string;
//   Status: string;
//   Ports: Port[];
//   Command: string;
// }

interface Container {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Ports: Port[];
  Command: string;
  Config: {
    Hostname: string;
    Env: string[];
    Cmd: string[];
    ExposedPorts: { [key: string]: object };
    Labels: { [key: string]: string };
    Volumes: { [key: string]: object };
  };
  HostConfig: {
    Binds: string[];
    PortBindings: {
      [key: string]: Array<{ HostPort: string }>;
    };
    RestartPolicy: { Name: string };
    NetworkMode: string;
    Privileged: boolean;
    Devices: Array<{
      PathOnHost: string;
      PathInContainer: string;
      CgroupPermissions: string;
    }>;
    Memory: number;
    CpuShares: number;
  };
  Mounts: Array<{
    Type: string;
    Source: string;
    Destination: string;
    Mode: string;
    RW: boolean;
  }>;
}

export default function Docker(): JSX.Element {
  // Add new state for logs dialog
  const [logsDialog, setLogsDialog] = useState<{
    open: boolean;
    containerId: string;
    name: string;
  }>({
    open: false,
    containerId: '',
    name: '',
  });

  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    container: Container | null;
  }>({
    open: false,
    container: null,
  });

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [imageSearchOpen, setImageSearchOpen] = useState(false);

  const queryClient = useQueryClient();

  // Add the missing function
  const getContainerStatusColor = (state: string): 'success' | 'error' | 'warning' => {
    switch (state.toLowerCase()) {
      case 'running':
        return 'success';
      case 'exited':
        return 'error';
      default:
        return 'warning';
    }
  };

  // Move mutations to the top level
  const startContainer = useMutation({
    mutationFn: async (containerId: string) => {
      const response = await fetch(`${apiUrl}/api/docker/containers/${containerId}/start`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to start container');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-containers'] });
    },
  });

  const stopContainer = useMutation({
    mutationFn: async (containerId: string) => {
      const response = await fetch(`${apiUrl}/api/docker/containers/${containerId}/stop`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to stop container');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-containers'] });
    },
  });

  const restartContainer = useMutation({
    mutationFn: async (containerId: string) => {
      const response = await fetch(`${apiUrl}/api/docker/containers/${containerId}/restart`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to restart container');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-containers'] });
    },
  });

  const deleteContainer = useMutation({
    mutationFn: async (containerId: string) => {
      const response = await fetch(`${apiUrl}/api/docker/containers/${containerId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete container');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-containers'] });
    },
  });

  const { data: containers, isLoading } = useQuery({
    queryKey: ['docker-containers'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/docker/containers?all=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch containers');
      }
      return response.json();
    },
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <LinearProgress />;
  }

  // Update the IconButton onClick handlers
  return (
    <Box sx={{ flexGrow: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Docker Containers</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create Container
        </Button>
      </Stack>

      <Grid container spacing={3}>
        {containers?.map((container: Container) => (
          <Grid item xs={12} key={container.Id}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6">
                      {container.Names[0].replace(/^\//, '')}
                      <Chip
                        size="small"
                        label={container.State}
                        color={getContainerStatusColor(container.State)}
                        sx={{ ml: 1 }}
                      />
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {container.Image}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    {container.State.toLowerCase() === 'running' ? (
                      <Tooltip title="Stop">
                        <IconButton
                          color="error"
                          onClick={() => stopContainer.mutate(container.Id)}
                        >
                          <StopIcon />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Start">
                        <IconButton
                          color="success"
                          onClick={() => startContainer.mutate(container.Id)}
                        >
                          <StartIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Restart">
                      <IconButton
                        color="warning"
                        onClick={() => restartContainer.mutate(container.Id)}
                      >
                        <RestartIcon />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Logs">
                      <IconButton
                        onClick={() =>
                          setLogsDialog({
                            open: true,
                            containerId: container.Id,
                            name: container.Names[0].replace(/^\//, ''),
                          })
                        }
                      >
                        <LogsIcon />
                      </IconButton>
                    </Tooltip>

                    <LogsDialog
                      open={logsDialog.open}
                      onClose={() => setLogsDialog({ open: false, containerId: '', name: '' })}
                      containerId={logsDialog.containerId}
                      containerName={logsDialog.name}
                    />
                    <Tooltip title="Edit">
                      <IconButton onClick={() => setEditDialog({ open: true, container })}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        color="error"
                        onClick={() => deleteContainer.mutate(container.Id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>

                {container.Ports.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Ports
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {container.Ports.map((port, index) => (
                        <Chip
                          key={index}
                          size="small"
                          label={`${port.PublicPort || port.PrivatePort}:${port.PrivatePort}/${
                            port.Type
                          }`}
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                  </Box>
                )}

                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Command
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      bgcolor: 'background.paper',
                      p: 1,
                      borderRadius: 1,
                      maxWidth: '100%',
                      overflow: 'auto',
                    }}
                  >
                    {container.Command}
                  </Typography>
                </Box>

                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Status
                  </Typography>
                  <Typography variant="body2">{container.Status}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <CreateContainerDialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} />
      <ImageSearchDialog
        open={imageSearchOpen}
        onClose={() => setImageSearchOpen(false)}
        onImageSelect={(image) => {
          // Handle image selection
          console.log('Selected image:', image);
          setImageSearchOpen(false);
          // You can pass this to CreateContainerDialog
        }}
      />
      <EditContainerDialog
        open={editDialog.open}
        onClose={() => setEditDialog({ open: false, container: null })}
        container={editDialog.container}
      />
    </Box>
  );
}
