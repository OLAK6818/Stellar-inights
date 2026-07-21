# Realtime Analytics Pipeline Guide

## Overview

The Stellar Insights realtime analytics pipeline delivers live corridor and anchor analytics updates across desktop, mobile, and backend systems. The system is designed to be resilient against network disruptions with automatic recovery mechanisms.

## Architecture

### Components

1. **Backend WebSocket Server** (`backend/src/websocket.rs`)
   - Full-duplex WebSocket connection management
   - Redis-backed cross-instance pub/sub
   - Rate limiting and connection pooling
   - Subscription state persistence and recovery

2. **Frontend Realtime Hooks** (`frontend/src/hooks/`)
   - `useWebSocket` - Core WebSocket connection management with stale data detection
   - `useRealtimeCorridors` - Corridor/anchor updates with message validation
   - `useRealtimeAnchors` - Anchor-specific updates

3. **Mobile Integration** (`mobile/src/services/api.ts`)
   - Snapshot API fallback when realtime unavailable
   - State reconciliation after offline periods

4. **Snapshot & Reconciliation APIs** (`backend/src/api/rpc.rs`)
   - `GET /api/rpc/snapshot/{type}` - Fetch analytics snapshots
   - `POST /api/rpc/reconcile` - State reconciliation

## Message Types

### Realtime Updates

```json
{
  "type": "corridor_update",
  "corridor_key": "corridor_id",
  "asset_a_code": "USDC",
  "asset_a_issuer": "ISSUER_A",
  "asset_b_code": "EUR",
  "asset_b_issuer": "ISSUER_B",
  "success_rate": 98.5,
  "health_score": 95.2,
  "last_updated": "2025-06-18T10:30:00Z"
}
```

```json
{
  "type": "anchor_update",
  "anchor_id": "anchor_1",
  "name": "Anchor Name",
  "reliability_score": 92.5,
  "status": "green"
}
```

### Health Alerts

```json
{
  "type": "health_alert",
  "corridor_id": "corridor_id",
  "severity": "warning",
  "message": "High failure rate detected",
  "timestamp": "2025-06-18T10:30:00Z"
}
```

### Subscription Management

```json
{
  "type": "subscribe",
  "channels": ["corridor:key1", "corridor:key2", "anchor:id"]
}
```

```json
{
  "type": "subscription_confirm",
  "channels": ["corridor:key1", "corridor:key2"],
  "status": "subscribed"
}
```

### Subscription Recovery

After reconnection, the server attempts to restore previous subscriptions:

```json
{
  "type": "subscription_recovered",
  "channels": ["corridor:key1", "corridor:key2"]
}
```

## Connection Recovery

### Automatic Resubscription

1. Client connects with optional `previous_id` query parameter
2. Server checks subscription recovery state
3. Recovers channels from previous connection
4. Sends `subscription_recovered` message
5. Client receives updates on restored channels

### Frontend Implementation

```typescript
const { reconnect } = useWebSocket(url, { maxReconnectAttempts: 5 });

// Trigger manual reconnect with previous connection ID
const previousId = localStorage.getItem('lastConnectionId');
reconnect();
```

### Stale Data Detection

The frontend tracks time since last message received:

- **Default threshold**: 30 seconds
- **Stale state**: No messages within threshold
- **UI feedback**: "Data is stale" indicator shown
- **Recovery**: Manual retry button or automatic reconciliation fetch

```typescript
const { isStaleData, lastMessageTime } = useWebSocket(url, {
  staleDataThreshold: 30000, // 30 seconds
  onStaleData: () => {
    // Fetch snapshot as fallback
    fetchAnalyticsSnapshot();
  },
});
```

## Snapshot API

### Get Analytics Snapshot

**Endpoint**: `GET /api/rpc/snapshot/{type}`

**Parameters**:
- `type` (path): `corridor`, `anchor`, or `all`

**Response**:
```json
{
  "snapshot_id": "uuid",
  "snapshot_type": "corridor",
  "timestamp": "2025-06-18T10:30:00Z",
  "data_hash": "hash",
  "record_count": 42,
  "data": {
    "corridors": [
      {
        "key": "corridor_1",
        "success_rate": 98.5,
        "health_score": 95.2
      }
    ]
  }
}
```

### State Reconciliation

**Endpoint**: `POST /api/rpc/reconcile`

**Request**:
```json
{
  "last_known_timestamp": "2025-06-18T10:00:00Z",
  "data_types": ["corridor", "anchor"]
}
```

