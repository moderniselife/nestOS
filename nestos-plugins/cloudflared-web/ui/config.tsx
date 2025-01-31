import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Card,
  CardContent,
  Typography,
} from '@mui/material';

function PluginConfig({ config: initialConfig, onChange, onSave, isPreInstall = false }) {
  const [config, setConfig] = useState(
    initialConfig || {
      WEB_PORT: '3001',
      CLOUDFLARED_PORT: '3002',
      ADMIN_USERNAME: '',
      ADMIN_PASSWORD: '',
      ENABLE_HTTPS: false,
      HTTPS_PORT: '3003',
    }
  );

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    } else {
      loadConfig();
    }
  }, [initialConfig]);

  const handleChange = React.useCallback(
    (key) => (value) => {
      const newConfig = { ...config, [key]: value };
      setConfig(newConfig);
      onChange?.(newConfig);
    },
    [config, onChange]
  );

  const handleSave = async () => {
    if (isPreInstall) {
      onSave?.(config);
    } else {
      try {
        await fetch(`${apiURL}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        await fetch(`${apiURL}/restart`, {
          method: 'POST',
        });
      } catch (error) {
        console.error('Failed to save configuration:', error);
      }
    }
  };

  const loadConfig = async () => {
    try {
      const response = await fetch(`${apiURL}/config`);
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('No configuration found:', error);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Cloudflared Web UI Configuration
        </Typography>
        <Box component="form" sx={{ '& > :not(style)': { m: 1 } }}>
          <ConfigTextField
            label="Web UI Port"
            value={config.WEB_PORT}
            onChange={(value) => handleChange('WEB_PORT')(value)}
            helperText="Port for the web interface"
          />

          <ConfigTextField
            label="Cloudflared Port"
            value={config.CLOUDFLARED_PORT}
            onChange={(value) => handleChange('CLOUDFLARED_PORT')(value)}
            helperText="Port for the Cloudflared service"
          />

          <ConfigTextField
            label="Admin Username"
            value={config.ADMIN_USERNAME}
            onChange={(value) => handleChange('ADMIN_USERNAME')(value)}
            helperText="Username for the web interface"
          />

          <ConfigTextField
            label="Admin Password"
            value={config.ADMIN_PASSWORD}
            onChange={(value) => handleChange('ADMIN_PASSWORD')(value)}
            type="password"
            helperText="Password for the web interface"
          />

          <FormControlLabel
            control={
              <Switch
                checked={config.ENABLE_HTTPS || false}
                onChange={(e) => handleChange('ENABLE_HTTPS')(e.target.checked)}
              />
            }
            label="Enable HTTPS"
          />

          {config.ENABLE_HTTPS && (
            <ConfigTextField
              label="HTTPS Port"
              value={config.HTTPS_PORT}
              onChange={(value) => handleChange('HTTPS_PORT')(value)}
              helperText="Port for HTTPS access"
            />
          )}

          <Button variant="contained" onClick={handleSave}>
            {isPreInstall ? 'Install with Configuration' : 'Save Configuration'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
