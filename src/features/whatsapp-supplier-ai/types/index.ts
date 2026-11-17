import { z } from 'zod';

export const SupplierAnalysisSchema = z.object({
  supplier: z.object({
    name: z.string().nullable(),
    whatsappName: z.string().nullable(),
    whatsappPhone: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  }),
  products: z.array(z.object({
    name: z.string().nullable(),
    description: z.string().nullable(),
    supplierCost: z.number().nullable(),
    confidence: z.number().min(0).max(1),
  }))
});

export type SupplierImportResult = z.infer<typeof SupplierAnalysisSchema>;

export interface SupplierAiDocument {
  id: string;
  code: string; // SUP-XXXX format
  name: string;
  whatsappName?: string;
  whatsappPhone: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierProductDraft {
  id: string;
  supplierId: string;
  supplierCode: string;
  productName: string;
  description: string;
  costPrice: number;
  markupPercent: number; // Suggested markup, e.g. 30%
  salePrice: number; // Calculated on server
  stockQuantity: number;
  status: 'draft' | 'imported';
  createdAt: string;
}
