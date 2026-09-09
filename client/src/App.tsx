import { Navigate, Route, Routes } from 'react-router-dom';

import GuestRoute from './components/GuestRoute';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Applications from './pages/Applications';
import Profile from './pages/Profile';
import HealthCheckPage from './pages/HealthCheckPage';

/**
 * Route table.
 *
 * Three tiers:
 *   - Guest-only: login and signup, which redirect away if already signed in.
 *   - Protected:  everything that shows a user's own data. Each is wrapped in
 *                 ProtectedRoute *and* AppLayout, so a page cannot accidentally
 *                 be added without its auth gate.
 *   - Public:     the Phase 0 connectivity check, kept as a debugging aid.
 *
 * The wrapping is repeated per route rather than applied to a parent layout
 * route, because it keeps each route's protection visible on the line that
 * declares it — there is no way to read this file and be unsure whether a page
 * requires a session.
 */
export default function App() {
  return (
    <Routes>
      {/* Guest-only */}
      <Route
        path="/login"
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <GuestRoute>
            <Signup />
          </GuestRoute>
        }
      />

      {/* Protected */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Dashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/applications"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Applications />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Profile />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Public — kept from Phase 0 for checking API connectivity. */}
      <Route path="/health-check" element={<HealthCheckPage />} />

      {/* The root sends everyone to the dashboard; ProtectedRoute then decides
          whether that means the dashboard or the login page. */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
