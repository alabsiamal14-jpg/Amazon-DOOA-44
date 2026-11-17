export interface ExtractedVideoOrderItem {
  product_name_raw: string;
  quantity: number;
}

export interface ExtractedVideoOrderData {
  customer_name: string | null;
  customer_phone: string | null;
  city: string | null;
  address: string | null;
  items: ExtractedVideoOrderItem[];
  notes: string | null;
  confidence: number;
  warnings: string[];
}

export interface MatchedVideoOrderItem {
  productId: string;
  productTitleAr: string;
  quantity: number;
  price: number;
  subtotal: number;
  outOfStock: boolean;
}

export interface VideoOrderPreviewData {
  customer_name: string;
  customer_phone: string;
  city: string;
  address: string;
  notes: string;
  items: MatchedVideoOrderItem[];
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  confidence: number;
  warnings: string[];
}
