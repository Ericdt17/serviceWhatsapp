/**
 * API Types
 * Type definitions for API requests and responses
 */

// ============================================================================
// API Response Wrapper
// ============================================================================

/**
 * Standard API response structure
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: PaginationInfo;
  count?: number;
  query?: string;
  date?: string;
  created?: number;
  failed?: number;
  results?: {
    success: Record<string, unknown>[];
    failed: Record<string, unknown>[];
  };
}

/**
 * Pagination information
 */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================================================
// API Error
// ============================================================================

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  statusCode: number;
  data: Record<string, unknown> | null;

  constructor(message: string, statusCode: number = 500, data: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.data = data;
  }
}

// ============================================================================
// Request Options
// ============================================================================

/**
 * Extended RequestInit with additional options
 */
export interface RequestOptions extends RequestInit {
  timeout?: number;
}
















