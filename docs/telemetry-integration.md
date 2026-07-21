# Telemetry and Trace Propagation Integration Guide

## Overview

This guide explains the full-stack telemetry system that enables distributed tracing across the Stellar Insights backend (Rust), frontend (Next.js), and mobile (React Native) applications.

## Architecture

### Trace Context Flow

```
Browser/Mobile → Frontend → Backend → RPC/Database
    (W3C TraceContext: traceparent header)
```

- **traceparent format**: `00-{trace_id}-{span_id}-{flags}`
- **Trace ID**: 32-character hex UUID (128-bit), same across all services
- **Span ID**: 16-character hex (64-bit), unique per operation
- **Flags**: `01` (sampled), `00` (not sampled)

## Backend Implementation

### Key Modules

1. **`src/observability/trace_context.rs`** - Trace utilities
   - Extract/inject W3C TraceContext headers
   - Get current trace/span IDs from OpenTelemetry context
   - Create child spans for background jobs

2. **`src/jobs/trace_aware_executor.rs`** - Async context preservation
   - `TraceAwareTask<F>` wrapper preserves span across tokio::spawn
   - `spawn_traced()` function for background jobs

3. **`src/websocket_trace.rs`** - WebSocket tracing
   - `WsTraceContext` for connection-level trace tracking
   - `TraceAwareMessageHandler` for message-level tracing

4. **`src/observability/health_checks.rs`** - Instrumented health endpoints
   - Per-component health checks (DB, Cache, RPC)
   - Span-based instrumentation with response times

### Request Flow with Tracing

```rust
// Incoming HTTP request with traceparent header
trace_propagation_middleware
  ├─ Extracts traceparent from headers
  ├─ Sets parent context on current span
  └─ Records trace_id/span_id in logs

Handler processes request
  ├─ Makes RPC call
  │  └─ inject_trace_context() adds traceparent header
  ├─ Spawns background job
  │  └─ spawn_traced() preserves trace context
  └─ WebSocket message
     └─ WsTraceContext maintains connection trace

All logs include trace_id for correlation
```

## Frontend Implementation

### Setup

```typescript
// 1. Initialize telemetry on app load
import { initializeTelemetry } from '@/lib/telemetry';

useEffect(() => {
  initializeTelemetry();
}, []);

// 2. API client automatically injects traceparent
import { apiGet, apiPost } from '@/lib/api-client';
const data = await apiGet('/api/data');
// Headers automatically include: traceparent: 00-{trace_id}-{span_id}-01
```

### TraceContext Management

- **Storage**: sessionStorage (persists across navigation within session)
- **Generation**: UUID v4 for trace_id, random 64-bit for span_id
- **Lifecycle**: One trace per session, reused for all requests

### WebSocket Integration

```typescript
// WebSocket automatically attaches trace_id
const ws = new WebSocket(`ws://backend/ws?trace_id=${traceContext.traceId}`);
```

## Mobile Implementation

### Setup

```typescript
// 1. Initialize telemetry service
import { TelemetryService } from '@/services/telemetryService';

const telemetry = new TelemetryService();

// 2. Network monitoring
// Automatically tracks online/offline transitions

// 3. App lifecycle events
// Automatically tracks foreground/background

// 4. API requests include traceparent headers
// Axios interceptor adds: traceparent: 00-{trace_id}-{span_id}-01
```

## Testing Trace Propagation

### Unit Tests

```bash
cargo test observability::trace_context
cargo test jobs::trace_aware_executor
```

### Integration Test: HTTP → RPC

```bash
# 1. Send request with traceparent header
curl -H 'traceparent: 00-abc123...-def456...-01' http://localhost:8000/api/test

# 2. Verify backend logs include trace_id: abc123
# 3. Verify RPC call includes traceparent header
# 4. Query Jaeger to see linked spans
```

### Smoke Test

```bash
./scripts/validate-telemetry.sh
# Checks:
# - Backend receives traceparent headers
# - All health checks return 200 OK
# - Jaeger shows complete trace chain
```

## Configuration

### Environment Variables

**Backend** (`backend/.env`)
```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
LOG_FORMAT=json
```

**Frontend** (`.env.local`)
```bash
NEXT_PUBLIC_ENABLE_TELEMETRY=true
NEXT_PUBLIC_TRACE_SAMPLE_RATE=1.0
```

**Mobile** (`.env`)
```bash
REACT_APP_ENABLE_TELEMETRY=true
```

## Observability Tools

### Jaeger (Local Development)

```bash
# Run Jaeger collector locally
docker run -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one

# View traces at http://localhost:16686
```

### Prometheus Metrics

- `stellar_insights_health_check_duration_ms` - Health check response times
- `stellar_insights_trace_propagation_failures` - Failed trace context injections

## Troubleshooting

### Missing traceparent headers in logs

1. Verify `OTEL_ENABLED=true`
2. Check `trace_propagation_middleware` is registered in main.rs
3. Confirm request includes traceparent header

### Trace context lost in background jobs

- Use `spawn_traced()` instead of `tokio::spawn()`
- Verify TraceAwareTask is used for async boundaries

### WebSocket trace_id not appearing

- Verify WsTraceContext is initialized in ws_handler
- Check WebSocket upgrade headers include traceparent

## Performance Considerations

- **Sampling**: Adjust LOG_FORMAT to control verbosity
- **OpenTelemetry**: Batch export reduces overhead
- **Header size**: traceparent adds ~55 bytes per request

## Security

- Trace IDs are pseudo-random UUIDs (safe to log)
- Do NOT include sensitive data in trace context
- Use `Redacted` type for PII in span fields (see logging module)

## Next Steps

1. Enable tracing in staging environment
2. Monitor performance impact with APM
3. Tune sampling rate based on traffic volume
4. Add custom spans for business metrics
5. Integrate with alerting on trace errors
