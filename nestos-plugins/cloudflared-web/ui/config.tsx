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
      WEBUI_PORT: '14333',
      EDGE_IP_VERSION: 'auto',
      PROTOCOL: 'auto',
      METRICS_ENABLE: false,
      METRICS_PORT: '60123',
      BASIC_AUTH_USER: 'admin',
      BASIC_AUTH_PASS: '',
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
            label="WebUI Port"
            value={config.WEBUI_PORT}
            onChange={(value) => handleChange('WEBUI_PORT')(value)}
            helperText="Port for the web interface"
          />

          <ConfigTextField
            label="Edge IP Version"
            value={config.EDGE_IP_VERSION}
            onChange={(value) => handleChange('EDGE_IP_VERSION')(value)}
            helperText="IP version (auto, 4, or 6)"
          />

          <ConfigTextField
            label="Protocol"
            value={config.PROTOCOL}
            onChange={(value) => handleChange('PROTOCOL')(value)}
            helperText="Connection protocol (auto, http2, or quic)"
          />

          <FormControlLabel
            control={
              <Switch
                checked={config.METRICS_ENABLE || false}
                onChange={(e) => handleChange('METRICS_ENABLE')(e.target.checked)}
              />
            }
            label="Enable Metrics"
          />

          {config.METRICS_ENABLE && (
            <ConfigTextField
              label="Metrics Port"
              value={config.METRICS_PORT}
              onChange={(value) => handleChange('METRICS_PORT')(value)}
              helperText="Port for metrics server"
            />
          )}

          <ConfigTextField
            label="Basic Auth Username"
            value={config.BASIC_AUTH_USER}
            onChange={(value) => handleChange('BASIC_AUTH_USER')(value)}
            helperText="Username for basic authentication"
          />

          <ConfigTextField
            label="Basic Auth Password"
            value={config.BASIC_AUTH_PASS}
            onChange={(value) => handleChange('BASIC_AUTH_PASS')(value)}
            type="password"
            helperText="Password for basic authentication"
          />

          <Button variant="contained" onClick={handleSave}>
            {isPreInstall ? 'Install with Configuration' : 'Save Configuration'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
