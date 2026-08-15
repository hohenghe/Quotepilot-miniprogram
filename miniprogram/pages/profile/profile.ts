import { getToken, logout } from '../../utils/auth'
import { getMe, updateProfile, uploadAvatarImage, uploadLicenseImage } from '../../services/seller'
import { UpdateProfilePayload } from '../../types/user'

const COUNTRIES = ['CN', 'US', 'DE', 'GB', 'FR', 'JP', 'KR', 'IN', 'OTHER']

Page({
  data: {
    loading: false,
    saving: false,
    uploadingAvatar: false,
    uploadingLicense: false,
    email: '',
    uid: '',
    name: '',
    storeName: '',
    phone: '',
    country: 'CN',
    countries: COUNTRIES,
    countryIndex: 0,
    avatarUrl: '',
    licenseUrl: '',
  },

  onShow() {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }
    this.loadProfile()
  },

  async loadProfile() {
    this.setData({ loading: true })
    try {
      const me = await getMe()
      const idx = COUNTRIES.indexOf(me.country || 'CN')
      this.setData({
        email: me.email || '',
        uid: me.uid || '',
        name: me.name || '',
        storeName: me.store_name || '',
        phone: me.phone || '',
        country: me.country || 'CN',
        countryIndex: idx >= 0 ? idx : 0,
        avatarUrl: me.avatar_url || '',
        licenseUrl: me.business_license_url || '',
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
    }
  },

  handleInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string
    this.setData({ [field]: e.detail.value } as any)
  },

  handleCountryChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value)
    this.setData({ countryIndex: index, country: this.data.countries[index] })
  },

  handleChooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFilePaths && res.tempFilePaths[0]
        if (path) this.doUploadAvatar(path)
      },
    })
  },

  async doUploadAvatar(filePath: string) {
    if (this.data.uploadingAvatar) return
    this.setData({ uploadingAvatar: true })
    try {
      const res = await uploadAvatarImage(filePath)
      this.setData({ avatarUrl: res.url })
      wx.showToast({ title: '头像已上传', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '上传失败', icon: 'none' })
    } finally {
      this.setData({ uploadingAvatar: false })
    }
  },

  handleChooseLicense() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFilePaths && res.tempFilePaths[0]
        if (path) this.doUploadLicense(path)
      },
    })
  },

  async doUploadLicense(filePath: string) {
    if (this.data.uploadingLicense) return
    this.setData({ uploadingLicense: true })
    try {
      const res = await uploadLicenseImage(filePath)
      this.setData({ licenseUrl: res.url })
      wx.showToast({ title: '营业执照已上传', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '上传失败', icon: 'none' })
    } finally {
      this.setData({ uploadingLicense: false })
    }
  },

  previewAvatar() {
    if (this.data.avatarUrl) {
      wx.previewImage({ urls: [this.data.avatarUrl] })
    }
  },

  previewLicense() {
    if (this.data.licenseUrl) {
      wx.previewImage({ urls: [this.data.licenseUrl] })
    }
  },

  async handleSave() {
    if (this.data.saving) return
    const payload: UpdateProfilePayload = {
      name: this.data.name.trim(),
      store_name: this.data.storeName.trim(),
      country: this.data.country,
    }
    if (this.data.avatarUrl) payload.avatar_url = this.data.avatarUrl
    if (this.data.licenseUrl) payload.business_license_url = this.data.licenseUrl
    this.setData({ saving: true })
    try {
      await updateProfile(payload)
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmText: '退出',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return
        logout()
        wx.reLaunch({ url: '/pages/login/login' })
      },
    })
  },

  goChangePassword() {
    wx.navigateTo({ url: '/pages/change-password/change-password' })
  },
})
