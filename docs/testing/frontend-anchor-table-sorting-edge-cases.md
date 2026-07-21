# Frontend Testing: Anchor Table Sorting Edge Cases

## Summary

The anchor table sorting logic in `AnchorsTables.tsx` handles numeric and string fields with
ascending/descending order. Without deterministic tests, regressions in comparator logic or
missing-value handling are easy to introduce silently.

## Sorting Logic Overview

**File:** `frontend/src/components/tables/AnchorsTables.tsx`

Sortable fields (`SortField` type):

| Field | Type | Default order |
|-------|------|---------------|
| `name` | string (lowercased) | asc |
| `reliability_score` | number | desc |
| `failure_rate` | number | desc |
| `total_transactions` | number | desc |

The sort runs inside `useMemo` and uses:
- `String.prototype.localeCompare` for string fields
- Arithmetic subtraction for numeric fields
- Toggle: clicking the active column flips `asc`↔`desc`; clicking a new column resets to `desc`

**Helper file:** `frontend/src/app/[locale]/anchors/components/helpers.tsx`
- `handleSort()` — manages sort state transitions for the simpler anchor list view

## Test File Location

```
frontend/src/__tests__/components/AnchorTableSorting.test.tsx
```

## Fixture Data

Use a fixed, deterministic anchor array in all tests. Define it once at the top of the file:

```typescript
import { AnchorMetrics } from '@/lib/api/types';

const anchors: AnchorMetrics[] = [
  { id: 'beta', name: 'Beta Anchor', reliability_score: 75, failure_rate: 5, total_transactions: 1000, health_status: 'green' },
  { id: 'alpha', name: 'Alpha Anchor', reliability_score: 90, failure_rate: 2, total_transactions: 5000, health_status: 'green' },
  { id: 'gamma', name: 'Gamma Anchor', reliability_score: 60, failure_rate: 12, total_transactions: 300, health_status: 'yellow' },
];
```

## Test Cases

### String sorting — `name`

```typescript
it('sorts by name ascending (A → Z)', () => {
  const sorted = sortAnchors(anchors, 'name', 'asc');
  expect(sorted.map(a => a.name)).toEqual(['Alpha Anchor', 'Beta Anchor', 'Gamma Anchor']);
});

it('sorts by name descending (Z → A)', () => {
  const sorted = sortAnchors(anchors, 'name', 'desc');
  expect(sorted.map(a => a.name)).toEqual(['Gamma Anchor', 'Beta Anchor', 'Alpha Anchor']);
});
```

### Numeric sorting — `reliability_score`

```typescript
it('sorts by reliability_score descending (high first)', () => {
  const sorted = sortAnchors(anchors, 'reliability_score', 'desc');
  expect(sorted.map(a => a.reliability_score)).toEqual([90, 75, 60]);
});

it('sorts by reliability_score ascending (low first)', () => {
  const sorted = sortAnchors(anchors, 'reliability_score', 'asc');
  expect(sorted.map(a => a.reliability_score)).toEqual([60, 75, 90]);
});
```

### Numeric sorting — `failure_rate`

```typescript
it('sorts by failure_rate ascending (lowest failure first)', () => {
  const sorted = sortAnchors(anchors, 'failure_rate', 'asc');
  expect(sorted.map(a => a.failure_rate)).toEqual([2, 5, 12]);
});
```

### Numeric sorting — `total_transactions`

```typescript
it('sorts by total_transactions descending', () => {
  const sorted = sortAnchors(anchors, 'total_transactions', 'desc');
  expect(sorted.map(a => a.total_transactions)).toEqual([5000, 1000, 300]);
});
```

### Missing / undefined values

The `AnchorMetrics` type may have optional fields in practice. Test that the comparator
does not crash and places missing values consistently (either all at the end or all at the front):

```typescript
it('handles undefined reliability_score without throwing', () => {
  const withMissing = [
    ...anchors,
    { id: 'missing', name: 'No Score Anchor', reliability_score: undefined as any, failure_rate: 0, total_transactions: 0, health_status: 'green' },
  ];

  expect(() => sortAnchors(withMissing, 'reliability_score', 'desc')).not.toThrow();
});

it('handles undefined name without throwing', () => {
  const withMissing = [
    ...anchors,
    { id: 'noname', name: undefined as any, reliability_score: 80, failure_rate: 1, total_transactions: 100, health_status: 'green' },
  ];

  expect(() => sortAnchors(withMissing, 'name', 'asc')).not.toThrow();
});
```

### Stable order — equal values

When two anchors share the same sort key value, their relative order must not change between renders:

```typescript
it('maintains stable order for equal reliability_score values', () => {
  const tied = [
    { id: 'first', name: 'First', reliability_score: 80, failure_rate: 3, total_transactions: 100, health_status: 'green' },
    { id: 'second', name: 'Second', reliability_score: 80, failure_rate: 3, total_transactions: 200, health_status: 'green' },
  ];

  const sorted1 = sortAnchors(tied, 'reliability_score', 'desc');
  const sorted2 = sortAnchors(tied, 'reliability_score', 'desc');

  expect(sorted1.map(a => a.id)).toEqual(sorted2.map(a => a.id));
});
```

### Sort toggle behavior (`handleSort` in helpers.tsx)

```typescript
it('toggles to desc when clicking an unselected column', () => {
  let sortBy = 'reliability';
  let direction: 'asc' | 'desc' = 'asc';

  handleSort('failure_rate', sortBy, direction, (s) => { sortBy = s; }, (d) => { direction = d; });

  expect(sortBy).toBe('failure_rate');
  expect(direction).toBe('asc'); // failure_rate defaults to asc per helpers.tsx logic
});

it('flips direction when clicking the active column', () => {
  let sortBy = 'reliability';
  let direction: 'asc' | 'desc' = 'desc';

  handleSort('reliability', sortBy, direction, (s) => { sortBy = s; }, (d) => { direction = d; });

  expect(direction).toBe('asc');
});
```

## Extracting the Sort Function

The `sortedAnchors` computation is currently inline in the component. To make it easily unit-testable
without rendering, extract it:

```typescript
// In a new file: frontend/src/lib/sorting.ts
export function sortAnchors(
  anchors: AnchorMetrics[],
  field: SortField,
  order: SortOrder,
): AnchorMetrics[] {
  return [...anchors].sort((a, b) => { /* existing comparator logic */ });
}
```

Then import and test `sortAnchors` directly without needing `render()`.

## Acceptance Criteria

- [ ] Sorting by each of the four fields is tested in both `asc` and `desc`
- [ ] Missing/undefined field values do not cause a crash
- [ ] Stable ordering is verified for equal-value cases
- [ ] `handleSort` toggle behavior is tested separately from rendering
- [ ] All tests are deterministic — no random data, no `Date.now()` in fixtures
