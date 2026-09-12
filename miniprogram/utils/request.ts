import { API_BASE_URL } from '../config/index'
import { getToken, logout } from './auth'
import { promptLogin } from './visitor'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  method?: Method
  data?: Record<string, any> | string
  header?: Record<string, string>
}

function extractDetail(data: any): string {
  if (data && typeof data === 'object' && typeof data.detail === 'string') {
    return data.detail
  }
  return ''
}

export function humanizeError(statusCode: number, detail: string): string {
  if (detail) {
    return detail
  }
  switch (statusCode) {
    case 400:
      return '请求参数错误'
    case 401:
      return '登录已失效，请重新登录'
    case 403:
      return '没有权限执行此操作'
    case 404:
      return '未找到相关数据'
    case 409:
      return '操作冲突，请稍后重试'
    case 500:
      return '服务器错误，请稍后重试'
    default:
      return `请求失败 (${statusCode})`
  }
}

export function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken()
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.header || {}),
  }
  if (token) {
    header['Authorization'] = `Bearer ${token}`
  }

  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T)
          return
        }
        if (res.statusCode === 401) {
          logout()
          promptLogin()
        }
        reject(new Error(humanizeError(res.statusCode, extractDetail(res.data))))
      },
      fail: () => {
        reject(new Error('网络连接失败，请检查网络'))
      },
    })
  })
}
