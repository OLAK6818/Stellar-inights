# API Standardization Implementation Guide

## Overview

This guide documents the complete implementation of API standardization across the Stellar Insights platform, including cursor-based pagination, field selection, unified response contracts, Stellar TOML validation, and strongly-typed clients.

## What Was Implemented

### 1. Backend Core Modules

#### Cursor-Based Pagination (`backend/src/cursor_pagination.rs`)

Replaces offset-based pagination with cursor-based pagination for efficient traversal:

- `CursorPageMeta`: Pagination metadata with opaque cursors
- `CursorPaginatedResponse<T>`: Standard paginated response envelope
- `encode_cursor()` / `decode_cursor()`: Cursor serialization

**Usage in handlers:**

```rust
use crate::cursor_pagination::{CursorPaginatedResponse, encode_cursor};

pub async fn list_anchors(
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse> {
    let limit = params.limit.unwrap_or(50).min(100);
    let cursor = params.cursor;

    // Fetch items based on cursor...
    let items = fetch_items(cursor, limit).await?;
    let total = count_items().await?;
    let has_next = items.len() >= limit;
    let next_cursor = has_next.then(|| {
        encode_cursor(&items.last().unwrap().id.to_string())
    });

    Ok(Json(CursorPaginatedResponse::new(
        items,
        total,
        limit as i64,
        cursor,
        has_next,
        next_cursor,
    )))
}
```

#### Field Selection (`backend/src/field_selection.rs`)

Allows clients to request only specific fields:

- `FieldSelector`: Parse and validate field requests
- `FieldSchema`: Define allowed fields per endpoint
- `validate()`: Validate field selection against schema

**Usage in handlers:**

```rust
use crate::field_selection::{FieldSelector, FieldSchema};

pub async fn list_anchors(
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse> {
    let selector = FieldSelector::from_query(params.fields);
    let schema = FieldSchema::new(&["id", "name", "domain", "url", "logo", "status"]);

    // Validate field selection
    let selector = schema.validate(&selector)
        .map_err(|e| ApiError::bad_request("INVALID_FIELDS", e))?;

    // Only serialize requested fields
    let anchors = fetch_anchors().await?;
    let filtered = anchors.into_iter()
        .map(|anchor| filter_fields(&anchor, &selector))
        .collect();

    // Return response...
}

fn filter_fields(anchor: &Anchor, selector: &FieldSelector) -> serde_json::Value {
    let mut obj = serde_json::json!({});

    if selector.should_include("id") {
        obj["id"] = json!(anchor.id);
    }
    if selector.should_include("name") {
        obj["name"] = json!(anchor.name);
    }
    // ... etc

    obj
}
```

#### Unified API Response Contract (`backend/src/api_contract.rs`)

Standardizes all responses with consistent envelopes:

- `SuccessResponse<T>`: Successful response wrapper
- `ErrorResponseContract`: Error response format
- `ResponseMetadata`: Optional metadata (request_id, timestamp, version)
- `ErrorDetail`: Structured error information

**Usage in handlers:**

```rust
use crate::api_contract::{SuccessResponse, ResponseMetadata};
use axum::Json;

pub async fn get_anchor(id: String) -> Result<impl IntoResponse> {
    let anchor = fetch_anchor(&id)
        .await
        .map_err(|_| ApiError::not_found("ANCHOR_NOT_FOUND", "Anchor not found"))?;

    let metadata = ResponseMetadata::new()
        .with_request_id("req-123".to_string())
        .with_timestamp(chrono::Utc::now().to_rfc3339());

    let response = SuccessResponse::new(anchor, 200)
        .with_metadata(metadata);

    Ok((StatusCode::OK, Json(response)))
}
```

#### Stellar TOML Validation (`backend/src/services/stellar_toml_validator.rs`)

Validates Stellar TOML payloads at runtime:

- `StellarTomlValidator`: Configurable validation rules
- `validate()`: Comprehensive validation including required fields, email formats, URLs, Stellar accounts
- `lenient()`: Optional lenient validation mode

**Usage in services:**

```rust
use crate::services::stellar_toml_validator::StellarTomlValidator;

pub async fn fetch_and_validate_toml(domain: &str) -> Result<StellarToml> {
    let client = StellarTomlClient::new(redis, None)?;
    let toml = client.fetch_toml(domain).await?;

    // Validate the fetched TOML
    let validator = StellarTomlValidator::new();
    validator.validate(&toml)
        .map_err(|e| anyhow!("TOML validation failed: {}", e))?;

    Ok(toml)
}
```

### 2. Documentation

#### API Schema Documentation (`docs/api-schema.md`)

