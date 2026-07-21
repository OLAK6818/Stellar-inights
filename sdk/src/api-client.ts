/**
 * Typed API Client for Stellar Insights
 *
 * Provides strongly-typed access to the Stellar Insights API with full contract enforcement.
 */

import React from "react";

/**
 * API Response Contract Types
 */

export interface ResponseMetadata {
  request_id?: string;
  timestamp?: string;
  version?: string;
}

export interface SuccessResponse<T> {
  status: "success";
  code: number;
  data: T;
  metadata?: ResponseMetadata;
}

export interface ErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id?: string;
}

export interface ErrorResponse {
  status: "error";
  code: number;
  error: ErrorDetail;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * Pagination Types
 */

export interface CursorPageMeta {
  limit: number;
  total: number;
  cursor?: string;
  has_next: boolean;
  next_cursor?: string;
}

export interface PaginatedResponse<T> {
  status: "success";
  code: number;
  data: T[];
  pagination: CursorPageMeta;
  metadata?: ResponseMetadata;
}

/**
 * API Error Class
 */

export class ApiError extends Error {
  constructor(
    public code: string,
    public message: string,
    public details?: Record<string, unknown>,
    public requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  static fromErrorResponse(errorResponse: ErrorResponse): ApiError {
    return new ApiError(
      errorResponse.error.code,
      errorResponse.error.message,
      errorResponse.error.details,
      errorResponse.error.request_id
    );
  }

  get isValidationError(): boolean {
    return this.code === "VALIDATION_ERROR";
  }

  get isInvalidFields(): boolean {
    return this.code === "INVALID_FIELDS";
  }

  get isInvalidCursor(): boolean {
    return this.code === "INVALID_CURSOR";
  }

  get isNotFound(): boolean {
    return this.code === "NOT_FOUND";
  }

  get isUnauthorized(): boolean {
    return this.code === "UNAUTHORIZED";
  }

  get isRateLimited(): boolean {
    return this.code === "RATE_LIMITED";
  }

  get isServiceUnavailable(): boolean {
    return this.code === "SERVICE_UNAVAILABLE";
  }
}

/**
 * Query Options
 */

export interface QueryOptions {
  fields?: string[];
  limit?: number;
  cursor?: string;
  [key: string]: unknown;
}

/**
 * Fetch Options
 */

export interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
}

/**
 * API Client Configuration
 */

export interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  onError?: (error: ApiError) => void;
}

/**
 * Main API Client
 */

