import { getToken, saveAuth, AuthUser } from '../../utils/auth'
import {
  wechatLogin,
  wechatBind,
  wechatRegister,
  login,
  register,
  resendVerification,
  AuthResult,
} from '../../services/auth'

const COUNTRIES = ['CN', 'US', 'DE', 'GB', 'FR', 'JP', 'KR', 'IN', 'OTHER']

let resendTimer: number | null = null

type Mode = 'home' | 'wechatUnbound' | 'accountLogin' | 'register' | 'wechatRegister' | 'bind' | 'registered'

function wxLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) resolve(res.code)
        else reject(new Error('wx.login 未返回 code'))
      },
      fail: () => reject(new Error('wx.login 调用失败')),
    })
  })
}

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
    mode: 'home' as Mode,
    loading: false,
    error: '',
    registeredMessage: '',
    registeredEmail: '',
    resending: false,
    resendMessage: '',
    resendCooldown: 0,
    resendBtnText: '重新发送验证邮件',
    identifier: '',
    password: '',
    showPwd: false,
    showRegPwd: false,
    showRegConfirm: false,
    regEmail: '',
    regPassword: '',
    regConfirm: '',
    regName: '',
    regPhone: '',
    countries: COUNTRIES,
    countryIndex: 0,
  },

  onShow() {
    if (getToken()) {
      wx.reLaunch({ url: '/pages/dashboard/dashboard' })
    }
  },

  async handleWechatLogin() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const code = await wxLogin()
      const result = await wechatLogin(code)
      if (result.bound && result.token) {
        saveAuth(result.token, toAuthUser(result))
        wx.reLaunch({ url: '/pages/dashboard/dashboard' })
      } else {
        this.setData({ mode: 'wechatUnbound' })
      }
    } catch (e) {
      this.setData({ error: (e as Error).message || '登录失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goAccountLogin() {
    this.setData({ mode: 'accountLogin', error: '' })
  },

  goForgotPassword() {
    wx.navigateTo({ url: '/pages/forgot-password/forgot-password' })
  },

  goRegister() {
    this.setData({ mode: 'register', error: '' })
  },

  goWechatUnbound() {
    this.setData({ mode: 'wechatUnbound', error: '' })
  },

  goWechatBind() {
    this.setData({ mode: 'bind', error: '' })
  },

  goWechatRegister() {
    this.setData({ mode: 'wechatRegister', error: '' })
  },

  goHome() {
    if (resendTimer) {
      clearInterval(resendTimer)
      resendTimer = null
    }
    this.setData({
      mode: 'home',
      error: '',
      registeredEmail: '',
      resendMessage: '',
      resendCooldown: 0,
      resendBtnText: '重新发送验证邮件',
    })
  },

  handleInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string
    this.setData({ [field]: e.detail.value } as any)
  },

  togglePwd() {
    this.setData({ showPwd: !this.data.showPwd })
  },

  toggleRegPwd() {
    this.setData({ showRegPwd: !this.data.showRegPwd })
  },

  toggleRegConfirm() {
    this.setData({ showRegConfirm: !this.data.showRegConfirm })
  },

  handleCountryChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ countryIndex: Number(e.detail.value) })
  },

  async handleAccountLogin() {
    const { identifier, password } = this.data
    if (!identifier.trim() || !password) {
      this.setData({ error: '请输入邮箱/会员号和密码' })
      return
    }
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const result = await login(identifier.trim(), password)
      if (result.token) {
        saveAuth(result.token, toAuthUser(result))
        wx.reLaunch({ url: '/pages/dashboard/dashboard' })
      } else {
        this.setData({ error: '登录失败，请重试' })
      }
    } catch (e) {
      this.setData({ error: (e as Error).message || '登录失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async handleBind() {
    const { identifier, password } = this.data
    if (!identifier.trim() || !password) {
      this.setData({ error: '请输入邮箱/会员号和密码' })
      return
    }
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const code = await wxLogin()
      const result = await wechatBind(code, identifier.trim(), password)
      if (result.bound && result.token) {
        saveAuth(result.token, toAuthUser(result))
        wx.reLaunch({ url: '/pages/dashboard/dashboard' })
      } else {
        this.setData({ error: '绑定失败，请重试' })
      }
    } catch (e) {
      this.setData({ error: (e as Error).message || '绑定失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  validateRegister(): boolean {
    const { regEmail, regPassword, regConfirm, regName, regPhone } = this.data
    if (!regEmail.trim() || !regPassword || !regName.trim() || !regPhone.trim()) {
      this.setData({ error: '请填写所有必填项' })
      return false
    }
    if (regPassword.length < 8) {
      this.setData({ error: '密码至少 8 位' })
      return false
    }
    if (regPassword !== regConfirm) {
      this.setData({ error: '两次密码不一致' })
      return false
    }
    return true
  },

  registerPayload() {
    const { regEmail, regPassword, regName, regPhone, countries, countryIndex } = this.data
    return {
      email: regEmail.trim(),
      password: regPassword,
      name: regName.trim(),
      country: countries[countryIndex] || 'CN',
      phone: regPhone.trim(),
    }
  },

  async handleRegister() {
    if (!this.validateRegister()) return
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const res = await register(this.registerPayload())
      this.setData({
        mode: 'registered',
        registeredMessage: res.message || '注册成功，请查收验证邮件',
        registeredEmail: this.data.regEmail.trim(),
        resendMessage: '',
        resendCooldown: 0,
        resendBtnText: '重新发送验证邮件',
      })
    } catch (e) {
      this.setData({ error: (e as Error).message || '注册失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async handleWechatRegister() {
    if (!this.validateRegister()) return
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const code = await wxLogin()
      const res = await wechatRegister({ ...this.registerPayload(), code })
      this.setData({
        mode: 'registered',
        registeredMessage: res.message || '注册成功，请查收验证邮件',
        registeredEmail: this.data.regEmail.trim(),
        resendMessage: '',
        resendCooldown: 0,
        resendBtnText: '重新发送验证邮件',
      })
    } catch (e) {
      this.setData({ error: (e as Error).message || '注册失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async handleResendVerification() {
    const email = this.data.registeredEmail
    if (!email) return
    if (this.data.resending || this.data.resendCooldown > 0) return
    this.setData({ resending: true, resendMessage: '' })
    try {
      const res = await resendVerification(email)
      this.setData({
        resendMessage: res.success
          ? '验证邮件已重新发送，请检查邮箱（包括垃圾邮件）。'
          : res.message || '发送失败，请稍后重试',
      })
      if (res.success) {
        this.startCooldown()
      }
    } catch (e) {
      this.setData({ resendMessage: (e as Error).message || '发送失败，请稍后重试' })
    } finally {
      this.setData({ resending: false })
    }
  },

  startCooldown() {
    const update = (n: number) => {
      this.setData({
        resendCooldown: n,
        resendBtnText: n > 0 ? `重新发送(${n}s)` : '重新发送验证邮件',
      })
    }
    update(60)
    if (resendTimer) {
      clearInterval(resendTimer)
    }
    resendTimer = setInterval(() => {
      const next = this.data.resendCooldown - 1
      if (next <= 0) {
        if (resendTimer) {
          clearInterval(resendTimer)
          resendTimer = null
        }
        update(0)
      } else {
        update(next)
      }
    }, 1000)
  },

  onUnload() {
    if (resendTimer) {
      clearInterval(resendTimer)
      resendTimer = null
    }
  },
})
