import { getToken } from '../../utils/auth'
import { needsTutorial, openTutorial, resumeVisitorTimer, pauseVisitorTimer, openGuestLogin } from '../../utils/visitor'
import { getMe, getSellerProducts, getSellerInquiries, getSellerScore, SellerInquiryItem } from '../../services/seller'

Page({
  data: {
    guest: false,
    email: '',
    storeName: '',
    uid: '',
    productCount: 0,
    inquiryCount: 0,
    pendingCount: 0,
    repliedCount: 0,
    scoreText: '—',
    loading: true,
    error: '',
    inquiries: [] as SellerInquiryItem[],
  },

  onHide() { pauseVisitorTimer() },
  onShow() {
    if (needsTutorial()) {
      this.setData({ loading: false })
      openTutorial()
      return
    }
    resumeVisitorTimer()
    this.loadData()
  },

  goTutorial() { openTutorial() },
  handleHeaderLogin() { openGuestLogin() },

  async loadData() {
    if (!getToken()) {
      this.setData({ guest: true, loading: false, error: '', storeName: '欢迎体验这儿卖', uid: '', email: '', productCount: 0, inquiryCount: 0, pendingCount: 0, repliedCount: 0, scoreText: '—', inquiries: [] })
      return
    }
    this.setData({ guest: false, loading: true, error: '' })
    try {
      const [me, products, inquiries, score] = await Promise.all([
        getMe(),
        getSellerProducts(),
        getSellerInquiries(1, 50),
        getSellerScore(),
      ])
      const items = inquiries.items || []
      this.setData({
        email: me.email || '',
        storeName: me.store_name || me.name || 'Seller',
        uid: me.uid || '',
        productCount: products.total || 0,
        inquiryCount: inquiries.total || 0,
        pendingCount: inquiries.pending_count != null ? inquiries.pending_count : 0,
        repliedCount: inquiries.replied_count != null ? inquiries.replied_count : 0,
        scoreText: score.score != null ? score.score.toFixed(1) : '—',
        inquiries: items.slice(0, 5),
        loading: false,
      })
    } catch (e) {
      this.setData({ error: (e as Error).message || '加载失败', loading: false })
    }
  },

  goProducts() {
    wx.navigateTo({ url: '/pages/products/products' })
  },

  goInquiries() {
    wx.navigateTo({ url: '/pages/inquiries/inquiries' })
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  },

  goReviews() {
    wx.navigateTo({ url: '/pages/reviews/reviews' })
  },
})