export class ApiClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;
  private retries: number;
  private onError?: (error: ApiError) => void;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
    this.retries = config.retries ?? 3;
    this.onError = config.onError;
  }

  /**
   * Generic fetch method with contract validation
   */
  private async fetch<T>(
    endpoint: string,
    options: FetchOptions = {}
  ): Promise<ApiResponse<T>> {
    const { timeout = this.timeout, retries = this.retries, ...fetchOptions } = options;

    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.buildHeaders(fetchOptions.headers);

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...fetchOptions,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Parse response
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          throw new Error(`Invalid JSON response: ${response.statusText}`);
        }

        // Validate response structure
        const validatedResponse = this.validateResponse<T>(data);

        // Handle error responses
        if (validatedResponse.status === "error") {
          const error = ApiError.fromErrorResponse(validatedResponse);
          this.onError?.(error);
          throw error;
        }

        return validatedResponse as SuccessResponse<T>;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx) or validation errors
        if (
          error instanceof ApiError &&
          (error.code === "VALIDATION_ERROR" ||
            error.code === "INVALID_FIELDS" ||
            error.code === "UNAUTHORIZED" ||
            error.code === "FORBIDDEN" ||
            error.code === "NOT_FOUND")
        ) {
          throw error;
        }

        // Retry on server errors or network issues
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Unknown error");
  }

  /**
   * Validate response conforms to API contract
   */
  private validateResponse<T>(data: unknown): ApiResponse<T> {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid response: not an object");
    }

    const response = data as Record<string, unknown>;
    const status = response.status;

    if (status === "success") {
      if (typeof response.code !== "number") {
        throw new Error("Invalid response: missing or invalid code");
      }
      if (response.data === undefined) {
        throw new Error("Invalid response: missing data");
      }
      return response as SuccessResponse<T>;
    } else if (status === "error") {
      if (typeof response.code !== "number") {
        throw new Error("Invalid error response: missing code");
      }
      if (typeof response.error !== "object" || response.error === null) {
        throw new Error("Invalid error response: missing error object");
      }
      const error = response.error as Record<string, unknown>;
      if (typeof error.code !== "string" || typeof error.message !== "string") {
        throw new Error("Invalid error response: invalid error details");
      }
      return response as ErrorResponse;
    } else {
      throw new Error(`Invalid response: unknown status "${status}"`);
    }
  }

  /**
   * Build headers with authentication
   */
  private buildHeaders(additionalHeaders?: HeadersInit): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    // Merge additional headers
    if (additionalHeaders) {
      if (typeof additionalHeaders === "object" && !Array.isArray(additionalHeaders)) {
        Object.assign(headers, additionalHeaders);
      }
    }

    return headers;
  }

  /**
   * Build query string from options
   */
  private buildQueryString(options?: QueryOptions): string {
    if (!options || Object.keys(options).length === 0) {
      return "";
    }

    const params = new URLSearchParams();

    if (options.fields && options.fields.length > 0) {
      params.set("fields", options.fields.join(","));
    }
    if (options.limit !== undefined) {
      params.set("limit", String(options.limit));
    }
    if (options.cursor) {
      params.set("cursor", options.cursor);
    }

    // Add any additional query parameters
    for (const [key, value] of Object.entries(options)) {
      if (!["fields", "limit", "cursor"].includes(key) && value !== undefined) {
        params.set(key, String(value));
      }
    }

    const query = params.toString();
    return query ? `?${query}` : "";
  }

  /**
   * GET request - returns data directly
   */
  async get<T>(
    endpoint: string,
    options?: QueryOptions,
    fetchOptions?: FetchOptions
  ): Promise<T> {
    const query = this.buildQueryString(options);
    const response = await this.fetch<T>(`${endpoint}${query}`, {
      method: "GET",
      ...fetchOptions,
    });
    return response.data;
  }

  /**
   * GET request - returns paginated response with pagination metadata
   */
  async getPaginated<T>(
    endpoint: string,
    options?: QueryOptions,
    fetchOptions?: FetchOptions
  ): Promise<PaginatedResponse<T>> {
    const query = this.buildQueryString(options);
    const response = await this.fetch<T[]>(`${endpoint}${query}`, {
      method: "GET",
      ...fetchOptions,
    });

    // Type guard - ensure response has pagination
    if (!("pagination" in response) || typeof response.pagination !== "object") {
      throw new Error("Response does not contain pagination metadata");
    }

    return response as unknown as PaginatedResponse<T>;
  }

  /**
   * POST request
   */
  async post<T>(
    endpoint: string,
    body?: unknown,
    fetchOptions?: FetchOptions
  ): Promise<T> {
    const response = await this.fetch<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
      ...fetchOptions,
    });
    return response.data;
  }

  /**
   * PUT request
   */
  async put<T>(
    endpoint: string,
    body?: unknown,
    fetchOptions?: FetchOptions
  ): Promise<T> {
    const response = await this.fetch<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
      ...fetchOptions,
    });
    return response.data;
  }

  /**
   * PATCH request
   */
  async patch<T>(
    endpoint: string,
    body?: unknown,
    fetchOptions?: FetchOptions
  ): Promise<T> {
    const response = await this.fetch<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(body),
      ...fetchOptions,
    });
    return response.data;
  }

  /**
   * DELETE request
   */
  async delete<T = void>(endpoint: string, fetchOptions?: FetchOptions): Promise<T> {
    const response = await this.fetch<T>(endpoint, {
      method: "DELETE",
      ...fetchOptions,
    });
    return response.data;
  }
}

/**
 * Hook for React - useApi
 */

export interface UseApiOptions<T> {
  enabled?: boolean;
  onError?: (error: ApiError) => void;
  onSuccess?: (data: T) => void;
}

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  refetch: () => Promise<void>;
}

export function useApi<T>(
  client: ApiClient,
  endpoint: string,
  options: QueryOptions = {},
  hookOptions?: UseApiOptions<T>
): UseApiResult<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);

  const refetch = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await client.get<T>(endpoint, options);
      setData(result);
      hookOptions?.onSuccess?.(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
        hookOptions?.onError?.(err);
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }, [client, endpoint, options, hookOptions]);

  React.useEffect(() => {
    if (hookOptions?.enabled === false) return;
    refetch();
  }, [refetch, hookOptions?.enabled]);

  return { data, loading, error, refetch };
}

/**
 * Hook for React - usePaginatedApi
 */

export interface UsePaginatedApiOptions<T> extends UseApiOptions<T[]> {
  onPageChange?: (pagination: CursorPageMeta) => void;
}

export interface UsePaginatedApiResult<T> extends UseApiResult<T[]> {
  pagination: CursorPageMeta | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

export function usePaginatedApi<T>(
  client: ApiClient,
  endpoint: string,
  limit: number = 50,
  hookOptions?: UsePaginatedApiOptions<T>
): UsePaginatedApiResult<T> {
  const [data, setData] = React.useState<T[]>([]);
  const [pagination, setPagination] = React.useState<CursorPageMeta | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [cursor, setCursor] = React.useState<string | undefined>();

  const loadMore = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await client.getPaginated<T>(endpoint, { limit, cursor });
      setData((prev) => (cursor ? [...prev, ...result.data] : result.data));
      setPagination(result.pagination);
      hookOptions?.onPageChange?.(result.pagination);
      hookOptions?.onSuccess?.(result.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
        hookOptions?.onError?.(err);
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }, [client, endpoint, limit, cursor, hookOptions]);

  React.useEffect(() => {
    if (hookOptions?.enabled === false) return;
    loadMore();
  }, [loadMore, hookOptions?.enabled]);

  return {
    data,
    loading,
    error,
    pagination,
    hasMore: pagination?.has_next ?? false,
    refetch: () => {
      setCursor(undefined);
      return loadMore();
    },
    loadMore: async () => {
      if (pagination?.next_cursor) {
        setCursor(pagination.next_cursor);
      }
    },
  };
}
