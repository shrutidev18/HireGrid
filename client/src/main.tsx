import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import './index.css';

/**
 * One QueryClient for the whole app, created outside the component tree so it
 * is not re-created on every render — a re-created client would throw away the
 * cache each time and defeat the point of using React Query.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Refetching every time the user tabs back to the window is noisy for a
      // tracker whose data changes when *they* change it. Individual queries
      // that genuinely need it (the analysis poller) opt back in.
      refetchOnWindowFocus: false,

      // One retry: enough to ride out a blip, not enough to make a genuinely
      // broken request take ten seconds to report failure.
      retry: 1,

      // Data is considered fresh for 30s, so navigating back to a page the
      // user just visited reads from cache instead of refetching.
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
    {/* Provider order matters: BrowserRouter must be inside QueryClientProvider
        so route components can use query hooks. */}
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
