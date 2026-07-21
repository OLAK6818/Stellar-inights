# Frontend Testing: Realtime Corridor Update State Transitions

## Summary

`useRealtimeCorridors` drives real-time data across the app, but its WebSocket message handling
and resulting state transitions have no dedicated test coverage. This document specifies what to
test and how.

## Hook Overview

**File:** `frontend/src/hooks/useRealtimeCorridors.ts`

The hook wraps `useWebSocket` and manages three pieces of state:

| State | Type | Updated by |
|-------|------|------------|
| `corridorUpdates` | `Map<string, CorridorUpdate>` | `corridor_update` messages |
| `healthAlerts` | `HealthAlert[]` | `health_alert` messages (capped at 50) |
| `recentPayments` | `NewPayment[]` | `new_payment` messages when `enablePaymentStream=true` (capped at 100) |

The hook also exposes connection state (`isConnected`, `isConnecting`, `connectionAttempts`)
and methods: `subscribeToCorridors`, `unsubscribeFromCorridors`, `clearHealthAlerts`, `reconnect`.

## Test File Location

```
frontend/src/__tests__/hooks/useRealtimeCorridors.test.ts
```

## Mock Strategy

Mock `useWebSocket` at the module level so tests control when messages arrive and what connection
state is reported, without needing a real WebSocket server.

```typescript
vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));
```

Expose a `triggerMessage` helper from the mock so individual tests can simulate incoming payloads:

```typescript
let triggerMessage: (msg: WsMessage) => void;

beforeEach(() => {
  vi.mocked(useWebSocket).mockImplementation((_url, { onMessage }) => {
    triggerMessage = onMessage;
    return {
      isConnected: true,
      isConnecting: false,
      connectionAttempts: 0,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      reconnect: vi.fn(),
    };
  });
});
```

## Test Cases

### `corridor_update` message

```typescript
it('updates corridorUpdates map when corridor_update message arrives', () => {
  const { result } = renderHook(() => useRealtimeCorridors());

  act(() => {
    triggerMessage({
      type: 'corridor_update',
      corridor_key: 'USDC-XLM',
      asset_a_code: 'USDC',
      asset_a_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      asset_b_code: 'XLM',
      asset_b_issuer: '',
      success_rate: 97.2,
      health_score: 91,
      last_updated: '2026-06-18T10:00:00Z',
    });
  });

  expect(result.current.corridorUpdates.get('USDC-XLM')).toMatchObject({
    corridor_key: 'USDC-XLM',
    success_rate: 97.2,
    health_score: 91,
  });
});
```

```typescript
it('invokes onCorridorUpdate callback with the update payload', () => {
  const onCorridorUpdate = vi.fn();
  const { result } = renderHook(() => useRealtimeCorridors({ onCorridorUpdate }));

  act(() => {
    triggerMessage({ type: 'corridor_update', corridor_key: 'EURC-PHP', ... });
  });

  expect(onCorridorUpdate).toHaveBeenCalledOnce();
  expect(onCorridorUpdate).toHaveBeenCalledWith(expect.objectContaining({ corridor_key: 'EURC-PHP' }));
});
```

```typescript
it('overwrites existing corridor entry on subsequent update', () => {
  const { result } = renderHook(() => useRealtimeCorridors());

  act(() => triggerMessage({ type: 'corridor_update', corridor_key: 'USDC-XLM', success_rate: 90 }));
  act(() => triggerMessage({ type: 'corridor_update', corridor_key: 'USDC-XLM', success_rate: 95 }));

  expect(result.current.corridorUpdates.get('USDC-XLM')?.success_rate).toBe(95);
  expect(result.current.corridorUpdates.size).toBe(1);
});
```

### `health_alert` message

