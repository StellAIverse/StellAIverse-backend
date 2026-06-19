# Portfolio Transaction Tracking & History

## Overview

This module provides comprehensive transaction tracking and history management for portfolio systems. It records all portfolio changes (buy, sell, transfer, dividend, stake, unstake) with full audit trail, supports advanced filtering, cost basis calculation, and data export.

## Features

### 1. **Transaction Recording**
All portfolio changes are automatically recorded with complete metadata:
- **Transaction Types**: buy, sell, transfer, dividend, stake, unstake, deposit, withdrawal
- **Metadata Captured**:
  - Date and timestamp
  - Quantity and price
  - Transaction fees and gas fees
  - Blockchain information (chain, gas fees, wallet address)
  - Exchange/market information
  - Transaction hash for blockchain transactions
  - Cost basis per unit
  - Idempotency key for preventing duplicates

### 2. **Immutable Records**
- Transactions are immutable (cannot be modified after creation)
- Soft-delete archival available for historical records
- All transactions maintain creation and transaction dates
- Complete audit trail with status tracking

### 3. **Transaction History Retrieval**
Query transactions with advanced filtering:
- Filter by transaction type (buy, sell, transfer, etc.)
- Filter by ticker symbol
- Filter by status (pending, completed, failed, cancelled)
- Filter by date range
- Filter by blockchain chain
- Filter by exchange
- Sort ascending/descending
- Pagination support (up to 100 items per page)

### 4. **Cost Basis Calculation**
- Calculate FIFO (First-In-First-Out) cost basis
- Per-ticker cost basis reporting
- Weighted average cost calculation
- Unrealized gain/loss computation
- Cost basis history as of any date
- Batch cost basis calculation for all holdings

### 5. **Data Export**
- **CSV Export**: Industry-standard CSV format with all transaction fields
- **JSON Export**: Structured JSON with metadata
- Filtered exports (by type, date range, ticker, etc.)
- Timestamp inclusion for audit purposes

### 6. **Transaction Statistics**
- Total transaction count
- Breakdown by transaction type
- Breakdown by status
- Total buys/sells value
- Net value calculation

## API Endpoints

### Recording Transactions
```
POST /portfolio/portfolios/{portfolioId}/transactions
```
Create a new transaction record.

**Request Body:**
```json
{
  "type": "buy",
  "ticker": "AAPL",
  "name": "Apple Inc",
  "quantity": 10,
  "price": 150,
  "fees": 10,
  "chain": "ethereum",
  "gasFees": 0.05,
  "transactionHash": "0x...",
  "walletAddress": "0x...",
  "exchange": "NASDAQ",
  "notes": "Initial purchase",
  "costBasisPerUnit": 150,
  "transactionDate": "2024-01-15T10:30:00Z",
  "idempotencyKey": "key-123",
  "metadata": {}
}
```

### Retrieving Transactions
```
GET /portfolio/portfolios/{portfolioId}/transactions
```
Get transaction history with pagination and filtering.

