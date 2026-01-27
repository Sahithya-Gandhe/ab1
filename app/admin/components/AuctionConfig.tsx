'use client';

import { useState, useEffect } from 'react';

interface AuctionConfigProps {
  onStatusChange: (status: 'ACTIVE') => void;
}

export default function AuctionConfig({ onStatusChange }: AuctionConfigProps) {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [tickSize, setTickSize] = useState('0.01');
  const [loading, setLoading] = useState(false);
  const [sellers, setSellers] = useState<any[]>([]);

  useEffect(() => {
    fetchSellers();
    fetchAuctionConfig();
  }, []);

  const fetchSellers = async () => {
    const response = await fetch('/api/sellers');
    const data = await response.json();
    setSellers(data);
  };

  const fetchAuctionConfig = async () => {
    const response = await fetch('/api/auction/config');
    const data = await response.json();
    if (data.startTime) {
      setStartTime(new Date(data.startTime).toISOString().slice(0, 16));
    }
    if (data.endTime) {
      setEndTime(new Date(data.endTime).toISOString().slice(0, 16));
    }
    if (data.tickSize) {
      setTickSize(data.tickSize.toString());
    }
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    try {
      await fetch('/api/auction/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: startTime ? new Date(startTime).toISOString() : null,
          endTime: endTime ? new Date(endTime).toISOString() : null,
          tickSize: parseFloat(tickSize),
        }),
      });
      alert('Configuration saved successfully!');
    } catch (error) {
      alert('Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleStartAuction = async () => {
    if (!startTime || !endTime) {
      alert('Please configure start and end times first');
      return;
    }

    const confirmed = confirm('Are you sure you want to START the auction?');
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch('/api/auction/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        alert('Auction started successfully!');
        onStatusChange('ACTIVE');
      } else {
        alert('Failed to start auction');
      }
    } catch (error) {
      alert('Failed to start auction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Panel */}
      <div className="auction-card">
        <h2 className="text-xl font-bold text-black mb-6">Auction Configuration</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-black mb-2">
              Start Time
            </label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-2">
              End Time
            </label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-2">
              Tick Size
            </label>
            <input
              type="number"
              step="0.01"
              value={tickSize}
              onChange={(e) => setTickSize(e.target.value)}
              className="input-field w-full"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <button
            onClick={handleSaveConfig}
            disabled={loading}
            className="btn-secondary disabled:opacity-50"
          >
            Save Configuration
          </button>
          
          <button
            onClick={handleStartAuction}
            disabled={loading}
            className="btn-success disabled:opacity-50"
          >
            ▶ START AUCTION
          </button>
        </div>
      </div>

      {/* Sellers Preview */}
      <div className="auction-card">
        <h2 className="text-xl font-bold text-black mb-4">Registered Sellers</h2>
        
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
                  <td className="px-6 py-4 whitespace-nowrap text-black">{seller.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-black">{Number(seller.quantity)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-black">
                    ₹{Number(seller.reservePrice).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-sm text-black">
          Total Sellers: {sellers.length}
        </div>
      </div>
    </div>
  );
}
