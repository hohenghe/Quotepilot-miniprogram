export interface SellerInquiryItem {
  id: number
  raw_message: string
  buyer_email: string | null
  product_id: number | null
  status: string
  reply_body: string | null
  created_at: string | null
}

export interface SellerInquiryListResult {
  items: SellerInquiryItem[]
  page: number
  page_size: number
  total: number
  pending_count: number
  replied_count: number
  has_next: boolean
}

export interface GenerateReplyResult {
  subject: string
  email_body: string
}
