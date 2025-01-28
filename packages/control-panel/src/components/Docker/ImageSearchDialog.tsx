import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  ListItemSecondaryAction,
  Button,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Box,
} from '@mui/material';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '../../App';

interface SearchResult {
  name: string;
  description: string;
  stars: number;
  icon: string | null;
}

interface ImageSearchDialogProps {
  open: boolean;
  onClose: () => void;
  onImageSelect: (image: string) => void;
}

export function ImageSearchDialog({
  open,
  onClose,
  onImageSelect,
}: ImageSearchDialogProps): JSX.Element {
  const [searchTerm, setSearchTerm] = useState('');
  const [registry, setRegistry] = useState<'docker' | 'github'>('docker');

  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['docker-images', searchTerm, registry],
    queryFn: async () => {
      if (!searchTerm) {
        return [];
      }
      const response = await fetch(
        `${apiUrl}/api/docker/images/search?term=${encodeURIComponent(
          searchTerm
        )}&registry=${registry}`
      );
      if (!response.ok) {
        throw new Error('Failed to search images');
      }
      return response.json();
    },
    enabled: searchTerm.length > 0,
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Search Docker Images</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <ToggleButtonGroup
            value={registry}
            exclusive
            onChange={(_, value) => value && setRegistry(value)}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="docker">Docker Hub</ToggleButton>
            <ToggleButton value="github">GitHub Registry</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            fullWidth
            label="Search images"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            variant="outlined"
          />
        </Box>

        {isLoading ? (
          <CircularProgress />
        ) : (
          <List>
            {searchResults?.map((image: SearchResult) => (
              <ListItem key={image.name}>
                <ListItemAvatar>
                  <Avatar
                    src={image.icon || undefined}
                    alt={image.name}
                    sx={{
                      bgcolor: image.icon ? 'transparent' : 'grey.300',
                    }}
                  >
                    {!image.icon && image.name.charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={image.name}
                  secondary={
                    <>
                      {image.description}
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                        sx={{ ml: 1 }}
                      >
                        ⭐ {image.stars}
                      </Typography>
                    </>
                  }
                />
                <ListItemSecondaryAction>
                  <Button
                    variant="contained"
                    onClick={() => {
                      onImageSelect(image.name);
                      onClose();
                    }}
                  >
                    Select
                  </Button>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
