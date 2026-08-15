import { getToken, saveAuth, AuthUser } from '../../utils/auth'
import { changePassword, AuthResult } from '../../services/auth'

function toAuthUser(result: AuthResult): AuthUser {
  return {
    user_id: result.user_id as number,
    email: result.email || '',
    role: result.role || 'seller',
    name: result.name || null,
    store_name: result.store_name || null,
    avatar_url: result.avatar_url || null,
    business_license_url: result.business_license_url || null,
    country: result.country || null,
    phone: result.phone || null,
    uid: result.uid || null,
  }
}

Page({
  data: {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    showCurrent: false,
    showNew: false,
    showConfirm: false,
    loading: false,
  },

  onLoad() {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
    }
  },

  handleInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string
    this.setData({ [field]: e.detail.value } as any)
  },

  toggleCurrent() {
    this.setData({ showCurrent: !this.data.showCurrent })
  },

  toggleNew() {
    this.setData({ showNew: !this.data.showNew })
  },

  toggleConfirm() {
    this.setData({ showConfirm: !this.data.showConfirm })
  },

  async handleSubmit() {
    const { currentPassword, newPassword, confirmPassword } = this.data
    if (!currentPassword) {
      wx.showToast({ title: '请输入当前密码', icon: 'none' })
      return
    }
    if (!newPassword) {
      wx.showToast({ title: '请输入新密码', icon: 'none' })
      return
    }
    if (newPassword.length < 6) {
      wx.showToast({ title: '新密码至少 6 位', icon: 'none' })
      return
    }
    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次新密码不一致', icon: 'none' })
      return
    }
    if (newPassword === currentPassword) {
      wx.showToast({ title: '新密码不能与当前密码相同', icon: 'none' })
      return
    }
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const res = await changePassword(currentPassword, newPassword)
      if (res.token) {
        saveAuth(res.token, toAuthUser(res))
      }
      wx.showToast({ title: '密码修改成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 500)
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '修改失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
