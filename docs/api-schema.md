# API Schema & Contract Documentation

## Overview

All Stellar Insights API endpoints follow a standardized schema with consistent response envelopes, pagination, field selection, and error handling. This document provides comprehensive guidance for API consumers across all platforms.

## Response Contract

### Success Response

All successful API responses follow this structure:

```json
{
  "status": "success",
  "code": 200,
  "data": {
    // Response data specific to the endpoint
  },
  "metadata": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-06-19T12:00:00Z",
    "version": "v1"
  }
}
```

#### Fields

- **status** (string): Always `"success"` for successful responses
- **code** (integer): HTTP status code (200, 201, etc.)
- **data** (object/array): The actual response payload
- **metadata** (object, optional): Additional request information
  - **request_id**: Unique identifier for tracing and debugging
  - **timestamp**: ISO 8601 timestamp when the response was generated
  - **version**: API version used for the request

### Error Response

All error responses follow this structure:

```json
{
  "status": "error",
  "code": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "details": {
      "field": "email",
      "reason": "Invalid format"
    },
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### Fields

- **status** (string): Always `"error"` for error responses
- **code** (integer): HTTP status code (400, 401, 404, 500, etc.)
- **error** (object): Error details
  - **code** (string): Machine-readable error code for client handling
  - **message** (string): Human-readable error description
  - **details** (object, optional): Additional error context (validation errors, etc.)
  - **request_id** (string): Same request ID as in the response metadata for tracing

### Common Error Codes

| HTTP Code | Error Code | Description |
|-----------|-----------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid input parameters |
| 400 | `INVALID_CURSOR` | Invalid pagination cursor |
| 400 | `INVALID_FIELDS` | Invalid field selection |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 403 | `FORBIDDEN` | Authenticated but not authorized |
| 404 | `NOT_FOUND` | Resource not found |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |
| 503 | `SERVICE_UNAVAILABLE` | Service temporarily unavailable |

## Pagination

### Cursor-Based Pagination

The API uses cursor-based pagination for efficient traversal of large result sets.

#### Query Parameters

- **limit** (integer, default: 50, max: 100): Number of items per page
- **cursor** (string, optional): Opaque cursor from a previous response

#### Request Example

```bash
GET /api/v1/anchors?limit=50&cursor=eyJpZCI6IDEyMzQ1fQ==
```

#### Response Example

```json
{
  "status": "success",
  "code": 200,
  "data": [
    { "id": 1, "name": "Anchor 1" },
    { "id": 2, "name": "Anchor 2" }
  ],
  "pagination": {
    "limit": 50,
    "total": 312,
    "cursor": "eyJpZCI6IDEyMzQ1fQ==",
    "has_next": true,
    "next_cursor": "eyJpZCI6IDEyMzk1fQ=="
  }
}
```

#### Pagination Metadata

- **limit** (integer): Number of items requested
- **total** (integer): Total count of available items
- **cursor** (string): Current page cursor
- **has_next** (boolean): Whether more results are available
- **next_cursor** (string, nullable): Cursor for the next page (null if on last page)

### Cursor Best Practices

1. **Stateless Navigation**: Cursors are opaque strings; don't parse or modify them
2. **Incremental Fetching**: Use `has_next` to determine when to stop
3. **Ordering Stability**: Results are ordered by creation time (newest first)
4. **Expiration**: Cursors are valid for 24 hours; refresh if needed

## Field Selection

### Overview

Control which fields are returned in API responses to optimize bandwidth and response times.

### Query Parameter

- **fields** (string, comma-separated): Comma-separated list of fields to include

#### Request Example

```bash
GET /api/v1/anchors?fields=id,name,domain
```

#### Response Example

```json
{
  "status": "success",
  "code": 200,
  "data": [
    { "id": 1, "name": "Anchor 1", "domain": "example.com" },
    { "id": 2, "name": "Anchor 2", "domain": "other.com" }
  ]
}
```

### Available Fields Per Endpoint

#### Anchors

- `id` - Anchor identifier
- `name` - Organization name
- `domain` - Domain where stellar.toml is hosted
- `url` - Organization website
- `description` - Anchor description
- `logo` - Logo URL
- `created_at` - Timestamp of creation
- `updated_at` - Last update timestamp
- `status` - Operational status

#### Corridors

- `id` - Corridor identifier
- `source_asset` - Source asset code
- `destination_asset` - Destination asset code
- `source_issuer` - Source issuer account
- `destination_issuer` - Destination issuer account
- `send_amount` - Average send amount
- `receive_amount` - Average receive amount
- `conversion_rate` - Current conversion rate
- `created_at` - Creation timestamp

#### Metrics

- `id` - Metric identifier
- `corridor_id` - Associated corridor
- `timestamp` - Metric timestamp
- `transaction_count` - Number of transactions
- `volume_xlm` - Volume in XLM
- `average_fee` - Average fee percentage
- `created_at` - Record creation time

### Field Selection Rules

1. **Required Fields**: Some endpoints require certain core fields (id, created_at, etc.)
2. **Invalid Fields**: Requesting non-existent fields returns a 400 error with details
3. **Performance**: Fewer fields = faster responses
4. **Defaults**: Omitting `fields` parameter returns all available fields

## Request Headers

### Authentication

```http
Authorization: Bearer YOUR_API_KEY
```

### Content Type

```http
Content-Type: application/json
Accept: application/json
```

### Request ID Tracking

Include an optional request ID for tracing:

```http
X-Request-ID: my-unique-request-id
```

This will be echoed in the response metadata.

## Examples

### Fetch Anchors with Pagination

```bash
# Fetch first page
curl -X GET "https://api.example.com/v1/anchors?limit=25" \
  -H "Authorization: Bearer token123" \
  -H "Accept: application/json"

