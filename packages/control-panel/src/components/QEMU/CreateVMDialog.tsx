import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Stack,
  ListSubheader,
} from '@mui/material';
import { useState } from 'react';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { apiUrl } from '../../App';
import { Upload as UploadIcon } from '@mui/icons-material';

interface CreateVMDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Template {
  id: string;
  cpu: number;
  memory: number;
  disk: number;
  network: {
    type: 'user' | 'bridge';
    bridge?: string;
  };
  vnc: boolean;
  extraArgs?: string[];
  useKvm?: boolean;
  cpuModel?: string;
}

export function CreateVMDialog({ open, onClose }: CreateVMDialogProps): JSX.Element {
  const [formData, setFormData] = useState({
    name: '',
    template: '',
    iso: '',
    cpu: 1,
    memory: 1024,
    disk: 10,
    network: {
      type: 'user' as 'user' | 'bridge',
      bridge: '',
    },
    vnc: true,
    useKvm: true,
    cpuModel: '',
    cpuSearchQuery: '',
  });

  const { data: templatesData } = useQuery({
    queryKey: ['vm-templates'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/qemu/templates`);
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }
      return response.json();
    },
  });

  const { data: cpusData } = useQuery({
    queryKey: ['vm-cpus'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/qemu/cpus`);
      if (!response.ok) {
        throw new Error('Failed to fetch CPU models');
      }
      return response.json();
    },
  });

  const { data: isosData } = useQuery({
    queryKey: ['vm-isos'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/qemu/isos`);
      if (!response.ok) {
        throw new Error('Failed to fetch ISOs');
      }
      return response.json();
    },
  });

  // Add template selection handler
  const handleTemplateChange = (templateId: string) => {
    const template = templatesData?.templates.find((t: Template) => t.id === templateId);
    if (template) {
      setFormData({
        ...formData,
        template: templateId,
        cpu: template.cpu,
        memory: template.memory,
        disk: template.disk,
        network: template.network,
        vnc: template.vnc,
        useKvm: template.useKvm,
        cpuModel: template.cpuModel,
      });
    }
  };

  const queryClient = useQueryClient();

  const createVM = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch(`${apiUrl}/api/qemu/vms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to create VM');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      onClose();
      setFormData({
        name: '',
        cpu: 1,
        iso: '',
        memory: 1024,
        disk: 10,
        network: {
          type: 'user',
          bridge: '',
        },
        template: '',
        vnc: true,
        useKvm: true,
        cpuModel: '',
        cpuSearchQuery: '',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createVM.mutate(formData);
  };

  const uploadISO = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${apiUrl}/api/qemu/isos`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error('Failed to upload ISO');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm-isos'] });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadISO.mutate(file);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create Virtual Machine</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Template</InputLabel>
              <Select
                value={formData.template}
                label="Template"
                onChange={(e) => handleTemplateChange(e.target.value)}
              >
                <MenuItem value="">Custom</MenuItem>
                {templatesData?.templates.map((template: Template) => (
                  <MenuItem key={template.id} value={template.id}>
                    {template.id.charAt(0).toUpperCase() + template.id.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" spacing={1}>
              <FormControl fullWidth>
                <InputLabel>Installation ISO</InputLabel>
                <Select
                  value={formData.iso}
                  label="Installation ISO"
                  onChange={(e) => setFormData({ ...formData, iso: e.target.value })}
                >
                  <MenuItem value="">None</MenuItem>
                  {isosData?.map((iso: string) => (
                    <MenuItem key={iso} value={iso}>
                      {iso}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                component="label"
                variant="contained"
                startIcon={<UploadIcon />}
                sx={{ minWidth: 'auto' }}
              >
                Upload
                <input type="file" hidden accept=".iso" onChange={handleFileUpload} />
              </Button>
            </Stack>
            {/* <FormControl fullWidth>
              <InputLabel>CPU Model</InputLabel>
              <Select
                value={formData.cpuModel}
                label="CPU Model"
                onChange={(e) => setFormData({ ...formData, cpuModel: e.target.value })}
              >
                <MenuItem value="">Default</MenuItem>
                {cpusData?.categories &&
                  Object.entries(cpusData.categories).map(([category, cpus]) => [
                    <ListSubheader key={category}>{category}</ListSubheader>,
                    cpus.map((cpu: { model: string; description: string }) => (
                      <MenuItem key={cpu.model} value={cpu.model}>
                        {cpu.model} {cpu.description ? `- ${cpu.description}` : ''}
                      </MenuItem>
                    )),
                  ])}
              </Select>
            </FormControl> */}
            <FormControl fullWidth>
              <InputLabel>CPU Model</InputLabel>
              <Select
                value={formData.cpuModel}
                label="CPU Model"
                onChange={(e) => setFormData({ ...formData, cpuModel: e.target.value })}
                onOpen={() => setFormData({ ...formData, cpuSearchQuery: '' })}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <MenuItem>
                  <TextField
                    size="small"
                    autoFocus
                    placeholder="Search CPU models..."
                    fullWidth
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => setFormData({ ...formData, cpuSearchQuery: e.target.value })}
                    value={formData.cpuSearchQuery || ''}
                  />
                </MenuItem>
                <MenuItem value="">Default</MenuItem>
                {cpusData?.categories &&
                  Object.entries(cpusData.categories).map(([category, cpus]) => {
                    const filteredCPUs = (cpus as any[]).filter(
                      (cpu) =>
                        !formData.cpuSearchQuery ||
                        cpu.model.toLowerCase().includes(formData.cpuSearchQuery.toLowerCase()) ||
                        cpu.description
                          .toLowerCase()
                          .includes(formData.cpuSearchQuery.toLowerCase())
                    );

                    if (filteredCPUs.length === 0) {
                      return null;
                    }

                    return [
                      <ListSubheader key={category}>{category}</ListSubheader>,
                      filteredCPUs.map((cpu: { model: string; description: string }) => (
                        <MenuItem key={cpu.model} value={cpu.model}>
                          {cpu.model} {cpu.description ? `- ${cpu.description}` : ''}
                        </MenuItem>
                      )),
                    ];
                  })}
              </Select>
            </FormControl>

            <TextField
              label="Name"
              fullWidth
              value={formData.name}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  name: e.target.value.replace(/[^a-zA-Z0-9-]/g, '-'), // Replace all non-alphanumeric chars with hyphens
                })
              }
              required
              helperText="Only letters, numbers, and hyphens are allowed"
            />
            <TextField
              label="CPU Cores"
              type="number"
              fullWidth
              value={formData.cpu}
              onChange={(e) => setFormData({ ...formData, cpu: parseInt(e.target.value) })}
              required
              inputProps={{ min: 1 }}
            />
            <TextField
              label="Memory (MB)"
              type="number"
              fullWidth
              value={formData.memory}
              onChange={(e) => setFormData({ ...formData, memory: parseInt(e.target.value) })}
              required
              inputProps={{ min: 512 }}
            />
            <TextField
              label="Disk Size (GB)"
              type="number"
              fullWidth
              value={formData.disk}
              onChange={(e) => setFormData({ ...formData, disk: parseInt(e.target.value) })}
              required
              inputProps={{ min: 1 }}
            />
            <FormControl fullWidth>
              <InputLabel>Network Type</InputLabel>
              <Select
                value={formData.network.type}
                label="Network Type"
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    network: {
                      ...formData.network,
                      type: e.target.value as 'user' | 'bridge',
                    },
                  })
                }
              >
                <MenuItem value="user">User (NAT)</MenuItem>
                <MenuItem value="bridge">Bridge</MenuItem>
              </Select>
            </FormControl>
            {formData.network.type === 'bridge' && (
              <TextField
                label="Bridge Interface"
                fullWidth
                value={formData.network.bridge}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    network: {
                      ...formData.network,
                      bridge: e.target.value,
                    },
                  })
                }
                required
              />
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={formData.vnc}
                  onChange={(e) => setFormData({ ...formData, vnc: e.target.checked })}
                />
              }
              label="Enable VNC Console"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.useKvm}
                  onChange={(e) => setFormData({ ...formData, useKvm: e.target.checked })}
                />
              }
              label="Use KVM"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained">
            Create
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
