import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { assertSupabase, getSupabaseClient } from "@/lib/supabase-client";
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
      const response = await apiRequest("POST", "/api/auth/login", { email, password });

      if (response.ok) {
        const data = await response.json();
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
        return;
      }

      const errorData = await response.json();
      throw new Error(errorData.message || "Login failed");
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

      // First, try to create user via API endpoint (works with both Supabase and MemStorage)
      const registerResponse = await apiRequest("POST", "/api/auth/register", {
        email: userData.email,
        username: userData.username,
        password: userData.password,
        confirmPassword: userData.confirmPassword,
        role: userData.role,
        fullName: userData.username,
      });

      if (!registerResponse.ok) {
        const errorData = await registerResponse.json();
        throw new Error(errorData.message || "Registration failed");
      }

      const registerData = await registerResponse.json();

      // Then try Supabase authentication if available
      try {
        const client = assertSupabase();
        const { data, error } = await client.auth.signUp({
          email: userData.email,
          password: userData.password,
          options: {
            data: {
              username: userData.username,
              role: userData.role,
              fullName: userData.username,
            },
            emailRedirectTo: `${window.location.origin}/auth`,
          },
        });

        if (error || !data.user) {
          console.warn("Supabase auth signUp failed, but user was created in storage:", error?.message);
          // Continue even if Supabase auth fails, since we have the user in our storage
        } else {
          await syncProfile(data.user);
        }
      } catch (supabaseError: any) {
        console.warn("Supabase authentication error (user still created in storage):", supabaseError.message);
        // Continue with the user we created via API
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
