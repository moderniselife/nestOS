import React, { useState, useEffect } from 'react';
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

const currentDomain = new URL(window.location.href);
const apiURL = `http://${currentDomain.hostname}:3000/api/plugins`;

function PluginConfig() {
  const [config, setConfig] = React.useState({
    domain: '',
    allowSignups: false,
    adminToken: '',
    port: '8100',
    smtpHost: '',
    smtpFrom: '',
    smtpPort: '587',
    smtpUsername: '',
    smtpPassword: '',
  });

  const handleSave = async () => {
    try {
      await fetch(`${apiURL}/vaultwarden/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      // Restart container to apply changes
      await fetch(`${apiURL}/vaultwarden/restart`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Vaultwarden Configuration
        </Typography>
        <Box component="form" sx={{ '& > :not(style)': { m: 1 } }}>
          <TextField
            fullWidth
            label="Domain"
            value={config.domain}
            onChange={(e) => setConfig({ ...config, domain: e.target.value })}
            helperText="Full URL where Vaultwarden will be accessible"
          />
          <FormControlLabel
            control={
              <Switch
                checked={config.allowSignups}
                onChange={(e) => setConfig({ ...config, allowSignups: e.target.checked })}
              />
            }
            label="Allow Signups"
          />
          <TextField
            fullWidth
            label="Admin Token"
            value={config.adminToken}
            onChange={(e) => setConfig({ ...config, adminToken: e.target.value })}
            type="password"
          />
          <TextField
            fullWidth
            label="Port"
            value={config.port}
            onChange={(e) => setConfig({ ...config, port: e.target.value })}
          />
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Email Configuration (Optional)
          </Typography>
          <TextField
            fullWidth
            label="SMTP Host"
            value={config.smtpHost}
            onChange={(e) => setConfig({ ...config, smtpHost: e.target.value })}
          />
          <TextField
            fullWidth
            label="SMTP From"
            value={config.smtpFrom}
            onChange={(e) => setConfig({ ...config, smtpFrom: e.target.value })}
          />
          <TextField
            fullWidth
            label="SMTP Port"
            value={config.smtpPort}
            onChange={(e) => setConfig({ ...config, smtpPort: e.target.value })}
          />
          <TextField
            fullWidth
            label="SMTP Username"
            value={config.smtpUsername}
            onChange={(e) => setConfig({ ...config, smtpUsername: e.target.value })}
          />
          <TextField
            fullWidth
            label="SMTP Password"
            value={config.smtpPassword}
            onChange={(e) => setConfig({ ...config, smtpPassword: e.target.value })}
            type="password"
          />
          <Button variant="contained" onClick={handleSave}>
            Save Configuration
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