# Response
{
  "status": "success",
  "code": 200,
  "data": [ ... ],
  "pagination": {
    "limit": 25,
    "total": 150,
    "cursor": "abc123",
    "has_next": true,
    "next_cursor": "def456"
  }
}

# Fetch next page
curl -X GET "https://api.example.com/v1/anchors?limit=25&cursor=def456" \
  -H "Authorization: Bearer token123"
```

### Fetch With Field Selection

```bash
curl -X GET "https://api.example.com/v1/anchors?fields=id,name,domain" \
  -H "Authorization: Bearer token123" \
  -H "Accept: application/json"

# Response
{
  "status": "success",
  "code": 200,
  "data": [
    { "id": 1, "name": "Anchor A", "domain": "anchor-a.com" },
    { "id": 2, "name": "Anchor B", "domain": "anchor-b.com" }
  ]
}
```

### Handle Errors

```bash
# Invalid fields request
curl -X GET "https://api.example.com/v1/anchors?fields=id,invalid_field" \
  -H "Authorization: Bearer token123"

# Error response (400)
{
  "status": "error",
  "code": 400,
  "error": {
    "code": "INVALID_FIELDS",
    "message": "Invalid fields requested",
    "details": {
      "invalid": ["invalid_field"],
      "allowed": ["id", "name", "domain", "url", ...]
    },
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

## Rate Limiting

All endpoints are rate-limited. Check response headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1624083600
```

When limit exceeded:

```json
{
  "status": "error",
  "code": 429,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Try again in 60 seconds."
  }
}
```

## Versioning

The API supports multiple versions via the `Accept` header or URL path:

```bash
# Version in URL
GET /api/v1/anchors

# Version in header
GET /api/anchors
Accept: application/vnd.stellar-insights.v1+json
```

New versions will be announced with a deprecation period.

## Best Practices

1. **Use Pagination**: Always use cursor-based pagination for list endpoints
2. **Select Fields**: Only request fields you need to reduce payload size
3. **Handle Errors**: Check the `error.code` field for programmatic error handling
4. **Cache Request IDs**: Use request IDs for debugging and support tickets
5. **Respect Rate Limits**: Implement exponential backoff for retries
6. **Handle Timeouts**: List endpoints may timeout with large result sets; use smaller limits
7. **Update Clients**: Monitor API announcements for deprecation notices

## SDK Support

Typed client libraries are available for common platforms:

- **TypeScript/JavaScript**: `@stellar-insights/sdk`
- **Python**: `stellar-insights-py`
- **Rust**: Built-in support via backend types
- **Swift/iOS**: Mobile SDK available

See respective SDK documentation for integration guides.
