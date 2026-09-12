import { request } from '../utils/request'

export interface AuthResult {
  supports_distribution: boolean | null
  token: string | null
  user_id: number | null
  email: string | null
  role: string | null
  name: string | null
  store_name: string | null
  avatar_url: string | null
  business_license_url: string | null
  country: string | null
  phone: string | null
  uid: string | null
}

export interface WechatAuthResult extends AuthResult {
  bound: boolean
}

export interface RegisterPayload {
  supports_distribution: boolean
  email: string
  password: string
  name: string
  country: string
  phone: string
}

export interface RegisterResult {
  success: boolean
  message: string
}

export function getWechatPhone(phoneCode: string): Promise<{ phone: string }> {
  return request<{ phone: string }>('/api/auth/wechat-phone', {
    method: 'POST',
    data: { phone_code: phoneCode },
  })
}

export function wechatLogin(code: string, phoneCode: string): Promise<WechatAuthResult> {
  return request<WechatAuthResult>('/api/auth/wechat-login', {
    method: 'POST',
    data: { code, phone_code: phoneCode },
  })
}

export function wechatBind(code: string, phoneCode: string, identifier: string, password: string): Promise<WechatAuthResult> {
  return request<WechatAuthResult>('/api/auth/wechat-bind', {
    method: 'POST',
    data: { code, phone_code: phoneCode, identifier, password },
  })
}

export function wechatRegister(data: RegisterPayload & { code: string, phone_code: string }): Promise<RegisterResult> {
  return request<RegisterResult>('/api/auth/wechat-register', {
    method: 'POST',
    data,
  })
}

export function login(identifier: string, password: string): Promise<AuthResult> {
  return request<AuthResult>('/api/auth/login', {
    method: 'POST',
    data: { identifier, password, role: 'seller' },
  })
}

export function register(data: RegisterPayload): Promise<RegisterResult> {
  return request<RegisterResult>('/api/auth/register', {
    method: 'POST',
    data: { ...data, role: 'seller' },
  })
}

export function resendVerification(email: string): Promise<RegisterResult> {
  return request<RegisterResult>('/api/auth/resend-verification', {
    method: 'POST',
    data: { email },
  })
}

export function changePassword(currentPassword: string, newPassword: string): Promise<AuthResult> {
  return request<AuthResult>('/api/auth/change-password', {
    method: 'POST',
    data: { current_password: currentPassword, new_password: newPassword },
  })
}

export function forgotPassword(email: string): Promise<RegisterResult> {
  return request<RegisterResult>('/api/auth/forgot-password', {
    method: 'POST',
    data: { email },
  })
}

export function resetPassword(token: string, newPassword: string): Promise<RegisterResult> {
  return request<RegisterResult>('/api/auth/reset-password', {
    method: 'POST',
    data: { token, new_password: newPassword },
  })
}
