import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Card,
  CardContent,
  Typography,
  Alert
} from '@mui/material';

export default function PlexConfig() {
  const [config, setConfig] = useState({
    timezone: '',
    plexClaim: '',
    configDir: '/var/lib/nestos/plugins/plex',
    transcodeDir: '/var/lib/nestos/plugins/plex',
    mediaDir: '/var/lib/nestos/plugins/plex/media'
  });

  const handleSave = async () => {
    try {
      await fetch('/api/plugins/plex/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      // Restart container to apply changes
      await fetch('/api/plugins/plex/restart', { method: 'POST' });
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Plex Media Server Configuration
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Get your claim token from <a href="https://www.plex.tv/claim" target="_blank" rel="noopener">plex.tv/claim</a>
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