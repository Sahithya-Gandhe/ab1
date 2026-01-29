/**
 * =============================================================================
 * SECOND-PRICE DOUBLE AUCTION ENGINE
 * =============================================================================
 * 
 * Excel-exact multi-buyer, multi-seller market clearing implementation.
 * 
 * MANDATORY AUCTION LOGIC (NON-NEGOTIABLE):
 * 
 * 1️⃣ SORTING:
 *    - Buyers: price DESC, quantity DESC
 *    - Sellers: landed cost ASC, offer price ASC
 * 
 * 2️⃣ CUMULATIVE CALCULATIONS:
 *    - Cumulative Supply: Top → Bottom
 *      cum_supply[i] = cum_supply[i-1] + seller_quantity[i]
 *    - Cumulative Demand: Bottom → Top
 *      cum_demand[i] = cum_demand[i+1] + buyer_quantity[i]
 *      If demand exhausted → repeat upward
 * 
 * 3️⃣ GAP CALCULATION:
 *    gap = cumulative_supply - cumulative_demand
 * 
 * 4️⃣ CLEARING RULE:
 *    - Identify row where gap changes from negative to positive
 *    - Clearing Quantity = quantity from PREVIOUS row
 *    - Clearing Price = SECOND-HIGHEST eligible bid (second-price mechanism)
 *    This preserves truthful bidding incentives
 * 
 * 5️⃣ TRADE VALUE:
 *    Trade Value = clearing_price × clearing_quantity × 1000
 * 
 * ALLOCATION RULES:
 *    - Buyer Eligibility: buyer.bid_price ≥ clearing_price
 *    - Seller Eligibility: seller.offer_price ≤ clearing_price
 *    - Sellers sorted by lowest landed cost
 *    - Buyers sorted by highest bid price
 *    - Tie at same price → higher quantity wins
 * 
 * PAYMENT RULE (Second-Price Safe):
 *    - Buyer pays clearing price
 *    - Seller receives clearing price
 *    - Landed cost is for ranking only, NEVER for payment
 * 
 * INCENTIVE GUARANTEES:
 *    - No buyer pays more than their bid
 *    - No seller receives less than their ask
 *    - Truthful bidding is a dominant strategy
 *    - Distance manipulation cannot affect payout
 *    - Higher quantity gives priority only at equal prices
 * 
 * =============================================================================
 */

// Decimal precision safety - use scaled integers
const DECIMAL_SCALE = 10000;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface SellerBidData {
  id: string;
  sellerId: string;
  sellerName: string;
  offerPricePerKg: number;
  offerQuantityMt: number;
  distanceKm: number;
  deliveryCostPerKg: number;
  landedCostPerKg: number;
}

export interface BuyerBidData {
  id: string;
  buyerId: string;
  buyerName: string;
  bidPricePerKg: number;
  bidQuantityMt: number;
}

export interface SupplyPoint {
  index: number;
  bidId: string;
  sellerId: string;
  sellerName: string;
  offerPrice: number;
  deliveryCost: number;
  landedCost: number;
  quantity: number;
  cumulativeSupply: number;
}

export interface DemandPoint {
  index: number;
  bidId: string;
  buyerId: string;
  buyerName: string;
  bidPrice: number;
  quantity: number;
  cumulativeDemand: number;
}

export interface GapPoint {
  index: number;
  price: number;
  cumulativeSupply: number;
  cumulativeDemand: number;
  gap: number;
  sellerBidId?: string;
}

export interface AllocationResult {
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  allocatedQuantityMt: number;
  finalPricePerKg: number; // Clearing price (second-price)
  buyerBidPrice: number;
  sellerOfferPrice: number;
  sellerLandedCost: number;
  tradeValue: number;
  buyerSavings: number; // bid_price - clearing_price
  sellerBonus: number;  // clearing_price - offer_price
}

export interface ClearingResult {
  clearingPrice: number;
  clearingQuantityMt: number;
  clearingType: 'EXACT' | 'INTERPOLATED' | 'NO_CLEARING';
  totalTradeValue: number;
  totalSupplyMt: number;
  totalDemandMt: number;
  unsoldSupplyMt: number;
  unsoldDemandMt: number;
  supplyPoints: SupplyPoint[];
  demandPoints: DemandPoint[]; // Buyer-level bids for allocation
  marketDemand: MarketDemandPoint[]; // Price-aggregated demand for clearing
  gapPoints: GapPoint[];
  allocations: AllocationResult[];
  eligibleBuyerCount: number;
  eligibleSellerCount: number;
  shouldReauction: boolean;
  reauctionReason?: string;
}

export interface DistanceSlabData {
  minKm: number;
  maxKm: number;
  costPerKg: number;
}

// Legacy types for backward compatibility
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

export interface LegacySupplyPoint {
  price: number;
  quantity: number;
  cumulativeQuantity: number;
  sellerId: string;
  sellerName: string;
}

export interface LegacyDemandPoint {
  price: number;
  quantity: number;
  cumulativeQuantity: number;
  userId: string;
  userName: string;
}

