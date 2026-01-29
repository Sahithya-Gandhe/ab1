import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const auctionId = body.auctionId;

    if (!auctionId) {
      return NextResponse.json({ error: 'Auction ID required' }, { status: 400 });
    }

    // Fetch auction
    const auction = await (prisma as any).auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    // Fetch allocations
    const allocations = await (prisma as any).allocation.findMany({
      where: { auctionId },
      include: { buyer: true, seller: true },
      orderBy: [{ finalPricePerKg: 'desc' }, { allocatedQuantityMt: 'desc' }],
    });

    // Fetch buyer-seller distances
    const distances = await (prisma as any).buyerSellerDistance.findMany({
      where: { auctionId },
    });

    const distanceMap = new Map();
    distances.forEach((d: any) => {
      distanceMap.set(`${d.buyerId}_${d.sellerId}`, {
        distanceKm: Number(d.distanceKm),
        deliveryCost: Number(d.costPerKg),
      });
    });

    // Create buyer-seller allocation matrix
    const buyerMap = new Map();
    const sellerMap = new Map();

    allocations.forEach((alloc: any) => {
      const distance = distanceMap.get(`${alloc.buyerId}_${alloc.sellerId}`) || { distanceKm: 0, deliveryCost: 0 };
      
      // Group by buyer
      if (!buyerMap.has(alloc.buyerId)) {
        buyerMap.set(alloc.buyerId, {
          name: alloc.buyer.buyerName,
          allocations: [],
          totalQuantity: 0,
          totalValue: 0,
          totalSavings: 0,
        });
      }
      const buyer = buyerMap.get(alloc.buyerId);
      buyer.allocations.push({
        sellerName: alloc.seller.sellerName,
        quantity: Number(alloc.allocatedQuantityMt),
        price: Number(alloc.finalPricePerKg),
        bidPrice: Number(alloc.buyerBidPrice || 0),
        distanceKm: distance.distanceKm,
        deliveryCost: distance.deliveryCost,
        landedCost: Number(alloc.finalPricePerKg) + distance.deliveryCost,
        tradeValue: Number(alloc.tradeValue || 0),
        savings: Number(alloc.buyerSavings || 0),
      });
      buyer.totalQuantity += Number(alloc.allocatedQuantityMt);
      buyer.totalValue += Number(alloc.tradeValue || 0);
      buyer.totalSavings += Number(alloc.buyerSavings || 0);

      // Group by seller
      if (!sellerMap.has(alloc.sellerId)) {
        sellerMap.set(alloc.sellerId, {
          name: alloc.seller.sellerName,
          allocations: [],
          totalQuantity: 0,
          totalValue: 0,
          totalBonus: 0,
        });
      }
      const seller = sellerMap.get(alloc.sellerId);
      seller.allocations.push({
        buyerName: alloc.buyer.buyerName,
        quantity: Number(alloc.allocatedQuantityMt),
        price: Number(alloc.finalPricePerKg),
        offerPrice: Number(alloc.sellerOfferPrice || 0),
        tradeValue: Number(alloc.tradeValue || 0),
        bonus: Number(alloc.sellerBonus || 0),
      });
      seller.totalQuantity += Number(alloc.allocatedQuantityMt);
      seller.totalValue += Number(alloc.tradeValue || 0);
      seller.totalBonus += Number(alloc.sellerBonus || 0);
    });

    // Create PDF
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15;

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('AUCTION REPORT', pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    // Summary
    const summaryData = [
      ['Clearing Price', `₹${Number(auction.clearingPrice || 0).toFixed(2)}/kg`],
      ['Clearing Quantity', `${Number(auction.clearingQuantityMt || 0).toFixed(2)} MT`],
      ['Trade Value', `₹${Number(auction.tradeValue || 0).toLocaleString('en-IN')}`],
      ['Leftover Supply', `${Number(auction.unsoldSupplyMt || 0).toFixed(2)} MT`],
    ];

    autoTable(doc, {
      startY: yPos,
      body: summaryData,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2, fontStyle: 'bold' },
      columnStyles: { 
        0: { cellWidth: 50, halign: 'right' }, 
        1: { cellWidth: 60, halign: 'left', textColor: [25, 118, 210] } 
      },
      margin: { left: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // BUYER → SELLER ALLOCATION
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('BUYER → SELLER ALLOCATION', 14, yPos);
    yPos += 7;

    for (const [buyerId, buyer] of buyerMap.entries()) {
      const buyerAllocData = buyer.allocations.map((a: any) => [
        a.sellerName,
        `${a.quantity.toFixed(2)} MT`,
        `${a.distanceKm.toFixed(0)} km`,
        `₹${a.deliveryCost.toFixed(2)}/kg`,
        `₹${a.landedCost.toFixed(2)}/kg`,
        `₹${a.savings.toLocaleString('en-IN')}`,
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [[{ content: buyer.name, colSpan: 6, styles: { halign: 'left', fillColor: [76, 175, 80] } }], ['Seller', 'Quantity', 'Distance', 'Delivery Cost', 'Landed Cost', 'Truthful Profit']],
        body: buyerAllocData,
        foot: [[
          'TOTAL',
          `${buyer.totalQuantity.toFixed(2)} MT`,
          '',
          '',
          '',
          `₹${buyer.totalSavings.toLocaleString('en-IN')}`,
        ]],
        theme: 'striped',
        headStyles: { fillColor: [76, 175, 80], fontSize: 9, fontStyle: 'bold' },
        footStyles: { fillColor: [220, 220, 220], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 25, halign: 'right' },
          2: { cellWidth: 25, halign: 'right' },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
          5: { cellWidth: 35, halign: 'right' },
        },
        margin: { left: 14 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 6;

      if (yPos > 170) {
        doc.addPage();
        yPos = 15;
      }
    }

    // SELLER → BUYER ALLOCATION
    if (yPos > 150) {
      doc.addPage();
      yPos = 15;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SELLER → BUYER ALLOCATION', 14, yPos);
    yPos += 7;

    for (const [sellerId, seller] of sellerMap.entries()) {
      const sellerAllocData = seller.allocations.map((a: any) => [
        a.buyerName,
        `${a.quantity.toFixed(2)} MT`,
        `₹${a.price.toFixed(2)}/kg`,
        `₹${a.bonus.toLocaleString('en-IN')}`,
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [[{ content: seller.name, colSpan: 4, styles: { halign: 'left', fillColor: [255, 152, 0] } }], ['Buyer', 'Quantity', 'Clearing Price', 'Truthful Profit']],
        body: sellerAllocData,
        foot: [[
          'TOTAL',
          `${seller.totalQuantity.toFixed(2)} MT`,
          '',
          `₹${seller.totalBonus.toLocaleString('en-IN')}`,
        ]],
        theme: 'striped',
        headStyles: { fillColor: [255, 152, 0], fontSize: 9, fontStyle: 'bold' },
        footStyles: { fillColor: [220, 220, 220], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 30, halign: 'right' },
          2: { cellWidth: 35, halign: 'right' },
          3: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 14 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 6;

      if (yPos > 170) {
        doc.addPage();
        yPos = 15;
      }
    }

    // FINAL LANDING COST PER BUYER
    if (yPos > 140) {
      doc.addPage();
      yPos = 15;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('FINAL LANDING COST PER BUYER', 14, yPos);
    yPos += 7;

    const landingCostData = Array.from(buyerMap.entries()).map(([buyerId, buyer]) => {
      const avgLandedCost = buyer.totalQuantity > 0 
        ? buyer.allocations.reduce((sum: number, a: any) => sum + (a.landedCost * a.quantity), 0) / buyer.totalQuantity
        : 0;
      
      return [
        buyer.name,
        `${buyer.totalQuantity.toFixed(2)} MT`,
        `₹${avgLandedCost.toFixed(2)}/kg`,
        `₹${buyer.totalValue.toLocaleString('en-IN')}`,
        `₹${buyer.totalSavings.toLocaleString('en-IN')}`,
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [['Buyer', 'Total Quantity', 'Avg Landed Cost', 'Trade Value', 'Truthful Profit']],
      body: landingCostData,
      theme: 'grid',
      headStyles: { fillColor: [63, 81, 181], fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 32, halign: 'right' },
        2: { cellWidth: 40, halign: 'right', fillColor: [255, 243, 224] },
        3: { cellWidth: 42, halign: 'right' },
        4: { cellWidth: 42, halign: 'right', fontStyle: 'bold', fillColor: [232, 245, 233] },
      },
      margin: { left: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
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
