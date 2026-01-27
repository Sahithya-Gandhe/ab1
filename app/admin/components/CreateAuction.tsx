'use client';

import { useState } from 'react';

interface CreateAuctionProps {
  onAuctionCreated: () => void;
}

export default function CreateAuction({ onAuctionCreated }: CreateAuctionProps) {
  const [tickSize, setTickSize] = useState('0.01');
  const [loading, setLoading] = useState(false);

  const handleCreateAuction = async () => {
    const confirmed = confirm('Create a new auction?');
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch('/api/auction/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickSize: parseFloat(tickSize),
        }),
      });

      if (response.ok) {
        alert('Auction created successfully!');
        onAuctionCreated();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to create auction');
      }
    } catch (error) {
      alert('Failed to create auction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="auction-card max-w-2xl w-full">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-black mb-4">
            🎯 Create New Auction
          </h2>
          <p className="text-black">
            No active auction found. Create a new auction to get started.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-black mb-2">
              Tick Size (Minimum Price Increment)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={tickSize}
              onChange={(e) => setTickSize(e.target.value)}
              className="input-field w-full"
              placeholder="0.01"
            />
            <p className="text-sm text-black mt-1">
              All bid prices must be multiples of this tick size (e.g., ₹0.10)
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
              <li>Set auction start and end times</li>
              <li>Start the auction to allow buyers to bid</li>
              <li>End the auction to calculate results</li>
              <li>View detailed reports and allocations</li>
            </ol>
          </div>

          <button
            onClick={handleCreateAuction}
            disabled={loading}
            className="btn-primary w-full py-3 text-lg"
          >
            {loading ? 'Creating...' : '✨ Create Auction'}
          </button>
        </div>
      </div>
    </div>
  );
}
