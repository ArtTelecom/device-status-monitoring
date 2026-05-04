import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

const AUTH_URL = "https://functions.poehali.dev/86948a87-bbd9-4f47-8cca-6d53e86724ef";
const TOKEN_KEY = "pp_auth_token";

export interface User {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
  is_active: boolean;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (t: string) => {
    try {
      const r = await fetch(`${AUTH_URL}?action=me`, { headers: { "X-Auth-Token": t } });
      const j = await r.json();
      if (j.success) setUser(j.user);
      else {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchMe(token);
    else setLoading(false);
  }, [token, fetchMe]);

  const login = async (email: string, password: string) => {
    const r = await fetch(`${AUTH_URL}?action=login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (j.success) {
      localStorage.setItem(TOKEN_KEY, j.token);
      setToken(j.token);
      setUser(j.user);
      return { ok: true };
    }
    return { ok: false, message: j.message || "Ошибка входа" };
  };

  const register = async (email: string, password: string, name: string) => {
    const r = await fetch(`${AUTH_URL}?action=register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const j = await r.json();
    if (j.success) {
      localStorage.setItem(TOKEN_KEY, j.token);
      setToken(j.token);
      setUser(j.user);
      return { ok: true };
    }
    return { ok: false, message: j.message || "Ошибка регистрации" };
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch(`${AUTH_URL}?action=logout`, {
          method: "DELETE",
          headers: { "X-Auth-Token": token },
        });
      } catch {
        // ignore
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const authFetch = useCallback(
    (url: string, init: RequestInit = {}) => {
      const h = new Headers(init.headers || {});
      if (token) h.set("X-Auth-Token", token);
      return fetch(url, { ...init, headers: h });
    },
    [token]
  );

  return (
    <Ctx.Provider value={{ user, token, loading, login, register, logout, authFetch }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
