import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Zap, Users, Gift, ChevronRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getDashboard } from "../api/dashboard";
import StatusBadge from "../components/StatusBadge";
import type { DashboardData } from "../api/dashboard";
import type { ApplicationStatus } from "../types";

const STATUS_OPTIONS: ApplicationStatus[] = ["SAVED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"];

// quick and dirty "x days ago" text for the recent activity list
function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  if (!data || data.totalApplications === 0) {
    return (
      <div className="bg-white rounded-2xl border border-teal-100 shadow-sm p-10 text-center">
        <p className="text-gray-500">You haven't added any applications yet.</p>
        <button
          onClick={() => navigate("/applications/new")}
          className="mt-4 bg-teal-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-teal-800"
        >
          Add your first application
        </button>
      </div>
    );
  }

  // "active" = anything not yet an offer or a rejection
  const activeCount = data.totalApplications - data.statusCounts.OFFER - data.statusCounts.REJECTED;

  const statCards = [
    {
      label: "Applications",
      value: data.totalApplications,
      caption: "tracked in total",
      icon: Briefcase,
      color: "bg-blue-100 text-blue-600",
    },
    {
      label: "Active",
      value: activeCount,
      caption: "still in play",
      icon: Zap,
      color: "bg-teal-100 text-teal-700",
    },
    {
      label: "Interviews",
      value: data.statusCounts.INTERVIEW,
      caption: "active this week",
      icon: Users,
      color: "bg-orange-100 text-orange-600",
    },
    {
      label: "Offers",
      value: data.statusCounts.OFFER,
      caption: "received",
      icon: Gift,
      color: "bg-green-100 text-green-600",
    },
  ];

  // widest bar in the chart below should fill the row, so scale off the biggest count
  const maxCount = Math.max(...STATUS_OPTIONS.map((s) => data.statusCounts[s]), 1);

  return (
    <div>
      {/* welcome banner */}
      <div className="bg-mint-sidebar rounded-2xl border border-teal-100 p-6 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">👋 Welcome back, {user?.name}!</h1>
          <p className="text-sm text-gray-600 mt-1">Here's what's happening with your job search today.</p>
        </div>
        <p className="hidden sm:block text-sm text-teal-800 italic text-right">
          Keep going.
          <br />
          great opportunities are on the way!
        </p>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-2xl border border-teal-100 shadow-sm p-5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${card.color}`}>
                <Icon size={18} />
              </div>
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.caption}</p>
            </div>
          );
        })}
      </div>

      {/* bar chart + quick actions/recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-teal-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900">Where your applications stand</h2>
          <p className="text-xs text-gray-400 mb-4">Applications at each stage</p>

          <div className="space-y-3">
            {STATUS_OPTIONS.map((status) => {
              const count = data.statusCounts[status];
              const widthPercent = (count / maxCount) * 100;
              return (
                <div key={status} className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-gray-500">{status}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-teal-700 h-3 rounded-full"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-gray-700">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-teal-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Quick Actions</h2>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate("/applications")}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-teal-900 hover:bg-teal-50"
              >
                <span className="flex items-center gap-2">
                  <Briefcase size={16} />
                  View Applications
                </span>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
              <button
                onClick={() => navigate("/resumes")}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-teal-900 hover:bg-teal-50"
              >
                <span className="flex items-center gap-2">
                  <Users size={16} />
                  Manage Resumes
                </span>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
              <button
                onClick={() => navigate("/applications/new")}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-teal-900 hover:bg-teal-50"
              >
                <span className="flex items-center gap-2">
                  <Gift size={16} />
                  Add Application
                </span>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-teal-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Recent Activity</h2>
            <ul className="space-y-3">
              {data.recentApplications.slice(0, 5).map((app) => (
                <li
                  key={app.id}
                  onClick={() => navigate(`/applications/${app.id}`)}
                  className="flex items-start gap-2 text-sm cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-700 mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-gray-700">
                      {app.companyName} application <StatusBadge status={app.status} />
                    </p>
                    <p className="text-xs text-gray-400">{timeAgo(app.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
