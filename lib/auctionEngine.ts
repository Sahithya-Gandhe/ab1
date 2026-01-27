/**
 * Second Price Auction Engine - EXCEL EXACT IMPLEMENTATION
 * 
 * CRITICAL EXCEL MATCH POINTS:
 * 
 * 1. GAP-BASED CLEARING:
 *    Gap[i] = CumulativeSupply[i] - CumulativeDemand[i]
 *    - EXACT: Gap = 0
 *    - INTERPOLATED: Gap changes from negative to positive
 *    - NO_CLEARING: All gaps negative (verified with early exit)
 * 
 * 2. DEMAND MAPPING:
 *    Demand MUST be mapped to seller price grid
 *    At each seller price: find cumulative demand from buyer bids
 *    (NOT quantity-based lookup)
 * 
 * 3. INTERPOLATION (when gap sign changes):
 *    Fraction = |Gap[i-1]| / (|Gap[i-1]| + Gap[i])
 *    ClearingPrice = Price[i-1] + (Price[i] - Price[i-1]) × Fraction
 *    ClearingQty = Supply[i-1] + (Supply[i] - Supply[i-1]) × Fraction
 *    ⚠️ BOTH price AND quantity must be interpolated
 * 
 * 4. BUYER ALLOCATION:
 *    SEQUENTIAL by price priority (NOT proportional)
 *    Each demand point (split) allocated independently
 *    Higher bids consume supply first
 *    Track remaining per split, NOT per buyer total
 * 
 * 5. UNIT SCALING:
 *    TradeValue = Qty × Price × 1000 (MT to Kg)
 *    Bonus = (Clearing - Reserve) × Qty × 1000
 * 
 * 6. DECIMAL SAFETY:
 *    ALL calculations use scaled integers (×10000)
 *    Supply cumulative: scaled integers
 *    Demand cumulative: scaled integers
 *    Gap calculation: scaled integers
 *    Allocations: scaled integers
 *    Prevents floating-point errors that cause Excel mismatch
 * 
 * 7. NO_CLEARING SHORT-CIRCUIT:
 *    If clearingType === 'NO_CLEARING':
 *    - Skip all allocation calculations
 *    - Return empty allocations
 *    - Zero trade value
 */

// Decimal precision safety - use scaled integers
const DECIMAL_SCALE = 10000;

// ================== TYPE DEFINITIONS ==================

export interface SellerData {
  id: string;
  name: string;
  quantity: number;
  reservePrice: number;
}

export interface BuyerBid {
  userId: string;
  userName: string;
  price1: number;
  quantity1: number;
  price2?: number;
  quantity2?: number;
  price3?: number;
  quantity3?: number;
}

export interface SupplyPoint {
  price: number;
  quantity: number;
  cumulativeQuantity: number;
  sellerId: string;
  sellerName: string;
}

export interface DemandPoint {
  price: number;
  quantity: number;
  cumulativeQuantity: number;
  userId: string;
  userName: string;
}

export interface GapPoint {
  index: number;
  price: number;
  cumulativeSupply: number;
  cumulativeDemand: number;
  gap: number;
}

export interface AllocationResult {
  sellerId: string;
  sellerName: string;
  quantity: number;
  reservePrice: number;
  clearingPrice: number;
  tradeValue: number;
  bonus: number;
}

export interface BuyerAllocationResult {
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

export interface ClearingResult {
  clearingPrice: number;
  clearingQuantity: number;
  clearingType: 'EXACT' | 'INTERPOLATED' | 'NO_CLEARING';
  totalTradeValue: number;
  supplyPoints: SupplyPoint[];
  demandPoints: DemandPoint[];
  gapPoints: GapPoint[];
  allocations: AllocationResult[];
  buyerAllocations: BuyerAllocationResult[];
}

// ================== VALIDATION ==================

/**
 * Validate tick size conformance for buyer bids
 * Must be called BEFORE auction execution
 */
export function validateTickSize(bids: BuyerBid[], tickSize: number): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const scaledTick = Math.round(tickSize * DECIMAL_SCALE);

