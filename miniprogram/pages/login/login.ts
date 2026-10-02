import { pauseVisitorTimer } from '../../utils/visitor'
import { getToken, saveAuth, logout, AuthUser } from '../../utils/auth'
import {
  wechatLogin,
  prepareWechatSession,
  wechatBind,
  getWechatPhone,
  login,
  register,
  resendVerification,
  AuthResult,
} from '../../services/auth'
import { CHINA_PROVINCES, CHINA_REGIONS, regionValue } from '../../config/china-cities'

const REGIONS = CHINA_PROVINCES

let resendTimer: number | null = null
let preparedSession: { token: string, expiresAt: number, bound: boolean } | null = null
let preparingSession: Promise<void> | null = null

type Mode = 'home' | 'wechatUnbound' | 'accountLogin' | 'register' | 'bind' | 'registered'

/**
 * Calls the official Mini Program login API for a one-time credential.
 * The credential is never cached because WeChat permits it to be used once.
 */
function getWechatLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) resolve(res.code)
        else reject(new Error('未返回登录凭证，请重试'))
      },
      fail: () => reject(new Error('无法调用快捷登录服务，请稍后重试')),
    })
  })
}

function prefetchWechatSession(): Promise<void> {
  if (preparedSession && preparedSession.expiresAt > Date.now() + 15000) return Promise.resolve()
  if (preparingSession) return preparingSession
  preparingSession = (async () => {
    try {
      const code = await getWechatLoginCode()
      const result = await prepareWechatSession(code)
      preparedSession = {
        token: result.session_token,
        expiresAt: Date.now() + result.expires_in * 1000,
        bound: result.bound,
      }
    } catch (_) {
      preparedSession = null
      // A fresh wx.login remains available when the user taps quick login.
    } finally {
      preparingSession = null
    }
  })()
  return preparingSession
}

type PhoneAuthorizationEvent = {
  detail: {
    code?: string
    errMsg?: string
  }
}

