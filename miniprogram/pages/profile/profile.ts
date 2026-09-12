import { promptLogin, openTutorial, resumeVisitorTimer, pauseVisitorTimer } from '../../utils/visitor'
import { getToken, logout } from '../../utils/auth'
import { getMe, updateProfile, uploadAvatarImage, uploadLicenseImage } from '../../services/seller'
import { UpdateProfilePayload } from '../../types/user'
import { CHINA_PROVINCES, CHINA_REGIONS, parseRegion, regionValue } from '../../config/china-cities'

const REGIONS = CHINA_PROVINCES

Page({
  data: {
    guest: false,
    loading: false,
    saving: false,
    uploadingAvatar: false,
    uploadingLicense: false,
    email: '',
    uid: '',
    name: '',
    storeName: '',
    phone: '',
    country: regionValue(REGIONS[0], CHINA_REGIONS[REGIONS[0]][0]),
    regionColumns: [REGIONS, CHINA_REGIONS[REGIONS[0]]],
    regionIndexes: [0, 0],
    avatarUrl: '',
    licenseUrl: '',
  },

  onHide() { pauseVisitorTimer() },
  goTutorial() { openTutorial() },
  requestLogin() { promptLogin() },
  onLoad() { if (!getToken()) promptLogin() },
  onShow() {
    resumeVisitorTimer()
    if (!getToken()) {
      this.setData({ guest: true, loading: false, email: '', uid: '', avatarUrl: '', licenseUrl: '' })
      return
    }
    this.setData({ guest: false })
    this.loadProfile()
  },

  async loadProfile() {
    if (!getToken()) return
    this.setData({ loading: true })
    try {
      const me = await getMe()
      const [provinceIndex, cityIndex] = parseRegion(me.country)
      const province = REGIONS[provinceIndex]
      const region = regionValue(province, CHINA_REGIONS[province][cityIndex])
      this.setData({
        email: me.email || '',
        uid: me.uid || '',
        name: me.name || '',
        storeName: me.store_name || '',
        phone: me.phone || '',
        country: region,
        regionColumns: [REGIONS, CHINA_REGIONS[province]],
        regionIndexes: [provinceIndex, cityIndex],
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

  handleRegionColumnChange(e: WechatMiniprogram.PickerColumnChange) {
    const { column, value } = e.detail
    const [provinceIndex] = this.data.regionIndexes
    if (column === 0) {
      const province = REGIONS[value]
      const city = CHINA_REGIONS[province][0]
      this.setData({
        regionColumns: [REGIONS, CHINA_REGIONS[province]],
        regionIndexes: [value, 0],
        country: regionValue(province, city),
      })
      return
    }
    const province = REGIONS[provinceIndex]
    const city = CHINA_REGIONS[province][value]
    this.setData({ regionIndexes: [provinceIndex, value], country: regionValue(province, city) })
  },

  handleRegionChange(e: WechatMiniprogram.PickerChange) {
    const [provinceIndex, cityIndex] = e.detail.value as number[]
    const province = REGIONS[provinceIndex]
    const city = CHINA_REGIONS[province][cityIndex]
    this.setData({ regionIndexes: [provinceIndex, cityIndex], country: regionValue(province, city) })
  },

  handleChooseAvatar() {
    if (!promptLogin()) return
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
    if (!promptLogin()) return
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
    if (!promptLogin()) return
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
        wx.reLaunch({ url: '/pages/dashboard/dashboard' })
      },
    })
  },

  goChangePassword() {
    if (!promptLogin()) return
    wx.navigateTo({ url: '/pages/change-password/change-password' })
  },
})
