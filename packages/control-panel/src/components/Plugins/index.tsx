import React, { useState, Suspense } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Button,
  Chip,
  TextField,
  InputAdornment,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Alert,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Search as SearchIcon,
  Close as CloseIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '../../App';
import * as Babel from '@babel/standalone';

interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  repository: string;
  icon: string;
  installed: boolean;
  category: string;
  tags: string[];
  configComponent?: string; // Base64 encoded React component code
}

// Add this helper function at the top of the file
const createConfigComponent = (configCode: string) => {
  return React.lazy(() => {
    // Create a babel-transformed version of the component
    const transformedCode = Babel.transform(configCode, {
      presets: ['react'],  // Use the built-in 'react' preset instead of '@babel/preset-react'
      filename: 'dynamic.tsx',
    }).code;

    // Create the component with proper scope
    const createComponent = new Function(
      'React',
      'MaterialUI',
      `
      const { useState } = React;
      const {
        Box,
        TextField,
        Button,
        Card,
        CardContent,
        Typography,
        Alert,
        FormControlLabel,
        Switch
      } = MaterialUI;
      
      ${transformedCode}
      
      return PluginConfig;
    `
    );

    const component = createComponent(React, {
      Box,
      TextField,
      Button,
      Card,
      CardContent,
      Typography,
      Alert,
      FormControlLabel,
      Switch,
    });

    return Promise.resolve({ default: component });
  });
};

export default function Plugins(): JSX.Element {
  const [search, setSearch] = useState('');
  const [configPlugin, setConfigPlugin] = useState<Plugin | null>(null);
  const queryClient = useQueryClient();

  const { data: plugins, isLoading } = useQuery<Plugin[]>({
    queryKey: ['plugins'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/plugins`);
      if (!response.ok) {
        throw new Error('Failed to fetch plugins');
      }
      return response.json();
    },
  });

  const installMutation = useMutation({
    mutationFn: async (pluginId: string) => {
      const response = await fetch(`${apiUrl}/api/system/plugins/${pluginId}/install`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to install plugin');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: async (pluginId: string) => {
      const response = await fetch(`${apiUrl}/api/system/plugins/${pluginId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to uninstall plugin');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  const handleOpenConfig = (plugin: Plugin) => {
    setConfigPlugin(plugin);
  };

  const handleCloseConfig = () => {
    setConfigPlugin(null);
  };

  const filteredPlugins = plugins?.filter(
    (plugin) =>
      plugin.name.toLowerCase().includes(search.toLowerCase()) ||
      plugin.description.toLowerCase().includes(search.toLowerCase()) ||
      plugin.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
  );

  // Replace the existing dynamic import with:
  const PluginConfig = configPlugin?.configComponent
    ? createConfigComponent(configPlugin.configComponent)
    : null;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Plugins & Apps
      </Typography>

      <TextField
        fullWidth
        variant="outlined"
        placeholder="Search plugins..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
      />

      {isLoading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredPlugins?.map((plugin) => (
            <Grid item xs={12} sm={6} md={4} key={plugin.id}>
              <Card>
                <CardMedia
                  component="img"
                  height="140"
                  image={plugin.icon}
                  alt={plugin.name}
                  sx={{ minHeight: '350px' }}
                />
                <CardContent>
                  <Typography gutterBottom variant="h6" component="div">
                    {plugin.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {plugin.description}
                  </Typography>
                  <Box sx={{ mb: 2 }}>
                    {plugin.tags.map((tag) => (
                      <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                    ))}
                  </Box>
                  <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                    Version: {plugin.version} • By {plugin.author}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                    <Button
                      variant={plugin.installed ? 'outlined' : 'contained'}
                      color={plugin.installed ? 'error' : 'primary'}
                      onClick={() => {
                        if (plugin.installed) {
                          uninstallMutation.mutate(plugin.id);
                        } else {
                          installMutation.mutate(plugin.id);
                        }
                      }}
                      disabled={installMutation.isPending || uninstallMutation.isPending}
                      sx={{ flex: 1 }}
                    >
                      {plugin.installed ? 'Uninstall' : 'Install'}
                    </Button>
                    {plugin.installed && (
                      <IconButton
                        color="primary"
                        onClick={() => handleOpenConfig(plugin)}
                        size="small"
                      >
                        <SettingsIcon />
                      </IconButton>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
      <Dialog open={!!configPlugin} onClose={handleCloseConfig} maxWidth="md" fullWidth>
        <DialogTitle sx={{ m: 0, p: 2 }}>
          {configPlugin?.name} Configuration
          <IconButton
            onClick={handleCloseConfig}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {configPlugin && PluginConfig && (
            <Suspense fallback={<CircularProgress />}>
              <PluginConfig />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
