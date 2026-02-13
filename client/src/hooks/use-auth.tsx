import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getSupabaseClient } from "@/lib/supabase-client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface User {
  id: string;
  email: string;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  role: "user" | "driver" | "admin";
  ecoPoints: number;
  totalRides: number;
  co2Saved: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: { email: string; username: string; password: string; confirmPassword: string; role: "user" | "driver" }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const { toast } = useToast();
  const supabase = getSupabaseClient(false);

  const syncProfile = useCallback(async (supabaseUser: SupabaseUser) => {
    const profilePayload = {
      id: supabaseUser.id,
      email: supabaseUser.email || "",
      username: (supabaseUser.user_metadata?.username as string) || supabaseUser.email?.split("@")[0] || "airbear",
      fullName: (supabaseUser.user_metadata?.fullName as string | undefined) || null,
      role: (supabaseUser.user_metadata?.role as "user" | "driver" | "admin" | undefined) || "user",
      avatarUrl: (supabaseUser.user_metadata?.avatar_url as string | undefined) || null,
    };

    try {
      const response = await apiRequest("POST", "/api/auth/sync-profile", profilePayload);
      const data = await response.json();
      setUser(data.user);
      localStorage.setItem("airbear-user", JSON.stringify(data.user));
    } catch (error) {
      // Fallback when API is unavailable (e.g., static hosting)
      const fallbackUser: User = {
        id: supabaseUser.id,
        email: profilePayload.email,
        username: profilePayload.username,
        fullName: profilePayload.fullName || undefined,
        avatarUrl: profilePayload.avatarUrl || undefined,
        role: profilePayload.role || "user",
        ecoPoints: 0,
        totalRides: 0,
        co2Saved: "0",
      };
      setUser(fallbackUser);
      localStorage.setItem("airbear-user", JSON.stringify(fallbackUser));
    }
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const fetchSession = async () => {
      try {
        const client = getSupabaseClient(false);

        // If Supabase is not configured, check localStorage for demo user
        if (!client) {
          const storedUser = localStorage.getItem("airbear-user");
          if (storedUser) {
            try {
              setUser(JSON.parse(storedUser));
            } catch (parseError) {
              console.warn('[Auth] Failed to parse stored user data:', parseError);
              localStorage.removeItem("airbear-user");
            }
          }
          console.log("[Auth] Supabase not configured - running in demo mode");
          return;
        }

        const { data, error } = await client.auth.getSession();
        if (error) {
          console.warn('[Auth] Session fetch error:', error.message);
          throw error;
        }
        
        const supabaseUser = data.session?.user;
        if (supabaseUser) {
          await syncProfile(supabaseUser);
        } else {
          // Check localStorage for demo/guest user
          const storedUser = localStorage.getItem("airbear-user");
          if (storedUser) {
            try {
              setUser(JSON.parse(storedUser));
            } catch (parseError) {
              console.warn('[Auth] Failed to parse stored user data:', parseError);
              localStorage.removeItem("airbear-user");
            }
          }
        }

        const { data: listener } = client.auth.onAuthStateChange(async (event, session) => {
          if (session?.user) {
            await syncProfile(session.user);
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
            localStorage.removeItem("airbear-user");
          } else if (event === 'TOKEN_REFRESHED') {
            // Token refresh failed without a session = session expired
            setUser(null);
            localStorage.removeItem("airbear-user");
          }
          // For INITIAL_SESSION without a session, do nothing - already handled above
        });

        cleanup = () => listener.subscription.unsubscribe();
      } catch (error: any) {
        console.error("[Auth] Session fetch failed:", error);
        // Fallback to localStorage if Supabase fails
        const storedUser = localStorage.getItem("airbear-user");
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (parseError) {
            console.warn('[Auth] Failed to parse stored user data on fallback:', parseError);
            localStorage.removeItem("airbear-user");
          }
        }
        // Don't show toast for configuration errors in demo mode
        if (!error.message?.includes("not configured")) {
          toast({
            title: "Auth Warning",
            description: "Using offline mode - some features may be limited",
            variant: "destructive",
          });
        }
      }
    };

    fetchSession().finally(() => setIsInitialized(true));

    return () => cleanup?.();
  }, [syncProfile, toast]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Sign in with Supabase client first to get JWT (needed for API auth on serverless)
      const client = getSupabaseClient(false);
      if (client) {
        try {
          const { error } = await client.auth.signInWithPassword({ email, password });
          if (error) {
            console.log("[Auth] Supabase client signIn failed:", error.message);
          }
        } catch (e) {
          console.warn("[Auth] Supabase client signIn exception:", e);
        }
      }

      // Then call API login (sets session cookie for non-serverless, returns user data)
      const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
      try {
        const client = getSupabaseClient(false);
        if (client) {
          const { data: sessionData } = await client.auth.getSession();
          if (sessionData.session?.access_token) {
            authHeaders["Authorization"] = `Bearer ${sessionData.session.access_token}`;
          }
        }
      } catch {}

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      const loginUser: User = {
        id: data.user.id,
        email: data.user.email,
        username: data.user.username,
        role: data.user.role || "user",
        ecoPoints: data.user.ecoPoints || 0,
        totalRides: data.user.totalRides || 0,
        co2Saved: data.user.co2Saved || "0",
        fullName: data.user.fullName,
        avatarUrl: data.user.avatarUrl,
      };
      setUser(loginUser);
      localStorage.setItem("airbear-user", JSON.stringify(loginUser));
    } catch (error: any) {
      throw new Error(error.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: { email: string; username: string; password: string; confirmPassword: string; role: "user" | "driver" }) => {
    setIsLoading(true);
    try {
      // Validate password match
      if (userData.password !== userData.confirmPassword) {
        throw new Error("Passwords do not match");
      }

      // Validate password strength
      if (userData.password.length < 6) {
        throw new Error("Password must be at least 6 characters");
      }

      // Create user via API endpoint (this already creates Supabase auth user + profile)
      // apiRequest throws on non-OK responses, so we wrap in try/catch for better error messages
      let registerData: any;
      try {
        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: userData.email,
            username: userData.username,
            password: userData.password,
            confirmPassword: userData.confirmPassword,
            role: userData.role,
            fullName: userData.username,
          }),
        });

        registerData = await registerResponse.json();

        if (!registerResponse.ok) {
          throw new Error(registerData.message || "Registration failed");
        }
      } catch (fetchError: any) {
        throw new Error(fetchError.message || "Registration failed");
      }

      // Sign into Supabase client-side to get a JWT for future API calls
      // The server already created the Supabase auth user, so we just sign in
      try {
        const client = getSupabaseClient(false);
        if (client) {
          const { error } = await client.auth.signInWithPassword({
            email: userData.email,
            password: userData.password,
          });
          if (error) {
            console.warn("[Auth] Supabase client sign-in after register failed:", error.message);
          }
        }
      } catch (supabaseError: any) {
        console.warn("[Auth] Supabase client sign-in error (non-critical):", supabaseError.message);
      }

      // Set the user from the API response
      setUser(registerData.user);
      localStorage.setItem("airbear-user", JSON.stringify(registerData.user));

    } catch (error: any) {
      throw new Error(error.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };


  const logout = async () => {
    const client = getSupabaseClient(false);
    if (client) {
      try {
        await client.auth.signOut();
      } catch (error) {
        console.warn("[Auth] signOut error:", error);
      }
    }
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch (error) {
      console.warn("[Auth] Server logout error:", error);
    }
    setUser(null);
    localStorage.removeItem("airbear-user");
    toast({
      title: "Signed Out",
      description: "You have been successfully signed out",
    });
  };

  const value = {
    user,
    isLoading,
    isInitialized,
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