```typescript
it('prepends new health alerts to the list', () => {
  const { result } = renderHook(() => useRealtimeCorridors());

  act(() => triggerMessage({ type: 'health_alert', corridor_id: 'USDC-XLM', severity: 'warning', message: 'Latency spike', timestamp: '2026-06-18T10:00:00Z' }));
  act(() => triggerMessage({ type: 'health_alert', corridor_id: 'USDC-XLM', severity: 'critical', message: 'Outage', timestamp: '2026-06-18T10:01:00Z' }));

  expect(result.current.healthAlerts[0].severity).toBe('critical');
  expect(result.current.healthAlerts[1].severity).toBe('warning');
});
```

```typescript
it('caps healthAlerts at 50 entries', () => {
  const { result } = renderHook(() => useRealtimeCorridors());

  act(() => {
    for (let i = 0; i < 60; i++) {
      triggerMessage({ type: 'health_alert', corridor_id: `corridor-${i}`, severity: 'info', message: '', timestamp: '' });
    }
  });

  expect(result.current.healthAlerts).toHaveLength(50);
});
```

```typescript
it('clearHealthAlerts empties the list', () => {
  const { result } = renderHook(() => useRealtimeCorridors());

  act(() => triggerMessage({ type: 'health_alert', corridor_id: 'c1', severity: 'info', message: '', timestamp: '' }));
  act(() => result.current.clearHealthAlerts());

  expect(result.current.healthAlerts).toHaveLength(0);
});
```

### `new_payment` message

```typescript
it('ignores new_payment when enablePaymentStream is false (default)', () => {
  const { result } = renderHook(() => useRealtimeCorridors());

  act(() => triggerMessage({ type: 'new_payment', corridor_id: 'USDC-XLM', amount: 100, successful: true, timestamp: '' }));

  expect(result.current.recentPayments).toHaveLength(0);
});
```

```typescript
it('records payment when enablePaymentStream is true', () => {
  const { result } = renderHook(() => useRealtimeCorridors({ enablePaymentStream: true }));

  act(() => triggerMessage({ type: 'new_payment', corridor_id: 'USDC-XLM', amount: 250, successful: true, timestamp: '2026-06-18T10:00:00Z' }));

  expect(result.current.recentPayments).toHaveLength(1);
  expect(result.current.recentPayments[0].amount).toBe(250);
});
```

```typescript
it('caps recentPayments at 100 entries', () => {
  const { result } = renderHook(() => useRealtimeCorridors({ enablePaymentStream: true }));

  act(() => {
    for (let i = 0; i < 110; i++) {
      triggerMessage({ type: 'new_payment', corridor_id: 'c', amount: i, successful: true, timestamp: '' });
    }
  });

  expect(result.current.recentPayments).toHaveLength(100);
});
```

### Unknown message types

```typescript
it('ignores unknown message types without throwing', () => {
  const { result } = renderHook(() => useRealtimeCorridors());

  expect(() => {
    act(() => triggerMessage({ type: 'some_future_event' as any, data: {} }));
  }).not.toThrow();

  expect(result.current.corridorUpdates.size).toBe(0);
  expect(result.current.healthAlerts).toHaveLength(0);
  expect(result.current.recentPayments).toHaveLength(0);
});
```

### Subscription behavior

```typescript
it('subscribes to corridors when connected and corridorKeys provided', () => {
  const subscribeMock = vi.fn();
  vi.mocked(useWebSocket).mockReturnValue({ isConnected: true, isConnecting: false, connectionAttempts: 0, subscribe: subscribeMock, unsubscribe: vi.fn(), reconnect: vi.fn() });

  renderHook(() => useRealtimeCorridors({ corridorKeys: ['USDC-XLM', 'EURC-PHP'] }));

  expect(subscribeMock).toHaveBeenCalledWith(['corridor:USDC-XLM', 'corridor:EURC-PHP']);
});
```

## Acceptance Criteria

- [ ] All four message types are covered: `corridor_update`, `health_alert`, `new_payment`, unknown
- [ ] State shape is validated after each message, not just callback invocation
- [ ] Cap behavior (50 alerts, 100 payments) is explicitly tested
- [ ] `enablePaymentStream: false` default is verified to suppress payment state
- [ ] No test depends on real network or timers
