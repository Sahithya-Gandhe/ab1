'use client';

import { useState, useEffect } from 'react';

interface LiveAuctionProps {
  onStatusChange: (status: 'COMPLETED') => void;
}

export default function LiveAuction({ onStatusChange }: LiveAuctionProps) {
  const [sellers, setSellers] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [auctionData, setAuctionData] = useState<any>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

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
      const [sellersRes, bidsRes, auctionRes] = await Promise.all([
        fetch('/api/sellers'),
        fetch('/api/bids'),
        fetch('/api/auction/status'),
      ]);

      const [sellersData, bidsData, auctionData] = await Promise.all([
        sellersRes.json(),
        bidsRes.json(),
        auctionRes.json(),
      ]);

      setSellers(sellersData);
      setBids(bidsData);
      setAuctionData(auctionData);

      if (auctionData.status === 'COMPLETED') {
        onStatusChange('COMPLETED');
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const handleEndAuction = async () => {
    const confirmed = confirm('Are you sure you want to END the auction and calculate results?');
    if (!confirmed) return;

    try {
      const response = await fetch('/api/auction/end', {
        method: 'POST',
      });

      if (response.ok) {
        alert('Auction ended successfully!');
        onStatusChange('COMPLETED');
      } else {
        alert('Failed to end auction');
      }
    } catch (error) {
      alert('Failed to end auction');
    }
  };

  return (
    <div className="space-y-6">
      {/* Live Status */}
      <div className="auction-card bg-green-50 border-green-200">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-green-800">
              🔴 AUCTION LIVE
            </h2>
            <p className="text-green-700 mt-1">
              Time Remaining: <span className="font-bold">{timeRemaining}</span>
            </p>
          </div>
          <button onClick={handleEndAuction} className="btn-danger">
            End Auction
          </button>
        </div>
      </div>

      {/* Live Bids Table */}
      <div className="auction-card">
        <h2 className="text-xl font-bold text-black mb-4">
          Live Bids ({bids.length} total)
        </h2>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="table-header">
                <th className="px-6 py-3">Buyer</th>
                <th className="px-6 py-3">Price 1</th>
                <th className="px-6 py-3">Qty 1</th>
                <th className="px-6 py-3">Price 2</th>
                <th className="px-6 py-3">Qty 2</th>
                <th className="px-6 py-3">Price 3</th>
                <th className="px-6 py-3">Qty 3</th>
                <th className="px-6 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bids.map((bid) => (
                <tr key={bid.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium">
                    {bid.user.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    ₹{bid.price1.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{bid.quantity1}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {bid.price2 ? `₹${bid.price2.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {bid.quantity2 || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {bid.price3 ? `₹${bid.price3.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {bid.quantity3 || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-black">
                    {new Date(bid.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {bids.length === 0 && (
          <div className="text-center py-8 text-black">
            No bids submitted yet. Waiting for buyers...
          </div>
        )}
      </div>

      {/* Sellers Table */}
      <div className="auction-card">
        <h2 className="text-xl font-bold text-black mb-4">Seller Supply</h2>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="table-header">
                <th className="px-6 py-3">Seller Name</th>
                <th className="px-6 py-3">Quantity</th>
                <th className="px-6 py-3">Reserve Price</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sellers.map((seller) => (
                <tr key={seller.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">{seller.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{Number(seller.quantity)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    ₹{Number(seller.reservePrice).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
