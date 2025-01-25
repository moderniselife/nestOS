import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  useTheme
} from '@mui/material';
import {
  Storage as StorageIcon,
  Memory as SystemIcon,
  Cloud as DockerIcon,
  NetworkCheck as NetworkIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '../../App';

const menuItems = [
  { text: 'System', icon: <SystemIcon />, path: '/system' },
  { text: 'Storage', icon: <StorageIcon />, path: '/storage' },
  { text: 'Docker', icon: <DockerIcon />, path: '/docker' },
  { text: 'Network', icon: <NetworkIcon />, path: '/network' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' }
];

export default function Sidebar() {
  const theme = useTheme();

  const { data: systemInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/info`);
      if (!response.ok) {
        throw new Error('Failed to fetch system info');
      }
      return response.json();
    }
  });

  return (
    <Box sx={{ overflow: 'auto' }}>
      <Box
        sx={{
          p: 2,
          borderBottom: `1px solid ${theme.palette.divider}`
        }}
      >
        <Typography variant="h6" noWrap component="div">
          NASOS
        </Typography>
        <Typography variant="caption" color="text.secondary">
          v0.1.0
        </Typography>
      </Box>

      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton>
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider />

      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          System Info
        </Typography>
        {systemInfo && (
          <List dense>
            <ListItem>
              <ListItemText
                primary="Hostname"
                secondary={systemInfo.hostname}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="OS"
                secondary={`${systemInfo.distro} ${systemInfo.release}`}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="CPU"
                secondary={`${systemInfo.cpu.cores} cores`}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Memory"
                secondary={`${Math.round(systemInfo.memory.used / 1024 / 1024 / 1024)}GB / ${Math.round(systemInfo.memory.total / 1024 / 1024 / 1024)}GB`}
              />
            </ListItem>
          </List>
        )}
      </Box>
    </Box>
  );
}