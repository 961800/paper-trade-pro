import React, { createContext, useContext, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  refreshUser: () => void;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? localStorage.getItem("papertrade_token") : null;

  const { data: user, isLoading, isFetching, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      staleTime: 60_000,
    },
  });

  // If token was rejected (401), clean up localStorage so user is not in a bad state
  React.useEffect(() => {
    if (isError) {
      localStorage.removeItem("papertrade_token");
    }
  }, [isError]);

  const setUser = useCallback((userData: User | null) => {
    queryClient.setQueryData(getGetMeQueryKey(), userData);
  }, [queryClient]);

  const login = useCallback(() => {
    window.location.href = "/login";
  }, []);

  const logout = useCallback(async () => {
    queryClient.clear();
    localStorage.removeItem("papertrade_token");
    try {
      const baseUrl = import.meta.env.VITE_API_URL || "";
      await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
    } catch (err) {
      console.error("Logout failed:", err);
    }
    window.location.href = "/login";
  }, [queryClient]);

  const refreshUser = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  }, [queryClient]);

  // If a token is in localStorage, wait until isFetching completes before treating as unauthenticated
  const effectiveLoading = isLoading || (!!token && !user && isFetching);

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isAuthenticated: !!user,
        isLoading: effectiveLoading,
        login,
        logout,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
