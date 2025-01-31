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

const ConfigTextField = React.memo<{
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  helperText?: string;
}>(({ label, value, onChange, type = 'text', helperText = '' }) => {
  ConfigTextField.displayName = 'ConfigTextField';
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <TextField
      fullWidth
      label={label}
      value={localValue || ''}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => onChange?.(localValue)}
      type={type}
      helperText={helperText}
      autoComplete="off"
      inputProps={{ autoComplete: 'off' }}
    />
  );
});

interface PluginConfigProps {
  config?: Record<string, any>;
  onChange?: (config: Record<string, any>) => void;
  onSave?: (config: Record<string, any>) => void;
  isPreInstall?: boolean;
}

const createConfigComponent = (configCode: string, pluginId: string) => {
  return React.lazy<React.ComponentType<PluginConfigProps>>(() => {
    const transformedCode = Babel.transform(configCode, {
      presets: ['react'],
      filename: 'dynamic.tsx',
    }).code;

    const createComponent = new Function(
      'React',
      'MaterialUI',
      'ConfigTextField',
      'apiUrl',
      'pluginId',
      `
      const { useState, useEffect } = React;
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

      const apiURL = \`\${apiUrl}/api/plugins/\${pluginId}\`;
      
      ${transformedCode}
      
      return PluginConfig;
    `
    );

    const component = createComponent(
      React,
      {
        Box,
        TextField,
        Button,
        Card,
        CardContent,
        Typography,
        Alert,
        FormControlLabel,
        Switch,
      },
      ConfigTextField,
      apiUrl,
      pluginId
    );

    return Promise.resolve({ default: component });
  });
};

export default function Plugins(): JSX.Element {
  const [search, setSearch] = useState('');
  const [configPlugin, setConfigPlugin] = useState<Plugin | null>(null);
  const [preInstallPlugin, setPreInstallPlugin] = useState<Plugin | null>(null);
  const [configBeforeInstall, setConfigBeforeInstall] = useState<Record<string, any>>({});
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
    mutationFn: async ({
      pluginId,
      config,
    }: {
      pluginId: string;
      config?: Record<string, any>;
    }) => {
      const response = await fetch(`${apiUrl}/api/system/plugins/${pluginId}/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config }),
      });
      if (!response.ok) {
        throw new Error('Failed to install plugin');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      setPreInstallPlugin(null);
      setConfigBeforeInstall({});
    },
  });

  const handleInstall = async (plugin: Plugin) => {
    try {
      const response = await fetch(`${apiUrl}/api/plugins/${plugin.id}/requires-config`);
      if (!response.ok) {
        throw new Error('Failed to check plugin configuration');
      }
      const { requiresConfig, configComponent } = await response.json();

      if (requiresConfig) {
        setPreInstallPlugin({
          ...plugin,
          configComponent,
        });
      } else {
        installMutation.mutate({ pluginId: plugin.id });
      }
    } catch (error) {
      console.error('Failed to check plugin configuration:', error);
    }
  };

  // Add this dialog for pre-installation configuration
  const PreInstallConfigDialog = () => (
    <Dialog open={!!preInstallPlugin} onClose={() => setPreInstallPlugin(null)}>
      <DialogTitle>
        Configure {preInstallPlugin?.name}
        <IconButton
          onClick={() => setPreInstallPlugin(null)}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {preInstallPlugin?.configComponent && (
          <Suspense fallback={<CircularProgress />}>
            {React.createElement(
              createConfigComponent(preInstallPlugin.configComponent, preInstallPlugin.id),
              {
                config: configBeforeInstall,
                onChange: setConfigBeforeInstall,
                onSave: () => {
                  installMutation.mutate({
                    pluginId: preInstallPlugin.id,
                    config: configBeforeInstall,
                  });
                },
                isPreInstall: true,
              }
            )}
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );

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
    ? createConfigComponent(configPlugin.configComponent, configPlugin.id)
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
                          handleInstall(plugin);
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
      <PreInstallConfigDialog />
    </Box>
  );
}
