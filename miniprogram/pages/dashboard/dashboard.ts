import { getToken } from '../../utils/auth'
import { needsTutorial, openTutorial, resumeVisitorTimer, pauseVisitorTimer, openGuestLogin, promptLogin } from '../../utils/visitor'
import { getSellerHome, SellerHomeSummary } from '../../services/seller'

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
    inquiries: [] as SellerHomeSummary['inquiries'],
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

  handleQuickPhoto() {
    if (!promptLogin()) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        wx.setStorageSync('zhermai_pending_product_recognition_image', file.tempFilePath)
        wx.navigateTo({ url: '/pages/product-edit/product-edit' })
      },
      fail: () => wx.showToast({ title: '无法打开相机，请稍后重试', icon: 'none' }),
    })
  },

  showGuest() {
    this.setData({ guest: true, loading: false, error: '', storeName: '欢迎体验这儿卖', uid: '', email: '', productCount: 0, inquiryCount: 0, pendingCount: 0, repliedCount: 0, scoreText: '—', inquiries: [] })
  },

  async loadData() {
    const token = getToken()
    if (!token) {
      this.showGuest()
      return
    }
    this.setData({ guest: false, loading: true, error: '' })
    try {
      // One authenticated home request validates the session and returns only
      // the counts and five inquiry previews this page actually renders.
      const home = await getSellerHome()
      if (!getToken()) {
        this.showGuest()
        return
      }
      if (getToken() !== token) return
      this.setData({
        email: home.email || '',
        storeName: home.store_name || home.name || 'Seller',
        uid: home.uid || '',
        productCount: home.product_count || 0,
        inquiryCount: home.inquiry_count || 0,
        pendingCount: home.pending_count || 0,
        repliedCount: home.replied_count || 0,
        scoreText: home.score != null ? home.score.toFixed(1) : '—',
        inquiries: home.inquiries || [],
        loading: false,
      })
    } catch (e) {
      if (!getToken()) {
        this.showGuest()
        return
      }
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
