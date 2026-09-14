import { Navigate, Route, Routes } from 'react-router-dom';

import GuestRoute from './components/GuestRoute';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Applications from './pages/Applications';
import AddApplication from './pages/AddApplication';
import ApplicationDetails from './pages/ApplicationDetails';
import EditApplication from './pages/EditApplication';
import MyResumes from './pages/MyResumes';
import Profile from './pages/Profile';
import HealthCheckPage from './pages/HealthCheckPage';

/**
 * Wraps a page in the auth gate and the shared chrome.
 *
 * Introduced once there were six protected routes: writing both wrappers out
 * per route made the table hard to read, and — more importantly — made it easy
 * to add a route and forget one of them. Now "protected" is a single word on
 * the line that declares the route, and there is no partial version of it.
 */
function protectedPage(element: React.ReactNode) {
  return (
    <ProtectedRoute>
      <AppLayout>{element}</AppLayout>
    </ProtectedRoute>
  );
}

/**
 * Route table.
 *
 * Three tiers: guest-only (login, signup), protected (everything showing a
 * user's own data), and public (the Phase 0 connectivity check).
 *
 * Route order: `/applications/new` is declared before `/applications/:id` for
 * readability. React Router v7 ranks by specificity rather than declaration
 * order, so a static segment already beats a dynamic one — but the ordering
 * makes the intent obvious to a reader who does not know that.
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
      <Route path="/dashboard" element={protectedPage(<Dashboard />)} />
      <Route path="/applications" element={protectedPage(<Applications />)} />
      <Route path="/applications/new" element={protectedPage(<AddApplication />)} />
      <Route path="/applications/:id" element={protectedPage(<ApplicationDetails />)} />
      <Route path="/applications/:id/edit" element={protectedPage(<EditApplication />)} />
      <Route path="/resumes" element={protectedPage(<MyResumes />)} />
      <Route path="/profile" element={protectedPage(<Profile />)} />

      {/* Public — kept from Phase 0 for checking API connectivity. */}
      <Route path="/health-check" element={<HealthCheckPage />} />

      {/* The root sends everyone to the dashboard; ProtectedRoute then decides
          whether that means the dashboard or the login page. */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
