# Analytics Data Integrity Guide

## Overview

This guide documents the end-to-end data integrity validation system for Stellar Insights analytics pipeline. The system ensures corridor and anchor analytics data maintains consistency from ingestion through database storage to frontend/mobile display.

## Data Integrity Layers

### 1. Ingestion Validation

**Location**: `backend/src/database.rs`, `backend/src/analytics.rs`

**Validation Rules**:

#### Corridor Analytics
- `corridor_key` - Required, non-empty string
- `asset_a_code` - Required, valid asset code format (1-12 chars)
- `asset_a_issuer` - Required, valid Stellar account address
- `asset_b_code` - Required, valid asset code format (1-12 chars)
- `asset_b_issuer` - Required, valid Stellar account address
- `success_rate` - Optional, range [0.0, 100.0]
- `health_score` - Optional, range [0.0, 100.0]
- `last_updated` - Optional, valid ISO 8601 timestamp

#### Anchor Analytics
- `anchor_id` - Required, non-empty string, unique
- `anchor_name` - Required, non-empty string
- `reliability_score` - Required, range [0.0, 100.0]
- `asset_performance_score` - Required, range [0.0, 100.0]
- `volume_score` - Required, range [0.0, 100.0]
- `asset_diversity_score` - Required, range [0.0, 100.0]
- `total_assets` - Required, non-negative integer
- `total_volume_usd` - Required, non-negative number
- `weighted_success_rate` - Required, range [0.0, 100.0]
- `status` - Required, one of: Red, Yellow, Green
- `timestamp` - Required, valid ISO 8601 timestamp

**Implementation**:

```rust
// Example validation in ingestion
pub fn validate_corridor_record(record: &CorridorAnalytics) -> Result<(), ValidationError> {
    // Required fields
    if record.corridor_key.is_empty() {
        return Err(ValidationError::MissingField("corridor_key"));
    }

    // Format validation
    if !is_valid_asset_code(&record.asset_a_code) {
        return Err(ValidationError::InvalidFormat("asset_a_code"));
    }

    if !is_valid_stellar_address(&record.asset_a_issuer) {
        return Err(ValidationError::InvalidAddress("asset_a_issuer"));
    }

    // Range validation
    if let Some(success_rate) = record.success_rate {
        if success_rate < 0.0 || success_rate > 100.0 {
            return Err(ValidationError::OutOfRange("success_rate"));
        }
    }

    Ok(())
}
```

### 2. Database Layer Validation

**Location**: `backend/src/database.rs`

**Storage Constraints**:

- **Type Enforcement**: Database schema enforces correct types
- **NOT NULL Constraints**: Required fields cannot be null
- **UNIQUE Constraints**: anchor_id is unique across table
- **CHECK Constraints**: Score values must be [0, 100]
- **Index Constraints**: Indexed on frequently queried fields

**Rejection of Malformed Records**:

```rust
// Database insert with validation
pub async fn insert_corridor_analytics(
    pool: &PgPool,
    record: &CorridorAnalytics,
) -> Result<(), DbError> {
    // Validate before insert
    validate_corridor_record(record)?;

    // Database constraints will enforce:
    // - NOT NULL on corridor_key
    // - UNIQUE on (asset_a_code, asset_a_issuer, asset_b_code, asset_b_issuer)
    // - CHECK (success_rate >= 0 AND success_rate <= 100)

    sqlx::query!(
        "INSERT INTO corridor_analytics (...) VALUES (...)",
        record.corridor_key,
        record.asset_a_code,
        // ... other fields
    )
    .execute(pool)
    .await?;

    Ok(())
}
```

### 3. Calculation Validation

**Location**: `backend/src/analytics.rs`

**Calculation Integrity**:

#### Anchor Reliability Score

**Formula**:
```
reliability_score = (success_rate * 0.7) + (settlement_time_score * 0.3)
```

**Validation**:
- `success_rate` = (successful_transactions / total_transactions) * 100
- Result rounded to 2 decimals
- Range check: [0.0, 100.0]

**Code**:
```rust
pub fn compute_anchor_metrics(
    total_transactions: i64,
    successful_transactions: i64,
    failed_transactions: i64,
    avg_settlement_time_ms: Option<i32>,
) -> AnchorMetrics {
    if total_transactions == 0 {
        return AnchorMetrics::default(); // Return zeroed metrics
    }

    // Calculate with rounding
    let success_rate = (successful_transactions as f64 / total_transactions as f64) * 100.0;
    let success_rate = (success_rate * 100.0).round() / 100.0; // Round to 2 decimals

    // Validate range
    assert!(success_rate >= 0.0 && success_rate <= 100.0, "Success rate out of range");

    // ... more calculations
}
```

#### Composite Anchor Score

**Formula**:
```
composite_score = (0.6 * asset_performance_score)
                + (0.3 * volume_score)
                + (0.1 * asset_diversity_score)
```

**Constraints**:
- All component scores must be in [0.0, 100.0]
- Composite score must be in [0.0, 100.0]
- Volume score uses logarithmic scaling
- Asset diversity capped at 10 assets

### 4. Display Layer Validation

**Location**: `frontend/src/components/`, `mobile/src/components/`

**UI Tests**:

```typescript
// Test: Verify displayed value matches source data
describe('CorridorCard', () => {
  test('displays success_rate correctly', () => {
    const data = {
      success_rate: 98.5,
      health_score: 95.2,
    };

    const { getByText } = render(<CorridorCard corridor={data} />);

    // Verify exact value displayed
    expect(getByText('98.5%')).toBeInTheDocument();
    expect(getByText('95.2%')).toBeInTheDocument();
  });

  test('handles null values gracefully', () => {
    const data = {
      success_rate: null,
      health_score: null,
    };

    const { getByText } = render(<CorridorCard corridor={data} />);

    // Should show placeholder or default
    expect(getByText('—')).toBeInTheDocument();
  });
});
```