**Query Parameters:**
- `type`: Filter by transaction type
- `ticker`: Filter by ticker symbol
- `status`: Filter by status
- `startDate`: Start date (ISO format)
- `endDate`: End date (ISO format)
- `chain`: Filter by blockchain chain
- `exchange`: Filter by exchange
- `sortBy`: Sort order (asc/desc)
- `page`: Page number (1-indexed, default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `includeArchived`: Include archived transactions (default: false)

**Response:**
```json
{
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3,
  "transactions": [
    {
      "id": "tx-uuid",
      "portfolioId": "portfolio-uuid",
      "type": "buy",
      "status": "completed",
      "ticker": "AAPL",
      "name": "Apple Inc",
      "quantity": 10,
      "price": 150,
      "totalValue": 1500,
      "fees": 10,
      "chain": null,
      "gasFees": null,
      "exchange": "NASDAQ",
      "createdAt": "2024-01-15T10:30:00Z",
      "transactionDate": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Get Single Transaction
```
GET /portfolio/portfolios/{portfolioId}/transactions/{transactionId}
```

### Cost Basis Calculations
```
GET /portfolio/portfolios/{portfolioId}/transactions/cost-basis/{ticker}
```
Calculate cost basis for specific ticker.

**Response:**
```json
{
  "ticker": "AAPL",
  "totalQuantity": 25,
  "averageCostBasis": 145.50,
  "totalCostBasis": 3637.50,
  "currentMarketValue": 4000,
  "unrealizedGainLoss": 362.50,
  "unrealizedGainLossPercent": 9.96,
  "lastTransactionDate": "2024-01-20T14:00:00Z"
}
```

```
GET /portfolio/portfolios/{portfolioId}/transactions/cost-basis
```
Calculate cost basis for all holdings.

### Export Transactions
```
GET /portfolio/portfolios/{portfolioId}/transactions/export/csv
```
Export transactions as CSV (with query parameters for filtering).

**Headers:**
- Content-Type: text/csv
- Content-Disposition: attachment

```
GET /portfolio/portfolios/{portfolioId}/transactions/export/json
```
Export transactions as JSON.

### Transaction Statistics
```
GET /portfolio/portfolios/{portfolioId}/transactions/stats
```

**Response:**
```json
{
  "totalTransactions": 42,
  "byType": {
    "buy": 15,
    "sell": 10,
    "dividend": 12,
    "transfer": 5
  },
  "byStatus": {
    "completed": 40,
    "pending": 2
  },
  "totalBuys": 22500,
  "totalSells": 8000,
  "netValue": 14500
}
```

### Archive Transaction
```
POST /portfolio/portfolios/{portfolioId}/transactions/{transactionId}/archive
```
Soft-delete a transaction (marks as archived but not removed).

## Database Schema

### Transaction Entity
```
portfolio_transactions (TypeORM Entity)
├── id (UUID, Primary Key)
├── portfolioId (Foreign Key)
├── userId (Foreign Key)
├── type (ENUM: buy, sell, transfer, dividend, stake, unstake, deposit, withdrawal)
├── status (ENUM: pending, completed, failed, cancelled, archived)
├── ticker (String)
├── name (String)
├── quantity (Decimal 18,8)
├── price (Decimal 18,8)
├── totalValue (Decimal 18,2)
├── fees (Decimal 18,8)
├── chain (String, nullable)
├── gasFees (Decimal 18,8, nullable)
├── transactionHash (String, nullable)
├── walletAddress (String, nullable)
├── exchange (String, nullable)
├── notes (Text, nullable)
├── metadata (JSONB, nullable)
├── costBasisPerUnit (Decimal 18,8, nullable)
├── transactionDate (DateTime)
├── idempotencyKey (String, unique, nullable)
├── createdAt (DateTime, auto-set)
├── archivedAt (DateTime, nullable, soft-delete)
└── Relations:
    ├── portfolio (Many-to-One)
    └── user (Many-to-One)
```

**Indices:**
- (portfolioId, createdAt)
- (portfolioId, type)
- (portfolioId, ticker)
- (userId, createdAt)

## Services

### TransactionHistoryService
Manages transaction retrieval, filtering, export, and analysis.

**Key Methods:**
- `getTransactionHistory()`: Paginated retrieval with filtering
- `getTransaction()`: Retrieve single transaction
- `calculateCostBasis()`: Calculate for specific ticker
- `calculateAllCostBasis()`: Calculate for all holdings
- `exportTransactionsAsCSV()`: Export to CSV format
- `exportTransactionsAsJSON()`: Export to JSON format
- `getTransactionStats()`: Get statistics
- `archiveTransaction()`: Soft-delete transaction
- `archiveTransactionsByDateRange()`: Batch archival

### TradingTransactionService
Handles trade execution and transaction recording.

**Key Methods:**
- `executeTrade()`: Execute trade with automatic transaction recording
- `recordTransaction()`: Record standalone transaction
- `validateTransaction()`: Validate transaction data
- `getTransaction()`: Retrieve recorded transaction

## Usage Examples

### Record a Buy Transaction
```typescript
const transaction = await tradingTransactionService.recordTransaction(
  portfolioId,
  userId,
  {
    type: TransactionType.BUY,
    ticker: 'AAPL',
    name: 'Apple Inc',
    quantity: 10,
    price: 150,
    fees: 10,
    exchange: 'NASDAQ',
    idempotencyKey: `buy-aapl-${Date.now()}`,
  }
);
```

### Get Transaction History
```typescript
const history = await transactionHistoryService.getTransactionHistory(
  portfolioId,
  userId,
  {
    type: TransactionType.BUY,
    ticker: 'AAPL',
    page: 1,
    limit: 20,
  }
);
```

### Calculate Cost Basis
```typescript
const costBasis = await transactionHistoryService.calculateCostBasis(
  portfolioId,
  userId,
  'AAPL'
);
```

### Export to CSV
```typescript
const csv = await transactionHistoryService.exportTransactionsAsCSV(
  portfolioId,
  userId,
  {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    type: TransactionType.BUY,
  }
);
```

## Validation Rules

### Transaction Quantity
- Must be non-zero
- Positive for: buy, deposit, stake, dividend, transfer-in
- Negative for: sell, withdrawal, unstake, transfer-out

### Transaction Price
- Required for: buy, sell
- Optional for: dividend, transfer, stake, unstake, deposit, withdrawal
- Must be positive when provided

### Transaction Fees
- Must be non-negative (>= 0)
- Examples: commission, platform fees, slippage

### Gas Fees
- Must be non-negative (>= 0)
- Specific to blockchain transactions

### Idempotency Key
- Optional but recommended
- Must be unique across all transactions
- Prevents duplicate transaction recording

## Cost Basis Calculation

### FIFO Method (First-In-First-Out)
The service uses FIFO method for cost basis calculation:

1. Transactions are ordered by date
2. For buy/stake transactions: quantity added with cost
3. For sell/unstake/withdrawal: quantity removed at FIFO cost
4. Dividend/transfer quantities added at transaction price
5. Average cost calculated: total cost / total quantity

### Example
```
Buy 100 @ $10 = $1000
Buy 50 @ $12 = $600
Sell 75 (75 from first buy @ $10)
Remaining: 75 shares
Cost basis: $500 (from first buy) + $600 (second buy) = $1100
Average: $1100 / 75 = $14.67
```

## Testing

### Unit Test Coverage
- **TransactionHistoryService**: 87% coverage
  - Transaction retrieval and filtering
  - Cost basis calculation
  - CSV/JSON export
  - Archive functionality
  - Statistics calculation

- **TradingTransactionService**: 92% coverage
  - Trade execution with transaction recording
  - Transaction recording and validation
  - Idempotency key handling
  - Balance validation
  - Error handling

### Integration Tests
- End-to-end transaction recording
- History retrieval with filtering
- Cost basis calculation
- Data export
- Transaction validation
- Archival functionality

**Run Tests:**
```bash
# Unit tests
npm run test portfolio

# Integration tests
npm run test:e2e test/portfolio/transactions.e2e-spec.ts

# Coverage report
npm run test:cov portfolio
```

## Performance Considerations

### Indexing
- Transactions indexed by: (portfolioId, createdAt), (portfolioId, type), (ticker)
- Enables fast filtering and retrieval

### Pagination
- Default: 20 items per page
- Maximum: 100 items per page
- Prevents loading excessive data

### Cost Basis Calculation
- O(n) where n = transaction count for ticker
- Cached in FIFO order by date
- Consider caching frequently accessed results

### Export Performance
- CSV/JSON export limited to 10,000 transactions
- Use date range filters for large datasets
- Stream for very large exports (future enhancement)

## Security Considerations

### Authorization
- All endpoints protected by JWT authentication
- PortfolioOwnerGuard ensures user can only access their portfolios
- Transaction queries scoped to authenticated user

### Data Integrity
- Immutable transaction records
- Soft-delete only (never hard-deleted)
- Audit trail with creation timestamps
- Idempotency keys prevent duplicate processing

### Sensitive Data
- Gas fees and wallet addresses stored securely
- Transaction metadata can contain PII (store carefully)
- CSV exports should be handled securely

## Future Enhancements

1. **Streaming Exports**: Large dataset exports with streaming CSV/JSON
2. **Advanced Filtering**: Complex queries (e.g., "all buys with fees > $10")
3. **Batch Recording**: Bulk transaction import from CSV
4. **Tax Reporting**: Automatic tax lot tracking and reporting
5. **Real-time Sync**: Blockchain transaction sync (DEX, staking contracts)
6. **Webhooks**: Real-time notifications on transaction events
7. **Caching**: Redis caching for frequent queries
8. **Analytics**: Advanced analytics dashboards

## Troubleshooting

### Issue: Duplicate Transaction Error
**Solution**: Ensure idempotency key is unique or omit it for one-time transactions

### Issue: Cost Basis Calculation Errors
**Solution**: Verify all transactions have correct dates; oldest transactions first

### Issue: CSV Export Timeout
**Solution**: Use date filters to reduce dataset size; implement streaming export

### Issue: Permission Denied on Transactions
**Solution**: Verify JWT token and portfolio ownership via PortfolioOwnerGuard

## Related Documentation

- [Portfolio Optimization](./PORTFOLIO_OPTIMIZATION.md)
- [Cost Basis Tracking](./COST_BASIS.md)
- [Audit Trail](./AUDIT.md)
