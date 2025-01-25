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
  Divider
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as UpdateIcon,
  PowerSettingsNew as PowerIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '../../App';

export default function Settings() {
  const { data: systemInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/system/info`);
      if (!response.ok) {
        throw new Error('Failed to fetch system info');
      }
      return response.json();
    }
  });

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
                    defaultValue={systemInfo?.hostname}
                    variant="outlined"
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Time Zone"
                    defaultValue="UTC"
                    variant="outlined"
                    size="small"
                  />
                </Grid>
              </Grid>
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={() => {
                    // TODO: Implement save settings
                    console.log('Save settings');
                  }}
                >
                  Save Changes
                </Button>
              </Box>
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
              <Button
                variant="contained"
                startIcon={<UpdateIcon />}
                onClick={() => {
                  // TODO: Implement system update
                  console.log('Update system');
                }}
              >
                Check for Updates
              </Button>
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
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Enable HTTPS"
                />
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Allow Remote Access"
                />
                <FormControlLabel
                  control={<Switch />}
                  label="Enable Two-Factor Authentication"
                />
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
                  control={<Switch defaultChecked />}
                  label="Enable Automatic Backups"
                />
                <TextField
                  fullWidth
                  label="Backup Location"
                  defaultValue="/mnt/backups"
                  variant="outlined"
                  size="small"
                />
                <TextField
                  fullWidth
                  label="Backup Retention (days)"
                  defaultValue="30"
                  type="number"
                  variant="outlined"
                  size="small"
                />
              </Stack>
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={() => {
                    // TODO: Implement backup now
                    console.log('Backup now');
                  }}
                >
                  Backup Now
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}