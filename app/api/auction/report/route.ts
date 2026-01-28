import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const dynamic = 'force-dynamic';

// Use 'any' cast to bypass TypeScript cache issues with Prisma client
const db = prisma as any;

export async function POST(request: NextRequest) {
  try {
    // Fetch completed auction
    const auction = await db.auction.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });

    if (!auction) {
      return NextResponse.json({ error: 'No completed auction found' }, { status: 404 });
    }

    // Fetch all data from database
    const sellers = await db.seller.findMany({
      orderBy: { reservePrice: 'asc' },
    });

    const bids = await db.bid.findMany({
      where: { auctionId: auction.id },
      include: { 
        user: true,
        splits: {
          orderBy: { price: 'desc' }
        }
      },
    });

    const sellerAllocations = await db.sellerAllocation.findMany({
      where: { auctionId: auction.id },
      orderBy: { reservePrice: 'asc' },
    });

    const buyerAllocations = await db.buyerAllocation.findMany({
      where: { auctionId: auction.id },
      include: { buyer: true, seller: true },
    });

    const gapSnapshots = await db.auctionGapSnapshot.findMany({
      where: { auctionId: auction.id },
      orderBy: { price: 'asc' },
    });

    const supplySnapshots = await db.auctionSupplySnapshot.findMany({
      where: { auctionId: auction.id },
      orderBy: { price: 'asc' },
    });

    const demandSnapshots = await db.auctionDemandSnapshot.findMany({
      where: { auctionId: auction.id },
      orderBy: { price: 'desc' },
    });

    // Generate PDF
    const doc = new jsPDF();
    
    // Calculate key values
    const clearingPrice = Number(auction.clearingPrice);
    const clearingQuantity = Number(auction.clearingQuantity);
    const totalTradeValue = Number(auction.totalTradeValue);
    const totalBonus = sellerAllocations.reduce((sum: number, a: any) => sum + Number(a.bonus), 0);
    const totalSupply = sellers.reduce((sum: number, s: any) => sum + Number(s.quantity), 0);
    const totalDemand = bids.reduce((sum: number, b: any) => {
      const splits = b.splits || [];
      return sum + splits.reduce((s: number, sp: any) => s + Number(sp.quantity), 0);
    }, 0);
    
    // ========================================
    // TITLE & HEADER
    // ========================================
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('SECOND PRICE AUCTION REPORT', 105, 18, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 26, { align: 'center' });
    
    doc.line(15, 30, 195, 30);

    // ========================================
    // SECTION 1: AUCTION SUMMARY
    // ========================================
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175); // Blue
    doc.text('SECTION 1: AUCTION SUMMARY', 15, 38);
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: 42,
      head: [['Auction ID', 'Status', 'Tick Size', 'Clearing Type', 'Clearing Price', 'Clearing Qty (MT)', 'Trade Value', 'Total Bonus', 'Total Supply', 'Total Demand', 'Completed At']],
      body: [[
        auction.id.substring(0, 8) + '...',
        auction.status,
        `₹${Number(auction.tickSize || 0.5).toFixed(2)}`,
        auction.clearingType || 'N/A',
        `₹${clearingPrice.toFixed(2)}`,
        clearingQuantity.toFixed(4),
        `₹${totalTradeValue.toFixed(2)}`,
        `₹${totalBonus.toFixed(2)}`,
        totalSupply.toFixed(4),
        totalDemand.toFixed(4),
        auction.endTime ? new Date(auction.endTime).toLocaleString() : '-',
      ]],
      theme: 'grid',
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      styles: { cellPadding: 2 },
    });

    // ========================================
    // SECTION 2: SUPPLY CURVE & GAP TABLE
    // ========================================
    let currentY = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 101, 52); // Green
    doc.text('SECTION 2: SUPPLY CURVE & GAP TABLE', 15, currentY);
    doc.setTextColor(0, 0, 0);

    // Build gap table from gap snapshots with seller quantities
    const gapTableData: any[] = [];
    
    // Create a map of seller info by price
    const sellerInfoByPrice = new Map<number, { name: string; qty: number }>();
    sellers.forEach((seller: any) => {
      const price = Number(seller.reservePrice);
      sellerInfoByPrice.set(price, { name: seller.name, qty: Number(seller.quantity) });
    });
    
    if (gapSnapshots && gapSnapshots.length > 0) {
      gapSnapshots.forEach((point: any) => {
        const price = Number(point.price);
        const gap = Number(point.gap);
        const supply = Number(point.supply);
        const demand = Number(point.demand);
        const sellerInfo = sellerInfoByPrice.get(price);
        
        let status = 'SHORTAGE';
        if (Math.abs(gap) < 0.0001) {
          status = 'EXACT MATCH';
        } else if (gap > 0) {
          status = 'SURPLUS';
        }
        
        // Calculate trade value at this price point (if demand exists)
        const tradeQty = Math.min(supply, demand);
        const tradeValue = tradeQty * price * 1000; // MT to Kg
        
        gapTableData.push([
          `₹${price.toFixed(2)}`,
          sellerInfo?.name || '-',
          sellerInfo?.qty?.toFixed(2) || '-',
          supply.toFixed(2),
          demand.toFixed(2),
          gap.toFixed(2),
          `₹${tradeValue.toFixed(2)}`,
          status,
        ]);
      });
    } else {
      // Fallback: Build from sellers
      let cumulativeSupply = 0;
      sellers.forEach((seller: any) => {
        cumulativeSupply += Number(seller.quantity);
        gapTableData.push([
          `₹${Number(seller.reservePrice).toFixed(2)}`,
          seller.name,
          Number(seller.quantity).toFixed(2),
          cumulativeSupply.toFixed(2),
          '-',
          '-',
          '-',
          '-',
        ]);
      });
    }

    autoTable(doc, {
      startY: currentY + 4,
      head: [['Price', 'Seller', 'Seller Qty', 'Cum. Supply', 'Cum. Demand', 'Gap', 'Trade Value', 'Status']],
      body: gapTableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 101, 52], textColor: 255, fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      styles: { cellPadding: 1.5 },
      didParseCell: function(data: any) {
        if (data.section === 'body' && data.column.index === 7) {
          const status = data.cell.text[0];
          if (status === 'EXACT MATCH') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'SHORTAGE') {
            data.cell.styles.textColor = [220, 38, 38];
          } else if (status === 'SURPLUS') {
            data.cell.styles.textColor = [37, 99, 235];
          }
        }
      },
    });

    // Draw Supply-Demand Graph
    currentY = (doc as any).lastAutoTable.finalY + 8;
    
    if (supplySnapshots && supplySnapshots.length > 0 && demandSnapshots && demandSnapshots.length > 0) {
      // Check if we need new page for graph
      if (currentY > 180) {
        doc.addPage();
        currentY = 20;
      }
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Supply-Demand Curve', 15, currentY);

      const graphX = 35;
      const graphStartY = currentY + 12;
      const graphWidth = 140;
      const graphHeight = 60;

      // Find data ranges
      const allPrices = [
        ...supplySnapshots.map((s: any) => Number(s.price)),
        ...demandSnapshots.map((d: any) => Number(d.price)),
      ].filter(p => !isNaN(p) && isFinite(p));
      
      const allQuantities = [
        ...supplySnapshots.map((s: any) => Number(s.cumulativeSupply)),
        ...demandSnapshots.map((d: any) => Number(d.cumulativeDemand)),
      ].filter(q => !isNaN(q) && isFinite(q));

      if (allPrices.length > 0 && allQuantities.length > 0) {
        const minPrice = Math.min(...allPrices);
        const maxPrice = Math.max(...allPrices);
        const maxQty = Math.max(...allQuantities, 0.001);
        const priceRange = maxPrice - minPrice || 1;

        const scaleX = (qty: number) => {
          const scaled = graphX + (qty / maxQty) * graphWidth;
          return Math.max(graphX, Math.min(graphX + graphWidth, scaled));
        };
        const scaleY = (price: number) => {
          const scaled = graphStartY + graphHeight - ((price - minPrice) / priceRange) * graphHeight;
          return Math.max(graphStartY, Math.min(graphStartY + graphHeight, scaled));
        };

        // Draw axes
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(graphX, graphStartY, graphX, graphStartY + graphHeight);
        doc.line(graphX, graphStartY + graphHeight, graphX + graphWidth, graphStartY + graphHeight);

        // Y-axis labels (Price) with grid lines
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        const priceStep = priceRange / 5;
        for (let i = 0; i <= 5; i++) {
          const price = minPrice + (priceStep * i);
          const y = scaleY(price);
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.2);
          doc.line(graphX, y, graphX + graphWidth, y);
          doc.setDrawColor(0);
          doc.text(`₹${price.toFixed(2)}`, graphX - 2, y + 1, { align: 'right' });
        }

        // X-axis labels (Quantity) with grid lines
        const qtyStep = maxQty / 5;
        for (let i = 0; i <= 5; i++) {
          const qty = qtyStep * i;
          const x = scaleX(qty);
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.2);
          doc.line(x, graphStartY, x, graphStartY + graphHeight);
          doc.setDrawColor(0);
          doc.text(qty.toFixed(0), x, graphStartY + graphHeight + 4, { align: 'center' });
        }

        // Axis titles
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('Price (₹/Kg)', graphX - 20, graphStartY + graphHeight / 2, { angle: 90 });
        doc.text('Quantity (MT)', graphX + graphWidth / 2, graphStartY + graphHeight + 10, { align: 'center' });

        // Draw Supply curve (green step function)
        const sortedSupply = [...supplySnapshots].sort((a: any, b: any) => Number(a.price) - Number(b.price));
        if (sortedSupply.length > 0) {
          doc.setDrawColor(34, 197, 94);
          doc.setLineWidth(1.5);
          let prevX = graphX;
          let prevY = scaleY(Number(sortedSupply[0]?.price) || minPrice);
          
          sortedSupply.forEach((point: any, index: number) => {
            const price = Number(point.price);
            const qty = Number(point.cumulativeSupply);
            if (isNaN(price) || isNaN(qty)) return;
            
            const x = scaleX(qty);
            const y = scaleY(price);
            
            if (index > 0) {
              doc.line(prevX, prevY, x, prevY);
              doc.line(x, prevY, x, y);
            }
            prevX = x;
            prevY = y;
          });
        }

        // Draw Demand curve (blue step function)
        const sortedDemand = [...demandSnapshots].sort((a: any, b: any) => Number(b.price) - Number(a.price));
        if (sortedDemand.length > 0) {
          doc.setDrawColor(59, 130, 246);
          doc.setLineWidth(1.5);
          let prevX = graphX;
          let prevY = scaleY(Number(sortedDemand[0]?.price) || maxPrice);
          
          sortedDemand.forEach((point: any, index: number) => {
            const price = Number(point.price);
            const qty = Number(point.cumulativeDemand);
            if (isNaN(price) || isNaN(qty)) return;
            
            const x = scaleX(qty);
            const y = scaleY(price);
            
            if (index > 0) {
              doc.line(prevX, prevY, x, prevY);
              doc.line(x, prevY, x, y);
            }
            prevX = x;
            prevY = y;
          });
        }

        // Mark clearing point
        if (!isNaN(clearingPrice) && !isNaN(clearingQuantity) && clearingQuantity > 0) {
          const clearingY = scaleY(clearingPrice);
          const clearingX = scaleX(clearingQuantity);
          
          doc.setDrawColor(255, 0, 0);
          doc.setLineWidth(0.3);
          // Dotted lines
          for (let i = graphX; i < clearingX; i += 3) {
            doc.line(i, clearingY, Math.min(i + 1.5, clearingX), clearingY);
          }
          for (let i = clearingY; i < graphStartY + graphHeight; i += 3) {
            doc.line(clearingX, i, clearingX, Math.min(i + 1.5, graphStartY + graphHeight));
          }

          doc.setFillColor(255, 0, 0);
          doc.circle(clearingX, clearingY, 2, 'F');
        }

        // Legend
        const legendX = graphX + graphWidth + 5;
        const legendY = graphStartY + 5;
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setDrawColor(34, 197, 94);
        doc.setLineWidth(1);
        doc.line(legendX, legendY, legendX + 8, legendY);
        doc.text('Supply', legendX + 10, legendY + 1);
        
        doc.setDrawColor(59, 130, 246);
        doc.line(legendX, legendY + 5, legendX + 8, legendY + 5);
        doc.text('Demand', legendX + 10, legendY + 6);
        
        doc.setFillColor(255, 0, 0);
        doc.circle(legendX + 4, legendY + 10, 1, 'F');
        doc.text('Clearing', legendX + 10, legendY + 11);

        currentY = graphStartY + graphHeight + 15;
      }
    }

    // ========================================
    // SECTION 3: SELLER-WISE ALLOCATION
    // ========================================
    if (currentY > 200) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(185, 28, 28); // Red
    doc.text('SECTION 3: SELLER-WISE ALLOCATION', 15, currentY);
    doc.setTextColor(0, 0, 0);

    // Create seller map for offered qty lookup
    const sellerOfferedMap = new Map<string, number>();
    sellers.forEach((s: any) => {
      sellerOfferedMap.set(s.id, Number(s.quantity));
    });

    const sellerTableData = sellerAllocations.map((alloc: any) => {
      const offeredQty = sellerOfferedMap.get(alloc.sellerId) || Number(alloc.quantity);
      const soldQty = Number(alloc.quantity);
      const percentSold = offeredQty > 0 ? ((soldQty / offeredQty) * 100).toFixed(1) + '%' : '0%';
      
      // Status: Check if reserve price is at or below clearing price
      const reservePrice = Number(alloc.reservePrice);
      const status = reservePrice <= clearingPrice ? 'ACCEPTED' : 'ABOVE CLEARING';
      
      // Trade Value at Clearing Price = Quantity × Clearing Price × 1000 (MT to Kg)
      const tradeAtClearing = soldQty * clearingPrice * 1000;
      
      return [
        alloc.sellerName,
        offeredQty.toFixed(2),
        soldQty.toFixed(2),
        percentSold,
        `₹${reservePrice.toFixed(2)}`,
        `₹${clearingPrice.toFixed(2)}`,
        `₹${Number(alloc.tradeValue).toFixed(2)}`,
        `₹${Number(alloc.bonus).toFixed(2)}`,
        `₹${tradeAtClearing.toFixed(2)}`,
        status,
      ];
    });

    autoTable(doc, {
      startY: currentY + 4,
      head: [['Seller', 'Offered', 'Sold', '% Sold', 'Reserve', 'Clearing', 'Trade Value', 'Bonus', 'Trade @ Clearing', 'Status']],
      body: sellerTableData,
      foot: [[
        'TOTAL',
        totalSupply.toFixed(2),
        clearingQuantity.toFixed(2),
        ((clearingQuantity / totalSupply) * 100).toFixed(1) + '%',
        '',
        '',
        `₹${totalTradeValue.toFixed(2)}`,
        `₹${totalBonus.toFixed(2)}`,
        `₹${(clearingQuantity * clearingPrice * 1000).toFixed(2)}`,
        '',
      ]],
      theme: 'grid',
      headStyles: { fillColor: [185, 28, 28], textColor: 255, fontSize: 6 },
      bodyStyles: { fontSize: 6 },
      footStyles: { fillColor: [229, 231, 235], textColor: 0, fontStyle: 'bold', fontSize: 6 },
      styles: { cellPadding: 1 },
      didParseCell: function(data: any) {
        if (data.section === 'body' && data.column.index === 9) {
          const val = data.cell.text[0];
          if (val === 'ACCEPTED') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
    });

    // ========================================
    // SECTION 4: BUYER-WISE ALLOCATION MATRIX
    // ========================================
    currentY = (doc as any).lastAutoTable.finalY + 10;

    if (currentY > 200) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9); // Orange/Amber
    doc.text('SECTION 4: BUYER-WISE ALLOCATION MATRIX', 15, currentY);
    doc.setTextColor(0, 0, 0);

    // Create detailed buyer-seller allocation rows
    // AGGREGATE: Merge duplicate buyer+seller combinations
    const buyerSellerAggregated = new Map<string, { buyerName: string; sellerName: string; quantity: number }>();
    
    // Group by buyer for summary info
    const buyerTotals = new Map<string, { name: string; totalQty: number; totalValue: number }>();
    
    buyerAllocations.forEach((ba: any) => {
      const qty = Number(ba.quantity);
      const value = qty * clearingPrice * 1000; // MT to Kg
      
      // Aggregate buyer totals
      if (!buyerTotals.has(ba.buyerId)) {
        buyerTotals.set(ba.buyerId, { name: ba.buyerName, totalQty: 0, totalValue: 0 });
      }
      const bt = buyerTotals.get(ba.buyerId)!;
      bt.totalQty += qty;
      bt.totalValue += value;
      
      // Aggregate buyer-seller pairs (remove duplicates)
      const key = `${ba.buyerId}__${ba.sellerId}`;
      if (buyerSellerAggregated.has(key)) {
        const existing = buyerSellerAggregated.get(key)!;
        existing.quantity += qty;
      } else {
        buyerSellerAggregated.set(key, {
          buyerName: ba.buyerName,
          sellerName: ba.sellerName,
          quantity: qty,
        });
      }
    });
    
    // Build aggregated matrix data (no duplicates)
    const buyerMatrixData: any[] = [];
    buyerSellerAggregated.forEach((agg) => {
      const value = agg.quantity * clearingPrice * 1000;
      buyerMatrixData.push([
        agg.buyerName,
        agg.sellerName,
        agg.quantity.toFixed(4),
        `₹${clearingPrice.toFixed(2)}`,
        `₹${value.toFixed(2)}`,
      ]);
    });

    autoTable(doc, {
      startY: currentY + 4,
      head: [['Buyer', 'From Seller', 'Qty (MT)', 'Price/Kg', 'Trade Value']],
      body: buyerMatrixData,
      theme: 'grid',
      headStyles: { fillColor: [180, 83, 9], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      styles: { cellPadding: 2 },
    });

    // ========================================
    // SECTION 5: BUYER SUMMARY & NO-TRADE ANALYSIS
    // ========================================
    currentY = (doc as any).lastAutoTable.finalY + 10;

    if (currentY > 220) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(124, 58, 237); // Purple
    doc.text('SECTION 5: BUYER SUMMARY & NO-TRADE ANALYSIS', 15, currentY);
    doc.setTextColor(0, 0, 0);

    // Build buyer summary with status
    const buyerSummaryData: any[] = [];
    const noTradeAnalysis: any[] = [];

    // Get all unique buyers from bids
    const allBuyersMap = new Map<string, { name: string; bidQty: number; maxBidPrice: number }>();
    bids.forEach((bid: any) => {
      const splits = bid.splits || [];
      const totalBidQty = splits.reduce((s: number, sp: any) => s + Number(sp.quantity), 0);
      const maxPrice = splits.length > 0 ? Math.max(...splits.map((sp: any) => Number(sp.price))) : 0;
      
      allBuyersMap.set(bid.userId, {
        name: bid.user.name,
        bidQty: totalBidQty,
        maxBidPrice: maxPrice,
      });
    });

    allBuyersMap.forEach((buyer, buyerId) => {
      const allocation = buyerTotals.get(buyerId);
      const allocatedQty = allocation?.totalQty || 0;
      const allocatedValue = allocation?.totalValue || 0;
      
      let status = 'NO TRADE';
      if (allocatedQty >= buyer.bidQty * 0.999) {
        status = 'FULLY ALLOCATED';
      } else if (allocatedQty > 0) {
        status = 'PARTIALLY ALLOCATED';
      }

      buyerSummaryData.push([
        buyer.name,
        buyer.bidQty.toFixed(4),
        allocatedQty.toFixed(4),
        `₹${allocatedValue.toFixed(2)}`,
        status,
      ]);

      // Collect no-trade buyers with reason
      if (status === 'NO TRADE') {
        let reason = 'Unknown';
        if (buyer.maxBidPrice < clearingPrice) {
          reason = `Bid price (Rs ${buyer.maxBidPrice.toFixed(2)}) below clearing (Rs ${clearingPrice.toFixed(2)})`;
        } else if (buyer.bidQty === 0) {
          reason = 'No quantity bid';
        } else {
          reason = 'Insufficient supply at bid prices';
        }
        noTradeAnalysis.push([buyer.name, buyer.bidQty.toFixed(4), `₹${buyer.maxBidPrice.toFixed(2)}`, reason]);
      }
    });

    autoTable(doc, {
      startY: currentY + 4,
      head: [['Buyer', 'Bid Qty (MT)', 'Allocated Qty', 'Trade Value', 'Status']],
      body: buyerSummaryData,
      theme: 'grid',
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      styles: { cellPadding: 2 },
      didParseCell: function(data: any) {
        if (data.section === 'body' && data.column.index === 4) {
          const status = data.cell.text[0];
          if (status === 'FULLY ALLOCATED') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'PARTIALLY ALLOCATED') {
            data.cell.styles.textColor = [180, 83, 9];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'NO TRADE') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    // Buyers Without Trade sub-section
    if (noTradeAnalysis.length > 0) {
      currentY = (doc as any).lastAutoTable.finalY + 8;
      
      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text('Buyers Without Trade - Analysis', 15, currentY);
      doc.setTextColor(0, 0, 0);

      autoTable(doc, {
        startY: currentY + 4,
        head: [['Buyer', 'Bid Qty', 'Max Bid Price', 'Reason for No Trade']],
        body: noTradeAnalysis,
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        styles: { cellPadding: 2 },
      });
    }

    // ========================================
    // FOOTER
    // ========================================
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Page ${i} of ${pageCount} | Second Price Auction Report`,
        105,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    // Generate buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="auction-report-${new Date().toISOString()}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