function getAuthorizedPhoneCode(event: PhoneAuthorizationEvent): string {
  const code = event.detail && event.detail.code
  if (code) return code
  if ((event.detail && event.detail.errMsg || '').includes('deny')) {
    throw new Error('需要授权手机号才能使用快捷登录')
  }
  throw new Error('未获取到手机号授权，请重试')
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
    supportsDistribution: null as boolean | null,
    mode: 'home' as Mode,
    loading: false,
    wechatBoundReady: false,
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
    authorizingRegisterPhone: false,
    regionColumns: [REGIONS, CHINA_REGIONS[REGIONS[0]]],
    regionIndexes: [0, 0],
    regionDisplay: regionValue(REGIONS[0], CHINA_REGIONS[REGIONS[0]][0]),
  },

  continueAsGuest() {
    if (this.data.loading) return
    logout()
    if (getCurrentPages().length > 1) wx.navigateBack()
    else wx.reLaunch({ url: '/pages/dashboard/dashboard' })
  },

  onShow() {
    pauseVisitorTimer()
    if (getToken()) {
      wx.reLaunch({ url: '/pages/dashboard/dashboard' })
    } else {
      void this.refreshWechatSession()
    }
  },

  async refreshWechatSession() {
    await prefetchWechatSession()
    if (!getToken()) {
      this.setData({ wechatBoundReady: !!(preparedSession && preparedSession.bound) })
    }
  },

  handleDistributionChange(event: WechatMiniprogram.RadioGroupChange) {
    this.setData({ supportsDistribution: event.detail.value === 'yes', error: '' })
  },

  requireDistribution() {
    if (this.data.supportsDistribution !== null) return true
    this.setData({ error: '请选择是否支持铺货' })
    return false
  },

  async handleWechatLogin(event: PhoneAuthorizationEvent) {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const phoneCode = getAuthorizedPhoneCode(event)
      if (preparingSession) await preparingSession
      const session = preparedSession
      preparedSession = null
      let result
      if (session && session.expiresAt > Date.now() + 15000) {
        try {
          result = await wechatLogin({ session_token: session.token }, phoneCode)
        } catch (e) {
          // An expired or invalid ticket is rejected before the phone code is used.
          if ((e as Error).message !== 'WeChat session expired') throw e
          result = await wechatLogin({ code: await getWechatLoginCode() }, phoneCode)
        }
      } else {
        result = await wechatLogin({ code: await getWechatLoginCode() }, phoneCode)
      }
      if (result.token) {
        saveAuth(result.token, toAuthUser(result))
        if (result.phone_binding_warning) {
          wx.showModal({
            title: '手机号未绑定',
            content: result.phone_binding_warning,
            showCancel: false,
            success: () => wx.reLaunch({ url: '/pages/dashboard/dashboard' }),
          })
        } else {
          wx.reLaunch({ url: '/pages/dashboard/dashboard' })
        }
      } else {
        this.setData({ error: '快捷登录注册失败，请稍后重试' })
      }
    } catch (e) {
      const message = (e as Error).message || '登录失败'
      this.setData({
        mode: message.includes('请使用账号密码登录并绑定微信') ? 'bind'
          : message.includes('请使用账号密码登录') ? 'accountLogin' : this.data.mode,
        error: message,
      })
    } finally {
      this.setData({ loading: false })
      if (!getToken()) void this.refreshWechatSession()
    }
  },

  goAccountLogin() {
    this.setData({ mode: 'accountLogin', error: '' })
  },

  goForgotPassword() {
    wx.navigateTo({ url: '/pages/forgot-password/forgot-password' })
  },

  goRegister() {
    this.setData({ mode: 'register', error: '', regPhone: '' })
  },

  goWechatUnbound() {
    this.setData({ mode: 'wechatUnbound', error: '' })
  },

  goWechatBind() {
    this.setData({ mode: 'bind', error: '' })
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

  handleRegionColumnChange(e: WechatMiniprogram.PickerColumnChange) {
    const { column, value } = e.detail
    const [provinceIndex] = this.data.regionIndexes
    if (!Number.isInteger(value) || value < 0) return
    if (column !== 0 && column !== 1) return
    if (column === 0) {
      const province = REGIONS[value]
      if (!province || !CHINA_REGIONS[province] || !CHINA_REGIONS[province].length) return
      const city = CHINA_REGIONS[province][0]
      this.setData({
        regionColumns: [REGIONS, CHINA_REGIONS[province]],
        regionIndexes: [value, 0],
        regionDisplay: regionValue(province, city),
      })
      return
    }
    const province = REGIONS[provinceIndex]
    if (!CHINA_REGIONS[province] || !CHINA_REGIONS[province][value]) return
    const city = CHINA_REGIONS[province][value]
    this.setData({ regionIndexes: [provinceIndex, value], regionDisplay: regionValue(province, city) })
  },

  handleRegionChange(e: WechatMiniprogram.PickerChange) {
    if (!Array.isArray(e.detail.value)) return
    const [provinceIndex, cityIndex] = e.detail.value as number[]
    if (!Number.isInteger(provinceIndex) || !Number.isInteger(cityIndex)) return
    const province = REGIONS[provinceIndex]
    if (!CHINA_REGIONS[province] || !CHINA_REGIONS[province][cityIndex]) return
    const city = CHINA_REGIONS[province][cityIndex]
    this.setData({ regionIndexes: [provinceIndex, cityIndex], regionDisplay: regionValue(province, city) })
  },

  async handleAuthorizeRegisterPhone(event: PhoneAuthorizationEvent) {
    if (this.data.authorizingRegisterPhone) return
    this.setData({ authorizingRegisterPhone: true, error: '' })
    try {
      const phoneCode = getAuthorizedPhoneCode(event)
      const { phone } = await getWechatPhone(phoneCode)
      this.setData({ regPhone: phone })
    } catch (e) {
      this.setData({ error: (e as Error).message || '手机号授权失败' })
    } finally {
      this.setData({ authorizingRegisterPhone: false })
    }
  },

  async handleAccountLogin() {
    const { identifier, password } = this.data
    if (!identifier.trim() || !password) {
      this.setData({ error: '请输入账号和密码' })
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

  async handleBind(event: PhoneAuthorizationEvent) {
    const { identifier, password } = this.data
    if (!identifier.trim() || !password) {
      this.setData({ error: '请输入账号和密码' })
      return
    }
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const phoneCode = getAuthorizedPhoneCode(event)
      // The code used to identify an unbound WeChat account was already
      // consumed. Binding therefore requests a new official login code.
      const code = await getWechatLoginCode()
      const result = await wechatBind(code, phoneCode, identifier.trim(), password)
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
    if (!this.requireDistribution()) return false
    const { regEmail, regPassword, regConfirm, regName, regPhone } = this.data
    if (!regPassword || !regName.trim() || !regPhone.trim()) {
      this.setData({ error: '请填写所有必填项' })
      return false
    }
    if (regEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) {
      this.setData({ error: '请输入有效的邮箱地址' })
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
    const { regEmail, regPassword, regName, regPhone, regionDisplay } = this.data
    return {
      supports_distribution: this.data.supportsDistribution as boolean,
      email: regEmail.trim() || undefined,
      password: regPassword,
      name: regName.trim(),
      // `country` is retained as the API field name; seller accounts store a
      // mainland-China province/city value here as their operating region.
      country: regionDisplay,
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
        registeredMessage: res.message || (this.data.regEmail.trim() ? '注册成功，请查收验证邮件' : '注册成功，请使用手机号登录'),
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
