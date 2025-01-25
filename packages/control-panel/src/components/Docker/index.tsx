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
  Button
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Refresh as RestartIcon,
  Add as AddIcon,
  Terminal as LogsIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '../../App';

interface Container {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  Command: string;
  Created: number;
  State: string;
  Status: string;
  Ports: Array<{
    IP?: string;
    PrivatePort: number;
    PublicPort?: number;
    Type: string;
  }>;
}

function getContainerStatusColor(state: string): 'success' | 'error' | 'warning' {
  switch (state.toLowerCase()) {
    case 'running':
      return 'success';
    case 'exited':
      return 'error';
    default:
      return 'warning';
  }
}

export default function Docker(): JSX.Element {
  const { data: containers, isLoading } = useQuery({
    queryKey: ['docker-containers'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/docker/containers?all=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch containers');
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
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Typography variant="h5">Docker Containers</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            // TODO: Implement create container dialog
            console.log('Create container');
          }}
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
                        <IconButton color="error">
                          <StopIcon />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Start">
                        <IconButton color="success">
                          <StartIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Restart">
                      <IconButton color="warning">
                        <RestartIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Logs">
                      <IconButton>
                        <LogsIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton color="error">
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
                          label={`${port.PublicPort || port.PrivatePort}:${
                            port.PrivatePort
                          }/${port.Type}`}
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
                      overflow: 'auto'
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
    </Box>
  );
}