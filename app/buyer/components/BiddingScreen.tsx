'use client';

import { useState, useEffect } from 'react';

interface BiddingScreenProps {
  userId: string;
}

export default function BiddingScreen({ userId }: BiddingScreenProps) {
  const [sellers, setSellers] = useState<any[]>([]);
  const [auctionData, setAuctionData] = useState<any>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [existingBid, setExistingBid] = useState<any>(null);
  
  // Bid form state
  const [price1, setPrice1] = useState('');
  const [quantity1, setQuantity1] = useState('');
  const [price2, setPrice2] = useState('');
  const [quantity2, setQuantity2] = useState('');
  const [price3, setPrice3] = useState('');
  const [quantity3, setQuantity3] = useState('');
  
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
        fetch('/api/auction/status'),
        fetch(`/api/bids/my-bid?userId=${userId}`),
      ]);

      const [sellersData, auctionData, bidData] = await Promise.all([
        sellersRes.json(),
        auctionRes.json(),
        bidRes.json(),
      ]);

      setSellers(sellersData);
      setAuctionData(auctionData);
      
      if (bidData) {
        setExistingBid(bidData);
        setPrice1(bidData.price1.toString());
        setQuantity1(bidData.quantity1.toString());
        setPrice2(bidData.price2?.toString() || '');
        setQuantity2(bidData.quantity2?.toString() || '');
        setPrice3(bidData.price3?.toString() || '');
        setQuantity3(bidData.quantity3?.toString() || '');
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const correctToTick = (value: string, tickSize: number): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    const corrected = Math.round(num / tickSize) * tickSize;
    return corrected.toFixed(2);
  };

  const handlePriceBlur = (value: string, setter: (val: string) => void) => {
    if (value && auctionData?.tickSize) {
      const corrected = correctToTick(value, auctionData.tickSize);
      setter(corrected);
    }
  };

  const validateBids = (): boolean => {
    if (!price1 || !quantity1 || parseFloat(quantity1) <= 0) {
      setMessage({ type: 'error', text: 'At least one bid (Price 1 & Quantity 1) is required' });
      return false;
    }

    if (price2 && (!quantity2 || parseFloat(quantity2) <= 0)) {
      setMessage({ type: 'error', text: 'If Price 2 is provided, Quantity 2 must be greater than 0' });
      return false;
    }

    if (price3 && (!quantity3 || parseFloat(quantity3) <= 0)) {
      setMessage({ type: 'error', text: 'If Price 3 is provided, Quantity 3 must be greater than 0' });
      return false;
    }

    return true;
  };

  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!validateBids()) return;

    setSubmitting(true);

    try {
      const response = await fetch('/api/bids/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          price1: parseFloat(price1),
          quantity1: parseFloat(quantity1),
          price2: price2 ? parseFloat(price2) : null,
          quantity2: quantity2 ? parseFloat(quantity2) : null,
          price3: price3 ? parseFloat(price3) : null,
          quantity3: quantity3 ? parseFloat(quantity3) : null,
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: existingBid ? 'Bid updated successfully!' : 'Bid submitted successfully!' });
        fetchData();
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to submit bid' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred while submitting bid' });
    } finally {
      setSubmitting(false);
    }
  };

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

      {/* Bid Form */}
      <div className="auction-card">
        <h2 className="text-xl font-bold text-black mb-4">
          {existingBid ? 'Update Your Bid' : 'Submit Your Bid'}
        </h2>
        
        <form onSubmit={handleSubmitBid} className="space-y-6">
          {/* Bid 1 */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg">
            <div>
              <label className="block text-sm font-medium text-black mb-2">
                Price 1 (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                value={price1}
                onChange={(e) => setPrice1(e.target.value)}
                onBlur={(e) => handlePriceBlur(e.target.value, setPrice1)}
                className="input-field w-full"
                placeholder="Enter price"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-2">
                Quantity 1 *
              </label>
              <input
                type="number"
                step="1"
                value={quantity1}
                onChange={(e) => setQuantity1(e.target.value)}
                className="input-field w-full"
                placeholder="Enter quantity"
                required
              />
            </div>
          </div>

          {/* Bid 2 */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="block text-sm font-medium text-black mb-2">
                Price 2 (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={price2}
                onChange={(e) => setPrice2(e.target.value)}
                onBlur={(e) => handlePriceBlur(e.target.value, setPrice2)}
                className="input-field w-full"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-2">
                Quantity 2
              </label>
              <input
                type="number"
                step="1"
                value={quantity2}
                onChange={(e) => setQuantity2(e.target.value)}
                className="input-field w-full"
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Bid 3 */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="block text-sm font-medium text-black mb-2">
                Price 3 (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={price3}
                onChange={(e) => setPrice3(e.target.value)}
                onBlur={(e) => handlePriceBlur(e.target.value, setPrice3)}
                className="input-field w-full"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-2">
                Quantity 3
              </label>
              <input
                type="number"
                step="1"
                value={quantity3}
                onChange={(e) => setQuantity3(e.target.value)}
                className="input-field w-full"
                placeholder="Optional"
              />
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
            disabled={submitting}
            className="btn-primary w-full disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : existingBid ? 'Update Bid' : 'Submit Bid'}
          </button>
        </form>

        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
          <p><strong>Note:</strong> Prices will be automatically corrected to match the tick size when you leave the field.</p>
        </div>
      </div>
    </div>
  );
}
