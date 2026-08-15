export interface SellerProduct {
  id: number
  name: string
  sku: string | null
  category: string
  description: string | null
  technical_specs: string | null
  certifications: string | null
  moq: number | null
  unit_price: number | null
  price_range_low: number | null
  price_range_high: number | null
  pricing: string | null
  lead_time_days: number | null
  image_url: string | null
  images: string[]
  is_active: boolean
  view_count: number
  favorite_count: number
  created_at: string | null
  seller_name: string | null
  seller_email: string | null
}

export interface ProductListResult {
  total: number
  items: SellerProduct[]
}

export interface ProductPayload {
  name: string
  sku?: string | null
  category?: string
  description?: string | null
  technical_specs?: string | null
  certifications?: string | null
  moq?: number | null
  unit_price?: number | null
  price_range_low?: number | null
  price_range_high?: number | null
  pricing?: string | null
  lead_time_days?: number | null
  image_url?: string | null
  images?: string[]
}

export interface DocumentUploadResult {
  id: number
  filename: string
  file_type: string
  status: string
  products_count: number
  error_message: string | null
  created_at: string | null
}

export interface AIRecognizedFields {
  name: string | null
  sku: string | null
  category: string | null
  description: string | null
  technical_specs: string | null
  certifications: string | null
  moq: number | null
  unit_price: number | null
  price_range_low: number | null
  price_range_high: number | null
  pricing: string | null
  lead_time_days: number | null
}

export interface AIProductRecognitionResult {
  success: boolean
  data: AIRecognizedFields
}
