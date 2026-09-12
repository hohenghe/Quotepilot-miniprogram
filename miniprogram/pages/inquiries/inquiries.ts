import { promptLogin, openTutorial, resumeVisitorTimer, pauseVisitorTimer } from '../../utils/visitor'
import { getToken } from '../../utils/auth'
import { getSellerInquiries, generateSellerReply } from '../../services/seller'
import { SellerInquiryItem } from '../../types/inquiry'

const PAGE_SIZE = 20

interface InquiryDisplayItem {
  id: number
  raw_message: string
  buyer_email: string
  productText: string
  status: string
  replied: boolean
  reply_body: string | null
  timeText: string
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.replace('T', ' ').slice(0, 16)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toDisplay(it: SellerInquiryItem): InquiryDisplayItem {
  return {
    id: it.id,
    raw_message: it.raw_message,
    buyer_email: it.buyer_email || '',
    productText: it.product_id != null ? `商品 #${it.product_id}` : '',
    status: it.status,
    replied: it.status === 'replied',
    reply_body: it.reply_body,
    timeText: formatTime(it.created_at),
  }
}

Page({
  data: {
    guest: false,
    items: [] as InquiryDisplayItem[],
    page: 1,
    total: 0,
    hasNext: false,
    loading: false,
    loadingMore: false,
    error: '',
    generatingId: null as number | null,
  },

  onHide() { pauseVisitorTimer() },
  goTutorial() { openTutorial() },
  requestLogin() { promptLogin() },
  onShow() {
    resumeVisitorTimer()
    if (!getToken()) {
      this.setData({ guest: true, loading: false, error: '', items: [], total: 0, hasNext: false })
      return
    }
    this.setData({ guest: false })
    this.loadInquiries(true)
  },

  async loadInquiries(reset: boolean) {
    if (!getToken()) return
    if (this.data.loading || this.data.loadingMore) return
    if (reset) {
      this.setData({ loading: true, error: '', page: 1 })
    } else {
      this.setData({ loadingMore: true })
    }
    const page = reset ? 1 : this.data.page + 1
    try {
      const res = await getSellerInquiries(page, PAGE_SIZE)
      const newItems = res.items.map(toDisplay)
      const items = reset ? newItems : this.data.items.concat(newItems)
      this.setData({
        items,
        total: res.total,
        page,
        hasNext: res.has_next,
        loading: false,
        loadingMore: false,
      })
    } catch (e) {
      this.setData({
        error: (e as Error).message || '加载失败',
        loading: false,
        loadingMore: false,
      })
    }
  },

  onReachBottom() {
    if (this.data.hasNext && !this.data.loading && !this.data.loadingMore) {
      this.loadInquiries(false)
    }
  },

  async onPullDownRefresh() {
    await this.loadInquiries(true)
    wx.stopPullDownRefresh()
  },

  handleRetry() {
    this.loadInquiries(true)
  },

  async handleGenerateReply(e: WechatMiniprogram.TouchEvent) {
    if (!promptLogin()) return
    const id = Number(e.currentTarget.dataset.id)
    if (this.data.generatingId === id) return
    this.setData({ generatingId: id })
    try {
      const res = await generateSellerReply(id)
      const items = this.data.items.map((it) =>
        it.id === id ? { ...it, reply_body: res.email_body, status: 'replied', replied: true } : it
      )
      this.setData({ items })
      wx.showToast({ title: '回复已生成', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '生成失败', icon: 'none' })
    } finally {
      if (this.data.generatingId === id) {
        this.setData({ generatingId: null })
      }
    }
  },

  handleCopy(e: WechatMiniprogram.TouchEvent) {
    const text = e.currentTarget.dataset.text as string
    if (!text) return
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      },
    })
  },
})
