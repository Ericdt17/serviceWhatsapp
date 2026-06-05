/**
 * API Service Layer
 * Centralized API client with error handling and request interceptors
 */

import { buildApiUrl, API_CONFIG } from '@/lib/api-config';
import type { ApiResponse, PaginationInfo, RequestOptions } from '@/types/api';
import { ApiError } from '@/types/api';

// Re-export types for backward compatibility
export type { ApiResponse, PaginationInfo };
export { ApiError };

/**
 * Make an API request with error handling
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const url = buildApiUrl(endpoint);
  const { timeout = API_CONFIG.TIMEOUT, ...fetchOptions } = options;

  // Set default headers
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };

  // Note: Authentication is now handled via HTTP-only cookies
  // The browser automatically sends cookies with credentials: 'include'
  // No need to manually add Authorization header

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include', // Include cookies in cross-origin requests
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Parse response
    let data: ApiResponse<T>;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Handle non-JSON responses
      const text = await response.text();
      throw new ApiError(
        text || `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    // Handle HTTP errors
    if (!response.ok) {
      throw new ApiError(
        data.error || data.message || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timeout', 408);
    }

    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error;
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError(
        'Network error: Unable to connect to server',
        0,
        error
      );
    }

    // Unknown error
    throw new ApiError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      500,
      error
    );
  }
}

/**
 * GET request
 */
export async function apiGet<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  // Build query string
  let url = endpoint;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return apiRequest<T>(url, {
    ...options,
    method: 'GET',
  });
}

/**
 * POST request
 */
export async function apiPost<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request
 */
export async function apiPut<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PATCH request
 */
export async function apiPatch<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request
 */
export async function apiDelete<T>(
  endpoint: string,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'DELETE',
  });
}

/**
 * POST request with file upload (multipart/form-data)
 */
export async function apiPostFile<T>(
  endpoint: string,
  file: File,
  additionalData?: Record<string, string | number>,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  const url = buildApiUrl(endpoint);
  
  const formData = new FormData();
  formData.append('file', file);
  
  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, String(value));
      }
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeout || API_CONFIG.TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      method: 'POST',
      body: formData,
      credentials: 'include',
      signal: controller.signal,
      // Don't set Content-Type header - browser will set it with boundary for multipart/form-data
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type');
    let data: ApiResponse<T>;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new ApiError(
        text || `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    if (!response.ok) {
      throw new ApiError(
        data.error || data.message || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timeout', 408);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError(
        'Network error: Unable to connect to server',
        0,
        error
      );
    }

    throw new ApiError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      500,
      error
    );
  }
}

/**
 * Health check - test API connection
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await apiGet<{ status: string }>('/api/v1/health');
    return response.success && response.data?.status === 'ok';
  } catch {
    return false;
  }
}

