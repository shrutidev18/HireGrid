import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Briefcase, FileText, User, Menu, X, ChevronDown, LogOut } from "lucide-react";
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
    <div className="min-h-screen bg-mint-bg">
      {/* sidebar - desktop only */}
      <aside className="hidden md:flex md:flex-col md:fixed md:top-0 md:left-0 md:h-screen md:w-[220px] bg-mint-sidebar border-r border-teal-100 p-4">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-9 h-9 bg-teal-700 rounded-xl flex items-center justify-center text-white font-bold text-sm">
            HG
          </div>
          <span className="text-lg font-semibold text-teal-900">HireGrid</span>
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
                  isActive ? "bg-teal-700 text-white" : "text-teal-900 hover:bg-teal-100"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* top bar for mobile - has the logo + hamburger */}
      <div className="md:hidden bg-mint-sidebar border-b border-teal-100 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal-700 rounded-lg flex items-center justify-center text-white font-bold text-xs">
            HG
          </div>
          <span className="font-semibold text-teal-900">HireGrid</span>
        </div>
        <button onClick={() => setShowMobileNav(!showMobileNav)}>
          {showMobileNav ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {showMobileNav && (
        <div className="md:hidden bg-mint-sidebar border-b border-teal-100 px-3 pb-3 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setShowMobileNav(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? "bg-teal-700 text-white" : "text-teal-900 hover:bg-teal-100"
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
        <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-end relative">
          <button onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-sm font-semibold">
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
