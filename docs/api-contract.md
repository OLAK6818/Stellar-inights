# API Response & Error Contract

## Overview

The Stellar Insights API enforces a unified response contract across all endpoints. This ensures consistent error handling, response formatting, and metadata across backend, frontend, and mobile clients.

## Contract Specification

### Success Response Contract

```typescript
interface ApiResponse<T> {
  status: "success";
  code: number; // HTTP status code (200, 201, etc.)
  data: T; // Response payload
  metadata?: {
    request_id?: string; // Unique request identifier for tracing
    timestamp?: string; // ISO 8601 timestamp
    version?: string; // API version (e.g., "v1")
  };
}
```

### Error Response Contract

```typescript
interface ErrorResponse {
  status: "error";
  code: number; // HTTP status code (400, 401, 404, 500, etc.)
  error: {
    code: string; // Machine-readable error code
    message: string; // Human-readable message
    details?: Record<string, any>; // Optional error context
    request_id?: string; // Trace ID matching the response
  };
}
```

## Error Categories

### 4xx Client Errors

#### 400 Bad Request

Returned for invalid input, malformed requests, or validation failures.

**Example: Validation Error**

```json
{
  "status": "error",
  "code": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "email": "Invalid email format",
      "age": "Must be between 18 and 100"
    },
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Example: Invalid Pagination Cursor**

```json
{
  "status": "error",
  "code": 400,
  "error": {
    "code": "INVALID_CURSOR",
    "message": "The provided cursor is invalid or expired",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Example: Invalid Field Selection**

```json
{
  "status": "error",
  "code": 400,
  "error": {
    "code": "INVALID_FIELDS",
    "message": "Invalid field selection",
    "details": {
      "invalid_fields": ["unknown_field"],
      "allowed_fields": ["id", "name", "domain", "url"]
    },
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### 401 Unauthorized

Returned when authentication is missing or invalid.

```json
{
  "status": "error",
  "code": 401,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid authentication token",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### 403 Forbidden

Returned when user is authenticated but lacks permission.

```json
{
  "status": "error",
  "code": 403,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### 404 Not Found

Returned when the requested resource doesn't exist.

```json
{
  "status": "error",
  "code": 404,
  "error": {
    "code": "NOT_FOUND",
    "message": "Anchor with ID 'example.com' not found",
    "details": {
      "resource_type": "anchor",
      "resource_id": "example.com"
    },
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### 429 Too Many Requests

Returned when rate limit is exceeded.

```json
{
  "status": "error",
  "code": 429,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Please try again later.",
    "details": {
      "retry_after_seconds": 60
    },
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### 5xx Server Errors

#### 500 Internal Server Error

Returned for unexpected server errors.

```json
{
  "status": "error",
  "code": 500,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal server error occurred",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

In development mode, additional debug information is included:

```json
{
  "status": "error",
  "code": 500,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal server error occurred",
    "details": {
      "cause": "database connection pool exhausted"
    },
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### 503 Service Unavailable

Returned when the service is temporarily unavailable.

```json
{
  "status": "error",
  "code": 503,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service temporarily unavailable. Please try again later.",
    "details": {
      "retry_after_seconds": 300
    },
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

## Client Implementation Patterns

### TypeScript/Frontend

```typescript
// Define response types
interface SuccessResponse<T> {
  status: "success";
  code: number;
  data: T;
  metadata?: {
    request_id?: string;
    timestamp?: string;
    version?: string;
  };
}

interface ErrorDetail {
  code: string;
  message: string;
  details?: Record<string, any>;
  request_id?: string;
}

interface ErrorResponse {
  status: "error";
  code: number;
  error: ErrorDetail;
}

type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// Generic fetch wrapper
async function fetchFromAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
      ...options?.headers,
    },
  });

  const json = (await response.json()) as ApiResponse<T>;

  if (json.status === "error") {
    const error = json as ErrorResponse;
    console.error(`[${error.error.code}] ${error.error.message}`);
    console.error(`Request ID: ${error.error.request_id}`);
    throw new ApiError(error.error.code, error.error.message);
  }

  return (json as SuccessResponse<T>).data;
}

// Usage
try {
  const anchors = await fetchFromAPI<Anchor[]>("/api/v1/anchors?limit=50");
  console.log(anchors);
} catch (error) {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_FIELDS") {
      // Handle field selection error
    } else if (error.code === "RATE_LIMITED") {
      // Implement exponential backoff
    } else if (error.code === "UNAUTHORIZED") {
      // Redirect to login
    }
  }
}
```

### React Hooks Example

```typescript
import { useEffect, useState } from "react";

interface UseApiOptions<T> {
  url: string;
  fields?: string[];
  limit?: number;
  cursor?: string;
  onError?: (error: ErrorDetail) => void;
}

function useApi<T>({ url, fields, limit = 50, cursor, onError }: UseApiOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorDetail | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (fields) params.set("fields", fields.join(","));
    if (limit) params.set("limit", limit.toString());
    if (cursor) params.set("cursor", cursor);

    fetchFromAPI<T>(`${url}?${params}`).then(
      (response) => {
        setData(response.data);
        setPagination(response.pagination);
        setLoading(false);
      },
      (error: ErrorDetail) => {
        setError(error);
        onError?.(error);
        setLoading(false);
      }
    );
  }, [url, fields, limit, cursor, onError]);

  return { data, loading, error, pagination };
}

// Usage
function AnchorsList() {
  const [cursor, setCursor] = useState<string | undefined>();
  const { data: anchors, loading, error, pagination } = useApi({
    url: "/api/v1/anchors",
    fields: ["id", "name", "domain"],
    limit: 25,
    cursor,
    onError: (error) => {
      if (error.code === "INVALID_FIELDS") {
        console.error("Requested fields not available");
      }
    },
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {anchors?.map((anchor) => (
        <div key={anchor.id}>{anchor.name}</div>
      ))}
      {pagination?.has_next && (
        <button onClick={() => setCursor(pagination.next_cursor)}>
          Load More
        </button>
      )}
    </div>
  );
}
```

### Python Example

```python
from dataclasses import dataclass
from typing import Generic, TypeVar, Optional, Dict, Any
import requests
from enum import Enum

T = TypeVar('T')

@dataclass
class ErrorDetail:
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = None

@dataclass
class SuccessResponse(Generic[T]):
    status: str
    code: int
    data: T
    metadata: Optional[Dict[str, Any]] = None

@dataclass
class ErrorResponse:
    status: str
    code: int
    error: ErrorDetail

class ApiError(Exception):
    def __init__(self, error_detail: ErrorDetail):
        self.code = error_detail.code
        self.message = error_detail.message
        self.details = error_detail.details
        self.request_id = error_detail.request_id
        super().__init__(self.message)

class StellarInsightsClient:
    def __init__(self, api_key: str, base_url: str = "https://api.stellar-insights.com"):
        self.api_key = api_key
        self.base_url = base_url

    def request(self, endpoint: str, fields: Optional[list] = None,
                limit: int = 50, cursor: Optional[str] = None):
        params = {
            'limit': limit,
        }
        if fields:
            params['fields'] = ','.join(fields)
        if cursor:
            params['cursor'] = cursor

        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Accept': 'application/json'
        }

        response = requests.get(
            f"{self.base_url}/{endpoint}",
            params=params,
            headers=headers
        )

        data = response.json()

        if data.get('status') == 'error':
            error = data['error']
            raise ApiError(ErrorDetail(
                code=error['code'],
                message=error['message'],
                details=error.get('details'),
                request_id=error.get('request_id')
            ))

        return data['data']

# Usage
try:
    client = StellarInsightsClient(api_key='your-key')
    anchors = client.request('v1/anchors', fields=['id', 'name', 'domain'])
    for anchor in anchors:
        print(f"{anchor['name']} ({anchor['domain']})")
except ApiError as e:
    if e.code == 'INVALID_FIELDS':
        print(f"Field error: {e.details}")
    elif e.code == 'RATE_LIMITED':
        print("Rate limited, backing off...")
    else:
        print(f"API Error: {e.message}")
```

### Swift/iOS Example

```swift
import Foundation

struct ApiError: Decodable {
    let code: String
    let message: String
    let details: [String: AnyCodable]?
    let request_id: String?
}

struct ErrorResponse: Decodable {
    let status: String
    let code: Int
    let error: ApiError
}

struct SuccessResponse<T: Decodable>: Decodable {
    let status: String
    let code: Int
    let data: T
    let metadata: ResponseMetadata?
}

struct ResponseMetadata: Decodable {
    let request_id: String?
    let timestamp: String?
    let version: String?
}

class StellarInsightsClient {
    let baseURL: URL
    let apiKey: String

    init(baseURL: URL, apiKey: String) {
        self.baseURL = baseURL
        self.apiKey = apiKey
    }

    func request<T: Decodable>(
        _ endpoint: String,
        fields: [String]? = nil,
        limit: Int = 50,
        cursor: String? = nil
    ) async throws -> T {
        var components = URLComponents(
            url: baseURL.appendingPathComponent(endpoint),
            resolvingAgainstBaseURL: true
        )!

        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(limit))
        ]

        if let fields = fields {
            queryItems.append(URLQueryItem(name: "fields", value: fields.joined(separator: ",")))
        }
        if let cursor = cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }

        components.queryItems = queryItems

        var request = URLRequest(url: components.url!)
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)

        let decoder = JSONDecoder()

        // Try to decode as error first
        if let errorResponse = try? decoder.decode(ErrorResponse.self, from: data) {
            throw NSError(domain: errorResponse.error.code, code: response.statusCode,
                        userInfo: ["message": errorResponse.error.message])
        }

        // Decode as success response
        let successResponse = try decoder.decode(SuccessResponse<T>.self, from: data)
        return successResponse.data
    }
}

// Usage
Task {
    let client = StellarInsightsClient(
        baseURL: URL(string: "https://api.stellar-insights.com")!,
        apiKey: "your-api-key"
    )

    do {
        let anchors: [Anchor] = try await client.request(
            "v1/anchors",
            fields: ["id", "name", "domain"],
            limit: 25
        )
        for anchor in anchors {
            print("\(anchor.name) (\(anchor.domain))")
        }
    } catch {
        print("Request failed: \(error)")
    }
}
```

## Migration Guide

If you have existing clients using a different response format:

1. **Update Response Parsing**: Wrap all API calls to expect the new response contract
2. **Error Handling**: Change from checking HTTP status codes to checking `error.code`
3. **Field Selection**: Start requesting only needed fields to reduce bandwidth
4. **Pagination**: Migrate from offset to cursor-based pagination
5. **Metadata**: Use `request_id` for debugging and support requests

## Testing the Contract

All API responses can be tested against the contract using the following checks:

```python
def validate_api_contract(response: dict) -> bool:
    """Validate API response conforms to contract"""
    if response.get('status') == 'success':
        assert 'data' in response
        assert 'code' in response
        if 'metadata' in response:
            assert 'request_id' in response['metadata'] or True
        return True
    elif response.get('status') == 'error':
        assert 'error' in response
        assert 'code' in response['error']
        assert 'message' in response['error']
        return True
    return False
```

## Support

For issues or questions about the API contract:
1. Check the request ID in error responses
2. Include request ID when reporting issues
3. Reference the relevant error code documentation
4. Consult SDK documentation for your platform