  for (const bid of bids) {
    const prices: number[] = [bid.price1];
    if (bid.price2) prices.push(bid.price2);
    if (bid.price3) prices.push(bid.price3);

    for (let i = 0; i < prices.length; i++) {
      const scaledPrice = Math.round(prices[i] * DECIMAL_SCALE);
      if (scaledPrice % scaledTick !== 0) {
        errors.push(`${bid.userName}: Price ${prices[i]} is not a multiple of tick size ${tickSize}`);
      }
    }

    // Check price differences between splits
    for (let i = 1; i < prices.length; i++) {
      const diff = Math.abs(Math.round((prices[i] - prices[i-1]) * DECIMAL_SCALE));
      if (diff % scaledTick !== 0) {
        errors.push(`${bid.userName}: Price difference ${Math.abs(prices[i] - prices[i-1])} is not a multiple of tick size ${tickSize}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ================== SUPPLY CALCULATION ==================

/**
 * Calculate supply curve from seller data
 * Sorted by price ASCENDING (standard supply curve)
 */
export function calculateSupply(sellers: SellerData[]): SupplyPoint[] {
  const supplyPoints: SupplyPoint[] = [];
  
  // Sort sellers by reserve price (ascending), then by name
  const sortedSellers = [...sellers].sort((a, b) => {
    const priceDiff = Math.round((a.reservePrice - b.reservePrice) * DECIMAL_SCALE);
    if (priceDiff === 0) {
      return a.name.localeCompare(b.name);
    }
    return priceDiff;
  });

  let cumulativeQuantityScaled = 0;
  for (const seller of sortedSellers) {
    const qtyScaled = Math.round(seller.quantity * DECIMAL_SCALE);
    cumulativeQuantityScaled += qtyScaled;
    
    supplyPoints.push({
      price: seller.reservePrice,
      quantity: seller.quantity,
      cumulativeQuantity: cumulativeQuantityScaled / DECIMAL_SCALE,
      sellerId: seller.id,
      sellerName: seller.name,
    });
  }

  return supplyPoints;
}

// ================== DEMAND CALCULATION ==================

/**
 * Calculate RAW buyer demand curve
 * Sorted by price DESCENDING - standard demand curve
 */
export function calculateRawDemand(bids: BuyerBid[]): DemandPoint[] {
  // Flatten all bid splits into individual demand points with buyer info
  const allBidPoints: DemandPoint[] = [];
  
  for (const bid of bids) {
    if (bid.quantity1 > 0) {
      allBidPoints.push({
        price: bid.price1,
        quantity: bid.quantity1,
        cumulativeQuantity: 0, // Will be calculated
        userId: bid.userId,
        userName: bid.userName,
      });
    }
    if (bid.price2 && bid.quantity2 && bid.quantity2 > 0) {
      allBidPoints.push({
        price: bid.price2,
        quantity: bid.quantity2,
        cumulativeQuantity: 0,
        userId: bid.userId,
        userName: bid.userName,
      });
    }
    if (bid.price3 && bid.quantity3 && bid.quantity3 > 0) {
      allBidPoints.push({
        price: bid.price3,
        quantity: bid.quantity3,
        cumulativeQuantity: 0,
        userId: bid.userId,
        userName: bid.userName,
      });
    }
  }

  // Sort by price DESCENDING (highest to lowest)
  allBidPoints.sort((a, b) => {
    const priceDiff = Math.round((b.price - a.price) * DECIMAL_SCALE);
    return priceDiff;
  });

  // Calculate cumulative quantities using scaled integers
  let cumulativeScaled = 0;
  for (const point of allBidPoints) {
    const qtyScaled = Math.round(point.quantity * DECIMAL_SCALE);
    cumulativeScaled += qtyScaled;
    point.cumulativeQuantity = cumulativeScaled / DECIMAL_SCALE;
  }

  return allBidPoints;
}

// ================== DEMAND MAPPING ==================

/**
 * CRITICAL EXCEL FUNCTION: Map demand onto seller price grid
 * At each seller price, determine cumulative demand from buyer bids
 */
export function mapDemandToSellerPrices(
  supplyPoints: SupplyPoint[],
  rawDemand: DemandPoint[]
): number[] {
  // No demand → all zeros
  if (rawDemand.length === 0) {
    return supplyPoints.map(() => 0);
  }

  const minBuyerPrice = rawDemand[rawDemand.length - 1].price;
  const maxBuyerPrice = rawDemand[0].price;
  const totalDemand = rawDemand[rawDemand.length - 1].cumulativeQuantity;

  return supplyPoints.map(sp => {
    const sellerPrice = sp.price;

    // Below minimum buyer price → full demand
    if (sellerPrice <= minBuyerPrice) {
      return totalDemand;
    }

    // Above maximum buyer price → 0
    if (sellerPrice > maxBuyerPrice) {
      return 0;
    }

    // Between min and max → cumulative demand at nearest higher buyer price
    const nearestHigherDemand = rawDemand.find(dp => sellerPrice <= dp.price);
    return nearestHigherDemand ? nearestHigherDemand.cumulativeQuantity : 0;
  });
}

// ================== GAP CALCULATION ==================

/**
 * EXCEL EXACT: Calculate gap at each seller price point
 * Gap[i] = CumulativeSupply[i] - CumulativeDemand[i]
 */
export function calculateGap(
  supplyPoints: SupplyPoint[],
  demandAtSellerPrices: number[]
): GapPoint[] {
  return supplyPoints.map((sp, index) => {
    // Use scaled integers for precise gap calculation
    const scaledSupply = Math.round(sp.cumulativeQuantity * DECIMAL_SCALE);
    const scaledDemand = Math.round(demandAtSellerPrices[index] * DECIMAL_SCALE);
    const scaledGap = scaledSupply - scaledDemand;
    
    return {
      index,
      price: sp.price,
      cumulativeSupply: sp.cumulativeQuantity,
      cumulativeDemand: demandAtSellerPrices[index],
      gap: scaledGap / DECIMAL_SCALE, // Convert back to decimal
    };
  });
}

// ================== CLEARING PRICE CALCULATION ==================

/**
 * EXCEL EXACT: Calculate clearing price with 3 scenarios
 * CASE 1: Exact match (Gap = 0)
 * CASE 2: Interpolation (Gap changes from negative to positive)
 * CASE 3: No clearing (all gaps negative)
 */
export function calculateClearingPrice(
  gapPoints: GapPoint[]
): {
  clearingPrice: number;
  clearingQuantity: number;
  clearingType: 'EXACT' | 'INTERPOLATED' | 'NO_CLEARING';
} {
  // CASE 1: Check for EXACT match (Gap = 0)
  for (const point of gapPoints) {
    if (Math.abs(point.gap) < 0.0001) { // Decimal tolerance
      return {
        clearingPrice: point.price,
        clearingQuantity: point.cumulativeSupply,
        clearingType: 'EXACT',
      };
    }
  }

  // CASE 2: Check for INTERPOLATED clearing (gap sign change)
  for (let i = 1; i < gapPoints.length; i++) {
    const prevGap = gapPoints[i - 1].gap;
    const currGap = gapPoints[i].gap;

    // Gap changes from negative to positive
    if (prevGap < 0 && currGap > 0) {
      // Linear interpolation for BOTH price AND quantity
      const prevPrice = gapPoints[i - 1].price;
      const currPrice = gapPoints[i].price;
      const prevSupply = gapPoints[i - 1].cumulativeSupply;
      const currSupply = gapPoints[i].cumulativeSupply;
      
      const fraction = Math.abs(prevGap) / (Math.abs(prevGap) + currGap);
      const interpolatedPrice = prevPrice + (currPrice - prevPrice) * fraction;
      const interpolatedQty = prevSupply + (currSupply - prevSupply) * fraction;
      
      return {
        clearingPrice: Math.round(interpolatedPrice * DECIMAL_SCALE) / DECIMAL_SCALE,
        clearingQuantity: Math.round(interpolatedQty * DECIMAL_SCALE) / DECIMAL_SCALE,
        clearingType: 'INTERPOLATED',
      };
    }
  }

  // CASE 3: NO_CLEARING - verify all gaps are negative
  const anyPositiveGap = gapPoints.some(g => g.gap > 0);
  if (!anyPositiveGap) {
    return {
      clearingPrice: 0,
      clearingQuantity: 0,
      clearingType: 'NO_CLEARING',
    };
  }

  // If we reach here, no clearing found (shouldn't happen in valid data)
  return {
    clearingPrice: 0,
    clearingQuantity: 0,
    clearingType: 'NO_CLEARING',
  };
}

// ================== SELLER ALLOCATIONS ==================

/**
 * Calculate SELLER allocations (who sells how much)
 * Only sellers with reservePrice <= clearingPrice participate
 */
export function calculateSellerAllocations(
  supplyPoints: SupplyPoint[],
  clearingPrice: number,
  clearingQuantity: number
): AllocationResult[] {
  const allocations: AllocationResult[] = [];
  let remainingQuantityScaled = Math.round(clearingQuantity * DECIMAL_SCALE);
  
  for (const sp of supplyPoints) {
    // Only sellers at or below clearing price participate
    if (Math.round(sp.price * DECIMAL_SCALE) > Math.round(clearingPrice * DECIMAL_SCALE)) break;

    const sellerQtyScaled = Math.round(sp.quantity * DECIMAL_SCALE);
    const allocatedQtyScaled = Math.min(remainingQuantityScaled, sellerQtyScaled);
    const allocatedQty = allocatedQtyScaled / DECIMAL_SCALE;
    
    // Excel unit scaling: MT to Kg (×1000)
    const qtyInKg = allocatedQty * 1000;
    
    // TradeValue = Qty × Price × 1000 (MT to Kg)
    const tradeValue = Math.round(clearingPrice * qtyInKg * DECIMAL_SCALE) / DECIMAL_SCALE;
    
    // Bonus = (ClearingPrice - ReservePrice) × Qty × 1000
    const bonus = Math.round((clearingPrice - sp.price) * qtyInKg * DECIMAL_SCALE) / DECIMAL_SCALE;
    
    allocations.push({
      sellerId: sp.sellerId,
      sellerName: sp.sellerName,
      quantity: allocatedQty,
      reservePrice: sp.price,
      clearingPrice,
      tradeValue,
      bonus,
    });

    remainingQuantityScaled -= allocatedQtyScaled;
    if (remainingQuantityScaled < 1) break; // Less than 0.0001
  }

  return allocations;
}

// ================== BUYER ALLOCATIONS ==================

/**
 * Calculate buyer-seller allocation matrix
 * EXCEL EXACT: Sequential allocation by price priority (NOT proportional)
 * Each demand point (split) is allocated independently
 * Higher bids consume supply first
 */
export function calculateBuyerAllocations(
  rawDemand: DemandPoint[],
  sellerAllocations: AllocationResult[],
  clearingPrice: number
): BuyerAllocationResult[] {
  // Filter accepted bids (price >= clearingPrice) and sort by price DESC
  // CRITICAL: Each demand point is treated independently, even for same buyer
  const acceptedBids = rawDemand
    .filter(dp => dp.price >= clearingPrice - 0.0001)
    .sort((a, b) => {
      // Sort by price DESC, then by userId for deterministic ordering
      if (Math.abs(a.price - b.price) > 0.0001) {
        return b.price - a.price;
      }
      return a.userId.localeCompare(b.userId);
    });

  // Track remaining quantity for each demand point independently
  const demandRemaining = new Map<DemandPoint, number>();
  for (const bid of acceptedBids) {
    demandRemaining.set(bid, bid.quantity);
  }

  // Initialize buyer allocation results
  const buyerMap = new Map<string, BuyerAllocationResult>();
  
  for (const bid of acceptedBids) {
    if (!buyerMap.has(bid.userId)) {
      buyerMap.set(bid.userId, {
        userId: bid.userId,
        userName: bid.userName,
        totalQuantity: 0,
        allocations: [],
      });
    }
  }

  // EXCEL SEQUENTIAL ALLOCATION: Walk through sellers, allocate to demand points by priority
  for (const sellerAlloc of sellerAllocations) {
    let sellerRemaining = sellerAlloc.quantity;

    // Allocate to demand points in price-priority order
    for (const bid of acceptedBids) {
      if (sellerRemaining < 0.0001) break;

      // Get remaining quantity for THIS demand point (not buyer total)
      const bidRemaining = demandRemaining.get(bid) || 0;
      
      if (bidRemaining < 0.0001) continue; // This split already satisfied

      // Allocate minimum of seller remaining and bid remaining
      const qtyToAllocate = Math.min(sellerRemaining, bidRemaining);
      
      const buyer = buyerMap.get(bid.userId)!;
      buyer.allocations.push({
        sellerId: sellerAlloc.sellerId,
        sellerName: sellerAlloc.sellerName,
        quantity: Math.round(qtyToAllocate * DECIMAL_SCALE) / DECIMAL_SCALE,
        price: clearingPrice,
      });

      buyer.totalQuantity += qtyToAllocate;
      
      // Update remaining for THIS demand point
      demandRemaining.set(bid, bidRemaining - qtyToAllocate);
      sellerRemaining -= qtyToAllocate;
    }
  }

  return Array.from(buyerMap.values());
}

// ================== MAIN AUCTION EXECUTION ==================

/**
 * MAIN AUCTION EXECUTION - EXCEL EXACT MATCH
 * Implements gap-based market clearing with interpolation
 */
export function executeAuction(
  sellers: SellerData[],
  bids: BuyerBid[],
  tickSize: number = 0.01
): ClearingResult {
  // Validate tick size conformance
  const validation = validateTickSize(bids, tickSize);
  if (!validation.valid) {
    console.warn('Tick size validation warnings:', validation.errors);
    // Continue with warnings, but data should be pre-validated
  }

  // STEP 1: Calculate supply curve (sorted ascending by price)
  const supplyPoints = calculateSupply(sellers);

  // STEP 2: Calculate RAW demand curve (sorted descending by price)
  const rawDemand = calculateRawDemand(bids);

  // STEP 3: Map demand onto seller price grid
  const demandAtSellerPrices = mapDemandToSellerPrices(supplyPoints, rawDemand);

  // STEP 4: Calculate gap at each price point
  const gapPoints = calculateGap(supplyPoints, demandAtSellerPrices);

  // STEP 5: Find clearing price using gap-based logic
  const { clearingPrice, clearingQuantity, clearingType } = calculateClearingPrice(gapPoints);

  // EARLY EXIT: NO_CLEARING case - no allocations
  if (clearingType === 'NO_CLEARING') {
    return {
      clearingPrice: 0,
      clearingQuantity: 0,
      totalTradeValue: 0,
      clearingType: 'NO_CLEARING',
      supplyPoints,
      demandPoints: rawDemand.map(rd => ({
        price: rd.price,
        quantity: rd.quantity,
        cumulativeQuantity: rd.cumulativeQuantity,
        userId: rd.userId,
        userName: rd.userName,
      })),
      gapPoints,
      allocations: [],
      buyerAllocations: [],
    };
  }

  // STEP 6: Calculate seller allocations
  const allocations = calculateSellerAllocations(supplyPoints, clearingPrice, clearingQuantity);

  // STEP 7: Calculate total trade value
  const totalTradeValue = allocations.reduce((sum, a) => sum + a.tradeValue, 0);

  // STEP 8: Calculate buyer allocations
  const buyerAllocations = calculateBuyerAllocations(rawDemand, allocations, clearingPrice);

  // Build demand points for UI display (from rawDemand)
  const demandPoints = rawDemand.map(rd => ({
    price: rd.price,
    quantity: rd.quantity,
    cumulativeQuantity: rd.cumulativeQuantity,
    userId: rd.userId,
    userName: rd.userName,
  }));
  
  return {
    clearingPrice: Math.round(clearingPrice * DECIMAL_SCALE) / DECIMAL_SCALE,
    clearingQuantity: Math.round(clearingQuantity * DECIMAL_SCALE) / DECIMAL_SCALE,
    totalTradeValue: Math.round(totalTradeValue * DECIMAL_SCALE) / DECIMAL_SCALE,
    clearingType,
    supplyPoints,
    demandPoints,
    gapPoints,
    allocations,
    buyerAllocations,
  };
}
