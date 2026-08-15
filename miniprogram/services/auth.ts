import { request } from '../utils/request'

export interface AuthResult {
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

export function wechatLogin(code: string): Promise<WechatAuthResult> {
  return request<WechatAuthResult>('/api/auth/wechat-login', {
    method: 'POST',
    data: { code },
  })
}

export function wechatBind(code: string, identifier: string, password: string): Promise<WechatAuthResult> {
  return request<WechatAuthResult>('/api/auth/wechat-bind', {
    method: 'POST',
    data: { code, identifier, password },
  })
}

export function wechatRegister(data: RegisterPayload & { code: string }): Promise<RegisterResult> {
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
