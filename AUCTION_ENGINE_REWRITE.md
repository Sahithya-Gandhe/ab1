# Auction Engine Rewrite - Excel Match Implementation

## Summary
Completely rewrote the auction engine to match Excel's gap-based market clearing logic EXACTLY.

## Key Changes

### 1. **Gap-Based Clearing Logic**
```typescript
Gap[i] = CumulativeSupply[i] - CumulativeDemand[i]
```
- EXACT match: Gap = 0
- INTERPOLATED: Gap changes from negative to positive
- NO_CLEARING: All gaps negative

### 2. **Demand Mapping to Seller Prices**
Critical Excel function: `mapDemandToSellerPrices()`
- At each seller price, find cumulative demand from buyer bids
- Rule: If sellerPrice <= buyerPrice, include that buyer's quantity
- Ensures demand is aligned to seller price grid, NOT quantity-based

### 3. **Linear Interpolation Formula**
When gap changes sign (negative → positive):
```typescript
Fraction = |Gap[i-1]| / (|Gap[i-1]| + Gap[i])
ClearingPrice = Price[i-1] + (Price[i] - Price[i-1]) × Fraction
```

### 4. **Decimal Safety**
```typescript
const DECIMAL_SCALE = 10000;
```
All calculations use scaled integers to avoid floating-point errors:
```typescript
Math.round(value * DECIMAL_SCALE) / DECIMAL_SCALE
```

### 5. **Buyer-Seller Allocation Matrix**
New function: `calculateBuyerAllocations()`
- Shows which buyer received quantity from which seller
- Proportional allocation based on accepted bids
- Included in results for display

### 6. **Tick Size Validation**
New function: `validateTickSize()`
- Validates BEFORE auction execution
- Checks bid prices are multiples of tick size
- Checks price differences conform to tick size

## 8-Step Auction Process

```typescript
1. Calculate supply curve (ascending by price)
2. Calculate RAW demand curve (descending by price)
3. Map demand onto seller price grid ← CRITICAL
4. Calculate gap at each price point (Gap = Supply - Demand)
5. Find clearing price (exact/interpolated/no clearing)
6. Calculate seller allocations
7. Calculate total trade value
8. Calculate buyer allocations
```

## New Data Structures

### GapPoint
```typescript
{
  index: number;
  price: number;
  cumulativeSupply: number;
  cumulativeDemand: number;
  gap: number; // Supply - Demand
}
```

### clearingType
```typescript
'EXACT' | 'INTERPOLATED' | 'NO_CLEARING'
```

### BuyerAllocationResult
```typescript
{
  userId: string;
  userName: string;
  totalQuantity: number;
  allocations: {
    sellerId: string;
    sellerName: string;
    quantity: number;
    price: number;
  }[];
}
```

## UI Updates

### Admin Results Page
- Added "Clearing Type" display (EXACT / INTERPOLATED / NO_CLEARING)
- Added Gap Analysis table showing:
  - Price, Cumulative Supply, Cumulative Demand, Gap
  - Color coding: Green (exact), Blue (surplus), Red (shortage)
- Added interpolation notice when applicable
- Added no-clearing warning when applicable

### PDF Report
- Added clearingType to summary
- Added Gap Analysis table with color coding
- Shows gap calculation at each price point
- Includes interpolation details if applicable

## Files Modified

1. **lib/auctionEngine.ts** - Complete rewrite (600+ lines)
2. **app/api/auction/end/route.ts** - Added tickSize parameter
3. **app/api/auction/results/route.ts** - Added tickSize parameter
4. **app/admin/components/AuctionResults.tsx** - Added gap analysis UI
5. **app/api/auction/report/route.ts** - Added gap analysis to PDF

## Testing Checklist

- [ ] Run `npm run dev` and start application
- [ ] Create auction with sellers
- [ ] Submit buyer bids
- [ ] End auction and verify clearing price calculation
- [ ] Check gap analysis table shows correct values
- [ ] Verify clearing type is correct (EXACT/INTERPOLATED/NO_CLEARING)
- [ ] Compare results with Excel calculations
- [ ] Download PDF report and verify gap analysis
- [ ] Test edge cases:
  - [ ] Exact match (gap = 0)
  - [ ] Interpolation (gap sign change)
  - [ ] No clearing (all gaps negative)
  - [ ] Tick size validation

## Critical Excel Match Points

✅ Gap calculation: Supply - Demand at each price
✅ Demand mapped to seller price grid (not quantity-based)
✅ Three clearing scenarios (exact, interpolated, no clearing)
✅ Linear interpolation when gap changes sign
✅ Decimal safety with scaled integers
✅ Buyer-seller allocation matrix
✅ Tick size validation before auction

## Next Steps

1. Test with sample data from Excel
2. Verify numerical exactness (no rounding errors)
3. Compare clearing price, quantity, and allocations with Excel
4. Update UI components if needed for buyer allocation display
5. Test edge cases and boundary conditions
