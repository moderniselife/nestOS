import React, { useState, useEffect } from 'react';
import { Box, TextField, Button, Card, CardContent, Typography, Alert } from '@mui/material';
const currentDomain = new URL(window.location.href);
const apiURL = `http://${currentDomain.hostname}:3000/api/plugins/plex`;

async function PluginConfig() {
  var [config, setConfig] = React.useState({
    timezone: '',
    plexClaim: '',
    configDir: '/var/lib/nestos/plugins/plex',
    transcodeDir: '/var/lib/nestos/plugins/plex',
    mediaDir: '/var/lib/nestos/plugins/plex/media',
  });

  const loadConfig = async () => {
    try {
      const response = await fetch(`${apiURL}/config`);
      const data = await response.json();
      config = data;
    } catch (error) {
      console.error('Failed to load configuration:', error);
    }
  };

  const handleSave = async () => {
    try {
      await fetch(`${apiURL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  };

  await loadConfig();

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Plex Media Server Configuration
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Get your claim token from{' '}
          <a href="https://www.plex.tv/claim" target="_blank" rel="noopener">
            plex.tv/claim
          </a>
        </Alert>
        <Box component="form" sx={{ '& > :not(style)': { m: 1 } }}>
          <TextField
            fullWidth
            label="Plex Claim Token"
            value={config.plexClaim}
            onChange={(e) => setConfig({ ...config, plexClaim: e.target.value })}
          />
          <TextField
            fullWidth
            label="Media Directory"
            value={config.mediaDir}
            onChange={(e) => setConfig({ ...config, mediaDir: e.target.value })}
            helperText="Directory containing your media files"
          />
          <TextField
            fullWidth
            label="Transcode Directory"
            value={config.transcodeDir}
            onChange={(e) => setConfig({ ...config, transcodeDir: e.target.value })}
          />
          <Button variant="contained" onClick={handleSave}>
            Save Configuration
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
