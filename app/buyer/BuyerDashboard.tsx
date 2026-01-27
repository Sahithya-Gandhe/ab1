'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import WelcomeScreen from './components/WelcomeScreen';
import BiddingScreen from './components/BiddingScreen';
import ResultsScreen from './components/ResultsScreen';

type AuctionStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED';

interface BuyerDashboardProps {
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export default function BuyerDashboard({ user }: BuyerDashboardProps) {
  const [auctionStatus, setAuctionStatus] = useState<AuctionStatus>('PENDING');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuctionStatus();
    const interval = setInterval(fetchAuctionStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAuctionStatus = async () => {
    try {
      const response = await fetch('/api/auction/status');
      const data = await response.json();
      setAuctionStatus(data.status);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch auction status:', error);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-black">Buyer Dashboard</h1>
              <p className="text-sm text-black">Welcome, {user.name}</p>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={handleLogout} className="btn-secondary">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {auctionStatus === 'PENDING' && <WelcomeScreen />}
        {auctionStatus === 'ACTIVE' && <BiddingScreen userId={user.id} />}
        {auctionStatus === 'COMPLETED' && <ResultsScreen userId={user.id} />}
      </main>
    </div>
  );
}
