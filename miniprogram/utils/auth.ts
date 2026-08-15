const TOKEN_KEY = 'quotepilot_token'
const USER_KEY = 'quotepilot_user'

export interface AuthUser {
  user_id: number
  email: string
  role: string
  name: string | null
  store_name: string | null
  avatar_url: string | null
  business_license_url: string | null
  country: string | null
  phone: string | null
  uid: string | null
}

export function saveAuth(token: string, user: AuthUser): void {
  wx.setStorageSync(TOKEN_KEY, token)
  wx.setStorageSync(USER_KEY, user)
}

export function getToken(): string | null {
  const token = wx.getStorageSync(TOKEN_KEY)
  return token ? String(token) : null
}

export function getUser(): AuthUser | null {
  const raw = wx.getStorageSync(USER_KEY)
  return raw ? (raw as AuthUser) : null
}

export function logout(): void {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(USER_KEY)
}

export function isAuthenticated(): boolean {
  return getToken() !== null
}