**Mobile Tests**:

```typescript
// Test: Analytics display correctness
describe('AnchorMetrics', () => {
  test('displays anchor reliability score with correct precision', async () => {
    const snapshot = {
      anchors: [
        {
          anchor_id: 'test-anchor',
          composite_score: 91.5,
        },
      ],
    };

    const { getByTestId } = render(<AnchorMetrics snapshot={snapshot} />);

    // Verify precision matches backend calculation
    expect(getByTestId('score')).toHaveTextContent('91.5');
  });
});
```

## Data Flow Validation

### Ingestion → Storage → Display

```
┌─────────────────┐
│  Ingestion      │
│  - Validate all │
│    fields       │
└────────┬────────┘
         │ (apply rules)
         ▼
┌─────────────────┐
│  Database       │
│  - Enforce      │
│    constraints  │
│  - Reject bad   │
│    records      │
└────────┬────────┘
         │ (store)
         ▼
┌─────────────────┐
│  API Response   │
│  - Return exact │
│    values       │
│  - Include hash │
└────────┬────────┘
         │ (fetch)
         ▼
┌─────────────────┐
│  Frontend/Mobile│
│  - Test display │
│    matches      │
│    source       │
└─────────────────┘
```

## Validation Tests

### Unit Tests

**File**: `backend/tests/analytics_tests.rs`

```rust
#[test]
fn test_anchor_metrics_validation() {
    let metrics = compute_anchor_metrics(1000, 995, 5, Some(2000));

    assert_eq!(metrics.total_transactions, 1000);
    assert_eq!(metrics.successful_transactions, 995);
    assert!(metrics.success_rate >= 0.0 && metrics.success_rate <= 100.0);
    assert!(metrics.reliability_score >= 0.0 && metrics.reliability_score <= 100.0);
}

#[test]
fn test_corridor_analytics_empty_rejection() {
    let invalid = CorridorAnalytics {
        corridor_key: String::new(), // Empty!
        ..default()
    };

    assert!(validate_corridor_record(&invalid).is_err());
}
```

### Integration Tests

**File**: `backend/tests/analytics_integrity_test.rs`

```rust
#[tokio::test]
async fn test_end_to_end_corridor_integrity() {
    // 1. Ingest
    let data = CorridorAnalytics {
        corridor_key: "test_corridor".to_string(),
        success_rate: 98.5,
        ..default()
    };

    // 2. Insert to DB
    let stored = db.insert_corridor(&data).await.unwrap();

    // 3. Retrieve
    let retrieved = db.get_corridor("test_corridor").await.unwrap();

    // 4. Verify integrity
    assert_eq!(stored.success_rate, retrieved.success_rate);
    assert_eq!(stored.data_hash, retrieved.data_hash);
}
```

### Display Tests

**File**: `frontend/src/__tests__/analytics-display.test.ts`

```typescript
test('corridor success rate displays with correct precision', async () => {
    const corridors = [
        { corridor_key: 'test', success_rate: 98.5555 }, // Backend rounds
    ];

    const { getByText } = render(<CorridorsTable corridors={corridors} />);

    // Should display rounded value
    expect(getByText('98.56%')).toBeInTheDocument();
});
```

## Monitoring & Alerts

### Validation Metrics

Track in observability system:
- **validation_failures_total** - Total validation errors by type
- **database_constraint_violations** - Constraint violation count
- **calculation_errors** - Errors in metric calculations
- **display_precision_mismatches** - UI value discrepancies

```rust
pub fn record_validation_failure(error_type: &str) {
    metrics::counter!("validation_failures_total", "error_type" => error_type.to_string())
        .increment(1);
}
```

### Health Checks

**Endpoint**: `GET /api/rpc/health`

```json
{
  "status": "healthy",
  "analytics_validation": {
    "failed_records_24h": 0,
    "last_validation_run": "2025-06-18T10:30:00Z",
    "validation_pass_rate": 99.9
  }
}
```

### Data Hash Verification

Use MD5/SHA256 hash of snapshot data to verify consistency:

```rust
let data_hash = format!("{:x}", md5::compute(snapshot_data.as_bytes()));

// Verify on client
if snapshot.data_hash != client_calculated_hash {
    logger.warn("Data hash mismatch - possible corruption");
}
```

## Common Validation Errors

| Error | Cause | Resolution |
|-------|-------|-----------|
| `MissingField` | Required field empty/null | Check data source, add default |
| `InvalidFormat` | Asset code/address invalid | Validate before ingestion |
| `OutOfRange` | Score outside [0,100] | Clamp or reject record |
| `DuplicateAnchorId` | Anchor ID already exists | Check for duplicates before insert |
| `InvalidTimestamp` | Non-ISO 8601 format | Parse and convert to standard format |

## Best Practices

1. **Validate Early**: Check data at ingestion boundary
2. **Enforce in DB**: Use constraints, NOT NULL, CHECK
3. **Test Round-Trip**: Verify data survives storage/retrieval
4. **Monitor Quality**: Track validation metrics
5. **Hash Snapshots**: Detect corruption in transit
6. **Document Ranges**: Keep validation rules consistent
7. **Version Schema**: Track validation rule changes

## References

- [Stellar Assets](https://developers.stellar.org/docs/learn/assets)
- [Account Addresses](https://developers.stellar.org/docs/learn/accounts)
- [Analytics Calculations](./analytics-calculations.md)
- [Database Schema](./database-schema.md)
