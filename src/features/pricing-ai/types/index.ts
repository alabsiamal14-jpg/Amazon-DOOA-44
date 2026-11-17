import { z } from 'zod';

// Shared types and validation schemas for Pricing AI

export const PriceObservationSchema = z.object({
  id: z.string(),
  productId: z.string().nullable(),
  productName: z.string(),
  supplierId: z.string().nullable(),
  supplierCode: z.string(),
  supplierName: z.string(),
  supplierCost: z.number(),
  currency: z.string().default('YER'),
  quantity: z.number().nullable().default(null),
  unit: z.string().nullable().default(null),
  sourceType: z.enum([
    'supplier_message',
    'whatsapp',
    'image',
    'uploaded_file',
    'manual_entry',
    'import_document',
    'admin_conversation'
  ]),
  sourceReference: z.string().nullable().default(null),
  conversationId: z.string().nullable().default(null),
  messageId: z.string().nullable().default(null),
  observedAt: z.string(),
  createdAt: z.string(),
  createdBy: z.string(),
  confidence: z.number().min(0).max(1).default(1),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  markupPercent: z.number().default(30),
  calculatedSalePrice: z.number()
});

export type PriceObservation = z.infer<typeof PriceObservationSchema>;

export interface PricingConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricingMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  attachments?: {
    name: string;
    url: string;
    mimeType: string;
  }[];
  extractedEntities?: {
    suppliers?: {
      name: string;
      code?: string;
      whatsappPhone?: string;
    }[];
    products?: {
      name: string;
      supplierCost: number;
      currency?: string;
      quantity?: number;
    }[];
  };
}

export interface SupplierRegistryItem {
  id: string;
  code: string; // SUP-XXXX or S, M, A etc. (SUP-0001 sequential is default, with manual code support)
  name: string;
  businessName?: string;
  whatsappName?: string;
  whatsappPhone: string;
  country?: string;
  city?: string;
  notes?: string;
  categories?: string[];
  products?: string[]; // array of product titles or IDs
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  lastKnownPriceDate?: string;
}

export interface PricingSettings {
  id: string;
  defaultMarkupPercent: number;
  updatedAt: string;
}

export interface PurchaseInstructionGroup {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  whatsappPhone: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    supplierCost: number;
    customerPrice: number;
  }[];
  totalPurchaseCost: number;
  totalCustomerPrice: number;
}