**Response**:
```json
{
  "reconciliation_id": "uuid",
  "timestamp": "2025-06-18T10:30:00Z",
  "updates": [
    {
      "type": "corridor",
      "updates": [],
      "timestamp": "2025-06-18T10:30:00Z"
    }
  ],
  "is_complete": true
}
```

## Mobile Fallback Pattern

When WebSocket connection fails:

1. Detect connection loss (timeout or explicit disconnect)
2. Fetch latest analytics via snapshot API
3. Display data with "Last updated X minutes ago" indicator
4. Retry WebSocket connection periodically
5. On reconnection, reconcile state if needed

```typescript
const handleConnectionLoss = async () => {
  try {
    const snapshot = await apiClient.getAnalyticsSnapshot('all');
    displayAnalytics(snapshot.data, { isOffline: true });
  } catch (error) {
    logger.error('Snapshot fallback failed', error);
  }
};
```

## Testing & Debugging

### Simulate Network Disruptions

**In browser DevTools**:
1. Open Network tab
2. Right-click WebSocket connection
3. Select "Block URL" to simulate disconnect
4. Observe stale data detection and UI feedback

### Check Subscription State

```javascript
// Frontend: Check if subscribed
const { corridorUpdates } = useRealtimeCorridors({
  corridorKeys: ['key1', 'key2'],
  onCorridorUpdate: (update) => console.log('Update:', update),
});
```

### Monitor Server Logs

```bash
# Watch WebSocket connections
docker logs -f stellar-insights-backend | grep -i websocket

# Check subscription recovery
docker logs -f stellar-insights-backend | grep -i "recovered"
```

### Manual API Testing

```bash
# Get corridor snapshot
curl http://localhost:8080/api/rpc/snapshot/corridor

# Get anchor snapshot
curl http://localhost:8080/api/rpc/snapshot/anchor

# Reconcile state
curl -X POST http://localhost:8080/api/rpc/reconcile \
  -H "Content-Type: application/json" \
  -d '{
    "last_known_timestamp": "2025-06-18T10:00:00Z",
    "data_types": ["corridor", "anchor"]
  }'
```

## Troubleshooting

### WebSocket Connection Fails

**Symptoms**: "Cannot connect to WebSocket server"

**Solutions**:
1. Check backend is running: `curl http://localhost:8080/api/rpc/health`
2. Verify WS_AUTH_TOKEN environment variable if required
3. Check browser console for CORS errors
4. Ensure WebSocket URL matches backend configuration

### Data Marked as Stale

**Symptoms**: "Data is stale" indicator appears

**Solutions**:
1. Check backend is sending messages: Monitor `/api/rpc/health`
2. Verify subscription was confirmed: Look for `subscription_confirm` message
3. Check network tab for message throughput
4. If persistent, fetch snapshot as fallback: `GET /api/rpc/snapshot/all`

### Mobile App Not Updating

**Symptoms**: Mobile shows outdated corridor data

**Solutions**:
1. Force WebSocket reconnect in app settings
2. Fetch latest snapshot: `apiClient.getAnalyticsSnapshot('all')`
3. Check if app has active WebSocket subscription
4. Verify mobile has internet connectivity

### Cross-Instance Sync Issues

**Symptoms**: Different server instances show different data

**Solutions**:
1. Verify Redis is running: `redis-cli ping`
2. Check Redis channel subscription: `SUBSCRIBE ws:broadcast`
3. Monitor Redis pub/sub: `MONITOR`
4. Review backend logs for Redis errors

## Performance Considerations

- **Message Throughput**: Limit to 100 messages/min per connection
- **Connection Pooling**: Max 1,000 concurrent connections per instance
- **Rate Limiting**: 10 connections per IP, 20 attempts per minute
- **Memory**: ~1KB per active connection
- **Snapshot Size**: Typically <1MB for full analytics snapshot

## Security

- **Authentication**: Optional token-based authentication via `?token=xxx`
- **Rate Limiting**: Per-IP and per-message rate limits
- **Message Validation**: All incoming messages validated for type field
- **Cross-Origin**: Configure CORS for frontend domain
- **Redis**: Use password-protected Redis in production

## Future Improvements

- Delta compression for large snapshots
- Client-side subscription filtering
- Metrics on message delivery latency
- Automatic fallback to polling if WebSocket unavailable
- Server-side broadcast to specific user groups
