import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Stack,
  Button,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  NetworkCheck as NetworkIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Check as DefaultIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '../../App';

interface NetworkTest {
  ping: {
    host: string;
    latency: number;
    packetLoss: number;
  };
  speedtest?: {
    download: number;
    upload: number;
    latency: number;
  };
}

interface NetworkInterface {
  iface: string;
  ifaceName: string;
  ip4: string;
  ip6: string;
  mac: string;
  internal: boolean;
  virtual: boolean;
  operstate: string;
  type: string;
  duplex: string;
  speed: number;
  dhcp: boolean;
  default: boolean;
  gateway?: string;
}

function getConnectionStatusColor(state: string): 'success' | 'error' | 'warning' {
  switch (state.toLowerCase()) {
    case 'up':
      return 'success';
    case 'down':
      return 'error';
    default:
      return 'warning';
  }
}

export default function Network(): JSX.Element {
  const { data: networkData, isLoading: interfacesLoading } = useQuery({
    queryKey: ['network-info'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/network/interfaces`);
      if (!response.ok) {
        throw new Error('Failed to fetch network interfaces');
      }
      return response.json();
    },
    refetchInterval: 5000,
  });

  const {
    data: networkTest,
    isLoading: testLoading,
    refetch: refetchTest,
  } = useQuery({
    queryKey: ['network-test'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/network/test`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to run network test');
      }
      return response.json() as Promise<NetworkTest>;
    },
    enabled: false, // Don't run automatically
  });

  if (interfacesLoading || testLoading) {
    return <LinearProgress />;
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Network Interfaces</Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              // TODO: Implement network scan
              console.log('Scan network');
            }}
          >
            Scan Network
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              // TODO: Implement add interface dialog
              console.log('Add interface');
            }}
          >
            Add Interface
          </Button>
        </Stack>
      </Stack>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <SpeedIcon color="primary" />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6">Network Tests</Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={
                testLoading ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />
              }
              onClick={() => refetchTest()}
              disabled={testLoading}
            >
              Run Tests
            </Button>
          </Stack>

          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2" color="text.secondary">
                  Ping Test
                </Typography>
                <Typography variant="body2">Host: {networkTest?.ping.host || 'N/A'}</Typography>
                <Typography variant="body2">
                  Latency: {networkTest?.ping.latency.toFixed(2) || 'N/A'} ms
                </Typography>
                <Typography variant="body2">
                  Packet Loss: {networkTest?.ping.packetLoss || 'N/A'}%
                </Typography>
              </Grid>
              {networkTest?.speedtest && (
                <>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Download Speed
                    </Typography>
                    <Typography variant="h6" color="primary">
                      {networkTest.speedtest.download.toFixed(1)} Mbps
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Upload Speed
                    </Typography>
                    <Typography variant="h6" color="primary">
                      {networkTest.speedtest.upload.toFixed(1)} Mbps
                    </Typography>
                  </Grid>
                </>
              )}
            </Grid>
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {networkData?.interfaces.map((iface: NetworkInterface) => (
          <Grid item xs={12} md={6} key={iface.iface}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <NetworkIcon color="primary" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6">
                      {iface.ifaceName || iface.iface}
                      <Chip
                        size="small"
                        label={iface.operstate}
                        color={getConnectionStatusColor(iface.operstate)}
                        sx={{ ml: 1 }}
                      />
                      {iface.default && (
                        <Chip
                          size="small"
                          label="Default"
                          color="primary"
                          icon={<DefaultIcon />}
                          sx={{ ml: 1 }}
                        />
                      )}
                      {iface.internal && (
                        <Chip size="small" label="Internal" variant="outlined" sx={{ ml: 1 }} />
                      )}
                      {iface.virtual && (
                        <Chip size="small" label="Virtual" variant="outlined" sx={{ ml: 1 }} />
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {iface.type} • {iface.mac}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Tooltip title="Edit">
                      <IconButton>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton color="error">
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>

                <Box sx={{ mt: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        IPv4 Address
                      </Typography>
                      <Typography variant="body2">{iface.ip4 || 'Not configured'}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        IPv6 Address
                      </Typography>
                      <Typography variant="body2">{iface.ip6 || 'Not configured'}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Speed
                      </Typography>
                      <Typography variant="body2">
                        {iface.speed ? `${iface.speed} Mbps` : 'Unknown'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        DHCP
                      </Typography>
                      <Typography variant="body2">{iface.dhcp ? 'Enabled' : 'Disabled'}</Typography>
                    </Grid>
                    {iface.gateway && (
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Gateway
                        </Typography>
                        <Typography variant="body2">{iface.gateway}</Typography>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
