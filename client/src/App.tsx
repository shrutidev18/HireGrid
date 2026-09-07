import { Navigate, Route, Routes } from 'react-router-dom';
import HealthCheckPage from './pages/HealthCheckPage';

/**
 * Route table for the app.
 *
 * Phase 0 has one route. Auth-protected routes, the dashboard, and the
 * applications pages are added in later phases; keeping routing in its own
 * component (rather than in main.tsx) means only this file changes when they
 * are.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HealthCheckPage />} />

      {/* Unknown paths fall back to the root rather than rendering nothing. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
