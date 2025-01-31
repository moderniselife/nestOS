import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  useTheme,
  Stack,
} from '@mui/material';
import {
  Storage as StorageIcon,
  Cloud as DockerIcon,
  NetworkCheck as NetworkIcon,
  Settings as SettingsIcon,
  Dashboard as DashboardIcon,
  Extension as ExtensionIcon,
  Apps as AppsIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiUrl } from '../../App';
import { version } from '../../../../../package.json';

const menuItems = [
  { text: 'Home', icon: <AppsIcon />, path: '/' },
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'Storage', icon: <StorageIcon />, path: '/storage' },
  { text: 'Docker', icon: <DockerIcon />, path: '/docker' },
  { text: 'Network', icon: <NetworkIcon />, path: '/network' },
  { text: 'Plugins', icon: <ExtensionIcon />, path: '/plugins' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

interface SidebarProps {
  isGlassMode?: boolean;
}

export default function Sidebar({ isGlassMode = false }: SidebarProps): JSX.Element {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const { data: systemInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/info`);
      if (!response.ok) {
        throw new Error('Failed to fetch system info');
      }
      return response.json();
    },
  });

  return (
    <Box sx={{ overflow: 'auto' }}>
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: isGlassMode ? 'rgba(255, 255, 255, 0.2)' : theme.palette.divider,
          backgroundColor: isGlassMode ? 'transparent' : 'background.paper',
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            component="img"
            src="/logo.svg"
            alt="NestOS Logo"
            sx={{
              width: 40,
              height: 40,
              animation: 'spin 20s linear infinite',
              '@keyframes spin': {
                '0%': {
                  transform: 'rotate(0deg)',
                },
                '100%': {
                  transform: 'rotate(360deg)',
                },
              },
            }}
          />
          <Box>
            <Typography
              variant="h6"
              noWrap
              component="div"
              sx={{
                color: isGlassMode ? 'white' : 'primary.main',
              }}
            >
              NestOS
            </Typography>
            <Typography
              variant="caption"
              color={isGlassMode ? 'rgba(255, 255, 255, 0.7)' : 'text.secondary'}
            >
              v{version}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              sx={{
                '&.Mui-selected': {
                  backgroundColor: isGlassMode
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(255, 112, 67, 0.08)',
                  '&:hover': {
                    backgroundColor: isGlassMode
                      ? 'rgba(255, 255, 255, 0.15)'
                      : 'rgba(255, 112, 67, 0.12)',
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  color: isGlassMode
                    ? 'white'
                    : location.pathname === item.path
                    ? 'primary.main'
                    : 'inherit',
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                sx={{
                  '& .MuiTypography-root': {
                    color: isGlassMode
                      ? 'white'
                      : location.pathname === item.path
                      ? 'primary.main'
                      : 'inherit',
                  },
                }}
              />
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
              <ListItemText primary="Hostname" secondary={systemInfo.hostname} />
            </ListItem>
            <ListItem>
              <ListItemText primary="OS" secondary={`${systemInfo.distro} ${systemInfo.release}`} />
            </ListItem>
            <ListItem>
              <ListItemText primary="CPU" secondary={`${systemInfo.cpu.cores} cores`} />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Memory"
                secondary={`${Math.round(
                  systemInfo.memory.used / 1024 / 1024 / 1024
                )}GB / ${Math.round(systemInfo.memory.total / 1024 / 1024 / 1024)}GB`}
              />
            </ListItem>
          </List>
        )}
      </Box>
    </Box>
  );
}
