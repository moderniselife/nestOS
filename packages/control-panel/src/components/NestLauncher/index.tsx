import {
  Box,
  Typography,
  Card,
  Grid,
  TextField,
  InputAdornment,
  styled,
  Paper,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '../../App';
import { useState, useEffect } from 'react';

const BackgroundContainer = styled(Box)(() => ({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundImage: 'var(--background-image, url(/backgrounds/mountain-night.jpg))',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  zIndex: -1,
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(10px)',
  },
}));

const ContentContainer = styled(Box)(({ theme }) => ({
  position: 'relative',
  zIndex: 1,
  minHeight: '100vh',
  height: 'auto',
  padding: '2rem',
  paddingTop: '88px',
  paddingBottom: '120px', // Add extra padding at bottom for search bar
  [theme.breakpoints.up('sm')]: {
    marginLeft: '240px',
  },
}));

const StatsCard = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2),
  background: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
}));

const AppCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  background: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  cursor: 'pointer',
  transition: 'all 0.2s ease-in-out',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: theme.spacing(1),
  '&:hover': {
    transform: 'translateY(-4px)',
    background: 'rgba(255, 255, 255, 0.15)',
  },
}));

export default function NestLauncher(): JSX.Element {
  const [greeting, setGreeting] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: appearanceSettings } = useQuery({
    queryKey: ['appearance-settings'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/appearance/appearance`);
      if (!response.ok) {
        throw new Error('Failed to fetch appearance settings');
      }
      return response.json();
    },
  });

  useEffect(() => {
    if (appearanceSettings?.background) {
      document.documentElement.style.setProperty(
        '--background-image',
        `url(/backgrounds/${appearanceSettings.background}.jpg)`
      );
    }
  }, [appearanceSettings?.background]);

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

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting('Good morning');
    } else if (hour < 18) {
      setGreeting('Good afternoon');
    } else {
      setGreeting('Good evening');
    }
  }, []);

  const { data: apps } = useQuery({
    queryKey: ['plugins'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/plugins`);
      if (!response.ok) {
        throw new Error('Failed to fetch plugins');
      }
      return response.json();
    },
  });

  const filteredApps = (apps || []).filter((app: any) =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <BackgroundContainer>
      <ContentContainer>
        <Typography
          variant="h2"
          color="white"
          gutterBottom
          sx={{
            fontSize: {
              xs: '2rem', // Mobile
              sm: '3rem', // Tablet
              md: '3rem', // Desktop (default h2 size)
            },
            mt: 2,
            mb: 5,
          }}
        >
          {greeting}, {systemInfo?.hostname}.
        </Typography>

        <Grid container spacing={3} sx={{ mb: 6 }}>
          <Grid item xs={12} md={4}>
            <StatsCard>
              <Typography variant="h6" color="white">
                Storage
              </Typography>
              <Typography variant="h4" color="white">
                {Math.round((systemInfo?.storage?.used || 0) / 1024 / 1024 / 1024)} GB
              </Typography>
              <Typography variant="body2" color="rgba(255,255,255,0.7)">
                / {Math.round((systemInfo?.storage?.total || 0) / 1024 / 1024 / 1024)} GB
              </Typography>
            </StatsCard>
          </Grid>
          <Grid item xs={12} md={4}>
            <StatsCard>
              <Typography variant="h6" color="white">
                Memory
              </Typography>
              <Typography variant="h4" color="white">
                {Math.round((systemInfo?.memory?.used || 0) / 1024 / 1024 / 1024)} GB
              </Typography>
              <Typography variant="body2" color="rgba(255,255,255,0.7)">
                / {Math.round((systemInfo?.memory?.total || 0) / 1024 / 1024 / 1024)} GB
              </Typography>
            </StatsCard>
          </Grid>
          <Grid item xs={12} md={4}>
            <StatsCard>
              <Typography variant="h6" color="white">
                CPU
              </Typography>
              <Typography variant="h4" color="white">
                {systemInfo?.cpu?.usage || 0}%
              </Typography>
              <Typography variant="body2" color="rgba(255,255,255,0.7)">
                {systemInfo?.cpu?.cores} cores
              </Typography>
            </StatsCard>
          </Grid>
        </Grid>

        <Typography variant="h5" color="white" sx={{ mb: 3, mt: 6 }}>
          Live Usage
        </Typography>

        <Grid container spacing={3} sx={{ mb: 6 }}>
          {filteredApps.map((app: any) => (
            <Grid item xs={6} sm={4} md={3} lg={2} key={app.id}>
              <AppCard onClick={() => window.open(app.url, '_blank')}>
                <Box
                  component="img"
                  src={app.icon}
                  alt={app.name}
                  sx={{
                    width: 48,
                    height: 48,
                    objectFit: 'contain',
                  }}
                />
                <Typography color="white" variant="subtitle2" align="center">
                  {app.name}
                </Typography>
              </AppCard>
            </Grid>
          ))}
        </Grid>

        <Box
          sx={{
            position: 'fixed',
            bottom: 40,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '300px',
          }}
        >
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'white' }} />
                </InputAdornment>
              ),
              sx: {
                color: 'white',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                '& fieldset': { border: '1px solid rgba(255, 255, 255, 0.2)' },
                '&:hover fieldset': { border: '1px solid rgba(255, 255, 255, 0.3)' },
              },
            }}
          />
        </Box>
      </ContentContainer>
    </BackgroundContainer>
  );
}
