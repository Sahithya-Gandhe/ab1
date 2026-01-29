'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AuctionResultsProps {
  onReset: () => void;
}

export default function AuctionResults({ onReset }: AuctionResultsProps) {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const response = await fetch('/api/auction/results-new');
      const data = await response.json();
      setResults(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch results:', error);
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      if (!results?.auction?.id) {
        alert('Auction ID not found');
        return;
      }

      const response = await fetch('/api/auction/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ auctionId: results.auction.id }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auction-report-${results.auctionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Failed to generate PDF report');
    }
  };

  const handleResetAuction = async () => {
    const confirmed = confirm('Are you sure you want to RESET the auction? This will clear all bids and results.');
    if (!confirmed) return;

    try {
      await fetch('/api/auction/reset', { method: 'POST' });
      onReset();
    } catch (error) {
      alert('Failed to reset auction');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-xl">Loading results...</div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="text-center py-12">
        <div className="text-xl text-red-600">Failed to load results</div>
      </div>
    );
  }

  // Prepare chart data - Supply and Demand as step functions
  // Supply: quantity on X-axis, price on Y-axis (ascending by price)
  // Demand: cumulative quantity on X-axis, price on Y-axis (descending by price)
  
  const supplyChartData: { quantity: number; price: number }[] = [];
  const demandChartData: { quantity: number; price: number }[] = [];
  
  // Build supply curve data (step function: cumulative qty vs price)
  if (results.supplyPoints && results.supplyPoints.length > 0) {
    // Start at origin
    supplyChartData.push({ quantity: 0, price: results.supplyPoints[0].price });
    
    results.supplyPoints.forEach((point: any, index: number) => {
      // Horizontal line to current cumulative quantity
      supplyChartData.push({ quantity: point.cumulativeQuantity, price: point.price });
      // Vertical step up to next price (if exists)
      if (index < results.supplyPoints.length - 1) {
        supplyChartData.push({ 
          quantity: point.cumulativeQuantity, 
          price: results.supplyPoints[index + 1].price 
        });
      }
    });
  }

  // Build demand curve data (step function: cumulative qty vs price, descending)
  if (results.demandPoints && results.demandPoints.length > 0) {
    // Sort demand by price descending for proper curve
    const sortedDemand = [...results.demandPoints].sort((a: any, b: any) => b.price - a.price);
    
    // Start at origin (0 qty, highest price)
    demandChartData.push({ quantity: 0, price: sortedDemand[0].price });
    
    sortedDemand.forEach((point: any, index: number) => {
      // Horizontal line to current cumulative quantity  
      demandChartData.push({ quantity: point.cumulativeQuantity, price: point.price });
      // Vertical step down to next price (if exists)
      if (index < sortedDemand.length - 1) {
        demandChartData.push({ 
          quantity: point.cumulativeQuantity, 
          price: sortedDemand[index + 1].price 
        });
      }
    });
  }

  // Combine for recharts - need to merge both curves
  // Create combined dataset with both supply and demand values
  const allQuantities = new Set<number>();
  supplyChartData.forEach(d => allQuantities.add(d.quantity));
  demandChartData.forEach(d => allQuantities.add(d.quantity));
  
  const sortedQuantities = Array.from(allQuantities).sort((a, b) => a - b);
  
  const chartData = sortedQuantities.map(qty => {
    // Find supply price at this quantity (last point with quantity <= qty)
    const supplyPoint = supplyChartData
      .filter(p => p.quantity <= qty)
      .sort((a, b) => b.quantity - a.quantity)[0];
    
    // Find demand price at this quantity
    const demandPoint = demandChartData
      .filter(p => p.quantity <= qty)
      .sort((a, b) => b.quantity - a.quantity)[0];
    
    return {
      quantity: qty,
      supply: supplyPoint?.price,
      demand: demandPoint?.price,
    };
  });

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="auction-card bg-blue-50 border-blue-200">
        <h2 className="text-2xl font-bold text-blue-800 mb-6">
          🎉 Auction Completed
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-black mb-1">Clearing Price</p>
            <p className="text-3xl font-bold text-blue-900">
              ₹{results.summary?.clearingPrice?.toFixed(2) || '0.00'}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-black mb-1">Clearing Quantity</p>
            <p className="text-3xl font-bold text-blue-900">
              {results.summary?.clearingQuantityMt?.toFixed(2) || '0'} units
            </p>
          </div>
          
          <div>
            <p className="text-sm text-black mb-1">Total Trade Value</p>
            <p className="text-3xl font-bold text-green-700">
              ₹{results.summary?.totalTradeValue?.toFixed(2) || '0.00'}
            </p>
          </div>

          <div>
            <p className="text-sm text-black mb-1">Clearing Type</p>
            <p className="text-lg font-bold text-purple-700">
              {results.summary?.clearingType || 'EXACT'}
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <button onClick={handleDownloadPDF} className="btn-primary">
            📄 Download PDF Report
          </button>
          <button onClick={handleResetAuction} className="btn-danger">
            🔄 Reset Auction
          </button>
        </div>
      </div>

      {/* Gap Analysis Table */}
      {results.gapPoints && results.gapPoints.length > 0 && (
        <div className="auction-card">
          <h2 className="text-xl font-bold text-black mb-4">
            📊 Gap Analysis (Supply - Demand)
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="table-header">
                  <th className="px-6 py-3">Price</th>
                  <th className="px-6 py-3">Cumulative Supply</th>
                  <th className="px-6 py-3">Cumulative Demand</th>
                  <th className="px-6 py-3">Gap</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.gapPoints?.map((point: any, index: number) => (
                  <tr 
                    key={index}
                    className={`
                      ${point.gap === 0 ? 'bg-green-50 font-semibold' : ''}
                      ${point.gap < 0 ? 'bg-red-50' : ''}
                      ${point.gap > 0 ? 'bg-blue-50' : ''}
                    `}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-black">
                      ₹{point.price?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-black">
                      {point.cumulativeSupply?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-black">
                      {point.cumulativeDemand?.toFixed(2) || '0.00'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${
                      point.gap === 0 ? 'text-green-700' :
                      point.gap < 0 ? 'text-red-700' : 'text-blue-700'
                    }`}>
                      {point.gap?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-center">
                      {point.gap === 0 && <span className="px-2 py-1 bg-green-100 text-green-800 rounded">EXACT</span>}
                      {point.gap < 0 && <span className="px-2 py-1 bg-red-100 text-red-800 rounded">SHORTAGE</span>}
                      {point.gap > 0 && <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">SURPLUS</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {results.clearingType === 'INTERPOLATED' && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Interpolation Applied:</strong> Clearing price calculated using linear interpolation 
                where gap changed from negative to positive.
              </p>
            </div>
          )}
          
          {results.clearingType === 'NO_CLEARING' && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                <strong>❌ No Clearing:</strong> All gap values are negative (demand exceeds supply at all prices). 
                No market clearing occurred.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Supply-Demand Chart */}
      <div className="auction-card">
        <h2 className="text-xl font-bold text-black mb-4">
          Supply-Demand Curve
        </h2>
        
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="quantity" 
              label={{ value: 'Quantity', position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              label={{ value: 'Price (₹)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip />
            <Legend />
            <Line 
              type="stepAfter" 
              dataKey="supply" 
              stroke="#10b981" 
              strokeWidth={2}
              name="Supply"
              connectNulls
            />
            <Line 
              type="stepAfter" 
              dataKey="demand" 
              stroke="#3b82f6" 
              strokeWidth={2}
              name="Demand"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Allocations Table */}
      <div className="auction-card">
        <h2 className="text-xl font-bold text-black mb-4">
          Seller-wise Allocation
        </h2>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="table-header">
                <th className="px-6 py-3">Seller</th>
                <th className="px-6 py-3">Allocated Qty</th>
                <th className="px-6 py-3">Reserve Price</th>
                <th className="px-6 py-3">Clearing Price</th>
                <th className="px-6 py-3">Trade Value</th>
                <th className="px-6 py-3">Seller Bonus</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.sellerAllocations?.map((alloc: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-black">
                    {alloc.sellerName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-black">
                    {alloc.totalQuantity?.toFixed(2) || '0.00'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-black">
                    ₹{(alloc.allocations?.[0]?.price || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-black">
                    ₹{results.summary?.clearingPrice?.toFixed(2) || '0.00'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-semibold text-green-700">
                    ₹{alloc.totalValue?.toFixed(2) || '0.00'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-blue-700">
                    ₹{alloc.totalBonus?.toFixed(2) || '0.00'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td className="px-6 py-4 text-black" colSpan={4}>TOTAL</td>
                <td className="px-6 py-4 text-green-700">
                  ₹{results.summary?.totalTradeValue?.toFixed(2) || '0.00'}
                </td>
                <td className="px-6 py-4 text-blue-700">
                  ₹{(results.sellerAllocations?.reduce((sum: number, a: any) => sum + (a.totalBonus || 0), 0) || 0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
