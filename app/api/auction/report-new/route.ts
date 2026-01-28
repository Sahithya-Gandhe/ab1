import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const dynamic = 'force-dynamic';

// Type definitions for records
interface AuctionRecord {
  id: string;
  status: string;
  clearingPrice?: any;
  clearingQuantityMt?: any;
  tradeValue?: any;
  totalSupplyMt?: any;
  totalDemandMt?: any;
  unsoldSupplyMt?: any;
  clearingType?: string;
  reauctionCount?: number;
  parentAuctionId?: string;
  tickSize: any;
  startTime?: Date;
  endTime?: Date;
  closedAt?: Date;
  createdAt: Date;
}

interface AllocationRecord {
  id: string;
  auctionId: string;
  buyerId: string;
  sellerId: string;
  allocatedQuantityMt: any;
  finalPricePerKg: any;
  buyerBidPrice?: any;
  sellerOfferPrice?: any;
  sellerLandedCost?: any;
  tradeValue?: any;
  buyerSavings?: any;
  sellerBonus?: any;
  buyer: { buyerName: string };
  seller: { sellerName: string };
}

interface SupplySnapshotRecord {
  id: string;
  sellerId: string;
  sellerName: string;
  price: any;
  quantity: any;
  cumulativeSupply: any;
  landedCost?: any;
  deliveryCost?: any;
}

interface DemandSnapshotRecord {
  id: string;
  buyerId: string;
  buyerName: string;
  price: any;
  quantity: any;
  cumulativeDemand: any;
}

interface GapSnapshotRecord {
  id: string;
  rowIndex: number;
  price: any;
  supply: any;
  demand: any;
  gap: any;
}

/**
 * GET /api/auction/report-new
 * Generate PDF report for auction results (new schema)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const auctionId = searchParams.get('auctionId');

    // Find the auction
    let auction: AuctionRecord | null;
    if (auctionId) {
      auction = await prisma.auction.findUnique({
        where: { id: auctionId },
      }) as AuctionRecord | null;
    } else {
      auction = await (prisma.auction.findFirst as any)({
        where: {
          OR: [
            { status: 'COMPLETED' },
            { status: 'CLOSED' },
            { status: 'REAUCTION' },
          ],
        },
        orderBy: { closedAt: 'desc' },
      }) as AuctionRecord | null;
    }

    if (!auction) {
      return NextResponse.json({ error: 'No completed auction found' }, { status: 404 });
    }

    // Fetch all data
    const allocations = await (prisma as any).allocation.findMany({
      where: { auctionId: auction.id },
      include: { buyer: true, seller: true },
      orderBy: { allocatedQuantityMt: 'desc' },
    }) as AllocationRecord[];

    const supplySnapshots = await (prisma as any).auctionSupplySnapshot.findMany({
      where: { auctionId: auction.id },
      orderBy: { cumulativeSupply: 'asc' },
    }) as SupplySnapshotRecord[];

    const demandSnapshots = await (prisma as any).auctionDemandSnapshot.findMany({
      where: { auctionId: auction.id },
      orderBy: { price: 'desc' },
    }) as DemandSnapshotRecord[];

    const gapSnapshots = await (prisma as any).auctionGapSnapshot.findMany({
      where: { auctionId: auction.id },
      orderBy: { rowIndex: 'asc' },
    }) as GapSnapshotRecord[];

    // Create PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Second-Price Double Auction Report', pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    // Subtitle
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Auction ID: ${auction.id}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    // Summary Section
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Auction Summary', 14, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const summaryData = [
      ['Status', auction.status],
      ['Clearing Type', auction.clearingType || 'N/A'],
      ['Clearing Price', `₹${Number(auction.clearingPrice || 0).toFixed(2)}/Kg`],
      ['Clearing Quantity', `${Number(auction.clearingQuantityMt || 0).toFixed(2)} MT`],
      ['Total Trade Value', `₹${Number(auction.tradeValue || 0).toLocaleString()}`],
      ['Total Supply', `${Number(auction.totalSupplyMt || 0).toFixed(2)} MT`],
      ['Total Demand', `${Number(auction.totalDemandMt || 0).toFixed(2)} MT`],
      ['Unsold Supply', `${Number(auction.unsoldSupplyMt || 0).toFixed(2)} MT`],
      ['Re-auction Count', String(auction.reauctionCount)],
      ['Tick Size', `₹${Number(auction.tickSize).toFixed(2)}`],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      margin: { left: 14, right: 14 },
      tableWidth: 'auto',
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Allocations Table
    if (allocations.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Allocations', 14, yPos);
      yPos += 8;

      const allocationData = allocations.map(a => [
        a.buyer.buyerName,
        a.seller.sellerName,
        Number(a.allocatedQuantityMt).toFixed(2),
        `₹${Number(a.finalPricePerKg).toFixed(2)}`,
        `₹${Number(a.buyerBidPrice || 0).toFixed(2)}`,
        `₹${Number(a.sellerOfferPrice || 0).toFixed(2)}`,
        `₹${Number(a.tradeValue || 0).toLocaleString()}`,
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Buyer', 'Seller', 'Qty (MT)', 'Clear Price', 'Bid Price', 'Offer Price', 'Trade Value']],
        body: allocationData,
        theme: 'grid',
        headStyles: { fillColor: [39, 174, 96] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    // Check if we need a new page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    // Supply Curve Table
    if (supplySnapshots.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Supply Curve', 14, yPos);
      yPos += 8;

      const supplyData = supplySnapshots.map(s => [
        s.sellerName,
        `₹${Number(s.price).toFixed(2)}`,
        Number(s.quantity).toFixed(2),
        Number(s.cumulativeSupply).toFixed(2),
        `₹${Number(s.landedCost || s.price).toFixed(2)}`,
        `₹${Number(s.deliveryCost || 0).toFixed(2)}`,
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Seller', 'Offer Price', 'Qty (MT)', 'Cumulative', 'Landed Cost', 'Delivery']],
        body: supplyData,
        theme: 'grid',
        headStyles: { fillColor: [231, 76, 60] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    // Check if we need a new page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    // Demand Curve Table
    if (demandSnapshots.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Demand Curve', 14, yPos);
      yPos += 8;

      const demandData = demandSnapshots.map(d => [
        d.buyerName,
        `₹${Number(d.price).toFixed(2)}`,
        Number(d.quantity).toFixed(2),
        Number(d.cumulativeDemand).toFixed(2),
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Buyer', 'Bid Price', 'Qty (MT)', 'Cumulative Demand']],
        body: demandData,
        theme: 'grid',
        headStyles: { fillColor: [52, 152, 219] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    // Check if we need a new page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    // Gap Analysis Table
    if (gapSnapshots.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Gap Analysis', 14, yPos);
      yPos += 8;

      const gapData = gapSnapshots.map(g => [
        String(g.rowIndex + 1),
        `₹${Number(g.price).toFixed(2)}`,
        Number(g.supply).toFixed(2),
        Number(g.demand).toFixed(2),
        Number(g.gap).toFixed(2),
        Number(g.gap) < 0 ? 'Shortage' : Number(g.gap) > 0 ? 'Surplus' : 'Exact',
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Row', 'Price', 'Cumulative Supply', 'Cumulative Demand', 'Gap', 'Status']],
        body: gapData,
        theme: 'grid',
        headStyles: { fillColor: [155, 89, 182] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Page ${i} of ${pageCount} | Second-Price Double Auction System`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    // Convert to buffer
    const pdfBuffer = doc.output('arraybuffer');

    // Return PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="auction-report-${auction.id}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating auction report:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
