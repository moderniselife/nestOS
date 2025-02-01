import { Box, styled } from '@mui/material';
import { useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '../../App';
import { createContext } from 'react';

export const AppearanceContext = createContext<{
  useFrostedGlass?: boolean;
  background?: string;
}>({});

const BackgroundContainer = styled(Box)(() => ({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundImage: 'var(--background-image)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  zIndex: 0,
  pointerEvents: 'none',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(10px)',
  },
}));

const ContentWrapper = styled(Box)(() => ({
  position: 'relative',
  zIndex: 1,
  height: '100%',
  backgroundColor: 'transparent',
  '& .MuiPaper-root': {
    backgroundColor: appearanceSettings?.useFrostedGlass ? 'rgba(255, 255, 255, 0.1)' : undefined,
    backdropFilter: appearanceSettings?.useFrostedGlass ? 'blur(10px)' : undefined,
  },
  '& .MuiCard-root': {
    backgroundColor: appearanceSettings?.useFrostedGlass ? 'rgba(255, 255, 255, 0.1)' : undefined,
    backdropFilter: appearanceSettings?.useFrostedGlass ? 'blur(10px)' : undefined,
  },
}));
let appearanceSettings: {
  useFrostedGlass?: boolean;
  background?: string;
} = {
  useFrostedGlass: false,
  background: 'abstract-dark',
};

export default function FrostedGlassProvider({ children }: { children: ReactNode }): JSX.Element {
  const { data: tmpSettings } = useQuery({
    queryKey: ['appearance-settings'],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/appearance/appearance`);
      if (!response.ok) {
        throw new Error('Failed to fetch appearance settings');
      }
      return response.json();
    },
  });
  appearanceSettings = tmpSettings;
  useEffect(() => {
    if (appearanceSettings?.background) {
      document.documentElement.style.setProperty(
        '--background-image',
        `url(/backgrounds/${appearanceSettings.background}.jpg)`
      );
    }
  }, [appearanceSettings?.background]);

  return (
    <AppearanceContext.Provider value={appearanceSettings || {}}>
      {appearanceSettings?.useFrostedGlass && <BackgroundContainer />}
      <ContentWrapper>{children}</ContentWrapper>
    </AppearanceContext.Provider>
  );
}
