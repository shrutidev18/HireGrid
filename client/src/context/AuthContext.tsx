import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "../types";
import * as authApi from "../api/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // loading = true while we're checking if there's already a valid cookie
  // (on page refresh). Until this finishes we don't know if user is logged in.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .getMe()
      .then((u) => setUser(u))
      .catch(() => setUser(null)) // no cookie / expired token - just means logged out
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const u = await authApi.login(email, password);
    setUser(u);
  }

  async function signup(name: string, email: string, password: string) {
    const u = await authApi.signup(name, email, password);
    setUser(u);
  }

  async function logout() {
    await authApi.logout();
    setUser(null);
  }

  // used by the Profile page after a successful save, so the name in the
  // top bar updates right away instead of needing a refresh
  function updateUser(updates: Partial<User>) {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// custom hook so components can just do useAuth() instead of importing
// useContext + AuthContext everywhere
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return ctx;
}
