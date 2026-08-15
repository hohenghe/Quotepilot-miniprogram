import { resetPassword } from '../../services/auth'

function extractToken(input: string): string {
  const s = input.trim()
  const m = s.match(/[?&]token=([^&\s]+)/)
  return m ? m[1] : s
}

Page({
  data: {
    token: '',
    newPassword: '',
    confirmPassword: '',
    showNew: false,
    showConfirm: false,
    loading: false,
  },

  handleInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string
    this.setData({ [field]: e.detail.value } as any)
  },

  toggleNew() {
    this.setData({ showNew: !this.data.showNew })
  },

  toggleConfirm() {
    this.setData({ showConfirm: !this.data.showConfirm })
  },

  async handleSubmit() {
    const token = extractToken(this.data.token)
    const { newPassword, confirmPassword } = this.data
    if (!token) {
      wx.showToast({ title: '请输入重置 token', icon: 'none' })
      return
    }
    if (newPassword.length < 8) {
      wx.showToast({ title: '新密码至少 8 位', icon: 'none' })
      return
    }
    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' })
      return
    }
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      await resetPassword(token, newPassword)
      wx.showToast({ title: '重置成功', icon: 'success' })
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/login/login' })
      }, 800)
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '重置失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
