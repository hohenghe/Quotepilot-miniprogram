import { getToken } from '../../utils/auth'
import { getMySellerReviews, reportReview } from '../../services/seller'
import { ReviewItem } from '../../types/review'

interface ReviewDisplayItem {
  id: number
  userName: string
  ratingText: string
  content: string
  images: string[]
  reported: boolean
  timeText: string
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.replace('T', ' ').slice(0, 16)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toDisplay(it: ReviewItem): ReviewDisplayItem {
  return {
    id: it.id,
    userName: it.user_name || '买家',
    ratingText: it.rating != null ? it.rating.toFixed(1) : '0.0',
    content: it.content || '',
    images: it.images || [],
    reported: it.reported === true,
    timeText: formatTime(it.created_at),
  }
}

Page({
  data: {
    scoreText: '暂无评分',
    items: [] as ReviewDisplayItem[],
    loading: false,
    error: '',
    reportingId: null as number | null,
  },

  onShow() {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }
    this.loadReviews()
  },

  async loadReviews() {
    this.setData({ loading: true, error: '' })
    try {
      const res = await getMySellerReviews()
      this.setData({
        scoreText: res.score != null ? `${res.score.toFixed(1)} / 5` : '暂无评分',
        items: (res.items || []).map(toDisplay),
        loading: false,
      })
    } catch (e) {
      this.setData({ error: (e as Error).message || '加载失败', loading: false })
    }
  },

  async onPullDownRefresh() {
    await this.loadReviews()
    wx.stopPullDownRefresh()
  },

  handleRetry() {
    this.loadReviews()
  },

  handleReport(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    if (this.data.reportingId != null) return
    wx.showModal({
      title: '举报评价',
      content: '确定要举报这条评价吗？',
      confirmText: '举报',
      confirmColor: '#dc2626',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ reportingId: id })
        try {
          await reportReview(id)
          const items = this.data.items.map((it) => (it.id === id ? { ...it, reported: true } : it))
          this.setData({ items })
          wx.showToast({ title: '已举报', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: (err as Error).message || '举报失败', icon: 'none' })
        } finally {
          this.setData({ reportingId: null })
        }
      },
    })
  },

  handlePreviewImage(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.items.find((it) => it.id === id)
    if (!item || item.images.length === 0) return
    wx.previewImage({ current: item.images[index] || item.images[0], urls: item.images })
  },
})
