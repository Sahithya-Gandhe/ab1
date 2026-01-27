import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import BuyerDashboard from './BuyerDashboard';

export default async function BuyerPage() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== 'BUYER') {
    redirect('/');
  }

  return <BuyerDashboard user={session.user} />;
}
