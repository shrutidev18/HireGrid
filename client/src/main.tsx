import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

/**
 * One QueryClient for the whole app, created outside the component tree so it
 * is not re-created on every render — a re-created client would throw away the
 * cache each time and defeat the point of using React Query.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Refetching every time the user tabs back is noisy for a tracker whose
      // data changes when *they* change it. Queries that genuinely need it
      // (the analysis poller) opt back in.
      refetchOnWindowFocus: false,

      // One retry: enough to ride out a blip, not enough to make a genuinely
      // broken request take ten seconds to report failure.
      retry: 1,

      staleTime: 30_000,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    {/*
      Provider order matters, outermost first:
        QueryClientProvider — AuthProvider is built on React Query, so the
                              client must exist before it mounts.
        BrowserRouter       — AuthProvider's consumers navigate, and
                              ProtectedRoute needs the router's location.
        AuthProvider        — supplies the session to everything in App.
    */}
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
