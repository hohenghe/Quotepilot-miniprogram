export interface UserProfile {
  user_id: number
  email: string | null
  role: string
  name: string | null
  store_name: string | null
  avatar_url: string | null
  business_license_url: string | null
  country: string | null
  phone: string | null
  uid: string | null
}

export interface UpdateProfilePayload {
  name?: string
  store_name?: string
  avatar_url?: string
  business_license_url?: string
  phone?: string
  country?: string
}