Comprehensive reference for API consumers covering:

- Response contract specification
- Pagination (cursor-based)
- Field selection
- Request headers
- Error handling
- Rate limiting
- Best practices
- SDK support

#### API Contract Documentation (`docs/api-contract.md`)

Detailed contract specification with:

- Response envelope structures
- Error categories and codes
- Client implementation patterns (TypeScript, React, Python, Swift)
- Migration guide from old API format
- Contract testing utilities

### 3. Frontend Typed Client (`sdk/src/api-client.ts`)

Strongly-typed API client for Web/React:

**Features:**

- Full response contract validation
- Type-safe request/response handling
- Automatic error handling with categorized error codes
- Cursor-based pagination support
- Field selection query building
- Exponential backoff retry logic
- React hooks: `useApi()` and `usePaginatedApi()`

**Usage:**

```typescript
import { ApiClient, useApi, usePaginatedApi } from "@stellar-insights/sdk";

// Initialize client
const client = new ApiClient({
  baseUrl: "https://api.stellar-insights.com",
  apiKey: "your-key",
  timeout: 30000,
});

// Direct usage
const anchors = await client.get("/v1/anchors", {
  fields: ["id", "name", "domain"],
  limit: 50,
});

// React hook usage
function AnchorsList() {
  const { data, loading, error, refetch } = useApi<Anchor[]>(
    client,
    "/v1/anchors",
    { fields: ["id", "name"], limit: 25 }
  );

  if (loading) return <div>Loading...</div>;
  if (error) {
    if (error.isValidationError) {
      return <div>Invalid request parameters</div>;
    }
    return <div>Error: {error.message}</div>;
  }

  return (
    <div>
      {data?.map((anchor) => (
        <div key={anchor.id}>{anchor.name}</div>
      ))}
      <button onClick={() => refetch()}>Refresh</button>
    </div>
  );
}

// Pagination hook usage
function PaginatedAnchorsList() {
  const { data, pagination, hasMore, loadMore } = usePaginatedApi(
    client,
    "/v1/anchors",
    25
  );

  return (
    <div>
      {data?.map((anchor) => (
        <div key={anchor.id}>{anchor.name}</div>
      ))}
      {hasMore && (
        <button onClick={loadMore}>Load More</button>
      )}
    </div>
  );
}
```

### 4. Mobile Typed Client (`mobile/src/services/api-client.ts`)

Optimized API client for React Native:

**Features:**

- Mobile-optimized timeouts and retry logic
- Built-in response caching
- Offline support (returns cached data when offline)
- Network state monitoring
- Field selection and cursor pagination
- React Native hooks: `useMobileApi()` and `useMobilePaginatedApi()`

**Usage:**

```typescript
import {
  MobileApiClient,
  useMobileApi,
  useMobilePaginatedApi,
} from "stellar-insights-mobile";

// Initialize with caching
const client = new MobileApiClient({
  baseUrl: "https://api.stellar-insights.com",
  apiKey: "your-key",
  timeout: 15000, // Mobile-optimized
  cache: {
    enabled: true,
    ttl: 5 * 60 * 1000, // 5 minutes
  },
});

// Usage in React Native component
function AnchorScreen() {
  const { data, loading, error, isOnline, refetch } = useMobileApi(
    client,
    "/v1/anchors",
    { fields: ["id", "name"], limit: 20 }
  );

  if (!isOnline) {
    return <Text>Device is offline. Showing cached data.</Text>;
  }

  if (loading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <FlatList
      data={data}
      renderItem={({ item }) => <Text>{item.name}</Text>}
      keyExtractor={(item) => item.id.toString()}
      onEndReached={() => refetch()}
    />
  );
}
```

### 5. Integration Tests

Comprehensive test suite covering:

- Response contract compliance
- Pagination metadata validation
- Field selection validation
- Error response format
- Cursor consistency checks
- Edge cases (empty results, last page, etc.)

**Run tests:**

```bash
# Backend tests
cd backend
cargo test --test integration_api_contract_tests

# Unit tests for new modules
cargo test cursor_pagination
cargo test field_selection
cargo test api_contract
```

## Integration Checklist

### 1. Update Backend Endpoints

For each endpoint, add:

- [ ] Cursor-based pagination support
- [ ] Field selection schema definition
- [ ] Response wrapped in `SuccessResponse<T>`
- [ ] Pagination metadata in response
- [ ] Proper error handling with structured errors
- [ ] Tests for pagination and field selection

**Example endpoint update:**

