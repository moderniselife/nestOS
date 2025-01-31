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
  var [config, setConfig] = useState(
    initialConfig || {
      DOMAIN: '',
      ALLOW_SIGNUPS: false,
      ADMIN_TOKEN: '',
      PORT: '8100',
      SMTP_HOST: '',
      SMTP_FROM: '',
      USE_SENDMAIL: false,
      SMTP_PORT: '587',
      SMTP_USERNAME: '',
      SMTP_PASSWORD: '',
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
          Vaultwarden Configuration
        </Typography>
        <Box component="form" sx={{ '& > :not(style)': { m: 1 } }}>
          <ConfigTextField
            label="Domain"
            value={config.DOMAIN}
            onChange={(value) => handleChange('DOMAIN')(value)}
            helperText="Full URL where Vaultwarden will be accessible"
          />
          <FormControlLabel
            control={
              <Switch
                checked={config.ALLOW_SIGNUPS || false}
                onChange={(e) => handleChange('ALLOW_SIGNUPS')(e.target.checked)}
              />
            }
            label="Allow Signups"
          />
          <ConfigTextField
            label="Admin Token"
            value={config.ADMIN_TOKEN}
            onChange={(value) => handleChange('ADMIN_TOKEN')(value)}
            type="password"
            helperText="Token for accessing the admin panel"
          />
          <ConfigTextField
            label="Port"
            value={config.PORT}
            onChange={(value) => handleChange('PORT')(value)}
            helperText="Port for the Vaultwarden server"
          />
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Email Configuration (Optional)
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={config.USE_SENDMAIL || false}
                onChange={(e) => handleChange('USE_SENDMAIL')(e.target.checked)}
              />
            }
            label="Use Sendmail"
          />
          <ConfigTextField
            label="SMTP Host"
            value={config.SMTP_HOST}
            onChange={(value) => handleChange('SMTP_HOST')(value)}
            helperText="SMTP server host"
          />
          <ConfigTextField
            label="SMTP From"
            value={config.SMTP_FROM}
            onChange={(value) => handleChange('SMTP_FROM')(value)}
            helperText="Email address to send emails from"
          />
          <ConfigTextField
            label="SMTP Port"
            value={config.SMTP_PORT}
            onChange={(value) => handleChange('SMTP_PORT')(value)}
            helperText="SMTP server port"
          />
          <ConfigTextField
            label="SMTP Username"
            value={config.SMTP_USERNAME}
            onChange={(value) => handleChange('SMTP_USERNAME')(value)}
            helperText="SMTP server username"
          />
          <ConfigTextField
            label="SMTP Password"
            value={config.SMTP_PASSWORD}
            onChange={(value) => handleChange('SMTP_PASSWORD')(value)}
            type="password"
            helperText="SMTP server password"
          />
          <Button variant="contained" onClick={handleSave}>
            {isPreInstall ? 'Install with Configuration' : 'Save Configuration'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
