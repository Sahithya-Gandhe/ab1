'use client';

import { useState, useEffect } from 'react';

interface BiddingScreenProps {
  userId: string;
}

// Distance slabs with their delivery costs (₹/kg)
const DISTANCE_SLABS = [
  { id: 'slab1', min: 0, max: 100, label: '0-100 km', deliveryCost: 0.50 },
  { id: 'slab2', min: 100, max: 200, label: '100-200 km', deliveryCost: 1.70 },
  { id: 'slab3', min: 200, max: 300, label: '200-300 km', deliveryCost: 1.00 },
  { id: 'slab4', min: 300, max: 400, label: '300-400 km', deliveryCost: 1.50 },
];

interface BidInput {
  price: string;
  quantity: string;
}

interface SlabBids {
  slab: typeof DISTANCE_SLABS[0];
  bids: [BidInput, BidInput, BidInput];
}

export default function BiddingScreen({ userId }: BiddingScreenProps) {
  const [sellers, setSellers] = useState<any[]>([]);
  const [auctionData, setAuctionData] = useState<any>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [existingBids, setExistingBids] = useState<any[]>([]);
  
  // Initialize bids state for all 4 slabs × 3 bids
  const [slabBids, setSlabBids] = useState<SlabBids[]>(
    DISTANCE_SLABS.map(slab => ({
      slab,
      bids: [
        { price: '', quantity: '' },
        { price: '', quantity: '' },
        { price: '', quantity: '' },
      ],
    }))
  );
  
  // Track which slabs are expanded
  const [expandedSlabs, setExpandedSlabs] = useState<Set<string>>(new Set(['slab1']));
  
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, [userId]);

  useEffect(() => {
    if (auctionData?.endTime) {
      const timer = setInterval(() => {
        const now = new Date().getTime();
        const end = new Date(auctionData.endTime).getTime();
        const diff = end - now;

        if (diff <= 0) {
          setTimeRemaining('Auction Ended');
          clearInterval(timer);
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [auctionData]);

  const fetchData = async () => {
    try {
      const [sellersRes, auctionRes, bidRes] = await Promise.all([
        fetch('/api/sellers'),
        fetch('/api/auction/config'),
        fetch(`/api/bids/my-bid?userId=${userId}`),
      ]);

      const [sellersData, auctionData, bidData] = await Promise.all([
        sellersRes.json(),
        auctionRes.json(),
        bidRes.json(),
      ]);

      setSellers(Array.isArray(sellersData) ? sellersData : []);
      setAuctionData(auctionData);
      
      // Load existing bids into the form
      if (bidData && Array.isArray(bidData.bids)) {
        setExistingBids(bidData.bids);
        loadExistingBids(bidData.bids);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setSellers([]);
    }
  };

  const loadExistingBids = (bids: any[]) => {
    // Group bids by distance slab
    const bidsBySlabIndex: { [key: number]: BidInput[] } = {};
    
    bids.forEach(bid => {
      const slabIndex = DISTANCE_SLABS.findIndex(
        s => s.id === bid.distanceSlabId
      );
      if (slabIndex >= 0) {
        if (!bidsBySlabIndex[slabIndex]) bidsBySlabIndex[slabIndex] = [];
        bidsBySlabIndex[slabIndex].push({
          price: String(bid.price),
          quantity: String(bid.quantity),
        });
      }
    });

    // Update state
    setSlabBids(prev => prev.map((slabBid, idx) => {
      const existingForSlab = bidsBySlabIndex[idx] || [];
      return {
        ...slabBid,
        bids: [
          existingForSlab[0] || { price: '', quantity: '' },
          existingForSlab[1] || { price: '', quantity: '' },
          existingForSlab[2] || { price: '', quantity: '' },
        ],
      };
    }));
    
    // Expand slabs that have bids
    const slabsWithBids = new Set<string>();
    Object.keys(bidsBySlabIndex).forEach(idx => {
      slabsWithBids.add(DISTANCE_SLABS[Number(idx)].id);
    });
    if (slabsWithBids.size > 0) {
      setExpandedSlabs(slabsWithBids);
    }
  };

  const toggleSlab = (slabId: string) => {
    setExpandedSlabs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(slabId)) {
        newSet.delete(slabId);
      } else {
        newSet.add(slabId);
      }
      return newSet;
    });
  };

  const updateBid = (slabIndex: number, bidIndex: number, field: 'price' | 'quantity', value: string) => {
    setSlabBids(prev => {
      const newBids = [...prev];
      newBids[slabIndex] = {
        ...newBids[slabIndex],
        bids: newBids[slabIndex].bids.map((bid, idx) => 
          idx === bidIndex ? { ...bid, [field]: value } : bid
        ) as [BidInput, BidInput, BidInput],
      };
      return newBids;
    });
  };

  const correctToTick = (value: string, tickSize: number): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    const corrected = Math.round(num / tickSize) * tickSize;
    return corrected.toFixed(2);
  };

  const handlePriceBlur = (slabIndex: number, bidIndex: number, value: string) => {
    if (value && auctionData?.tickSize) {
      const corrected = correctToTick(value, auctionData.tickSize);
      updateBid(slabIndex, bidIndex, 'price', corrected);
    }
  };

  const getBidCount = () => {
    let count = 0;
    slabBids.forEach(slabBid => {
      slabBid.bids.forEach(bid => {
        if (bid.price && bid.quantity && parseFloat(bid.quantity) > 0) {
          count++;
        }
      });
    });
    return count;
  };

  const validateBids = (): boolean => {
    const bidCount = getBidCount();
    
    if (bidCount === 0) {
      setMessage({ type: 'error', text: 'Please enter at least one bid (price and quantity)' });
      return false;
    }

    // Validate each bid has both price and quantity
    for (const slabBid of slabBids) {
      for (const [idx, bid] of slabBid.bids.entries()) {
        if (bid.price && (!bid.quantity || parseFloat(bid.quantity) <= 0)) {
          setMessage({ 
            type: 'error', 
            text: `${slabBid.slab.label} - Bid #${idx + 1}: If price is provided, quantity must be greater than 0` 
          });
          return false;
        }
        if (bid.quantity && parseFloat(bid.quantity) > 0 && !bid.price) {
          setMessage({ 
            type: 'error', 
            text: `${slabBid.slab.label} - Bid #${idx + 1}: If quantity is provided, price is required` 
          });
          return false;
        }
      }
    }

    return true;
  };

  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!validateBids()) return;

    setSubmitting(true);

    try {
      // Collect all valid bids
      const allBids: {
        distanceSlabId: string;
        price: number;
        quantity: number;
      }[] = [];

      slabBids.forEach(slabBid => {
        slabBid.bids.forEach(bid => {
          if (bid.price && bid.quantity && parseFloat(bid.quantity) > 0) {
            allBids.push({
              distanceSlabId: slabBid.slab.id,
              price: parseFloat(bid.price),
              quantity: parseFloat(bid.quantity),
            });
          }
        });
      });

      const response = await fetch('/api/bids/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          bids: allBids,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        const bidsCount = data.bidsCount || allBids.length;
        setMessage({ 
          type: 'success', 
          text: `Successfully submitted ${bidsCount} bid${bidsCount > 1 ? 's' : ''} across ${new Set(allBids.map(b => b.distanceSlabId)).size} distance slab(s)!` 
        });
        fetchData(); // Refresh auction data
      } else {
        console.error('Submit failed:', data);
        setMessage({ type: 'error', text: data.error || 'Failed to submit bid' });
      }
    } catch (error) {
      console.error('Submit error:', error);
      setMessage({ type: 'error', text: 'An error occurred while submitting bid' });
    } finally {
      setSubmitting(false);
    }
  };

  // Group sellers by distance slab
  const sellersByDistance = DISTANCE_SLABS.map(slab => ({
    slab,
    sellers: sellers.filter(s => {
      const dist = Number(s.distanceKm || 0);
      return dist >= slab.min && dist < slab.max;
    }),
  }));

  return (
    <div className="space-y-6">
      {/* Timer */}
      <div className="auction-card bg-green-50 border-green-200">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-green-800 mb-2">
            🔴 Auction Active
          </h2>
          <p className="text-green-700">
            Time Remaining: <span className="text-xl font-bold">{timeRemaining}</span>
          </p>
          <p className="text-sm text-black mt-2">
            Tick Size: ₹{Number(auctionData?.tickSize || 0.01).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Distance Slab Summary */}
      <div className="auction-card">
        <h2 className="text-xl font-bold text-black mb-4">📍 Distance Slabs & Delivery Costs</h2>
        <p className="text-sm text-gray-600 mb-4">
          Suppliers are grouped by distance. Each distance slab has a different delivery cost that affects the landed price.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {DISTANCE_SLABS.map(slab => {
            const slabSellers = sellers.filter(s => {
              const dist = Number(s.distanceKm || 0);
              return dist >= slab.min && dist < slab.max;
            });
            const totalQty = slabSellers.reduce((sum, s) => sum + Number(s.totalQuantity || s.offerQuantityMt || 0), 0);
            
            return (
              <div key={slab.id} className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-semibold text-black">{slab.label}</h3>
                <p className="text-sm text-gray-600">Delivery: ₹{slab.deliveryCost.toFixed(2)}/kg</p>
                <p className="text-sm text-black mt-2">
                  <span className="font-semibold">{slabSellers.length}</span> sellers
                </p>
                <p className="text-sm text-black">
                  <span className="font-semibold">{totalQty.toFixed(2)}</span> MT available
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bid Form */}
      <div className="auction-card">
        <h2 className="text-xl font-bold text-black mb-2">
          {existingBids.length > 0 ? 'Update Your Bids' : 'Submit Your Bids'}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          For each distance slab, you can submit up to 3 price-quantity bids. 
          Higher prices get priority in the clearing mechanism.
        </p>
        <p className="text-sm text-blue-700 bg-blue-50 p-3 rounded mb-6">
          <strong>Tip:</strong> The <strong>landed cost</strong> (base price + delivery cost) is what matters for clearing. 
          Consider the delivery cost when deciding your bid price!
        </p>
        
        <form onSubmit={handleSubmitBid} className="space-y-4">
          {slabBids.map((slabBid, slabIndex) => {
            const isExpanded = expandedSlabs.has(slabBid.slab.id);
            const slabHasBids = slabBid.bids.some(b => b.price && b.quantity);
            
            return (
              <div 
                key={slabBid.slab.id} 
                className={`border-2 rounded-lg overflow-hidden ${
                  slabHasBids ? 'border-blue-400' : 'border-gray-200'
                }`}
              >
                {/* Slab Header */}
                <button
                  type="button"
                  onClick={() => toggleSlab(slabBid.slab.id)}
                  className={`w-full p-4 flex items-center justify-between text-left ${
                    slabHasBids ? 'bg-blue-50' : 'bg-gray-50'
                  } hover:bg-gray-100 transition-colors`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{isExpanded ? '📂' : '📁'}</span>
                    <div>
                      <h3 className="font-bold text-black text-lg">{slabBid.slab.label}</h3>
                      <p className="text-sm text-gray-600">
                        Delivery Cost: ₹{slabBid.slab.deliveryCost.toFixed(2)}/kg
                        {slabHasBids && (
                          <span className="ml-2 text-blue-600 font-semibold">
                            ({slabBid.bids.filter(b => b.price && b.quantity).length} bid(s) entered)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="text-2xl">{isExpanded ? '▼' : '▶'}</span>
                </button>

                {/* Slab Content */}
                {isExpanded && (
                  <div className="p-4 bg-white space-y-4">
                    {/* Show sellers in this slab */}
                    {sellersByDistance[slabIndex].sellers.length > 0 && (
                      <div className="bg-gray-50 rounded p-3 mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          Sellers in this distance range:
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {sellersByDistance[slabIndex].sellers.map(seller => (
                            <span 
                              key={seller.id} 
                              className="text-xs bg-white border rounded px-2 py-1 text-gray-700"
                            >
                              {seller.name || seller.sellerName} ({Number(seller.totalQuantity || seller.offerQuantityMt || 0).toFixed(1)} MT)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bid inputs */}
                    {slabBid.bids.map((bid, bidIndex) => (
                      <div 
                        key={bidIndex}
                        className={`border-l-4 pl-4 py-2 ${
                          bidIndex === 0 ? 'border-blue-500' : 'border-gray-300'
                        }`}
                      >
                        <h4 className="font-semibold text-black mb-2">
                          Bid #{bidIndex + 1} {bidIndex === 0 ? '(Primary)' : '(Optional)'}
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-black mb-1">
                              Price (₹/kg)
                            </label>
                            <input
                              type="number"
                              step={auctionData?.tickSize || 0.01}
                              value={bid.price}
                              onChange={(e) => updateBid(slabIndex, bidIndex, 'price', e.target.value)}
                              onBlur={(e) => handlePriceBlur(slabIndex, bidIndex, e.target.value)}
                              className="input-field w-full"
                              placeholder="Enter price"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-black mb-1">
                              Quantity (MT)
                            </label>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={bid.quantity}
                              onChange={(e) => updateBid(slabIndex, bidIndex, 'quantity', e.target.value)}
                              className="input-field w-full"
                              placeholder="Enter quantity"
                            />
                          </div>
                        </div>
                        {bid.price && (
                          <p className="text-xs text-gray-500 mt-1">
                            Effective landed cost for sellers in this slab: 
                            <span className="font-semibold ml-1">
                              ₹{(parseFloat(bid.price) + slabBid.slab.deliveryCost).toFixed(2)}/kg
                            </span>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary */}
          <div className="bg-gray-100 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-black font-semibold">
                  Total Bids: <span className="text-blue-600">{getBidCount()}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Across {slabBids.filter(sb => sb.bids.some(b => b.price && b.quantity)).length} distance slab(s)
                </p>
              </div>
              <div className="text-right text-sm text-gray-600">
                <p>Total Quantity Bidding:</p>
                <p className="font-bold text-black">
                  {slabBids.reduce((total, sb) => 
                    total + sb.bids.reduce((sum, b) => 
                      sum + (parseFloat(b.quantity) || 0), 0), 0
                  ).toFixed(2)} MT
                </p>
              </div>
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-md ${
              message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
              'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || getBidCount() === 0}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : existingBids.length > 0 ? 'Update Bids' : 'Submit Bids'}
          </button>
        </form>

        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
          <p><strong>Note:</strong> Prices will be automatically corrected to match the tick size. 
          In a second-price auction, the clearing price is based on the second-highest bid, 
          so bidding your true value is the optimal strategy.</p>
        </div>
      </div>
    </div>
  );
}
