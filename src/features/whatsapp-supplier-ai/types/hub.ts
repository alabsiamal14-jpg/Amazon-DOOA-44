export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface PriceObservation {
  id: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  productId: string | null;
  productName: string;
  supplierCost: number;
  currency: string;
  quantity: number | null;
  unit: string | null;
  sourceType:
    | "whatsapp_video"
    | "whatsapp_screenshot"
    | "whatsapp_message"
    | "pdf"
    | "excel"
    | "csv"
    | "image"
    | "manual";
  sourceReference: string | null;
  conversationId: string | null;
  messageId: string | null;
  observedAt: string;
  createdAt: string;
  createdBy: string;
  confidence: number;
  approvalStatus: ApprovalStatus;
  markupPercent: number;
  calculatedSalePrice: number;
  sourceHash: string | null;
}

export interface Supplier {
  id: string;
  supplierCode: string;
  shortCode: string;
  businessName: string;
  whatsappPhone: string;
  createdAt: string;
}

export interface SupplierProduct {
  id: string;
  supplierId: string;
  name: string;
  sku: string;
  currentCost: number;
  status: ApprovalStatus;
}
