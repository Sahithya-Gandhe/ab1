'use client';

import { useState, useEffect } from 'react';

export default function WelcomeScreen() {
  const [auctionData, setAuctionData] = useState<any>(null);
  const [timeUntilStart, setTimeUntilStart] = useState<string>('');

  useEffect(() => {
    fetchAuctionData();
  }, []);

  useEffect(() => {
    if (auctionData?.startTime) {
      const timer = setInterval(() => {
        const now = new Date().getTime();
        const start = new Date(auctionData.startTime).getTime();
        const diff = start - now;

        if (diff <= 0) {
          setTimeUntilStart('Starting soon...');
          clearInterval(timer);
        } else {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          
          if (days > 0) {
            setTimeUntilStart(`${days}d ${hours}h ${minutes}m ${seconds}s`);
          } else {
            setTimeUntilStart(`${hours}h ${minutes}m ${seconds}s`);
          }
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [auctionData]);

  const fetchAuctionData = async () => {
    const response = await fetch('/api/auction/status');
    const data = await response.json();
    setAuctionData(data);
  };

  return (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <div className="auction-card">
        <div className="text-6xl mb-4">⏳</div>
        <h2 className="text-3xl font-bold text-black mb-4">
          Auction Not Started
        </h2>
        <p className="text-black mb-6">
          The auction has not started yet. Please wait for the administrator to begin the auction.
        </p>

        {auctionData?.configuredStart && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <p className="text-sm text-black mb-2">Scheduled Start Time:</p>
            <p className="text-xl font-bold text-blue-900">
              {new Date(auctionData.configuredStart).toLocaleString()}
            </p>
            <p className="text-sm text-black mt-4">Time Until Start:</p>
            <p className="text-2xl font-bold text-blue-700 mt-2">
              {timeUntilStart || 'Calculating...'}
            </p>
          </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            💡 <strong>Tip:</strong> Once the auction starts, you'll be able to submit up to 3 price-quantity bids.
          </p>
        </div>
      </div>

      <div className="auction-card text-left">
        <h3 className="text-xl font-bold text-black mb-4">How It Works</h3>
        <ul className="space-y-3 text-black">
          <li className="flex items-start">
            <span className="text-blue-600 font-bold mr-2">1.</span>
            <span>Wait for the admin to start the auction</span>
          </li>
          <li className="flex items-start">
            <span className="text-blue-600 font-bold mr-2">2.</span>
            <span>View available seller supply and their reserve prices</span>
          </li>
          <li className="flex items-start">
            <span className="text-blue-600 font-bold mr-2">3.</span>
            <span>Submit up to 3 price-quantity bid combinations</span>
          </li>
          <li className="flex items-start">
            <span className="text-blue-600 font-bold mr-2">4.</span>
            <span>Wait for auction to end and see results</span>
          </li>
          <li className="flex items-start">
            <span className="text-blue-600 font-bold mr-2">5.</span>
            <span>Download your personalized auction report</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
