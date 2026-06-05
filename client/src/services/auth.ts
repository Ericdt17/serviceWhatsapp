/**
 * Authentication Service
 * Handles login, logout, and token management
 */

import { apiPost, apiGet } from "./api";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    user: {
      id: number;
      name: string;
      email: string;
      role: "agency" | "super_admin";
      agencyId: number | null;
    };
  };
}

export interface UserInfo {
  id: number;
  name: string;
  email: string;
  role: "agency" | "super_admin";
  agencyId: number | null;
}

const USER_KEY = "auth_user";

/**
 * Login with email and password
 * JWT is now stored in HTTP-only cookie, not returned in response
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  try {
    const response = await apiPost<LoginResponse["data"]>("/api/v1/auth/login", {
      email,
      password,
    });

    if (response.success && response.data) {
      // Store user info only (token is in HTTP-only cookie)
      localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
    }

    return response as LoginResponse;
  } catch (error) {
    // Handle API errors (401, 400, etc.)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Authentication failed",
      data: null as unknown as LoginResponse['data'],
    };
  }
}

/**
 * Logout - call backend to clear cookie, then clear local user info
 */
export async function logout(): Promise<void> {
  try {
    // Call backend logout endpoint to clear HTTP-only cookie
    await apiPost("/api/v1/auth/logout");
  } catch (error) {
    // Even if backend call fails, clear local storage
    console.error("Logout error:", error);
  } finally {
    // Clear local user info
    localStorage.removeItem(USER_KEY);
  }
}

/**
 * Get stored user info (for initial render, before API check)
 */
export function getUser(): UserInfo | null {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr) as UserInfo;
  } catch {
    return null;
  }
}

/**
 * Get current user info from API
 * This is the source of truth for authentication state
 */
export async function getCurrentUser(): Promise<UserInfo | null> {
  try {
    const response = await apiGet<{ user: UserInfo }>("/api/v1/auth/me");
    if (response.success && response.data) {
      const user = response.data.user;
      // Update stored user info
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    }
    console.warn("[Auth] getCurrentUser: Response not successful", response);
    return null;
  } catch (error) {
    const apiErr = error as { statusCode?: number; status?: number; message?: string; name?: string };
    // Log error for debugging
    console.error("[Auth] getCurrentUser error:", {
      message: apiErr?.message,
      statusCode: apiErr?.statusCode || apiErr?.status,
      name: apiErr?.name,
    });

    // Only clear localStorage on 401 (invalid session)
    // Don't clear on network errors or other issues
    if (apiErr?.statusCode === 401 || apiErr?.status === 401) {
      // 401 means invalid/expired session - clear cache
      console.warn("[Auth] 401 Unauthorized - clearing cached user");
      localStorage.removeItem(USER_KEY);
    }
    // Return null for any error, but don't clear cache for network errors
    return null;
  }
}

