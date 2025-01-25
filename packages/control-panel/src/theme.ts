import { createTheme } from '@mui/material/styles';

// NestOS Color Palette
const nestColors = {
  primary: {
    main: '#FF7043', // Warm orange - like a nest
    light: '#FFA270',
    dark: '#C63F17'
  },
  secondary: {
    main: '#5D4037', // Warm brown - like wood
    light: '#8B6B61',
    dark: '#321911'
  },
  background: {
    default: '#121212',
    paper: '#1E1E1E'
  },
  success: {
    main: '#66BB6A',
    light: '#81C784',
    dark: '#388E3C'
  },
  warning: {
    main: '#FFA726',
    light: '#FFB74D',
    dark: '#F57C00'
  },
  error: {
    main: '#EF5350',
    light: '#E57373',
    dark: '#D32F2F'
  },
  info: {
    main: '#29B6F6',
    light: '#4FC3F7',
    dark: '#0288D1'
  }
};

export const theme = createTheme({
  palette: {
    mode: 'dark',
    ...nestColors
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Arial',
      'sans-serif',
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Segoe UI Symbol"'
    ].join(','),
    h1: {
      fontWeight: 600
    },
    h2: {
      fontWeight: 600
    },
    h3: {
      fontWeight: 600
    },
    h4: {
      fontWeight: 600
    },
    h5: {
      fontWeight: 600
    },
    h6: {
      fontWeight: 600
    }
  },
  components: {
    MuiAppBar: {
      defaultProps: {
        elevation: 0
      },
      styleOverrides: {
        root: {
          backgroundColor: nestColors.background.paper,
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)'
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: nestColors.background.paper,
          borderRight: '1px solid rgba(255, 255, 255, 0.12)'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: nestColors.background.paper,
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.12)'
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none'
          }
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6
        }
      }
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: 'rgba(255, 255, 255, 0.12)'
        }
      }
    }
  },
  shape: {
    borderRadius: 12
  }
});