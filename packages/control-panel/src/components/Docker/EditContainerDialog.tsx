import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel,
  Alert,
  Backdrop,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { apiUrl } from '../../App';

interface Port {
  container: number;
  host: number;
  protocol: 'tcp' | 'udp';
}

interface Volume {
  container: string;
  host: string;
  mode: 'rw' | 'ro';
}

interface EnvVar {
  key: string;
  value: string;
}

interface Device {
  host: string;
  container: string;
  permissions: string;
}

interface EditContainerDialogProps {
  open: boolean;
  onClose: () => void;
  container: Container | null;
}

// Add to the Container interface
interface Container {
  Id: string;
  Names: string[];
  Image: string;
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

export function EditContainerDialog({
  open,
  onClose,
  container,
}: EditContainerDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [ports, setPorts] = useState<Port[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [restart, setRestart] = useState('no');
  const [privileged, setPrivileged] = useState(false);
  const [networkMode, setNetworkMode] = useState('bridge');
  const [hostname, setHostname] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [command, setCommand] = useState<string[]>([]);
  const [memory, setMemory] = useState<number | ''>('');
  const [cpuShares, setCpuShares] = useState<number | ''>('');
  const [labels, setLabels] = useState<EnvVar[]>([]);
  const [user, setUser] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [domainName, setDomainName] = useState('');
  const [dns, setDns] = useState<string[]>([]);
  const [dnsSearch, setDnsSearch] = useState<string[]>([]);
  const [extraHosts, setExtraHosts] = useState<EnvVar[]>([]);
  const [ulimits, setUlimits] = useState<Array<{ name: string; soft: number; hard: number }>>([]);
  const [cpuPeriod, setCpuPeriod] = useState<number | ''>('');
  const [cpuQuota, setCpuQuota] = useState<number | ''>('');
  const [blkioWeight, setBlkioWeight] = useState<number | ''>('');
  const [cgroupParent, setCgroupParent] = useState('');
  const [readonlyRootfs, setReadonlyRootfs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add new query to fetch container details
  const { data: containerDetails } = useQuery({
    queryKey: ['container-details', container?.Id],
    queryFn: async () => {
      if (!container?.Id) {
        return null;
      }
      const response = await fetch(`${apiUrl}/api/docker/containers/${container.Id}/inspect`);
      if (!response.ok) {
        throw new Error('Failed to fetch container details');
      }
      return response.json();
    },
    enabled: !!container?.Id,
  });

  // Update useEffect to initialize form with container details
  useEffect(() => {
    if (containerDetails) {
      // Basic settings
      setName(containerDetails.Name.replace(/^\//, ''));

      // Ports
      const portBindings = containerDetails.HostConfig.PortBindings || {};
      const exposedPorts = containerDetails.Config.ExposedPorts || {};
      const parsedPorts = [
        ...Object.entries(portBindings).map(([key, value]) => {
          const [containerPort, protocol] = key.split('/');
          return {
            container: parseInt(containerPort),
            host: parseInt(Array.isArray(value) && value[0]?.HostPort ? value[0].HostPort : '0'),
            protocol: protocol as 'tcp' | 'udp',
          };
        }),
        // Include exposed ports that don't have bindings
        ...Object.keys(exposedPorts)
          .filter((key) => !portBindings[key])
          .map((key) => {
            const [port, protocol] = key.split('/');
            return {
              container: parseInt(port),
              host: 0,
              protocol: protocol as 'tcp' | 'udp',
            };
          }),
      ];
      setPorts(parsedPorts);

      // Volumes
      const mounts = containerDetails.Mounts || [];
      const parsedVolumes = mounts.map(
        (mount: { Source: string; Destination: string; RW: string }) => ({
          host: mount.Source,
          container: mount.Destination,
          mode: mount.RW ? 'rw' : 'ro',
        })
      );
      setVolumes(parsedVolumes);

      // Environment Variables
      const env = containerDetails.Config.Env || [];
      const parsedEnv = env.map((e: string) => {
        const [key, ...valueParts] = e.split('=');
        return {
          key,
          value: valueParts.join('='),
        };
      });
      setEnvVars(parsedEnv);

      // Advanced Settings
      setRestart(containerDetails.HostConfig.RestartPolicy.Name);
      setPrivileged(containerDetails.HostConfig.Privileged);
      setNetworkMode(containerDetails.HostConfig.NetworkMode);
      setHostname(containerDetails.Config.Hostname);
      setMemory(containerDetails.HostConfig.Memory);
      setCpuShares(containerDetails.HostConfig.CpuShares);

      // Devices
      const devices = containerDetails.HostConfig.Devices || [];
      const parsedDevices = devices.map(
        (device: { PathOnHost: string; PathInContainer: string; CgroupPermissions: string }) => ({
          host: device.PathOnHost,
          container: device.PathInContainer,
          permissions: device.CgroupPermissions,
        })
      );
      setDevices(parsedDevices);

      // Command
      if (containerDetails.Config.Cmd) {
        setCommand(containerDetails.Config.Cmd);
      }

      // Labels
      const labels = containerDetails.Config.Labels || {};
      const parsedLabels = Object.entries(labels).map(([key, value]) => ({
        key,
        value,
      }));
      setLabels(parsedLabels as unknown as EnvVar[]);

      // User
      setUser(containerDetails.Config.User || '');

      // Working Directory
      setWorkingDir(containerDetails.Config.WorkingDir || '');

      // Domain Name
      setDomainName(containerDetails.Config.Domainname || '');

      // DNS
      setDns(containerDetails.HostConfig.Dns || []);

      // DNS Search
      setDnsSearch(containerDetails.HostConfig.DnsSearch || []);

      // Extra Hosts
      setExtraHosts(
        (containerDetails.HostConfig.ExtraHosts || []).map((host: string) => {
          const [key, value] = host.split(':');
          return { key, value };
        })
      );

      // Ulimits
      setUlimits(containerDetails.HostConfig.Ulimits || []);

      // CPU Period and Quota
      setCpuPeriod(containerDetails.HostConfig.CpuPeriod || '');
      setCpuQuota(containerDetails.HostConfig.CpuQuota || '');

      // Blkio Weight and Cgroup Parent
      setBlkioWeight(containerDetails.HostConfig.BlkioWeight || '');
      setCgroupParent(containerDetails.HostConfig.CgroupParent || '');

      // Readonly Rootfs
      setReadonlyRootfs(containerDetails.HostConfig.ReadonlyRootfs || false);
    }
  }, [containerDetails]);

  // Update the editContainer mutation
  //   const editContainer = useMutation({
  //     mutationFn: async (data: any) => {
  //       // First update the container configuration
  //       const updateResponse = await fetch(
  //         `${apiUrl}/api/docker/containers/${container?.Id}/update`,
  //         {
  //           method: 'PUT',
  //           headers: {
  //             'Content-Type': 'application/json',
  //           },
  //           body: JSON.stringify({
  //             RestartPolicy: { Name: data.restart },
  //             Memory: data.memory,
  //             CpuShares: data.cpu_shares,
  //             NetworkMode: data.network_mode,
  //             Privileged: data.privileged,
  //           }),
  //         }
  //       );

  //       if (!updateResponse.ok) {
  //         throw new Error('Failed to update container configuration');
  //       }

  //       // Then recreate the container with new settings
  //       const response = await fetch(`${apiUrl}/api/docker/containers`, {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //         },
  //         body: JSON.stringify(data),
  //       });

  //       if (!response.ok) {
  //         throw new Error('Failed to update container');
  //       }

  //       // Start the new container
  //       const newContainer = await response.json();
  //       await fetch(`${apiUrl}/api/docker/containers/${newContainer.Id}/start`, {
  //         method: 'POST',
  //       });

  //       return newContainer;
  //     },
  //     onSuccess: () => {
  //       queryClient.invalidateQueries({ queryKey: ['docker-containers'] });
  //       onClose();
  //     },
  //   });
  const editContainer = useMutation({
    mutationFn: async (data: any) => {
      setLoading(true);
      setError(null);
      try {
        // Stop the container first
        try {
          const stopResponse = await fetch(
            `${apiUrl}/api/docker/containers/${container?.Id}/stop`,
            {
              method: 'POST',
            }
          );
          // If response is not ok and it's not because container is already stopped (304)
          if (!stopResponse.ok && stopResponse.status !== 304) {
            const errorData = await stopResponse.json();
            throw new Error(errorData.message || 'Failed to stop container');
          }
        } catch (stopError: any) {
          // Ignore "container already stopped" errors
          if (!stopError.message?.includes('container already stopped')) {
            throw stopError;
          }
        }

        // Remove the old container
        try {
          const removeResponse = await fetch(`${apiUrl}/api/docker/containers/${container?.Id}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ force: true }),
          });
          if (!removeResponse.ok && removeResponse.status !== 404) {
            const errorData = await removeResponse.json();
            throw new Error(errorData.message || 'Failed to remove container');
          }
        } catch (removeError: any) {
          // Ignore "no such container" errors
          if (!removeError.message?.includes('no such container')) {
            throw removeError;
          }
        }

        // Create new container
        const createResponse = await fetch(`${apiUrl}/api/docker/containers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.json();
          throw new Error(errorData.message || 'Failed to create container');
        }

        const newContainer = await createResponse.json();

        // Start the new container
        try {
          const startResponse = await fetch(
            `${apiUrl}/api/docker/containers/${newContainer.Id}/start`,
            {
              method: 'POST',
            }
          );

          // If response is not ok and it's not because container is already started (304)
          if (!startResponse.ok && startResponse.status !== 304) {
            const errorData = await startResponse.json();
            throw new Error(errorData.message || 'Failed to start container');
          }
        } catch (startError: any) {
          // If the error is not "container already started", rethrow it
          if (!startError.message?.includes('container already started')) {
            throw startError;
          }
        }

        setSuccess('Container updated successfully');
        return newContainer;
      } catch (err: any) {
        setError(err.message || 'An error occurred');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-containers'] });
      setTimeout(() => {
        onClose();
      }, 2000); // Close dialog after 2 seconds on success
    },
  });

  const handleSubmit = () => {
    const data = {
      image: container?.Image,
      name,
      hostname,
      ports: ports.map((p) => ({
        container: p.container,
        host: p.host,
        protocol: p.protocol,
      })),
      volumes: volumes.map((v) => ({
        container: v.container,
        host:
          v.host.startsWith('.') || !v.host.startsWith('/') ? `${process.cwd()}/${v.host}` : v.host,
        mode: v.mode,
      })),
      env: Object.fromEntries(envVars.map((e) => [e.key, e.value])),
      restart,
      privileged,
      network_mode: networkMode,
      devices: devices.length > 0 ? devices : undefined,
      command: command.length > 0 ? command : undefined,
      memory: memory || undefined,
      cpu_shares: cpuShares || undefined,
      labels:
        labels.length > 0 ? Object.fromEntries(labels.map((l) => [l.key, l.value])) : undefined,
      exposed_ports: ports.reduce((acc, port) => {
        acc[`${port.container}/${port.protocol}`] = {};
        return acc;
      }, {} as { [key: string]: object }),
      user: user || undefined,
      working_dir: workingDir || undefined,
      domain_name: domainName || undefined,
      dns: dns.length > 0 ? dns : undefined,
      dns_search: dnsSearch.length > 0 ? dnsSearch : undefined,
      extra_hosts: extraHosts.length > 0 ? extraHosts.map((h) => `${h.key}:${h.value}`) : undefined,
      ulimits: ulimits.length > 0 ? ulimits : undefined,
      cpu_period: cpuPeriod || undefined,
      cpu_quota: cpuQuota || undefined,
      blkio_weight: blkioWeight || undefined,
      cgroup_parent: cgroupParent || undefined,
      readonly_rootfs: readonlyRootfs,
    };

    editContainer.mutate(data);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edit Container</DialogTitle>
      <DialogContent>
        <Grid container spacing={2}>
          {/* Basic Settings */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Container Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              margin="normal"
            />
          </Grid>

          {/* Ports */}
          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Ports</Typography>
              </AccordionSummary>
              <AccordionDetails>
                {ports.map((port, index) => (
                  <Grid container spacing={2} key={index} alignItems="center">
                    <Grid item xs={3}>
                      <TextField
                        fullWidth
                        label="Host Port"
                        type="number"
                        value={port.host}
                        onChange={(e) => {
                          const newPorts = [...ports];
                          newPorts[index].host = parseInt(e.target.value);
                          setPorts(newPorts);
                        }}
                      />
                    </Grid>
                    <Grid item xs={3}>
                      <TextField
                        fullWidth
                        label="Container Port"
                        type="number"
                        value={port.container}
                        onChange={(e) => {
                          const newPorts = [...ports];
                          newPorts[index].container = parseInt(e.target.value);
                          setPorts(newPorts);
                        }}
                      />
                    </Grid>
                    <Grid item xs={3}>
                      <FormControl fullWidth>
                        <InputLabel>Protocol</InputLabel>
                        <Select
                          value={port.protocol}
                          onChange={(e) => {
                            const newPorts = [...ports];
                            newPorts[index].protocol = e.target.value as 'tcp' | 'udp';
                            setPorts(newPorts);
                          }}
                        >
                          <MenuItem value="tcp">TCP</MenuItem>
                          <MenuItem value="udp">UDP</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={3}>
                      <IconButton onClick={() => setPorts(ports.filter((_, i) => i !== index))}>
                        <RemoveIcon />
                      </IconButton>
                    </Grid>
                  </Grid>
                ))}
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setPorts([...ports, { host: 0, container: 0, protocol: 'tcp' }])}
                >
                  Add Port
                </Button>
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* Volumes */}
          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Volumes</Typography>
              </AccordionSummary>
              <AccordionDetails>
                {volumes.map((volume, index) => (
                  <Grid container spacing={2} key={index} alignItems="center">
                    <Grid item xs={4}>
                      <TextField
                        fullWidth
                        label="Host Path"
                        value={volume.host}
                        onChange={(e) => {
                          const newVolumes = [...volumes];
                          newVolumes[index].host = e.target.value;
                          setVolumes(newVolumes);
                        }}
                      />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField
                        fullWidth
                        label="Container Path"
                        value={volume.container}
                        onChange={(e) => {
                          const newVolumes = [...volumes];
                          newVolumes[index].container = e.target.value;
                          setVolumes(newVolumes);
                        }}
                      />
                    </Grid>
                    <Grid item xs={2}>
                      <FormControl fullWidth>
                        <InputLabel>Mode</InputLabel>
                        <Select
                          value={volume.mode}
                          onChange={(e) => {
                            const newVolumes = [...volumes];
                            newVolumes[index].mode = e.target.value as 'rw' | 'ro';
                            setVolumes(newVolumes);
                          }}
                        >
                          <MenuItem value="rw">RW</MenuItem>
                          <MenuItem value="ro">RO</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={2}>
                      <IconButton onClick={() => setVolumes(volumes.filter((_, i) => i !== index))}>
                        <RemoveIcon />
                      </IconButton>
                    </Grid>
                  </Grid>
                ))}
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setVolumes([...volumes, { host: '', container: '', mode: 'rw' }])}
                >
                  Add Volume
                </Button>
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* Environment Variables */}
          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Environment Variables</Typography>
              </AccordionSummary>
              <AccordionDetails>
                {envVars.map((env, index) => (
                  <Grid container spacing={2} key={index} alignItems="center">
                    <Grid item xs={5}>
                      <TextField
                        fullWidth
                        label="Key"
                        value={env.key}
                        onChange={(e) => {
                          const newEnvVars = [...envVars];
                          newEnvVars[index].key = e.target.value;
                          setEnvVars(newEnvVars);
                        }}
                      />
                    </Grid>
                    <Grid item xs={5}>
                      <TextField
                        fullWidth
                        label="Value"
                        value={env.value}
                        onChange={(e) => {
                          const newEnvVars = [...envVars];
                          newEnvVars[index].value = e.target.value;
                          setEnvVars(newEnvVars);
                        }}
                      />
                    </Grid>
                    <Grid item xs={2}>
                      <IconButton onClick={() => setEnvVars(envVars.filter((_, i) => i !== index))}>
                        <RemoveIcon />
                      </IconButton>
                    </Grid>
                  </Grid>
                ))}
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setEnvVars([...envVars, { key: '', value: '' }])}
                >
                  Add Environment Variable
                </Button>
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* Advanced Settings */}
          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Advanced Settings</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <FormControl fullWidth>
                      <InputLabel>Restart Policy</InputLabel>
                      <Select value={restart} onChange={(e) => setRestart(e.target.value)}>
                        <MenuItem value="no">No</MenuItem>
                        <MenuItem value="always">Always</MenuItem>
                        <MenuItem value="on-failure">On Failure</MenuItem>
                        <MenuItem value="unless-stopped">Unless Stopped</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6}>
                    <FormControl fullWidth>
                      <InputLabel>Network Mode</InputLabel>
                      <Select value={networkMode} onChange={(e) => setNetworkMode(e.target.value)}>
                        <MenuItem value="bridge">Bridge</MenuItem>
                        <MenuItem value="host">Host</MenuItem>
                        <MenuItem value="none">None</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={privileged}
                          onChange={(e) => setPrivileged(e.target.checked)}
                        />
                      }
                      label="Privileged Mode"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="Memory Limit (bytes)"
                      type="number"
                      value={memory}
                      onChange={(e) => setMemory(parseInt(e.target.value) || '')}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="CPU Shares"
                      type="number"
                      value={cpuShares}
                      onChange={(e) => setCpuShares(parseInt(e.target.value) || '')}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Hostname"
                      value={hostname}
                      onChange={(e) => setHostname(e.target.value)}
                    />
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* Devices */}
          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Devices</Typography>
              </AccordionSummary>
              <AccordionDetails>
                {devices.map((device, index) => (
                  <Grid container spacing={2} key={index} alignItems="center">
                    <Grid item xs={4}>
                      <TextField
                        fullWidth
                        label="Host Path"
                        value={device.host}
                        onChange={(e) => {
                          const newDevices = [...devices];
                          newDevices[index].host = e.target.value;
                          setDevices(newDevices);
                        }}
                      />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField
                        fullWidth
                        label="Container Path"
                        value={device.container}
                        onChange={(e) => {
                          const newDevices = [...devices];
                          newDevices[index].container = e.target.value;
                          setDevices(newDevices);
                        }}
                      />
                    </Grid>
                    <Grid item xs={2}>
                      <TextField
                        fullWidth
                        label="Permissions"
                        value={device.permissions}
                        onChange={(e) => {
                          const newDevices = [...devices];
                          newDevices[index].permissions = e.target.value;
                          setDevices(newDevices);
                        }}
                      />
                    </Grid>
                    <Grid item xs={2}>
                      <IconButton onClick={() => setDevices(devices.filter((_, i) => i !== index))}>
                        <RemoveIcon />
                      </IconButton>
                    </Grid>
                  </Grid>
                ))}
                <Button
                  startIcon={<AddIcon />}
                  onClick={() =>
                    setDevices([...devices, { host: '', container: '', permissions: 'rwm' }])
                  }
                >
                  Add Device
                </Button>
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* Command */}
          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Command</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Command (space-separated)"
                      value={command.join(' ')}
                      onChange={(e) => setCommand(e.target.value.split(' ').filter(Boolean))}
                      helperText="Example: npm start"
                    />
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* Labels */}
          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Labels</Typography>
              </AccordionSummary>
              <AccordionDetails>
                {labels.map((label, index) => (
                  <Grid container spacing={2} key={index} alignItems="center">
                    <Grid item xs={5}>
                      <TextField
                        fullWidth
                        label="Key"
                        value={label.key}
                        onChange={(e) => {
                          const newLabels = [...labels];
                          newLabels[index].key = e.target.value;
                          setLabels(newLabels);
                        }}
                      />
                    </Grid>
                    <Grid item xs={5}>
                      <TextField
                        fullWidth
                        label="Value"
                        value={label.value}
                        onChange={(e) => {
                          const newLabels = [...labels];
                          newLabels[index].value = e.target.value;
                          setLabels(newLabels);
                        }}
                      />
                    </Grid>
                    <Grid item xs={2}>
                      <IconButton onClick={() => setLabels(labels.filter((_, i) => i !== index))}>
                        <RemoveIcon />
                      </IconButton>
                    </Grid>
                  </Grid>
                ))}
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setLabels([...labels, { key: '', value: '' }])}
                >
                  Add Label
                </Button>
              </AccordionDetails>
            </Accordion>
          </Grid>
          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Container Configuration</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="User"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      helperText="Container user (e.g., 'user' or 'user:group')"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="Working Directory"
                      value={workingDir}
                      onChange={(e) => setWorkingDir(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="Domain Name"
                      value={domainName}
                      onChange={(e) => setDomainName(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={readonlyRootfs}
                          onChange={(e) => setReadonlyRootfs(e.target.checked)}
                        />
                      }
                      label="Read-only Root Filesystem"
                    />
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>

          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Network Configuration</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="DNS Servers"
                      value={dns.join(',')}
                      onChange={(e) => setDns(e.target.value.split(',').filter(Boolean))}
                      helperText="Comma-separated DNS servers"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="DNS Search Domains"
                      value={dnsSearch.join(',')}
                      onChange={(e) => setDnsSearch(e.target.value.split(',').filter(Boolean))}
                      helperText="Comma-separated search domains"
                    />
                  </Grid>
                  {extraHosts.map((host, index) => (
                    <Grid container spacing={2} key={index} alignItems="center">
                      <Grid item xs={5}>
                        <TextField
                          fullWidth
                          label="Hostname"
                          value={host.key}
                          onChange={(e) => {
                            const newHosts = [...extraHosts];
                            newHosts[index].key = e.target.value;
                            setExtraHosts(newHosts);
                          }}
                        />
                      </Grid>
                      <Grid item xs={5}>
                        <TextField
                          fullWidth
                          label="IP Address"
                          value={host.value}
                          onChange={(e) => {
                            const newHosts = [...extraHosts];
                            newHosts[index].value = e.target.value;
                            setExtraHosts(newHosts);
                          }}
                        />
                      </Grid>
                      <Grid item xs={2}>
                        <IconButton
                          onClick={() => setExtraHosts(extraHosts.filter((_, i) => i !== index))}
                        >
                          <RemoveIcon />
                        </IconButton>
                      </Grid>
                    </Grid>
                  ))}
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() => setExtraHosts([...extraHosts, { key: '', value: '' }])}
                  >
                    Add Extra Host
                  </Button>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>

          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Resource Limits</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="CPU Period (μs)"
                      type="number"
                      value={cpuPeriod}
                      onChange={(e) => setCpuPeriod(parseInt(e.target.value) || '')}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="CPU Quota (μs)"
                      type="number"
                      value={cpuQuota}
                      onChange={(e) => setCpuQuota(parseInt(e.target.value) || '')}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="Block IO Weight"
                      type="number"
                      value={blkioWeight}
                      onChange={(e) => setBlkioWeight(parseInt(e.target.value) || '')}
                      helperText="Weight between 10 and 1000"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="Cgroup Parent"
                      value={cgroupParent}
                      onChange={(e) => setCgroupParent(e.target.value)}
                    />
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>
        </Grid>
      </DialogContent>
      <Backdrop open={loading} style={{ zIndex: 9999 }}>
        <CircularProgress color="primary" />
      </Backdrop>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setError(null)} severity="error">
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!success}
        autoHideDuration={4000}
        onClose={() => setSuccess(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccess(null)} severity="success">
          {success}
        </Alert>
      </Snackbar>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : undefined}
        >
          {loading ? 'Updating...' : 'Update Container'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
