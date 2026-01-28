import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function POST(request: NextRequest) {
  try {
    const { auctionId } = await request.json();

    if (!auctionId) {
      return NextResponse.json({ error: 'Auction ID required' }, { status: 400 });
    }

    // Fetch all auction data
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    // Fetch allocations with relations
    const allocations = await prisma.allocation.findMany({
      where: { auctionId },
      include: {
        buyer: true,
        seller: true,
      },
    });

    // Fetch seller bids sorted by landed cost
    const sellerBids = await prisma.sellerBid.findMany({
      where: { auctionId },
      orderBy: { landedCostPerKg: 'asc' },
      include: { seller: true },
    });

    // Fetch buyer bids sorted by price DESC
    const buyerBids = await prisma.buyerBid.findMany({
      where: { auctionId },
      orderBy: { bidPricePerKg: 'desc' },
      include: { buyer: true },
    });

    // Fetch snapshots
    const gapSnapshots = await prisma.auctionGapSnapshot.findMany({
      where: { auctionId },
      orderBy: { price: 'asc' },
    });

    const supplySnapshots = await prisma.auctionSupplySnapshot.findMany({
      where: { auctionId },
      orderBy: { price: 'asc' },
    });

    const demandSnapshots = await prisma.auctionDemandSnapshot.findMany({
      where: { auctionId },
      orderBy: { price: 'desc' },
    });

    // Create PDF
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;

    // Helper function
    const formatNumber = (val: any, decimals = 2): string => {
      if (val === null || val === undefined) return '-';
      return Number(val).toFixed(decimals);
    };

    const formatCurrency = (val: any): string => {
      if (val === null || val === undefined) return '-';
      return '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // ===== PAGE 1: TITLE & SUMMARY =====
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Second Price Double Auction Report', pageWidth / 2, 25, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Auction ID: ${auctionId}`, pageWidth / 2, 35, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, 42, { align: 'center' });
    doc.text(`Status: ${auction.status}`, pageWidth / 2, 49, { align: 'center' });

    // Key Metrics Box
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(margin, 60, pageWidth - 2 * margin, 60);
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('AUCTION SUMMARY', pageWidth / 2, 70, { align: 'center' });
    
    const clearingPrice = Number(auction.clearingPrice) || 0;
    const clearingQty = Number(auction.clearingQuantityMt) || 0;
    const tradeValue = Number(auction.tradeValue) || 0;
    const totalSupply = Number(auction.totalSupplyMt) || 0;
    const totalDemand = Number(auction.totalDemandMt) || 0;
    
    // Find highest buyer bid for truthful price calculations
    const highestBuyerBid = buyerBids.length > 0 ? Number(buyerBids[0].bidPricePerKg) : 0;
    const secondHighestBid = buyerBids.length > 1 ? Number(buyerBids[1].bidPricePerKg) : highestBuyerBid;
    const truthfulPriceBonus = highestBuyerBid - secondHighestBid;
    const priceGap = highestBuyerBid - clearingPrice;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    const col1X = margin + 20;
    const col2X = pageWidth / 2 + 20;
    let summaryY = 82;
    
    // Left column
    doc.text(`Clearing Price: ${formatCurrency(clearingPrice)}/kg`, col1X, summaryY);
    doc.text(`Clearing Quantity: ${formatNumber(clearingQty)} MT`, col1X, summaryY + 8);
    doc.text(`Trade Value: ${formatCurrency(tradeValue)}`, col1X, summaryY + 16);
    doc.text(`Clearing Type: ${auction.clearingType || 'N/A'}`, col1X, summaryY + 24);
    
    // Right column
    doc.text(`Total Supply: ${formatNumber(totalSupply)} MT`, col2X, summaryY);
    doc.text(`Total Demand: ${formatNumber(totalDemand)} MT`, col2X, summaryY + 8);
    doc.text(`Highest Bid: ${formatCurrency(highestBuyerBid)}/kg`, col2X, summaryY + 16);
    doc.text(`Truthful Price Bonus: ${formatCurrency(truthfulPriceBonus)}/kg`, col2X, summaryY + 24);

    // Formula explanation box
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Excel Formula Reference:', margin, 135);
    doc.setFont('helvetica', 'normal');
    doc.text('• Trade Value = Clearing Price × Clearing Quantity × 1000', margin, 143);
    doc.text('• Truthful Price Bonus = Highest Bid - Second Highest Bid (Incentive for truthful bidding)', margin, 150);
    doc.text('• Clearing Price = Second Highest Bid (Second-price auction mechanism)', margin, 157);
    doc.text('• Price Gap = Highest Bid - Clearing Price', margin, 164);
    doc.text('• Cumulative Supply: Calculated TOP to BOTTOM', margin, 171);
    doc.text('• Cumulative Demand: Calculated BOTTOM to TOP (repeats when exhausted)', margin, 178);

    // ===== PAGE 2: SUPPLY TABLE =====
    doc.addPage();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('SECTION 1: SUPPLY TABLE (Sellers)', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Sorted by Landed Cost (Ascending). Cumulative Supply calculated TOP → BOTTOM.', pageWidth / 2, 22, { align: 'center' });

    // Build supply table data
    let cumulativeSupply = 0;
    const supplyTableData = sellerBids.map((bid: any, idx: number) => {
      cumulativeSupply += Number(bid.offerQuantityMt);
      return [
        idx + 1,
        bid.seller?.sellerName || 'Unknown',
        bid.seller?.location || '-',
        formatNumber(bid.distanceKm, 0),
        formatCurrency(bid.offerPricePerKg),
        formatCurrency(bid.deliveryCostPerKg),
        formatCurrency(bid.landedCostPerKg),
        formatNumber(bid.offerQuantityMt),
        formatNumber(cumulativeSupply),
      ];
    });

    autoTable(doc, {
      startY: 28,
      head: [[
        'S.No',
        'Seller Name',
        'Location',
        'Distance (km)',
        'Base Price (₹/kg)',
        'Delivery Cost (₹/kg)',
        'Landed Cost (₹/kg)',
        'Quantity (MT)',
        'Cumm Supply (MT)',
      ]],
      body: supplyTableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 240, 240] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { cellWidth: 35 },
        2: { cellWidth: 30 },
        3: { halign: 'center', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 30 },
        5: { halign: 'right', cellWidth: 30 },
        6: { halign: 'right', cellWidth: 30 },
        7: { halign: 'right', cellWidth: 25 },
        8: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
      },
    });

    // Add total row
    const supplyFinalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Supply: ${formatNumber(totalSupply)} MT`, pageWidth - margin, supplyFinalY + 8, { align: 'right' });

    // ===== PAGE 3: DEMAND TABLE =====
    doc.addPage();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('SECTION 2: DEMAND TABLE (Buyers)', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Sorted by Bid Price (Descending). Cumulative Demand calculated BOTTOM → TOP.', pageWidth / 2, 22, { align: 'center' });

    // Calculate cumulative demand BOTTOM to TOP
    // First, calculate total demand
    const totalBuyerQty = buyerBids.reduce((sum: number, b: any) => sum + Number(b.bidQuantityMt), 0);
    
    // Calculate cumulative demand from bottom to top
    // Start from the lowest price (last in sorted list) and work up
    const buyerBidsReversed = [...buyerBids].reverse();
    let runningDemand = 0;
    const cumulativeDemandMap = new Map<string, number>();
    
    for (const bid of buyerBidsReversed) {
      runningDemand += Number(bid.bidQuantityMt);
      cumulativeDemandMap.set(bid.id, runningDemand);
    }

    // Build demand table data (display in DESC price order, but with cumm demand from bottom-up calculation)
    const demandTableData = buyerBids.map((bid: any, idx: number) => {
      const cumDemand = cumulativeDemandMap.get(bid.id) || 0;
      return [
        idx + 1,
        bid.buyer?.buyerName || 'Unknown',
        bid.buyer?.organization || '-',
        formatCurrency(bid.bidPricePerKg),
        formatNumber(bid.bidQuantityMt),
        formatNumber(cumDemand),
        idx === 0 ? 'HIGHEST' : (idx === 1 ? 'SECOND' : '-'),
      ];
    });

    autoTable(doc, {
      startY: 28,
      head: [[
        'S.No',
        'Buyer Name',
        'Organization',
        'Bid Price (₹/kg)',
        'Quantity (MT)',
        'Cumm Demand (MT)',
        'Ranking',
      ]],
      body: demandTableData,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 240, 240] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { cellWidth: 45 },
        2: { cellWidth: 50 },
        3: { halign: 'right', cellWidth: 35 },
        4: { halign: 'right', cellWidth: 30 },
        5: { halign: 'right', cellWidth: 35, fontStyle: 'bold' },
        6: { halign: 'center', cellWidth: 25 },
      },
      didParseCell: function(data) {
        // Highlight highest and second highest
        if (data.section === 'body' && data.row.index === 0) {
          data.cell.styles.fillColor = [255, 230, 230];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.section === 'body' && data.row.index === 1) {
          data.cell.styles.fillColor = [230, 255, 230];
        }
      },
    });

    const demandFinalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Demand: ${formatNumber(totalDemand)} MT`, pageWidth - margin, demandFinalY + 8, { align: 'right' });
    
    // Formula box
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Note: Clearing Price = Second Highest Bid = ' + formatCurrency(clearingPrice) + '/kg', margin, demandFinalY + 16);
    doc.text('Truthful Price Bonus = ' + formatCurrency(highestBuyerBid) + ' - ' + formatCurrency(secondHighestBid) + ' = ' + formatCurrency(truthfulPriceBonus) + '/kg', margin, demandFinalY + 23);

    // ===== PAGE 4: GAP TABLE (MARKET CLEARING) =====
    doc.addPage();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('SECTION 3: GAP TABLE (Market Clearing Analysis)', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Gap = Cumulative Supply - Cumulative Demand. Clearing occurs where Gap crosses zero or changes sign.', pageWidth / 2, 22, { align: 'center' });

    // Build gap table from snapshots or calculate from bids
    interface GapRow {
      price: number;
      supply: number;
      demand: number;
      gap: number;
      status: string;
    }
    
    let gapTableData: GapRow[] = [];
    
    if (gapSnapshots.length > 0) {
      gapTableData = gapSnapshots.map((snap: any) => ({
        price: Number(snap.price),
        supply: Number(snap.supply),
        demand: Number(snap.demand),
        gap: Number(snap.gap),
        status: Number(snap.gap) < 0 ? 'SHORTAGE' : (Number(snap.gap) > 0 ? 'SURPLUS' : 'CLEARING'),
      }));
    } else {
      // Calculate from bids if no snapshots
      // Create a merged price grid
      const pricePoints = new Set<number>();
      sellerBids.forEach((b: any) => pricePoints.add(Number(b.landedCostPerKg)));
      buyerBids.forEach((b: any) => pricePoints.add(Number(b.bidPricePerKg)));
      
      const sortedPrices = Array.from(pricePoints).sort((a, b) => a - b);
      
      sortedPrices.forEach(price => {
        // Cumulative supply at this price (all sellers with landed cost <= price)
        const supply = sellerBids
          .filter((b: any) => Number(b.landedCostPerKg) <= price)
          .reduce((sum: number, b: any) => sum + Number(b.offerQuantityMt), 0);
        
        // Cumulative demand at this price (all buyers with bid >= price)
        const demand = buyerBids
          .filter((b: any) => Number(b.bidPricePerKg) >= price)
          .reduce((sum: number, b: any) => sum + Number(b.bidQuantityMt), 0);
        
        const gap = supply - demand;
        
        gapTableData.push({
          price,
          supply,
          demand,
          gap,
          status: gap < 0 ? 'SHORTAGE' : (gap > 0 ? 'SURPLUS' : 'CLEARING'),
        });
      });
    }

    // Find clearing row index
    let clearingRowIdx = -1;
    for (let i = 0; i < gapTableData.length; i++) {
      if (gapTableData[i].gap >= 0) {
        clearingRowIdx = i;
        break;
      }
    }

    const gapTableBody = gapTableData.map((row, idx) => [
      idx + 1,
      formatCurrency(row.price),
      formatNumber(row.supply),
      formatNumber(row.demand),
      formatNumber(row.gap),
      row.status,
      idx === clearingRowIdx ? '>>> CLEARING PRICE <<<' : '',
    ]);

    autoTable(doc, {
      startY: 28,
      head: [[
        'Row',
        'Price (₹/kg)',
        'Cumm Supply (MT)',
        'Cumm Demand (MT)',
        'Gap (S - D)',
        'Status',
        'Notes',
      ]],
      body: gapTableBody,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [142, 68, 173], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 240, 240] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { halign: 'right', cellWidth: 30 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 35 },
        4: { halign: 'right', cellWidth: 30 },
        5: { halign: 'center', cellWidth: 25 },
        6: { halign: 'center', cellWidth: 50 },
      },
      didParseCell: function(data) {
        if (data.section === 'body') {
          // Highlight clearing row
          if (data.row.index === clearingRowIdx) {
            data.cell.styles.fillColor = [255, 255, 150];
            data.cell.styles.fontStyle = 'bold';
          }
          // Color code status
          if (data.column.index === 5) {
            const cellText = String(data.cell.raw);
            if (cellText === 'SHORTAGE') {
              data.cell.styles.textColor = [192, 57, 43];
            } else if (cellText === 'SURPLUS') {
              data.cell.styles.textColor = [39, 174, 96];
            } else if (cellText === 'CLEARING') {
              data.cell.styles.textColor = [41, 128, 185];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      },
    });

    // ===== PAGE 5: ALLOCATIONS =====
    doc.addPage();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('SECTION 4: BUYER-SELLER ALLOCATIONS', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Final allocations with trade details. Buyer Savings = (Bid Price - Final Price) × Quantity × 1000', pageWidth / 2, 22, { align: 'center' });

    const allocationTableData = allocations.map((alloc: any, idx: number) => {
      const qty = Number(alloc.allocatedQuantityMt);
      const bidPrice = Number(alloc.buyerBidPrice);
      const finalPrice = Number(alloc.finalPricePerKg);
      const sellerOffer = Number(alloc.sellerOfferPrice);
      const sellerLanded = Number(alloc.sellerLandedCost) || sellerOffer;
      const savings = (bidPrice - finalPrice) * qty * 1000;
      const sellerBonus = (finalPrice - sellerLanded) * qty * 1000;
      const tradeVal = finalPrice * qty * 1000;
      
      return [
        idx + 1,
        alloc.buyer?.buyerName || 'Unknown',
        alloc.seller?.sellerName || 'Unknown',
        formatCurrency(bidPrice),
        formatCurrency(sellerLanded),
        formatCurrency(finalPrice),
        formatNumber(qty),
        formatCurrency(tradeVal),
        formatCurrency(savings > 0 ? savings : 0),
        formatCurrency(sellerBonus > 0 ? sellerBonus : 0),
      ];
    });

    autoTable(doc, {
      startY: 28,
      head: [[
        'S.No',
        'Buyer',
        'Seller',
        'Bid Price (₹/kg)',
        'Landed Cost (₹/kg)',
        'Final Price (₹/kg)',
        'Qty (MT)',
        'Trade Value (₹)',
        'Buyer Savings (₹)',
        'Seller Bonus (₹)',
      ]],
      body: allocationTableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [230, 126, 34], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 240, 240] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
        3: { halign: 'right', cellWidth: 28 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'right', cellWidth: 28 },
        6: { halign: 'right', cellWidth: 18 },
        7: { halign: 'right', cellWidth: 30 },
        8: { halign: 'right', cellWidth: 28 },
        9: { halign: 'right', cellWidth: 28 },
      },
    });

    // Calculate totals
    let totalTradeValue = 0;
    let totalBuyerSavings = 0;
    let totalSellerBonus = 0;
    
    allocations.forEach((alloc: any) => {
      const qty = Number(alloc.allocatedQuantityMt);
      const bidPrice = Number(alloc.buyerBidPrice);
      const finalPrice = Number(alloc.finalPricePerKg);
      const sellerLanded = Number(alloc.sellerLandedCost) || Number(alloc.sellerOfferPrice);
      
      totalTradeValue += finalPrice * qty * 1000;
      const savings = (bidPrice - finalPrice) * qty * 1000;
      totalBuyerSavings += savings > 0 ? savings : 0;
      const bonus = (finalPrice - sellerLanded) * qty * 1000;
      totalSellerBonus += bonus > 0 ? bonus : 0;
    });

    const allocFinalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Trade Value: ${formatCurrency(totalTradeValue)}`, pageWidth - margin, allocFinalY + 8, { align: 'right' });
    doc.text(`Total Buyer Savings: ${formatCurrency(totalBuyerSavings)}`, pageWidth - margin, allocFinalY + 15, { align: 'right' });
    doc.text(`Total Seller Bonus: ${formatCurrency(totalSellerBonus)}`, pageWidth - margin, allocFinalY + 22, { align: 'right' });

    // ===== PAGE 6: SELLER SUMMARY =====
    doc.addPage();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('SECTION 5: SELLER SUMMARY', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Seller performance summary. Truthful Price Bonus = (Clearing Price - Seller Landed Cost) × Allocated Qty × 1000', pageWidth / 2, 22, { align: 'center' });

    // Aggregate by seller
    const sellerSummary = new Map<string, {
      name: string;
      location: string;
      offered: number;
      allocated: number;
      landedCost: number;
      bonus: number;
      tradeValue: number;
    }>();

    sellerBids.forEach((bid: any) => {
      const sellerId = bid.sellerId;
      if (!sellerSummary.has(sellerId)) {
        sellerSummary.set(sellerId, {
          name: bid.seller?.sellerName || 'Unknown',
          location: bid.seller?.location || '-',
          offered: Number(bid.offerQuantityMt),
          allocated: 0,
          landedCost: Number(bid.landedCostPerKg),
          bonus: 0,
          tradeValue: 0,
        });
      }
    });

    allocations.forEach((alloc: any) => {
      const sellerId = alloc.sellerId;
      const existing = sellerSummary.get(sellerId);
      if (existing) {
        const qty = Number(alloc.allocatedQuantityMt);
        existing.allocated += qty;
        const bonus = (clearingPrice - existing.landedCost) * qty * 1000;
        existing.bonus += bonus > 0 ? bonus : 0;
        existing.tradeValue += clearingPrice * qty * 1000;
      }
    });

    const sellerSummaryData = Array.from(sellerSummary.values()).map((s, idx) => [
      idx + 1,
      s.name,
      s.location,
      formatCurrency(s.landedCost),
      formatNumber(s.offered),
      formatNumber(s.allocated),
      formatNumber(s.offered - s.allocated),
      formatCurrency(s.tradeValue),
      formatCurrency(s.bonus),
    ]);

    autoTable(doc, {
      startY: 28,
      head: [[
        'S.No',
        'Seller Name',
        'Location',
        'Landed Cost (₹/kg)',
        'Offered (MT)',
        'Allocated (MT)',
        'Unsold (MT)',
        'Trade Value (₹)',
        'Bonus (₹)',
      ]],
      body: sellerSummaryData,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 240, 240] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { cellWidth: 40 },
        2: { cellWidth: 35 },
        3: { halign: 'right', cellWidth: 30 },
        4: { halign: 'right', cellWidth: 25 },
        5: { halign: 'right', cellWidth: 25 },
        6: { halign: 'right', cellWidth: 25 },
        7: { halign: 'right', cellWidth: 35 },
        8: { halign: 'right', cellWidth: 30 },
      },
    });

    // ===== FINAL PAGE: KEY METRICS & FORMULAS =====
    doc.addPage();
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('FINAL SUMMARY & EXCEL FORMULAS', pageWidth / 2, 20, { align: 'center' });

    // Draw summary boxes
    const boxY = 35;
    const boxHeight = 30;
    const boxWidth = (pageWidth - 3 * margin) / 3;

    // Box 1: Trade Value
    doc.setFillColor(41, 128, 185);
    doc.rect(margin, boxY, boxWidth, boxHeight, 'F');
    doc.setTextColor(255);
    doc.setFontSize(10);
    doc.text('TRADE VALUE', margin + boxWidth/2, boxY + 10, { align: 'center' });
    doc.setFontSize(14);
    doc.text(formatCurrency(tradeValue), margin + boxWidth/2, boxY + 22, { align: 'center' });

    // Box 2: Clearing Price
    doc.setFillColor(39, 174, 96);
    doc.rect(margin + boxWidth + 5, boxY, boxWidth, boxHeight, 'F');
    doc.setFontSize(10);
    doc.text('CLEARING PRICE', margin + boxWidth + 5 + boxWidth/2, boxY + 10, { align: 'center' });
    doc.setFontSize(14);
    doc.text(formatCurrency(clearingPrice) + '/kg', margin + boxWidth + 5 + boxWidth/2, boxY + 22, { align: 'center' });

    // Box 3: Clearing Quantity
    doc.setFillColor(142, 68, 173);
    doc.rect(margin + 2 * (boxWidth + 5), boxY, boxWidth, boxHeight, 'F');
    doc.setFontSize(10);
    doc.text('CLEARING QUANTITY', margin + 2 * (boxWidth + 5) + boxWidth/2, boxY + 10, { align: 'center' });
    doc.setFontSize(14);
    doc.text(formatNumber(clearingQty) + ' MT', margin + 2 * (boxWidth + 5) + boxWidth/2, boxY + 22, { align: 'center' });

    // Reset text color
    doc.setTextColor(0);

    // Formula Reference Table
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Excel Formula Reference', margin, boxY + 50);

    const formulaData = [
      ['Trade Value', 'Clearing Price × Clearing Quantity × 1000', formatCurrency(tradeValue)],
      ['Clearing Price', 'Second Highest Buyer Bid Price', formatCurrency(clearingPrice) + '/kg'],
      ['Clearing Quantity', 'MIN(Total Supply, Total Demand) from PREVIOUS row', formatNumber(clearingQty) + ' MT'],
      ['Truthful Price Bonus', 'Highest Bid - Second Highest Bid', formatCurrency(truthfulPriceBonus) + '/kg'],
      ['Price Gap', 'Highest Bid - Clearing Price', formatCurrency(priceGap) + '/kg'],
      ['Gap (S - D)', 'Cumulative Supply - Cumulative Demand', 'At each price point'],
      ['Cumulative Supply', 'Running sum TOP → BOTTOM by Landed Cost', formatNumber(totalSupply) + ' MT (Total)'],
      ['Cumulative Demand', 'Running sum BOTTOM → TOP by Bid Price', formatNumber(totalDemand) + ' MT (Total)'],
      ['Buyer Savings', '(Bid Price - Final Price) × Quantity × 1000', 'Per allocation'],
      ['Seller Bonus', '(Final Price - Landed Cost) × Quantity × 1000', 'Per allocation'],
    ];

    autoTable(doc, {
      startY: boxY + 55,
      head: [['Metric', 'Formula', 'Value']],
      body: formulaData,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [44, 62, 80], textColor: 255 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { cellWidth: 150 },
        2: { halign: 'right', cellWidth: 50 },
      },
    });

    // Add footer with page numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(
        `Page ${i} of ${totalPages} | Second Price Double Auction Report | Auction ID: ${auctionId}`,
        pageWidth / 2,
        pageHeight - 5,
        { align: 'center' }
      );
    }

    // Generate PDF
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=auction-report-${auctionId}.pdf`,
      },
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Failed to generate report', details: String(error) },
      { status: 500 }
    );
  }
}
