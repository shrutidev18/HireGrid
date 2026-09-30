import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Briefcase, FileText, User, Menu, X, ChevronDown, LogOut, Bell, Target } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/applications", label: "Applications", icon: Briefcase },
  { to: "/resumes", label: "Resumes", icon: FileText },
  { to: "/profile", label: "Profile", icon: User },
];

// wraps every logged-in page with the sidebar + top bar. Pages just render
// their content inside this instead of each having their own full-page layout.
export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);

  // show first letters of name in the avatar circle
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-app-bg">
      {/* sidebar - desktop only */}
      <aside className="hidden md:flex md:flex-col md:fixed md:top-0 md:left-0 md:h-screen md:w-[220px] bg-white border-r border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">
            HG
          </div>
          <span className="text-lg font-semibold text-gray-900">HireGrid</span>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* just a little tagline at the bottom so the sidebar doesn't feel empty */}
        <div className="mt-auto px-2">
          <div className="border-t border-gray-100 pt-4 flex items-center gap-2 text-gray-400">
            <Target size={16} />
            <p className="text-xs italic">
              Small steps
              <br />
              build big careers.
            </p>
          </div>
        </div>
      </aside>

      {/* top bar for mobile - has the logo + hamburger */}
      <div className="md:hidden bg-white border-b border-gray-100 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
            HG
          </div>
          <span className="font-semibold text-gray-900">HireGrid</span>
        </div>
        <button onClick={() => setShowMobileNav(!showMobileNav)}>
          {showMobileNav ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {showMobileNav && (
        <div className="md:hidden bg-white border-b border-gray-100 px-3 pb-3 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setShowMobileNav(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* main column - pushed right on desktop to make room for the fixed sidebar */}
      <div className="md:ml-[220px]">
        <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-end gap-4 relative">
          {/* just a static bell icon to match the reference layout - no notifications
              system in this app yet, so it doesn't have a dropdown or unread count */}
          <button className="text-gray-400 hover:text-gray-600">
            <Bell size={20} />
          </button>

          <button onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold">
              {initials}
            </div>
            <span className="text-sm font-medium text-gray-700">{user?.name}</span>
            <ChevronDown size={16} className="text-gray-400" />
          </button>

          {showMenu && (
            <div className="absolute top-14 right-6 bg-white border border-gray-200 rounded-lg shadow-sm py-1 w-40">
              <Link
                to="/profile"
                onClick={() => setShowMenu(false)}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <User size={16} />
                Profile
              </Link>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          )}
        </div>

        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
