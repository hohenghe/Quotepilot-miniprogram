import { request, humanizeError } from '../utils/request'
import { getToken, logout } from '../utils/auth'
import { API_BASE_URL } from '../config/index'
import {
  ProductListResult,
  ProductPayload,
  DocumentUploadResult,
  SellerProduct,
} from '../types/product'
import {
  SellerInquiryItem,
  SellerInquiryListResult,
  GenerateReplyResult,
} from '../types/inquiry'
import {
  UserProfile,
  UpdateProfilePayload,
} from '../types/user'
import {
  ReviewItem,
  SellerReviewsResult,
} from '../types/review'

export type {
  SellerInquiryItem,
  SellerInquiryListResult,
  GenerateReplyResult,
  UserProfile,
  UpdateProfilePayload,
  ReviewItem,
  SellerReviewsResult,
}

export function getMe(): Promise<UserProfile> {
  return request<UserProfile>('/api/auth/me')
}

export function updateProfile(data: UpdateProfilePayload): Promise<UserProfile> {
  return request<UserProfile>('/api/auth/me', { method: 'PUT', data })
}

export function getSellerProducts(page = 1, pageSize = 20, search?: string): Promise<ProductListResult> {
  const params = [`page=${page}`, `page_size=${pageSize}`]
  if (search) {
    params.push(`search=${encodeURIComponent(search)}`)
  }
  return request<ProductListResult>(`/api/products?${params.join('&')}`)
}

export function getSellerProduct(productId: number): Promise<SellerProduct> {
  return request<SellerProduct>(`/api/products/${productId}`)
}

export function createSellerProduct(data: ProductPayload): Promise<SellerProduct> {
  return request<SellerProduct>('/api/products', { method: 'POST', data })
}

export function updateSellerProduct(productId: number, data: ProductPayload): Promise<SellerProduct> {
  return request<SellerProduct>(`/api/products/${productId}`, { method: 'PUT', data })
}

export function deleteSellerProduct(productId: number): Promise<{ ok: boolean; id: number; is_active: boolean }> {
  return request(`/api/products/${productId}`, { method: 'DELETE' })
}

export function deleteSellerProducts(productIds: number[]): Promise<{ success: boolean; deleted_count: number }> {
  return request('/api/products/batch', { method: 'DELETE', data: { product_ids: productIds } })
}

export function deleteAllSellerProducts(): Promise<{ success: boolean; deleted_count: number }> {
  return request('/api/products/all', { method: 'DELETE' })
}

export function uploadProductImage(filePath: string): Promise<{ url: string }> {
  return uploadFile<{ url: string }>('/api/files/upload', filePath, { kind: 'product' })
}

export function uploadProductFile(filePath: string): Promise<DocumentUploadResult> {
  return uploadFile<DocumentUploadResult>('/api/products/upload', filePath)
}

export function uploadAvatarImage(filePath: string): Promise<{ url: string }> {
  return uploadFile<{ url: string }>('/api/files/upload', filePath, { kind: 'avatar' })
}

export function uploadLicenseImage(filePath: string): Promise<{ url: string }> {
  return uploadFile<{ url: string }>('/api/files/upload', filePath, { kind: 'license' })
}

export function getSellerInquiries(page = 1, pageSize = 20): Promise<SellerInquiryListResult> {
  return request<SellerInquiryListResult>(`/api/seller-inquiries/received?page=${page}&page_size=${pageSize}`)
}

export function generateSellerReply(inquiryId: number): Promise<GenerateReplyResult> {
  return request<GenerateReplyResult>('/api/seller-inquiries/generate-reply', {
    method: 'POST',
    data: { inquiry_id: inquiryId },
  })
}

export function getSellerScore(): Promise<{ score: number | null }> {
  return request('/api/sellers/score')
}

export function getMySellerReviews(): Promise<SellerReviewsResult> {
  return request<SellerReviewsResult>('/api/reviews/seller')
}

export function reportReview(reviewId: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/reviews/${reviewId}/report`, { method: 'POST' })
}

function extractUploadDetail(raw: string): string {
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && typeof obj.detail === 'string') {
      return obj.detail
    }
  } catch {
    // ignore non-JSON body
  }
  return ''
}

function uploadFile<T = any>(path: string, filePath: string, formData?: Record<string, string>): Promise<T> {
  const token = getToken()
  const header: Record<string, string> = {}
  if (token) {
    header['Authorization'] = `Bearer ${token}`
  }
  return new Promise<T>((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}${path}`,
      filePath,
      name: 'file',
      header,
      formData,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(res.data) as T)
          } catch {
            reject(new Error('上传响应解析失败'))
          }
          return
        }
        if (res.statusCode === 401) {
          logout()
          const pages = getCurrentPages()
          const current = pages.length > 0 ? pages[pages.length - 1].route : ''
          if (current !== 'pages/login/login') {
            wx.reLaunch({ url: '/pages/login/login' })
          }
        }
        reject(new Error(humanizeError(res.statusCode, extractUploadDetail(res.data))))
      },
      fail: () => {
        reject(new Error('网络连接失败，请检查网络'))
      },
    })
  })
}