```rust
// Before
pub async fn list_anchors() -> Result<Json<Vec<Anchor>>> {
    let anchors = db.list_anchors().await?;
    Ok(Json(anchors))
}

// After
pub async fn list_anchors(
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse> {
    let selector = FieldSelector::from_query(params.fields);
    let schema = FieldSchema::new(&["id", "name", "domain", "url"]);
    let selector = schema.validate(&selector)
        .map_err(|e| ApiError::bad_request("INVALID_FIELDS", e))?;

    let limit = params.limit.unwrap_or(50).min(100);
    let anchors = db.list_anchors_paginated(limit, &params.cursor).await?;
    let total = db.count_anchors().await?;

    let has_next = anchors.len() >= limit;
    let next_cursor = has_next.then(|| {
        encode_cursor(&anchors.last().unwrap().id.to_string())
    });

    let response = CursorPaginatedResponse::new(
        anchors,
        total,
        limit as i64,
        params.cursor,
        has_next,
        next_cursor,
    );

    Ok(Json(response))
}
```

### 2. Validate Stellar TOML

Add validation to any endpoint that generates or returns Stellar TOML:

```rust
pub async fn get_anchor_toml(domain: String) -> Result<impl IntoResponse> {
    let toml = fetch_anchor_toml(&domain).await?;

    // Validate TOML structure
    let validator = StellarTomlValidator::new();
    validator.validate(&toml)
        .map_err(|e| ApiError::bad_request("INVALID_TOML", e))?;

    Ok(Json(SuccessResponse::new(toml, 200)))
}
```

### 3. Update Frontend Components

Replace direct API calls with typed client:

```typescript
// Before
const response = await fetch(`/api/v1/anchors`);
const anchors = await response.json();

// After
const client = new ApiClient({ baseUrl: "http://localhost:3000" });
const anchors = await client.get<Anchor[]>("/v1/anchors", {
  fields: ["id", "name"],
  limit: 50,
});
```

### 4. Update Mobile Components

Use mobile-optimized client with offline support:

```typescript
// Before
const response = await fetch(`/api/v1/anchors`);
const anchors = await response.json();

// After
const client = new MobileApiClient({
  baseUrl: "http://localhost:3000",
  cache: { enabled: true },
});
const anchors = await client.get<Anchor[]>("/v1/anchors", {
  limit: 20,
});
```

## Migration Path

### Phase 1: Core Infrastructure (Done)

- [x] Cursor-based pagination module
- [x] Field selection module
- [x] API response contract
- [x] Stellar TOML validator
- [x] Documentation
- [x] Typed clients (Web & Mobile)
- [x] Integration tests

### Phase 2: Backend Integration

- [ ] Update all list endpoints to use cursor pagination
- [ ] Define field schemas for each endpoint
- [ ] Wrap all responses in `SuccessResponse<T>`
- [ ] Add Stellar TOML validation to relevant endpoints
- [ ] Update error handling to match contract

### Phase 3: Client Migration

- [ ] Update frontend to use typed client
- [ ] Update mobile to use mobile-optimized client
- [ ] Implement field selection in UI components
- [ ] Add pagination UI with cursor support
- [ ] Implement offline support (mobile)

### Phase 4: Testing & Rollout

- [ ] Run integration test suite
- [ ] Test pagination with real data
- [ ] Test field selection error handling
- [ ] Load test with pagination
- [ ] Gradual rollout with feature flags

## Performance Considerations

### Pagination

- Cursor-based pagination is more efficient than offset for large result sets
- Cursors are opaque and stable even when data changes
- Default limit: 50 (backend), 25 (mobile)
- Maximum limit: 100

### Field Selection

- Reduces payload size significantly
- Clients should request only needed fields
- Schema validation is fast (O(n) where n = requested fields)
- Default: all fields if not specified

### Caching

- Frontend: No built-in caching (use browser cache headers)
- Mobile: 5-minute default cache TTL
- Cache keys: `METHOD:ENDPOINT`
- LRU eviction when cache grows

### Error Handling

- All errors follow the contract
- Client code can use error codes for programmatic handling
- `request_id` enables server-side tracing

## Troubleshooting

### "Invalid cursor" errors

- Cursors expire after 24 hours
- Don't modify cursor strings
- Re-fetch first page if cursor is stale

### "Invalid fields" errors

- Check the `details.allowed` list in error response
- Only request fields that exist for the endpoint
- Some fields may be protected by permissions

### Network timeouts (mobile)

- Check device connectivity
- Cached data is returned automatically when offline
- Reduce `limit` for better performance on slow networks

## Support

For questions or issues:

1. Check the API documentation in `docs/api-schema.md`
2. Review contract documentation in `docs/api-contract.md`
3. Run integration tests to validate contract compliance
4. Include request ID from error responses when reporting issues
