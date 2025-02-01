import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Card,
  CardContent,
  Typography,
} from '@mui/material';

function PluginConfig({ config: initialConfig, onChange, onSave, isPreInstall = false }) {
  const [config, setConfig] = useState(
    initialConfig || {
      DOMAIN: '',
      PASSWORD: '',
      PORT: '8200',
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
          VS Code Server Configuration
        </Typography>
        <Box component="form" sx={{ '& > :not(style)': { m: 1 } }}>
          <TextField
            fullWidth
            label="Domain"
            value={config.DOMAIN}
            onChange={(e) => handleChange('DOMAIN')(e.target.value)}
            helperText="Full URL where VS Code Server will be accessible"
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={config.PASSWORD}
            onChange={(e) => handleChange('PASSWORD')(e.target.value)}
            helperText="Password for accessing VS Code Server"
          />
          <TextField
            fullWidth
            label="Port"
            value={config.PORT}
            onChange={(e) => handleChange('PORT')(e.target.value)}
            helperText="Port for the VS Code Server"
          />
          <Button variant="contained" onClick={handleSave}>
            {isPreInstall ? 'Install with Configuration' : 'Save Configuration'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

export default PluginConfig;