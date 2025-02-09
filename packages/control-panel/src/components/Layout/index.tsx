import { useState, useContext } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  useTheme,
  CircularProgress,
  Alert,
  Snackbar,
  Stack,
  Chip,
} from '@mui/material';
// import { Extension } from '@mui/icons-material';
import MenuIcon from '@mui/icons-material/Menu';
import SignalWifiStatusbar4BarIcon from '@mui/icons-material/SignalWifiStatusbar4Bar';
import { useQuery } from '@tanstack/react-query';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Sidebar from '../Sidebar';
import Dashboard from '../Dashboard';
import Storage from '../Storage';
import Docker from '../Docker';
import Network from '../Network';
import Settings from '../Settings';
import Plugins from '../Plugins';
import NestLauncher from '../NestLauncher';
import QEMU from '../QEMU';
import { apiUrl } from '../../App';
import { AppearanceContext } from '../FrostedGlassProvider';

const drawerWidth = 240;

// Update getPageTitle function
const getPageTitle = (pathname: string): string => {
  switch (pathname) {
    case '/':
      return 'Home';
    case '/dashboard':
      return 'Dashboard';
    case '/storage':
      return 'Storage Management';
    case '/docker':
      return 'Docker Containers';
    case '/network':
      return 'Network Settings';
    case '/plugins':
      return 'Plugin Management';
    case '/vms':
      return 'VMs';
    case '/settings':
      return 'System Settings';
    default:
      return 'NestOS';
  }
};

export default function Layout(): JSX.Element {
  const theme = useTheme();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { useFrostedGlass } = useContext(AppearanceContext);

  const { data: systemInfo, isLoading: systemLoading } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      try {
        const response = await fetch(`${apiUrl}/api/system/info`);
        if (!response.ok) {
          throw new Error('Failed to fetch system info');
        }
        return response.json();
      } catch (error) {
        setError('Failed to connect to system service');
        throw error;
      }
    },
  });

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleCloseError = () => {
    setError(null);
  };

  const isLauncherPage = location.pathname === '/';
  const glassStyle =
    isLauncherPage || useFrostedGlass
      ? {
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          borderColor: 'rgba(255, 255, 255, 0.2)',
        }
      : {};

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          backgroundColor: isLauncherPage || useFrostedGlass ? 'transparent' : 'background.paper',
          borderBottom: '1px solid',
          borderColor:
            isLauncherPage || useFrostedGlass ? 'rgba(255, 255, 255, 0.2)' : theme.palette.divider,
          ...glassStyle,
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{
              flexGrow: 1,
              color: isLauncherPage || useFrostedGlass ? 'white' : 'text.primary',
            }}
          >
            {getPageTitle(location.pathname)}
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            {systemLoading ? (
              <CircularProgress color="primary" size={24} />
            ) : (
              <>
                <SignalWifiStatusbar4BarIcon
                  color="primary"
                  sx={{ opacity: systemInfo ? 1 : 0.5 }}
                />
                <Chip
                  size="small"
                  label={systemInfo?.hostname || 'Not connected'}
                  color={systemInfo ? 'primary' : 'default'}
                  variant="outlined"
                />
              </>
            )}
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              ...((isLauncherPage || useFrostedGlass) && glassStyle),
            },
          }}
        >
          <Sidebar isGlassMode={isLauncherPage || useFrostedGlass} />
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: '1px solid',
              borderColor:
                isLauncherPage || useFrostedGlass
                  ? 'rgba(255, 255, 255, 0.2)'
                  : theme.palette.divider,
              backgroundColor:
                isLauncherPage || useFrostedGlass ? 'transparent' : 'background.paper',
              ...glassStyle,
            },
          }}
          open
        >
          <Sidebar isGlassMode={isLauncherPage || useFrostedGlass} />
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: location.pathname === '/' ? 0 : 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: '64px', // AppBar height
          backgroundColor: useFrostedGlass ? 'transparent' : 'background.default',
        }}
      >
        <Routes>
          <Route path="/" element={<NestLauncher />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/storage" element={<Storage />} />
          <Route path="/docker" element={<Docker />} />
          <Route path="/network" element={<Network />} />
          <Route path="/plugins" element={<Plugins />} />
          <Route path="/vms" element={<QEMU />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={handleCloseError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseError} severity="error" variant="filled" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
