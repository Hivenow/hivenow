import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface InvoiceItem {
  productId: string;
  productName: string;
  productImage?: string;
  size: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  hsnCode?: string;
}

export interface InvoiceData {
  _id?: string;
  userId?: string;
  invoiceNumber: string;
  orderNumber: string;
  transactionId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  billingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  items: InvoiceItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  tax: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  generatedAt: number;
}

/**
 * Generate an official, GST-compliant Indian Tax Invoice PDF for Beelyn LLP (HIVE NOW).
 * Returns a Blob ready for downloading or uploading.
 */
export async function generateInvoicePdf(invoice: InvoiceData, logoUrl?: string): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  
  // A4 Page Size: 595.28 x 841.89 points
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Premium Brand Palette colors (Hive Warm Gold & Slate styling)
  const colorDark = rgb(0.1, 0.1, 0.1);           // #1A1A1A (Rich Charcoal)
  const colorAmber = rgb(0.78, 0.55, 0.15);      // #C78C26 (Hive Gold/Amber)
  const colorMuted = rgb(0.35, 0.38, 0.45);      // #596173 (Slate 600)
  const colorBorder = rgb(0.88, 0.89, 0.92);     // #E0E3EB (Border)
  const colorBgLight = rgb(0.98, 0.97, 0.95);    // #FAF7F2 (Warm Alabaster fill)

  // White main sheet
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: rgb(1, 1, 1),
  });

  // Top header golden stripe
  page.drawRectangle({
    x: 0,
    y: pageHeight - 6,
    width: pageWidth,
    height: 6,
    color: colorAmber,
  });

  // ── 1. HEADER: BRAND & LEGAL ENTITY ──────────────────────────────────────
  page.drawText("HIVE NOW", {
    x: 50,
    y: pageHeight - 48,
    size: 22,
    font: fontHelveticaBold,
    color: colorDark,
  });

  page.drawText("Hyperlocal Fashion Marketplace", {
    x: 50,
    y: pageHeight - 60,
    size: 8,
    font: fontHelvetica,
    color: colorAmber,
  });

  // Legal Seller Details
  page.drawText("BEELYN LLP", {
    x: 50,
    y: pageHeight - 74,
    size: 9,
    font: fontHelveticaBold,
    color: colorDark,
  });

  page.drawText("LLPIN: ACS-4901  |  GSTIN: 32ABFFB8327H1ZL", {
    x: 50,
    y: pageHeight - 86,
    size: 8,
    font: fontHelveticaBold,
    color: colorMuted,
  });

  page.drawText("55/4379, Door No 3623, Valanjambalam Junction, M.G. Road", {
    x: 50,
    y: pageHeight - 97,
    size: 7.5,
    font: fontHelvetica,
    color: colorMuted,
  });

  page.drawText("Ernakulam, Kochi, Kerala - 682016  (State Code: 32)", {
    x: 50,
    y: pageHeight - 107,
    size: 7.5,
    font: fontHelvetica,
    color: colorMuted,
  });

  // ── 2. INVOICE TITLE & METADATA (RIGHT ALIGNED) ──────────────────────────
  page.drawText("TAX INVOICE", {
    x: 390,
    y: pageHeight - 48,
    size: 18,
    font: fontHelveticaBold,
    color: colorDark,
  });

  const formattedDate = new Date(invoice.generatedAt || Date.now()).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const formattedTime = new Date(invoice.generatedAt || Date.now()).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  page.drawText(`Invoice No: ${invoice.invoiceNumber}`, {
    x: 390,
    y: pageHeight - 65,
    size: 8.5,
    font: fontHelveticaBold,
    color: colorDark,
  });

  page.drawText(`Order ID: ${invoice.orderNumber}`, {
    x: 390,
    y: pageHeight - 78,
    size: 8.5,
    font: fontHelvetica,
    color: colorMuted,
  });

  page.drawText(`Date: ${formattedDate}, ${formattedTime}`, {
    x: 390,
    y: pageHeight - 91,
    size: 8.5,
    font: fontHelvetica,
    color: colorMuted,
  });

  page.drawText("Place of Supply: Kerala (32)", {
    x: 390,
    y: pageHeight - 104,
    size: 8,
    font: fontHelveticaBold,
    color: colorAmber,
  });

  // Top Divider line
  page.drawLine({
    start: { x: 50, y: pageHeight - 118 },
    end: { x: pageWidth - 50, y: pageHeight - 118 },
    thickness: 1,
    color: colorBorder,
  });

  // ── 3. BILLING & SHIPPING CARDS ──────────────────────────────────────────
  const cardY = pageHeight - 195;
  const cardHeight = 68;

  // Card 1: Billed To Customer
  page.drawRectangle({
    x: 50,
    y: cardY,
    width: 240,
    height: cardHeight,
    color: colorBgLight,
    borderColor: colorBorder,
    borderWidth: 0.5,
  });

  page.drawText("BILLED TO / CUSTOMER", { x: 60, y: cardY + 54, size: 7.5, font: fontHelveticaBold, color: colorAmber });
  const custName = invoice.customerName.length > 28 ? invoice.customerName.substring(0, 25) + "..." : invoice.customerName;
  page.drawText(custName, { x: 60, y: cardY + 39, size: 8.5, font: fontHelveticaBold, color: colorDark });
  page.drawText(invoice.customerPhone ? `Phone: ${invoice.customerPhone}` : "Customer Order", { x: 60, y: cardY + 26, size: 8, font: fontHelvetica, color: colorMuted });
  page.drawText("State: Kerala (Code: 32)", { x: 60, y: cardY + 13, size: 7.5, font: fontHelvetica, color: colorMuted });

  // Card 2: Shipping Destination
  page.drawRectangle({
    x: 305,
    y: cardY,
    width: 240,
    height: cardHeight,
    color: colorBgLight,
    borderColor: colorBorder,
    borderWidth: 0.5,
  });

  const addr = invoice.shippingAddress;
  page.drawText("DELIVERY DESTINATION", { x: 315, y: cardY + 54, size: 7.5, font: fontHelveticaBold, color: colorAmber });
  const addrLine1 = (addr.line1 || "Kochi, Kerala").substring(0, 32);
  page.drawText(addrLine1, { x: 315, y: cardY + 39, size: 8, font: fontHelvetica, color: colorDark });
  page.drawText(`${addr.city || "Kochi"}, ${addr.state || "Kerala"} - ${addr.pincode || "682024"}`, { x: 315, y: cardY + 26, size: 8, font: fontHelveticaBold, color: colorDark });
  page.drawText("90-Min Express Delivery", { x: 315, y: cardY + 13, size: 7.5, font: fontHelveticaBold, color: colorAmber });

  // ── 4. ITEMISED TAX INVOICE TABLE ────────────────────────────────────────
  let currentY = cardY - 24;

  // Table header bar
  page.drawRectangle({
    x: 50,
    y: currentY - 5,
    width: pageWidth - 100,
    height: 20,
    color: colorBgLight,
    borderColor: colorBorder,
    borderWidth: 0.5,
  });

  page.drawText("ITEM DESCRIPTION", { x: 60, y: currentY, size: 8, font: fontHelveticaBold, color: colorDark });
  page.drawText("HSN", { x: 260, y: currentY, size: 8, font: fontHelveticaBold, color: colorDark });
  page.drawText("SIZE", { x: 310, y: currentY, size: 8, font: fontHelveticaBold, color: colorDark });
  page.drawText("QTY", { x: 355, y: currentY, size: 8, font: fontHelveticaBold, color: colorDark });
  
  const unitPriceHeaderWidth = fontHelveticaBold.widthOfTextAtSize("RATE", 8);
  page.drawText("RATE", { x: 450 - unitPriceHeaderWidth, y: currentY, size: 8, font: fontHelveticaBold, color: colorDark });
  
  const totalHeaderWidth = fontHelveticaBold.widthOfTextAtSize("AMOUNT (INR)", 8);
  page.drawText("AMOUNT (INR)", { x: 535 - totalHeaderWidth, y: currentY, size: 8, font: fontHelveticaBold, color: colorDark });

  currentY -= 24;

  // Item rows
  for (const item of invoice.items) {
    const nameStr = item.productName.length > 32
      ? item.productName.substring(0, 29) + "..."
      : item.productName;

    page.drawText(nameStr, { x: 60, y: currentY, size: 8.5, font: fontHelvetica, color: colorDark });
    page.drawText(item.hsnCode || "6204", { x: 260, y: currentY, size: 8, font: fontHelvetica, color: colorMuted });
    page.drawText(item.size || "Free", { x: 310, y: currentY, size: 8, font: fontHelvetica, color: colorDark });
    
    const qtyText = String(item.quantity);
    page.drawText(qtyText, { x: 360, y: currentY, size: 8.5, font: fontHelvetica, color: colorDark });
    
    const unitPriceText = `₹${item.unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const unitPriceWidth = fontHelvetica.widthOfTextAtSize(unitPriceText, 8.5);
    page.drawText(unitPriceText, { x: 450 - unitPriceWidth, y: currentY, size: 8.5, font: fontHelvetica, color: colorDark });
    
    const totalPriceText = `₹${item.totalPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const totalPriceWidth = fontHelveticaBold.widthOfTextAtSize(totalPriceText, 8.5);
    page.drawText(totalPriceText, { x: 535 - totalPriceWidth, y: currentY, size: 8.5, font: fontHelveticaBold, color: colorDark });

    page.drawLine({
      start: { x: 50, y: currentY - 6 },
      end: { x: pageWidth - 50, y: currentY - 6 },
      thickness: 0.5,
      color: colorBorder,
    });

    currentY -= 20;
  }

  // ── 5. TOTALS & TAX BREAKDOWN ────────────────────────────────────────────
  currentY -= 10;

  // Left column: Payment & Tax Summary Notes
  page.drawText("PAYMENT METHOD", { x: 60, y: currentY, size: 7.5, font: fontHelveticaBold, color: colorMuted });
  page.drawText((invoice.paymentMethod || "Online Prepaid").toUpperCase(), { x: 60, y: currentY - 12, size: 9, font: fontHelveticaBold, color: colorDark });

  page.drawText("GST SUMMARY (INCL. 5% TAX)", { x: 60, y: currentY - 30, size: 7.5, font: fontHelveticaBold, color: colorMuted });
  page.drawText("CGST @ 2.5%  +  SGST @ 2.5% (Intra-state Kerala)", { x: 60, y: currentY - 42, size: 7.5, font: fontHelvetica, color: colorMuted });

  // Right column: Calculations
  const summaryX = 360;

  page.drawText("Items Subtotal", { x: summaryX, y: currentY, size: 8.5, font: fontHelvetica, color: colorMuted });
  const subtotalText = `₹${invoice.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const subtotalWidth = fontHelvetica.widthOfTextAtSize(subtotalText, 8.5);
  page.drawText(subtotalText, { x: 535 - subtotalWidth, y: currentY, size: 8.5, font: fontHelvetica, color: colorDark });

  currentY -= 15;
  page.drawText("Express Delivery Fee", { x: summaryX, y: currentY, size: 8.5, font: fontHelvetica, color: colorMuted });
  const delText = invoice.deliveryFee === 0 ? "FREE" : `₹${invoice.deliveryFee.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const delWidth = fontHelvetica.widthOfTextAtSize(delText, 8.5);
  page.drawText(delText, { x: 535 - delWidth, y: currentY, size: 8.5, font: fontHelvetica, color: colorDark });

  if (invoice.discount > 0) {
    currentY -= 15;
    page.drawText("Discount / Coupon", { x: summaryX, y: currentY, size: 8.5, font: fontHelvetica, color: colorMuted });
    const discText = `-₹${invoice.discount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const discWidth = fontHelvetica.widthOfTextAtSize(discText, 8.5);
    page.drawText(discText, { x: 535 - discWidth, y: currentY, size: 8.5, font: fontHelvetica, color: rgb(0.1, 0.5, 0.1) });
  }

  currentY -= 18;

  // Grand Total Box
  page.drawRectangle({
    x: summaryX - 10,
    y: currentY - 6,
    width: pageWidth - summaryX - 40 + 10,
    height: 24,
    color: colorBgLight,
    borderColor: colorBorder,
    borderWidth: 0.5,
  });

  page.drawText("TOTAL PAID", { x: summaryX, y: currentY, size: 9.5, font: fontHelveticaBold, color: colorDark });
  const totalText = `₹${invoice.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const totalWidth = fontHelveticaBold.widthOfTextAtSize(totalText, 9.5);
  page.drawText(totalText, { x: 535 - totalWidth, y: currentY, size: 9.5, font: fontHelveticaBold, color: colorAmber });

  // ── 6. FOOTER STATUTORY DECLARATION ──────────────────────────────────────
  page.drawLine({
    start: { x: 50, y: 70 },
    end: { x: pageWidth - 50, y: 70 },
    thickness: 0.5,
    color: colorBorder,
  });

  page.drawText("Statutory Declaration: This is a computer-generated tax invoice issued by Beelyn LLP for orders fulfilled on Hive Now.", {
    x: 50,
    y: 52,
    size: 7,
    font: fontHelvetica,
    color: colorMuted,
  });

  page.drawText("No physical signature required. Support: support@hivenow.in  |  +91 73560 19103  |  hivenow.in", {
    x: 50,
    y: 40,
    size: 7,
    font: fontHelveticaBold,
    color: colorDark,
  });

  // Save document and convert bytes to Blob
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}
