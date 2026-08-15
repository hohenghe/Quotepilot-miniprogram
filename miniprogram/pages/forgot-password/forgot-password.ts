import { forgotPassword } from '../../services/auth'

Page({
  data: {
    email: '',
    loading: false,
    sent: false,
  },

  handleInput(e: WechatMiniprogram.Input) {
    this.setData({ email: e.detail.value })
  },

  async handleSubmit() {
    const email = this.data.email.trim()
    if (!email) {
      wx.showToast({ title: '请输入邮箱', icon: 'none' })
      return
    }
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      await forgotPassword(email)
      this.setData({ sent: true })
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '发送失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goReset() {
    wx.navigateTo({ url: '/pages/reset-password/reset-password' })
  },

  goBack() {
    wx.navigateBack()
  },
})
