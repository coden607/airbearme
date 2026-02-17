import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getSupabaseClient } from "./supabase-client";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  
  // Try Supabase JWT first (for serverless deployments)
  try {
    const supabase = getSupabaseClient(false);
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        headers["Authorization"] = `Bearer ${data.session.access_token}`;
      }
    }
  } catch {
    // Supabase not configured
  }
  
  // Note: For session-based auth (production server), we rely on cookies
  // The 'credentials: include' in fetch will automatically send session cookies
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = `${res.status}: ${res.statusText}`;

    try {
      const text = await res.text();
      if (text) {
        errorMessage = text;
      }
    } catch (parseError) {
      console.warn('[QueryClient] Failed to parse error response:', parseError);
    }

    throw new Error(errorMessage);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(url, {
      method,
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...authHeaders,
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    console.error('[QueryClient] API request failed:', { method, url, error });
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch(queryKey.join("/") as string, {
          credentials: "include",
          headers: authHeaders,
        });

        if (unauthorizedBehavior === "returnNull" && res.status === 401) {
          return null;
        }

        await throwIfResNotOk(res);
        return await res.json();
      } catch (error) {
        console.error('[QueryClient] Query failed:', { queryKey, error });
        throw error;
      }
    };

// Authenticated fetch wrapper - use this instead of raw fetch() for protected routes
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      ...authHeaders,
    },
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
