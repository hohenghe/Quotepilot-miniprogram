export interface ReviewItem {
  id: number
  seller_id: number
  user_id: number
  user_name: string
  rating: number
  content: string | null
  images: string[]
  reported: boolean
  created_at: string | null
}

export interface SellerReviewsResult {
  items: ReviewItem[]
  score: number | null
}
