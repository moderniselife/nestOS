import { ThemeProvider, CssBaseline, CircularProgress, Box } from '@mui/material';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { theme } from './theme.js';
import Layout from './components/Layout';
import FrostedGlassProvider from './components/FrostedGlassProvider/index.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
});

// API base URL from environment or default
const API_URL = import.meta.env.VITE_API_URL || ''; //`http://${new URL(window.location.href).hostname}:3000`;

function ApiCheck({ children }: { children: React.ReactNode }) {
  const { isLoading, isError, error } = useQuery({
    queryKey: ['api-health'],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/health`);
      if (!response.ok) {
        throw new Error('API is not responding');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        color="error.main"
      >
        Error connecting to API: {error instanceof Error ? error.message : 'Unknown error'}
      </Box>
    );
  }

  return children;
}

function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <ApiCheck>
            <FrostedGlassProvider>
              <Layout />
            </FrostedGlassProvider>
          </ApiCheck>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Export API URL for use in other components
export const apiUrl = API_URL;
export default App;