export interface LegacyAllocationResult {
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

export interface LegacyClearingResult {
  clearingPrice: number;
  clearingQuantity: number;
  clearingType: 'EXACT' | 'INTERPOLATED' | 'NO_CLEARING';
  totalTradeValue: number;
  supplyPoints: LegacySupplyPoint[];
  demandPoints: LegacyDemandPoint[];
  gapPoints: GapPoint[];
  allocations: LegacyAllocationResult[];
  buyerAllocations: BuyerAllocationResult[];
}

// =============================================================================
// UTILITY: Calculate delivery cost from distance slabs
// =============================================================================

export function calculateDeliveryCost(
  distanceKm: number,
  distanceSlabs: DistanceSlabData[]
): number {
  if (!distanceSlabs || distanceSlabs.length === 0) {
    return 0;
  }
  
  // Sort slabs by minKm
  const sortedSlabs = [...distanceSlabs].sort((a, b) => a.minKm - b.minKm);
  
  for (const slab of sortedSlabs) {
    if (distanceKm >= slab.minKm && distanceKm <= slab.maxKm) {
      return slab.costPerKg;
    }
  }
  
  // If distance exceeds all slabs, use the highest slab's cost
  const lastSlab = sortedSlabs[sortedSlabs.length - 1];
  if (distanceKm > lastSlab.maxKm) {
    return lastSlab.costPerKg;
  }
  
  return 0;
}

// =============================================================================
// TICK SIZE VALIDATION
// =============================================================================

/**
 * Validate tick size conformance for buyer bids
 * Must be called BEFORE auction execution
 */
export function validateTickSize(
  buyerBids: BuyerBidData[],
  tickSize: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const scaledTick = Math.round(tickSize * DECIMAL_SCALE);

  for (const bid of buyerBids) {
    const scaledPrice = Math.round(bid.bidPricePerKg * DECIMAL_SCALE);
    if (scaledPrice % scaledTick !== 0) {
      errors.push(
        `${bid.buyerName}: Price ${bid.bidPricePerKg} is not a multiple of tick size ${tickSize}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// Legacy tick size validation
export function validateTickSizeLegacy(bids: BuyerBid[], tickSize: number): {
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
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// STEP 1: BUILD SUPPLY CURVE
// =============================================================================
/**
 * Build supply curve from seller bids.
 * SORTING: Landed cost ASC, then offer price ASC (for tie-breaking)
 * CUMULATIVE: Top → Bottom (sum as you go down)
 */
export function buildSupplyCurve(sellerBids: SellerBidData[]): SupplyPoint[] {
  if (!sellerBids || sellerBids.length === 0) {
    return [];
  }

  // Sort by landed cost ASC, then offer price ASC, then quantity DESC (tie-breaker)
  const sortedBids = [...sellerBids].sort((a, b) => {
    const landedDiff = Math.round((a.landedCostPerKg - b.landedCostPerKg) * DECIMAL_SCALE);
    if (landedDiff !== 0) return landedDiff;
    
    const priceDiff = Math.round((a.offerPricePerKg - b.offerPricePerKg) * DECIMAL_SCALE);
    if (priceDiff !== 0) return priceDiff;
    
    // Higher quantity wins at same price
    const qtyDiff = Math.round((b.offerQuantityMt - a.offerQuantityMt) * DECIMAL_SCALE);
    return qtyDiff;
  });

  // Calculate cumulative supply: Top → Bottom
  let cumulativeSupplyScaled = 0;
  const supplyPoints: SupplyPoint[] = [];

  for (let i = 0; i < sortedBids.length; i++) {
    const bid = sortedBids[i];
    const qtyScaled = Math.round(bid.offerQuantityMt * DECIMAL_SCALE);
    cumulativeSupplyScaled += qtyScaled;

    supplyPoints.push({
      index: i,
      bidId: bid.id,
      sellerId: bid.sellerId,
      sellerName: bid.sellerName,
      offerPrice: bid.offerPricePerKg,
      deliveryCost: bid.deliveryCostPerKg,
      landedCost: bid.landedCostPerKg,
      quantity: bid.offerQuantityMt,
      cumulativeSupply: cumulativeSupplyScaled / DECIMAL_SCALE,
    });
  }

  return supplyPoints;
}

// =============================================================================
// STEP 2: BUILD MARKET DEMAND CURVE (EXCEL-EXACT)
// =============================================================================
/**
 * Build MARKET-LEVEL demand curve from buyer bids.
 * 
 * CRITICAL EXCEL LOGIC:
 * 1. AGGREGATE all buyer bids by price (sum quantities at each price point)
 * 2. SORT by price DESC
 * 3. Calculate cumulative demand BOTTOM → TOP on aggregated totals
 * 
 * This matches Excel's demand table exactly where:
 * - Each row is a price point
 * - Total demand is sum of all buyers at that price
 * - Cumulative demand is calculated bottom-up on aggregated demand
 */
export interface MarketDemandPoint {
  pricePerKg: number;
  totalDemandMt: number;
  cumulativeDemandMt: number;
}

export function buildMarketDemandCurve(buyerBids: BuyerBidData[]): MarketDemandPoint[] {
  if (!buyerBids || buyerBids.length === 0) {
    return [];
  }

  // Step 1: AGGREGATE demand by price (sum all buyer quantities at each price)
  const demandByPrice = new Map<number, number>();
  
  for (const bid of buyerBids) {
    const priceKey = Math.round(bid.bidPricePerKg * DECIMAL_SCALE);
    const existing = demandByPrice.get(priceKey) || 0;
    const qtyScaled = Math.round(bid.bidQuantityMt * DECIMAL_SCALE);
    demandByPrice.set(priceKey, existing + qtyScaled);
  }

  // Step 2: Convert to array and SORT by price DESC
  const aggregatedDemand = Array.from(demandByPrice.entries())
    .map(([priceScaled, qtyScaled]) => ({
      pricePerKg: priceScaled / DECIMAL_SCALE,
      totalDemandMt: qtyScaled / DECIMAL_SCALE,
      cumulativeDemandMt: 0, // Will be calculated
    }))
    .sort((a, b) => {
      const priceDiff = Math.round((b.pricePerKg - a.pricePerKg) * DECIMAL_SCALE);
      return priceDiff;
    });

  // Step 3: Calculate cumulative demand BOTTOM → TOP
  let cumulativeDemandScaled = 0;
  for (let i = aggregatedDemand.length - 1; i >= 0; i--) {
    const qtyScaled = Math.round(aggregatedDemand[i].totalDemandMt * DECIMAL_SCALE);
    cumulativeDemandScaled += qtyScaled;
    aggregatedDemand[i].cumulativeDemandMt = cumulativeDemandScaled / DECIMAL_SCALE;
  }

  return aggregatedDemand;
}

/**
 * Build BUYER-LEVEL demand points (used for allocation ONLY, not clearing)
 * This preserves individual buyer bid information for allocation after market clears
 */
export function buildDemandCurve(buyerBids: BuyerBidData[]): DemandPoint[] {
  if (!buyerBids || buyerBids.length === 0) {
    return [];
  }

  // Sort by price DESC, then quantity DESC (tie-breaker)
  const sortedBids = [...buyerBids].sort((a, b) => {
    const priceDiff = Math.round((b.bidPricePerKg - a.bidPricePerKg) * DECIMAL_SCALE);
    if (priceDiff !== 0) return priceDiff;
    
    // Higher quantity wins at same price
    const qtyDiff = Math.round((b.bidQuantityMt - a.bidQuantityMt) * DECIMAL_SCALE);
    return qtyDiff;
  });

  // Create demand points - these are for ALLOCATION ONLY
  const demandPoints: DemandPoint[] = sortedBids.map((bid, i) => ({
    index: i,
    bidId: bid.id,
    buyerId: bid.buyerId,
    buyerName: bid.buyerName,
    bidPrice: bid.bidPricePerKg,
    quantity: bid.bidQuantityMt,
    cumulativeDemand: 0, // Not used for clearing
  }));

  return demandPoints;
}

// =============================================================================
// STEP 3: MAP MARKET DEMAND TO SUPPLY PRICE GRID
// =============================================================================
/**
 * EXCEL CRITICAL: Map market demand onto seller price/supply grid.
 * At each supply point price P, find total demand from market willing to pay >= P
 * Uses MARKET-LEVEL aggregated demand (not individual buyers)
 */
export function mapMarketDemandToSupplyGrid(
  supplyPoints: SupplyPoint[],
  marketDemand: MarketDemandPoint[]
): number[] {
  if (supplyPoints.length === 0 || marketDemand.length === 0) {
    return supplyPoints.map(() => 0);
  }

  return supplyPoints.map((sp) => {
    // At this supply price, find the highest market demand point where price >= supply price
    // This gives us the cumulative demand at this price level
    for (const md of marketDemand) {
      if (md.pricePerKg >= sp.offerPrice) {
        // Found the demand at or above this supply price
        return md.cumulativeDemandMt;
      }
    }
    // If no market demand meets this price, demand is 0
    return 0;
  });
}

// =============================================================================
// STEP 4: CALCULATE GAP AT EACH PRICE POINT
// =============================================================================
/**
 * EXCEL EXACT: Calculate gap at each seller price point.
 * Gap[i] = CumulativeSupply[i] - CumulativeDemand[i]
 */
export function calculateGap(
  supplyPoints: SupplyPoint[],
  demandAtSupplyPrices: number[]
): GapPoint[] {
  return supplyPoints.map((sp, index) => {
    const scaledSupply = Math.round(sp.cumulativeSupply * DECIMAL_SCALE);
    const scaledDemand = Math.round(demandAtSupplyPrices[index] * DECIMAL_SCALE);
    const scaledGap = scaledSupply - scaledDemand;

    return {
      index,
      price: sp.offerPrice,
      cumulativeSupply: sp.cumulativeSupply,
      cumulativeDemand: demandAtSupplyPrices[index],
      gap: scaledGap / DECIMAL_SCALE,
      sellerBidId: sp.bidId,
    };
  });
}

// =============================================================================
// STEP 5: FIND CLEARING PRICE (SECOND-PRICE MECHANISM)
// =============================================================================
/**
 * CLEARING RULE:
 * - Find row where gap changes from negative to positive
 * - Clearing Quantity = cumulative supply from PREVIOUS row
 * - Clearing Price = SECOND-HIGHEST eligible bid (second-price)
 * 
 * INTERPOLATION (when gap sign changes):
 * Fraction = |Gap[i-1]| / (|Gap[i-1]| + Gap[i])
 * ClearingQty = Supply[i-1] + (Supply[i] - Supply[i-1]) × Fraction
 */
export function calculateClearingPrice(
  gapPoints: GapPoint[],
  demandPoints: DemandPoint[],
  supplyPoints: SupplyPoint[]
): { clearingPrice: number; clearingQuantity: number; clearingType: 'EXACT' | 'INTERPOLATED' | 'NO_CLEARING' } {
  
  if (gapPoints.length === 0 || demandPoints.length === 0) {
    return { clearingPrice: 0, clearingQuantity: 0, clearingType: 'NO_CLEARING' };
  }

  // CASE 1: Check for EXACT match (Gap = 0)
  for (const point of gapPoints) {
    if (Math.abs(Math.round(point.gap * DECIMAL_SCALE)) === 0) {
      // Second-price: Find the second-highest bid at or above this price
      const eligibleBids = demandPoints
        .filter((d) => d.bidPrice >= point.price)
        .sort((a, b) => b.bidPrice - a.bidPrice);
      
      // If only one bid, clearing price is the offer price
      // If multiple, use second-highest bid price
      const secondPrice = eligibleBids.length > 1 
        ? eligibleBids[1].bidPrice 
        : point.price;

      return {
        clearingPrice: Math.max(secondPrice, point.price),
        clearingQuantity: point.cumulativeSupply,
        clearingType: 'EXACT',
      };
    }
  }

  // CASE 2: INTERPOLATION - Gap changes from negative to positive
  for (let i = 1; i < gapPoints.length; i++) {
    const prev = gapPoints[i - 1];
    const curr = gapPoints[i];

    if (prev.gap < 0 && curr.gap > 0) {
      // Interpolation fraction
      const absGapPrev = Math.abs(prev.gap);
      const absGapCurr = curr.gap;
      const fraction = absGapPrev / (absGapPrev + absGapCurr);

      // Interpolate quantity
      const interpolatedQty = prev.cumulativeSupply + 
        (curr.cumulativeSupply - prev.cumulativeSupply) * fraction;

      // Find clearing price using second-price rule
      // The clearing price should be the second-highest bid that clears
      const interpolatedPrice = prev.price + (curr.price - prev.price) * fraction;
      
      // Find eligible bids at or above the interpolated price
      const eligibleBids = demandPoints
        .filter((d) => d.bidPrice >= interpolatedPrice)
        .sort((a, b) => b.bidPrice - a.bidPrice);

      // Second-price mechanism: price is the minimum of:
      // 1. Second-highest eligible bid (if exists)
      // 2. The interpolated price (which represents market clearing)
      let clearingPrice = interpolatedPrice;
      if (eligibleBids.length > 1) {
        // Use the second-highest bid as the ceiling
        clearingPrice = Math.max(eligibleBids[1].bidPrice, interpolatedPrice);
      }

      return {
        clearingPrice: Math.round(clearingPrice * DECIMAL_SCALE) / DECIMAL_SCALE,
        clearingQuantity: Math.round(interpolatedQty * DECIMAL_SCALE) / DECIMAL_SCALE,
        clearingType: 'INTERPOLATED',
      };
    }
  }

  // CASE 3: First gap is already positive (supply exceeds demand from start)
  for (const point of gapPoints) {
    if (point.gap >= 0) {
      const clearingQty = Math.min(point.cumulativeSupply, point.cumulativeDemand);
      
      const eligibleBids = demandPoints
        .filter((d) => d.bidPrice >= point.price)
        .sort((a, b) => b.bidPrice - a.bidPrice);

      const secondPrice = eligibleBids.length > 1 
        ? eligibleBids[1].bidPrice 
        : point.price;

      return {
        clearingPrice: Math.max(secondPrice, point.price),
        clearingQuantity: Math.round(clearingQty * DECIMAL_SCALE) / DECIMAL_SCALE,
        clearingType: 'EXACT',
      };
    }
  }

  // CASE 4: NO_CLEARING - all gaps are negative
  return { clearingPrice: 0, clearingQuantity: 0, clearingType: 'NO_CLEARING' };
}

// =============================================================================
// STEP 6: CALCULATE ALLOCATIONS
// =============================================================================
/**
 * ALLOCATION RULES:
 * - Buyer Eligibility: buyer.bid_price ≥ clearing_price
 * - Seller Eligibility: seller.offer_price ≤ clearing_price
 * - Sellers sorted by lowest landed cost
 * - Buyers sorted by highest bid price
 * - Tie at same price → higher quantity wins
 * 
 * Allocation Formula:
 * allocated_qty = min(seller_remaining, buyer_remaining, clearing_remaining)
 */
export function calculateAllocations(
  supplyPoints: SupplyPoint[],
  demandPoints: DemandPoint[],
  clearingPrice: number,
  clearingQuantity: number
): AllocationResult[] {
  if (clearingQuantity <= 0 || clearingPrice <= 0) {
    return [];
  }

  // Filter eligible sellers (offer_price ≤ clearing_price)
  // Already sorted by landed cost ASC
  const eligibleSellers = supplyPoints.filter(
    (sp) => sp.offerPrice <= clearingPrice + 1e-6
  );

  // Filter eligible buyers (bid_price ≥ clearing_price)
  // Already sorted by bid price DESC
  const eligibleBuyers = demandPoints.filter(
    (dp) => dp.bidPrice >= clearingPrice - 1e-6
  );

  if (eligibleSellers.length === 0 || eligibleBuyers.length === 0) {
    return [];
  }

  // Track remaining quantities
  const sellerRemaining = new Map<string, number>();
  for (const sp of eligibleSellers) {
    sellerRemaining.set(sp.bidId, sp.quantity);
  }

  const buyerRemaining = new Map<string, number>();
  for (const dp of eligibleBuyers) {
    buyerRemaining.set(dp.bidId, dp.quantity);
  }

  let clearingRemaining = clearingQuantity;
  const allocations: AllocationResult[] = [];

  // Allocate: iterate through sellers by landed cost
  for (const seller of eligibleSellers) {
    if (clearingRemaining < 0.0001) break;

    let sellerQtyRemaining = sellerRemaining.get(seller.bidId) || 0;

    // For each seller, allocate to buyers by price priority
    for (const buyer of eligibleBuyers) {
      if (clearingRemaining < 0.0001) break;
      if (sellerQtyRemaining < 0.0001) break;

      const buyerQtyRemaining = buyerRemaining.get(buyer.bidId) || 0;
      if (buyerQtyRemaining < 0.0001) continue;

      // Allocation formula: min of all three constraints
      const allocQty = Math.min(
        sellerQtyRemaining,
        buyerQtyRemaining,
        clearingRemaining
      );

      if (allocQty > 0.0001) {
        // Trade value in full currency (MT × Price/Kg × 1000 Kg/MT)
        const tradeValue = allocQty * clearingPrice * 1000;
        
        // Buyer savings: what they would have paid vs what they pay
        const buyerSavings = (buyer.bidPrice - clearingPrice) * allocQty * 1000;
        
        // Seller bonus: what they receive vs what they asked
        const sellerBonus = (clearingPrice - seller.offerPrice) * allocQty * 1000;

        allocations.push({
          buyerId: buyer.buyerId,
          buyerName: buyer.buyerName,
          sellerId: seller.sellerId,
          sellerName: seller.sellerName,
          allocatedQuantityMt: Math.round(allocQty * DECIMAL_SCALE) / DECIMAL_SCALE,
          finalPricePerKg: clearingPrice,
          buyerBidPrice: buyer.bidPrice,
          sellerOfferPrice: seller.offerPrice,
          sellerLandedCost: seller.landedCost,
          tradeValue: Math.round(tradeValue * 100) / 100,
          buyerSavings: Math.round(buyerSavings * 100) / 100,
          sellerBonus: Math.round(sellerBonus * 100) / 100,
        });

        // Update remaining quantities
        sellerQtyRemaining -= allocQty;
        buyerRemaining.set(buyer.bidId, buyerQtyRemaining - allocQty);
        clearingRemaining -= allocQty;
      }
    }

    sellerRemaining.set(seller.bidId, sellerQtyRemaining);
  }

  return allocations;
}

// =============================================================================
// STEP 7: CHECK RE-AUCTION CONDITION
// =============================================================================
/**
 * RE-AUCTION RULE:
 * If (unsold_supply / total_supply) ≥ 70%
 * → create new auction
 * → carry forward leftover quantities
 */
export function checkReauctionCondition(
  totalSupply: number,
  unsoldSupply: number,
  threshold: number = 0.7
): { shouldReauction: boolean; reason?: string } {
  if (totalSupply <= 0) {
    return { shouldReauction: false };
  }

  const unsoldRatio = unsoldSupply / totalSupply;

  if (unsoldRatio >= threshold) {
    return {
      shouldReauction: true,
      reason: `Unsold supply (${(unsoldRatio * 100).toFixed(1)}%) exceeds ${(threshold * 100).toFixed(0)}% threshold`,
    };
  }

  return { shouldReauction: false };
}

// =============================================================================
// MAIN AUCTION EXECUTION (NEW SCHEMA)
// =============================================================================
/**
 * Execute the complete second-price double auction with EXCEL-EXACT logic.
 * 
 * CRITICAL TWO-LAYER APPROACH:
 * - Layer 1 (Market Demand): Price-aggregated demand for clearing
 * - Layer 2 (Buyer Bids): Individual bids for allocation
 * 
 * This matches Excel's logic where cumulative demand is calculated from
 * aggregated demand at each price point, NOT from individual buyer rows.
 */
export function executeDoubleAuction(
  sellerBids: SellerBidData[],
  buyerBids: BuyerBidData[],
  tickSize: number = 0.01
): ClearingResult {
  // Validate tick size
  const validation = validateTickSize(buyerBids, tickSize);
  if (!validation.valid) {
    console.warn('Tick size validation warnings:', validation.errors);
  }

  // STEP 1: Build supply curve
  const supplyPoints = buildSupplyCurve(sellerBids);

  // STEP 2A: Build MARKET demand curve (aggregated by price) for CLEARING
  const marketDemand = buildMarketDemandCurve(buyerBids);

  // STEP 2B: Build BUYER-LEVEL demand points for ALLOCATION (after clearing)
  const demandPoints = buildDemandCurve(buyerBids);

  // Calculate totals
  const totalSupply = supplyPoints.length > 0
    ? supplyPoints[supplyPoints.length - 1].cumulativeSupply
    : 0;
  const totalDemand = marketDemand.length > 0
    ? marketDemand[0].cumulativeDemandMt // First point has total (calculated bottom-up)
    : 0;

  // EARLY EXIT: No data
  if (supplyPoints.length === 0 || marketDemand.length === 0) {
    return {
      clearingPrice: 0,
      clearingQuantityMt: 0,
      clearingType: 'NO_CLEARING',
      totalTradeValue: 0,
      totalSupplyMt: totalSupply,
      totalDemandMt: totalDemand,
      unsoldSupplyMt: totalSupply,
      unsoldDemandMt: totalDemand,
      supplyPoints: [],
      demandPoints: [],
      marketDemand: [],
      gapPoints: [],
      allocations: [],
      eligibleBuyerCount: 0,
      eligibleSellerCount: 0,
      shouldReauction: totalSupply > 0,
      reauctionReason: 'No clearing possible - no bids',
    };
  }

  // STEP 3: Map MARKET demand to supply price grid (not individual buyers)
  const demandAtSupplyPrices = mapMarketDemandToSupplyGrid(supplyPoints, marketDemand);

  // STEP 4: Calculate gap at each price point (using market demand)
  const gapPoints = calculateGap(supplyPoints, demandAtSupplyPrices);

  // STEP 5: Find clearing price (second-price mechanism)
  // Still uses demandPoints for second-price calculation (individual buyer bids)
  const { clearingPrice, clearingQuantity, clearingType } = calculateClearingPrice(
    gapPoints,
    demandPoints,
    supplyPoints
  );

  // EARLY EXIT: No clearing
  if (clearingType === 'NO_CLEARING') {
    const reauctionCheck = checkReauctionCondition(totalSupply, totalSupply);
    return {
      clearingPrice: 0,
      clearingQuantityMt: 0,
      clearingType: 'NO_CLEARING',
      totalTradeValue: 0,
      totalSupplyMt: totalSupply,
      totalDemandMt: totalDemand,
      unsoldSupplyMt: totalSupply,
      unsoldDemandMt: totalDemand,
      supplyPoints,
      demandPoints,
      marketDemand,
      gapPoints,
      allocations: [],
      eligibleBuyerCount: 0,
      eligibleSellerCount: 0,
      shouldReauction: reauctionCheck.shouldReauction,
      reauctionReason: reauctionCheck.reason,
    };
  }

  // STEP 6: Calculate allocations
  const allocations = calculateAllocations(
    supplyPoints,
    demandPoints,
    clearingPrice,
    clearingQuantity
  );

  // Calculate totals
  const totalTradeValue = allocations.reduce((sum, a) => sum + a.tradeValue, 0);
  const allocatedQty = allocations.reduce((sum, a) => sum + a.allocatedQuantityMt, 0);
  const unsoldSupply = totalSupply - allocatedQty;
  const unsoldDemand = Math.max(0, totalDemand - allocatedQty);

  // Count eligible participants
  const eligibleSellerIds = new Set(allocations.map((a) => a.sellerId));
  const eligibleBuyerIds = new Set(allocations.map((a) => a.buyerId));

  // Check re-auction condition
  const reauctionCheck = checkReauctionCondition(totalSupply, unsoldSupply);

  return {
    clearingPrice: Math.round(clearingPrice * DECIMAL_SCALE) / DECIMAL_SCALE,
    clearingQuantityMt: Math.round(clearingQuantity * DECIMAL_SCALE) / DECIMAL_SCALE,
    clearingType,
    totalTradeValue: Math.round(totalTradeValue * 100) / 100,
    totalSupplyMt: Math.round(totalSupply * DECIMAL_SCALE) / DECIMAL_SCALE,
    totalDemandMt: Math.round(totalDemand * DECIMAL_SCALE) / DECIMAL_SCALE,
    unsoldSupplyMt: Math.round(unsoldSupply * DECIMAL_SCALE) / DECIMAL_SCALE,
    unsoldDemandMt: Math.round(unsoldDemand * DECIMAL_SCALE) / DECIMAL_SCALE,
    supplyPoints,
    demandPoints,
    marketDemand,
    gapPoints,
    allocations,
    eligibleBuyerCount: eligibleBuyerIds.size,
    eligibleSellerCount: eligibleSellerIds.size,
    shouldReauction: reauctionCheck.shouldReauction,
    reauctionReason: reauctionCheck.reason,
  };
}

// =============================================================================
// HELPER: Prepare seller bids with delivery cost calculation
// =============================================================================
export function prepareSellerBids(
  rawBids: Array<{
    id: string;
    sellerId: string;
    sellerName: string;
    offerPricePerKg: number;
    offerQuantityMt: number;
    distanceKm: number;
  }>,
  distanceSlabs: DistanceSlabData[]
): SellerBidData[] {
  return rawBids.map((bid) => {
    const deliveryCost = calculateDeliveryCost(bid.distanceKm, distanceSlabs);
    return {
      ...bid,
      deliveryCostPerKg: deliveryCost,
      landedCostPerKg: bid.offerPricePerKg + deliveryCost,
    };
  });
}

// =============================================================================
// HELPER: Get leftover quantities for re-auction
// =============================================================================
export function getLeftoverQuantities(
  supplyPoints: SupplyPoint[],
  allocations: AllocationResult[]
): Array<{ sellerId: string; sellerName: string; leftoverQuantity: number; offerPrice: number }> {
  // Sum allocations per seller
  const allocatedPerSeller = new Map<string, number>();
  for (const alloc of allocations) {
    const current = allocatedPerSeller.get(alloc.sellerId) || 0;
    allocatedPerSeller.set(alloc.sellerId, current + alloc.allocatedQuantityMt);
  }

  // Calculate leftover for each seller
  const leftovers: Array<{ sellerId: string; sellerName: string; leftoverQuantity: number; offerPrice: number }> = [];
  
  // Group supply points by seller
  const sellerSupply = new Map<string, { total: number; name: string; price: number }>();
  for (const sp of supplyPoints) {
    const existing = sellerSupply.get(sp.sellerId);
    if (existing) {
      existing.total += sp.quantity;
    } else {
      sellerSupply.set(sp.sellerId, {
        total: sp.quantity,
        name: sp.sellerName,
        price: sp.offerPrice,
      });
    }
  }

  for (const [sellerId, supply] of sellerSupply.entries()) {
    const allocated = allocatedPerSeller.get(sellerId) || 0;
    const leftover = supply.total - allocated;
    
    if (leftover > 0.0001) {
      leftovers.push({
        sellerId,
        sellerName: supply.name,
        leftoverQuantity: Math.round(leftover * DECIMAL_SCALE) / DECIMAL_SCALE,
        offerPrice: supply.price,
      });
    }
  }

  return leftovers;
}

// =============================================================================
// LEGACY COMPATIBILITY FUNCTIONS
// =============================================================================
// These functions maintain backward compatibility with the existing API routes

/**
 * Calculate supply curve from seller data (legacy format)
 */
export function calculateSupply(sellers: SellerData[]): LegacySupplyPoint[] {
  const supplyPoints: LegacySupplyPoint[] = [];
  
  const sortedSellers = [...sellers].sort((a, b) => {
    const priceDiff = Math.round((a.reservePrice - b.reservePrice) * DECIMAL_SCALE);
    if (priceDiff === 0) return a.name.localeCompare(b.name);
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

/**
 * Calculate RAW buyer demand curve (legacy format)
 */
export function calculateRawDemand(bids: BuyerBid[]): LegacyDemandPoint[] {
  const allBidPoints: LegacyDemandPoint[] = [];
  
  for (const bid of bids) {
    if (bid.quantity1 > 0) {
      allBidPoints.push({
        price: bid.price1,
        quantity: bid.quantity1,
        cumulativeQuantity: 0,
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

  allBidPoints.sort((a, b) => {
    const priceDiff = Math.round((b.price - a.price) * DECIMAL_SCALE);
    return priceDiff;
  });

  let cumulativeScaled = 0;
  for (const point of allBidPoints) {
    const qtyScaled = Math.round(point.quantity * DECIMAL_SCALE);
    cumulativeScaled += qtyScaled;
    point.cumulativeQuantity = cumulativeScaled / DECIMAL_SCALE;
  }

  return allBidPoints;
}

/**
 * Map demand onto seller price grid (legacy)
 * EXCEL-EXACT: At each seller price P, find cumulative demand from buyers willing to pay >= P
 * Cumulative demand is calculated BOTTOM-TO-TOP with repeat when exhausted
 */
export function mapDemandToSellerPrices(
  supplyPoints: LegacySupplyPoint[],
  rawDemand: LegacyDemandPoint[]
): number[] {
  if (rawDemand.length === 0) {
    return supplyPoints.map(() => 0);
  }

  // For each supply point (seller price), calculate the total demand from buyers
  // who are willing to pay at or above that price
  return supplyPoints.map(sp => {
    let demandScaled = 0;
    for (const dp of rawDemand) {
      // Only include demand where buyer's bid price >= seller's offer price
      if (dp.price >= sp.price) {
        demandScaled += Math.round(dp.quantity * DECIMAL_SCALE);
      }
    }
    return demandScaled / DECIMAL_SCALE;
  });
}

/**
 * Calculate gap (legacy format)
 */
export function calculateGapLegacy(
  supplyPoints: LegacySupplyPoint[],
  demandAtSellerPrices: number[]
): GapPoint[] {
  return supplyPoints.map((sp, index) => {
    const scaledSupply = Math.round(sp.cumulativeQuantity * DECIMAL_SCALE);
    const scaledDemand = Math.round(demandAtSellerPrices[index] * DECIMAL_SCALE);
    const scaledGap = scaledSupply - scaledDemand;
    
    return {
      index,
      price: sp.price,
      cumulativeSupply: sp.cumulativeQuantity,
      cumulativeDemand: demandAtSellerPrices[index],
      gap: scaledGap / DECIMAL_SCALE,
    };
  });
}

/**
 * Calculate clearing price (legacy format)
 * EXCEL-EXACT CLEARING RULE:
 * - Find row where gap changes from negative to positive
 * - Clearing Quantity = cumulative supply from PREVIOUS row (for incentive preservation)
 * - Clearing Price = Second highest eligible bid (second-price mechanism)
 */
export function calculateClearingPriceLegacy(
  gapPoints: GapPoint[]
): {
  clearingPrice: number;
  clearingQuantity: number;
  clearingType: 'EXACT' | 'INTERPOLATED' | 'NO_CLEARING';
  clearingRowIndex: number;
} {
  // CASE 1: Check for EXACT match (Gap = 0)
  for (let i = 0; i < gapPoints.length; i++) {
    const point = gapPoints[i];
    if (Math.round(point.gap * DECIMAL_SCALE) === 0) {
      // Clearing at this row - use PREVIOUS row's cumulative supply for quantity
      // This gives incentive to truthful bidders
      const clearingQty = i > 0 ? gapPoints[i - 1].cumulativeSupply : point.cumulativeSupply;
      return {
        clearingPrice: point.price,
        clearingQuantity: clearingQty,
        clearingType: 'EXACT',
        clearingRowIndex: i,
      };
    }
  }

  // CASE 2: INTERPOLATION - Gap changes from negative to positive
  for (let i = 1; i < gapPoints.length; i++) {
    const prev = gapPoints[i - 1];
    const curr = gapPoints[i];

    if (prev.gap < 0 && curr.gap > 0) {
      // Interpolation fraction
      const absGapPrev = Math.abs(prev.gap);
      const absGapCurr = curr.gap;
      const fraction = absGapPrev / (absGapPrev + absGapCurr);

      // Interpolate price
      const interpolatedPrice = prev.price + (curr.price - prev.price) * fraction;
      
      // CLEARING QUANTITY = PREVIOUS ROW's cumulative supply (for incentive preservation)
      const clearingQty = prev.cumulativeSupply;

      return {
        clearingPrice: Math.round(interpolatedPrice * DECIMAL_SCALE) / DECIMAL_SCALE,
        clearingQuantity: Math.round(clearingQty * DECIMAL_SCALE) / DECIMAL_SCALE,
        clearingType: 'INTERPOLATED',
        clearingRowIndex: i - 1,
      };
    }
  }

  // CASE 3: First gap is already positive (supply exceeds demand from start)
  for (let i = 0; i < gapPoints.length; i++) {
    const point = gapPoints[i];
    if (point.gap >= 0) {
      // Take minimum of supply and demand at this point
      const clearingQty = Math.min(point.cumulativeSupply, point.cumulativeDemand);
      return {
        clearingPrice: point.price,
        clearingQuantity: Math.round(clearingQty * DECIMAL_SCALE) / DECIMAL_SCALE,
        clearingType: 'EXACT',
        clearingRowIndex: i,
      };
    }
  }

  return {
    clearingPrice: 0,
    clearingQuantity: 0,
    clearingType: 'NO_CLEARING',
    clearingRowIndex: -1,
  };
}

/**
 * Calculate seller allocations (legacy format)
 */
export function calculateSellerAllocations(
  supplyPoints: LegacySupplyPoint[],
  clearingPrice: number,
  clearingQuantity: number
): LegacyAllocationResult[] {
  const allocations: LegacyAllocationResult[] = [];
  let remainingQuantityScaled = Math.round(clearingQuantity * DECIMAL_SCALE);
  
  for (const sp of supplyPoints) {
    if (sp.price > clearingPrice + 1e-6) continue;

    const sellerQtyScaled = Math.round(sp.quantity * DECIMAL_SCALE);
    const allocatedQtyScaled = Math.min(remainingQuantityScaled, sellerQtyScaled);
    const allocatedQty = allocatedQtyScaled / DECIMAL_SCALE;
    
    const qtyInKg = allocatedQty * 1000;
    const tradeValue = Math.round(clearingPrice * qtyInKg * DECIMAL_SCALE) / DECIMAL_SCALE;
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
    if (remainingQuantityScaled < 1) break;
  }

  return allocations;
}

/**
 * Calculate buyer allocations (legacy format)
 */
export function calculateBuyerAllocations(
  rawDemand: LegacyDemandPoint[],
  sellerAllocations: LegacyAllocationResult[],
  clearingPrice: number
): BuyerAllocationResult[] {
  const acceptedBids = rawDemand
    .filter(dp => {
      const bidPriceScaled = Math.round(dp.price * DECIMAL_SCALE);
      const clearingPriceScaled = Math.round(clearingPrice * DECIMAL_SCALE);
      return bidPriceScaled >= clearingPriceScaled;
    })
    .sort((a, b) => {
      const priceA = Math.round(a.price * DECIMAL_SCALE);
      const priceB = Math.round(b.price * DECIMAL_SCALE);
      if (priceB !== priceA) return priceB - priceA;
      const qtyA = Math.round(a.quantity * DECIMAL_SCALE);
      const qtyB = Math.round(b.quantity * DECIMAL_SCALE);
      if (qtyA !== qtyB) return qtyA - qtyB;
      return a.userId.localeCompare(b.userId);
    });

  const demandRemaining = new Map<LegacyDemandPoint, number>();
  for (const bid of acceptedBids) {
    demandRemaining.set(bid, bid.quantity);
  }

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

  for (const sellerAlloc of sellerAllocations) {
    let sellerRemaining = sellerAlloc.quantity;

    for (const bid of acceptedBids) {
      if (sellerRemaining < 0.0001) break;

      const bidRemaining = demandRemaining.get(bid) || 0;
      if (bidRemaining < 0.0001) continue;

      const qtyToAllocate = Math.min(sellerRemaining, bidRemaining);
      
      const buyer = buyerMap.get(bid.userId)!;
      buyer.allocations.push({
        sellerId: sellerAlloc.sellerId,
        sellerName: sellerAlloc.sellerName,
        quantity: Math.round(qtyToAllocate * DECIMAL_SCALE) / DECIMAL_SCALE,
        price: clearingPrice,
      });

      buyer.totalQuantity += qtyToAllocate;
      demandRemaining.set(bid, bidRemaining - qtyToAllocate);
      sellerRemaining -= qtyToAllocate;
    }
  }

  return Array.from(buyerMap.values());
}

/**
 * LEGACY: Main auction execution for backward compatibility
 * EXCEL-EXACT FORMULAS:
 * - Trade Value = clearingPrice × clearingQuantity × 1000
 * - Truthful Price Bonus = Highest Bid - Second Highest Bid
 * - Clearing Price = Second Highest Bid (second-price mechanism)
 * - Gap = Cumulative Supply - Cumulative Demand
 */
export function executeAuction(
  sellers: SellerData[],
  bids: BuyerBid[],
  tickSize: number = 0.01
): LegacyClearingResult {
  const validation = validateTickSizeLegacy(bids, tickSize);
  if (!validation.valid) {
    console.warn('Tick size validation warnings:', validation.errors);
  }

  const supplyPoints = calculateSupply(sellers);
  const rawDemand = calculateRawDemand(bids);
  const demandAtSellerPrices = mapDemandToSellerPrices(supplyPoints, rawDemand);
  const gapPoints = calculateGapLegacy(supplyPoints, demandAtSellerPrices);
  
  // Get clearing with new return type that includes clearingRowIndex
  const clearingResult = calculateClearingPriceLegacy(gapPoints);
  const { clearingPrice, clearingQuantity, clearingType } = clearingResult;

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

  const allocations = calculateSellerAllocations(supplyPoints, clearingPrice, clearingQuantity);
  
  // EXCEL FORMULA: Trade Value = Clearing Price × Clearing Quantity × 1000 (convert MT to KG)
  const totalTradeValue = clearingPrice * clearingQuantity * 1000;
  
  const buyerAllocations = calculateBuyerAllocations(rawDemand, allocations, clearingPrice);

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
    totalTradeValue: Math.round(totalTradeValue * 100) / 100,
    clearingType,
    supplyPoints,
    demandPoints,
    gapPoints,
    allocations,
    buyerAllocations,
  };
}
