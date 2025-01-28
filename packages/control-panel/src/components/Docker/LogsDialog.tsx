import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '../../App';

interface LogsDialogProps {
  open: boolean;
  onClose: () => void;
  containerId: string;
  containerName: string;
}

export function LogsDialog({
  open,
  onClose,
  containerId,
  containerName,
}: LogsDialogProps): JSX.Element {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['container-logs', containerId],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/docker/containers/${containerId}/logs?tail=1000`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }

      // Read the response as a Uint8Array
      const buffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      // Convert the Uint8Array to string, handling Docker log format
      let result = '';
      for (let i = 0; i < uint8Array.length; ) {
        // Docker log format: [8]stream[1][...]size[4]message
        // Skip the header (8 bytes)
        i += 8;
        const size = uint8Array[i + 3];
        i += 4;

        // Read the message content
        const chunk = uint8Array.slice(i, i + size);
        result += new TextDecoder().decode(chunk);
        i += size;
      }

      return result;
    },
    enabled: open,
    refetchInterval: 5000,
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Logs: {containerName}</DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        ) : (
          <Box
            sx={{
              bgcolor: 'background.paper',
              p: 2,
              borderRadius: 1,
              maxHeight: '60vh',
              overflow: 'auto',
            }}
          >
            <Typography
              component="pre"
              sx={{
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                margin: 0,
                fontSize: '0.875rem',
              }}
            >
              {logs || ''}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
