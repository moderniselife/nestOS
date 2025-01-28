import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  IconButton,
} from '@mui/material';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '../../App';
import { Search as SearchIcon } from '@mui/icons-material';
import { ImageSearchDialog } from './ImageSearchDialog';

interface CreateContainerDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateContainerDialog({ open, onClose }: CreateContainerDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  const [formData, setFormData] = useState({
    image: '',
    name: '',
    ports: [{ container: '', host: '' }],
    volumes: [{ container: '', host: '' }],
    env: [{ key: '', value: '' }],
  });

  const createContainer = useMutation({
    mutationFn: async (data: typeof formData) => {
      // First, pull the image
      const pullResponse = await fetch(`${apiUrl}/api/docker/images/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: data.image }),
      });
      if (!pullResponse.ok) {
        throw new Error('Failed to pull image');
      }

      // Then create the container
      const response = await fetch(`${apiUrl}/api/docker/containers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: data.image,
          name: data.name,
          ports: data.ports
            .filter((p) => p.container && p.host)
            .map((p) => ({
              container: parseInt(p.container),
              host: parseInt(p.host),
            })),
          volumes: data.volumes
            .filter((v) => v.container && v.host)
            .map((v) => ({
              container: v.container,
              host: v.host,
            })),
          env: Object.fromEntries(
            data.env.filter((e) => e.key && e.value).map((e) => [e.key, e.value])
          ),
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to create container');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-containers'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createContainer.mutate(formData);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <form onSubmit={handleSubmit}>
          <DialogTitle>Create Container</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <Stack direction="row" spacing={1}>
                <TextField
                  required
                  fullWidth
                  label="Image"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                />
                <IconButton type="button" onClick={() => setImageSearchOpen(true)}>
                  <SearchIcon />
                </IconButton>
              </Stack>
              <TextField
                label="Container Name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="contained">
              Create
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ImageSearchDialog
        open={imageSearchOpen}
        onClose={() => setImageSearchOpen(false)}
        onImageSelect={(image) => {
          setFormData({ ...formData, image });
          setImageSearchOpen(false);
        }}
      />
    </>
  );
}
