import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Card,
  CardContent,
  Typography
} from '@mui/material';

export default function VaultwardenConfig() {
  const [config, setConfig] = useState({
    domain: '',
    allowSignups: false,
    adminToken: '',
    port: '8100',
    smtpHost: '',
    smtpFrom: '',
    smtpPort: '587',
    smtpUsername: '',
    smtpPassword: ''
  });

  const handleSave = async () => {
    try {
      await fetch('/api/plugins/vaultwarden/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      // Restart container to apply changes
      await fetch('/api/plugins/vaultwarden/restart', { method: 'POST' });
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
          <Button variant="contained" onClick={handleSave}>
            Save Configuration
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}