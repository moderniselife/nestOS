import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Stack,
  Button,
  Switch,
  FormControlLabel,
  TextField,
  Alert,
  Divider,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as UpdateIcon,
  PowerSettingsNew as PowerIcon,
  BackupRounded as BackupIcon,
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '../../App';
import React from 'react';
import { LoadingButton } from '@mui/lab';

interface UpdateSettings {
  autoUpdate: boolean;
  schedule: 'hourly' | 'daily' | null;
}

// Add these interfaces near UpdateSettings interface
interface BackupSettings {
  enabled: boolean;
  location: string;
  retention: number;
}
interface AppearanceSettings {
  background: string;
  useFrostedGlass: boolean;
}

export default function Settings(): JSX.Element {
  const queryClient = useQueryClient();

  const [isBackingUp, setIsBackingUp] = React.useState(false);

  const { data: backupSettings } = useQuery<BackupSettings>({
    queryKey: ['backup-settings'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/backup/settings`);
      if (!response.ok) {
        throw new Error('Failed to fetch backup settings');
      }
      return response.json();
    },
  });

  const handleBackupSettings = async (settings: Partial<BackupSettings>) => {
    try {
      const response = await fetch(`${apiUrl}/api/system/backup/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...backupSettings,
          ...settings,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update backup settings');
      }

      await queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
    } catch (error) {
      console.error('Failed to update backup settings:', error);
      alert('Failed to update backup settings');
    }
  };

  // Add this function to handle manual backup
  const handleManualBackup = async () => {
    try {
      setIsBackingUp(true);
      const response = await fetch(`${apiUrl}/api/system/backup/run`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Backup failed');
      }

      const result = await response.json();
      alert(result.message);
    } catch (error) {
      console.error('Backup failed:', error);
      alert('Backup failed');
    } finally {
      setIsBackingUp(false);
    }
  };

  const { data: systemInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/info`);
      if (!response.ok) {
        throw new Error('Failed to fetch system info');
      }
      return response.json();
    },
  });

  const { data: updateSettings } = useQuery<UpdateSettings>({
    queryKey: ['update-settings'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/updates/settings`);
      if (!response.ok) {
        throw new Error('Failed to fetch update settings');
      }
      return response.json();
    },
  });

  const handleUpdateSettings = async (settings: Partial<UpdateSettings>) => {
    try {
      await fetch(`${apiUrl}/api/system/updates/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      await queryClient.invalidateQueries({ queryKey: ['update-settings'] });
    } catch (error) {
      console.error('Failed to update settings:', error);
      alert('Failed to update settings');
    }
  };

  const { data: appearanceSettings } = useQuery<AppearanceSettings>({
    queryKey: ['appearance-settings'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/appearance/appearance`);
      if (!response.ok) {
        throw new Error('Failed to fetch appearance settings');
      }
      return response.json();
    },
  });

  const handleAppearanceSettings = async (settings: Partial<AppearanceSettings>) => {
    try {
      const response = await fetch(`${apiUrl}/api/appearance/appearance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to update appearance settings');
      }
      await queryClient.invalidateQueries({ queryKey: ['appearance-settings'] });
    } catch (error) {
      console.error('Failed to update appearance settings:', error);
      alert('Failed to update appearance settings');
    }
  };

  // Add state for system settings
  const [hostname, setHostname] = React.useState('');
  const [timezone, setTimezone] = React.useState('');
  const [timezones, setTimezones] = React.useState<string[]>([]);
  const [defaultView, setDefaultView] = React.useState<'launcher' | 'dashboard'>('launcher');
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  // Load timezones
  React.useEffect(() => {
    fetch(`${apiUrl}/api/system/timezones`)
      .then((res) => res.json())
      .then((data) => setTimezones(data))
      .catch(console.error);
  }, []);

  React.useEffect(() => {
    if (systemInfo) {
      setHostname(systemInfo.hostname || '');
      setTimezone(systemInfo.timezone || 'UTC');
      setDefaultView(systemInfo.defaultView || 'launcher');
    }
  }, [systemInfo]);

  const handleSaveSettings = async () => {
    try {
      setSaveError(null);
      setSaveSuccess(false);

      const response = await fetch(`${apiUrl}/api/system/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname, timezone, defaultView }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setSaveSuccess(true);
      await queryClient.invalidateQueries({ queryKey: ['system-info'] });
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save settings');
    }
  };

  // Replace the System Information card content with:
  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h5" gutterBottom>
        System Settings
      </Typography>

      <Grid container spacing={3}>
        {/* System Information */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Information
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Hostname"
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    variant="outlined"
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    select
                    fullWidth
                    label="Time Zone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    variant="outlined"
                    size="small"
                  >
                    {timezones.map((tz) => (
                      <MenuItem key={tz} value={tz}>
                        {tz}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth variant="outlined" size="small">
                    <InputLabel>Default View</InputLabel>
                    <Select
                      value={defaultView}
                      onChange={(e) => setDefaultView(e.target.value as 'launcher' | 'dashboard')}
                      label="Default View"
                    >
                      <MenuItem value="launcher">App Launcher</MenuItem>
                      <MenuItem value="dashboard">Dashboard</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              {saveError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {saveError}
                </Alert>
              )}
              {saveSuccess && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  Settings saved successfully
                </Alert>
              )}
              <Box sx={{ mt: 2 }}>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSaveSettings}>
                  Save Changes
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Appearance */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Appearance
              </Typography>
              <Stack spacing={2}>
                <FormControl fullWidth variant="outlined" size="small">
                  <InputLabel>Background</InputLabel>
                  <Select
                    value={appearanceSettings?.background || 'abstract-dark'}
                    onChange={(e) =>
                      handleAppearanceSettings({
                        ...appearanceSettings,
                        background: e.target.value,
                      })
                    }
                    label="Background"
                  >
                    <MenuItem value="mountain-night">Mountain Night</MenuItem>
                    <MenuItem value="abstract-dark">Abstract Dark</MenuItem>
                    <MenuItem value="forest-mist">Forest Mist</MenuItem>
                    <MenuItem value="ocean-dark">Ocean Dark</MenuItem>
                    <MenuItem value="space">Space</MenuItem>
                  </Select>
                </FormControl>

                <FormControlLabel
                  control={
                    <Switch
                      checked={appearanceSettings?.useFrostedGlass ?? false}
                      onChange={(e) =>
                        handleAppearanceSettings({
                          ...appearanceSettings,
                          useFrostedGlass: e.target.checked,
                        })
                      }
                    />
                  }
                  label="Use Frosted Glass Theme"
                />

                <Alert severity="info" sx={{ mt: 1 }}>
                  The frosted glass theme applies the Nest Launcher&apos;s modern, translucent
                  design across all pages.
                </Alert>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* System Updates */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Updates
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Current Version: {systemInfo?.release}
              </Typography>
              <Stack spacing={2}>
                <Button
                  variant="contained"
                  startIcon={<UpdateIcon />}
                  onClick={async () => {
                    try {
                      const response = await fetch(`${apiUrl}/api/system/updates/check`);
                      if (!response.ok) {
                        throw new Error('Failed to check for updates');
                      }
                      const data = await response.json();
                      const updateData = data.system;

                      if (updateData.updateAvailable) {
                        if (
                          window.confirm(
                            `Update available! Changes:\n${updateData.updateDetails
                              .map((d: any) => `${d.hash}: ${d.message}`)
                              .join('\n')}\n\nWould you like to update now?`
                          )
                        ) {
                          await fetch(`${apiUrl}/api/system/updates/apply`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ target: 'system' }),
                          });
                          window.location.reload();
                        }
                      } else {
                        alert('Your system is up to date!');
                      }
                    } catch (error) {
                      console.error('Update check failed:', error);
                      alert('Failed to check for updates');
                    }
                  }}
                >
                  Check for Updates
                </Button>

                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(updateSettings?.autoUpdate)}
                      onChange={(e) =>
                        handleUpdateSettings({
                          autoUpdate: e.target.checked,
                          schedule: e.target.checked ? updateSettings?.schedule || 'daily' : null,
                        })
                      }
                    />
                  }
                  label="Enable Auto Updates"
                />

                {updateSettings?.autoUpdate && (
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Update Schedule"
                    value={updateSettings.schedule || 'daily'}
                    onChange={(e) =>
                      handleUpdateSettings({
                        autoUpdate: true,
                        schedule: e.target.value as 'hourly' | 'daily',
                      })
                    }
                  >
                    <MenuItem value="hourly">Every Hour</MenuItem>
                    <MenuItem value="daily">Once Daily</MenuItem>
                  </TextField>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* nestOS Updates */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                nestOS Updates
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Current Version: {systemInfo?.nestos.version}
              </Typography>
              <Stack spacing={2}>
                <Button
                  variant="contained"
                  startIcon={<UpdateIcon />}
                  onClick={async () => {
                    try {
                      const response = await fetch(`${apiUrl}/api/system/updates/check`);
                      if (!response.ok) {
                        throw new Error('Failed to check for updates');
                      }
                      const data = await response.json();
                      const updateData = data.nestos;

                      if (updateData.updateAvailable) {
                        if (
                          window.confirm(
                            `Update available! Changes:\n${updateData.updateDetails
                              .map((d: any) => `${d.hash}: ${d.message}`)
                              .join('\n')}\n\nWould you like to update now?`
                          )
                        ) {
                          await fetch(`${apiUrl}/api/system/updates/apply`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ target: 'nestos' }),
                          });
                          window.location.reload();
                        }
                      } else {
                        alert('Your system is up to date!');
                      }
                    } catch (error) {
                      console.error('Update check failed:', error);
                      alert('Failed to check for updates');
                    }
                  }}
                >
                  Check for Updates
                </Button>

                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(updateSettings?.autoUpdate)}
                      onChange={(e) =>
                        handleUpdateSettings({
                          autoUpdate: e.target.checked,
                          schedule: e.target.checked ? updateSettings?.schedule || 'daily' : null,
                        })
                      }
                    />
                  }
                  label="Enable Auto Updates"
                />

                {updateSettings?.autoUpdate && (
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Update Schedule"
                    value={updateSettings.schedule || 'daily'}
                    onChange={(e) =>
                      handleUpdateSettings({
                        autoUpdate: true,
                        schedule: e.target.value as 'hourly' | 'daily',
                      })
                    }
                  >
                    <MenuItem value="hourly">Every Hour</MenuItem>
                    <MenuItem value="daily">Once Daily</MenuItem>
                  </TextField>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Power Management */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Power Management
              </Typography>
              <Stack spacing={2}>
                <Button
                  variant="contained"
                  color="warning"
                  startIcon={<PowerIcon />}
                  onClick={() => {
                    // TODO: Implement reboot
                    console.log('Reboot system');
                  }}
                >
                  Reboot System
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<PowerIcon />}
                  onClick={() => {
                    // TODO: Implement shutdown
                    console.log('Shutdown system');
                  }}
                >
                  Shutdown System
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Security Settings */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Security Settings
              </Typography>
              <Stack spacing={2}>
                <FormControlLabel control={<Switch defaultChecked />} label="Enable HTTPS" />
                <FormControlLabel control={<Switch defaultChecked />} label="Allow Remote Access" />
                <FormControlLabel control={<Switch />} label="Enable Two-Factor Authentication" />
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Alert severity="info">
                Some security settings may require a system restart to take effect.
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        {/* Backup Settings */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Backup Settings
              </Typography>
              <Stack spacing={2}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={backupSettings?.enabled ?? false}
                      onChange={(e) => handleBackupSettings({ enabled: e.target.checked })}
                    />
                  }
                  label="Enable Automatic Backups"
                />
                <TextField
                  fullWidth
                  label="Backup Location"
                  value={backupSettings?.location ?? '/mnt/backups'}
                  onChange={(e) => handleBackupSettings({ location: e.target.value })}
                  variant="outlined"
                  size="small"
                />
                <TextField
                  fullWidth
                  label="Backup Retention (days)"
                  value={backupSettings?.retention ?? 30}
                  onChange={(e) =>
                    handleBackupSettings({ retention: parseInt(e.target.value) || 30 })
                  }
                  type="number"
                  variant="outlined"
                  size="small"
                  inputProps={{ min: 1, max: 365 }}
                />
              </Stack>
              <Box sx={{ mt: 2 }}>
                <LoadingButton
                  loading={isBackingUp}
                  variant="contained"
                  startIcon={<BackupIcon />}
                  onClick={handleManualBackup}
                >
                  Backup Now
                </LoadingButton>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
