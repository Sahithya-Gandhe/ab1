'use client';

import { useState, useEffect } from 'react';

interface ResultsScreenProps {
  userId: string;
}

export default function ResultsScreen({ userId }: ResultsScreenProps) {
  const [results, setResults] = useState<any>(null);
  const [myBid, setMyBid] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResults();
  }, [userId]);

  const fetchResults = async () => {
    try {
      const [resultsRes, bidRes] = await Promise.all([
        fetch('/api/auction/results'),
        fetch(`/api/bids/my-bid?userId=${userId}`),
      ]);

      const [resultsData, bidData] = await Promise.all([
        resultsRes.json(),
        bidRes.json(),
      ]);

      setResults(resultsData);
      setMyBid(bidData);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch results:', error);
      setLoading(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const response = await fetch('/api/auction/report', {
        method: 'POST',
      });
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auction-report-buyer-${new Date().toISOString()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to download report');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-xl">Loading results...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Results Summary */}
      <div className="auction-card bg-blue-50 border-blue-200">
        <h2 className="text-2xl font-bold text-blue-800 mb-6">
          🎉 Auction Results
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-black mb-1">Clearing Price</p>
            <p className="text-3xl font-bold text-blue-900">
              ₹{results?.clearingPrice?.toFixed(2) || '0.00'}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-black mb-1">Clearing Quantity</p>
            <p className="text-3xl font-bold text-blue-900">
              {results?.clearingQuantity?.toFixed(2) || '0'} units
            </p>
          </div>
          
          <div>
            <p className="text-sm text-black mb-1">Total Trade Value</p>
            <p className="text-3xl font-bold text-green-700">
              ₹{results?.totalTradeValue?.toFixed(2) || '0.00'}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <button onClick={handleDownloadReport} className="btn-primary">
            📄 Download Report
          </button>
        </div>
      </div>

      {/* My Bid */}
      {myBid && (
        <div className="auction-card">
          <h2 className="text-xl font-bold text-black mb-4">Your Submitted Bid</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-black mb-1">Bid 1</p>
              <p className="font-semibold">
                ₹{myBid.price1.toFixed(2)} × {myBid.quantity1} units
              </p>
            </div>
            
            {myBid.price2 && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-black mb-1">Bid 2</p>
                <p className="font-semibold">
                  ₹{myBid.price2.toFixed(2)} × {myBid.quantity2} units
                </p>
              </div>
            )}
            
            {myBid.price3 && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-black mb-1">Bid 3</p>
                <p className="font-semibold">
                  ₹{myBid.price3.toFixed(2)} × {myBid.quantity3} units
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Seller Allocations */}
      <div className="auction-card">
        <h2 className="text-xl font-bold text-black mb-4">
          Seller-wise Allocation
        </h2>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="table-header">
                <th className="px-6 py-3">Seller</th>
                <th className="px-6 py-3">Quantity Sold</th>
                <th className="px-6 py-3">Reserve Price</th>
                <th className="px-6 py-3">Clearing Price</th>
                <th className="px-6 py-3">Seller Revenue</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results?.allocations?.map((alloc: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-black">
                    {alloc.sellerName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-black">
                    {alloc.quantity.toFixed(2)} units
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-black">
                    ₹{alloc.reservePrice.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-semibold text-black">
                    ₹{alloc.clearingPrice.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-green-700 font-semibold">
                    ₹{alloc.tradeValue.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Information Box */}
      <div className="auction-card bg-gray-50">
        <h3 className="font-bold text-black mb-3">About Second Price Auctions</h3>
        <p className="text-sm text-black">
          In a second-price auction, winners pay the price of the highest rejected bid (or the lowest accepted 
          reserve price), not their own bid. This mechanism encourages honest bidding and ensures fair market 
          pricing. The clearing price represents the equilibrium where supply meets demand.
        </p>
      </div>
    </div>
  );
}
