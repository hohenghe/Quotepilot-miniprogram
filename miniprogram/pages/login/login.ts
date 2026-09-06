import { getToken, saveAuth, AuthUser } from '../../utils/auth'
import {
  wechatLogin,
  wechatBind,
  wechatRegister,
  getWechatPhone,
  login,
  register,
  resendVerification,
  AuthResult,
} from '../../services/auth'
import { CHINA_PROVINCES, CHINA_REGIONS, regionValue } from '../../config/china-cities'

const REGIONS = CHINA_PROVINCES

let resendTimer: number | null = null

type Mode = 'home' | 'wechatUnbound' | 'accountLogin' | 'register' | 'wechatRegister' | 'bind' | 'registered'

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

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
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
    authorizingRegisterPhone: false,
    regionColumns: [REGIONS, CHINA_REGIONS[REGIONS[0]]],
    regionIndexes: [0, 0],
    regionDisplay: regionValue(REGIONS[0], CHINA_REGIONS[REGIONS[0]][0]),
  },

  onShow() {
    if (getToken()) {
      wx.reLaunch({ url: '/pages/dashboard/dashboard' })
    }
  },

  async handleWechatLogin(event: PhoneAuthorizationEvent) {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const phoneCode = getAuthorizedPhoneCode(event)
      const code = await getWechatLoginCode()
      const result = await wechatLogin(code, phoneCode)
      if (result.bound && result.token) {
        saveAuth(result.token, toAuthUser(result))
        wx.reLaunch({ url: '/pages/dashboard/dashboard' })
      } else {
        this.setData({ mode: 'wechatUnbound', error: '' })
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
    this.setData({ mode: 'register', error: '', regPhone: '' })
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

  handleRegionColumnChange(e: WechatMiniprogram.PickerColumnChange) {
    const { column, value } = e.detail
    const [provinceIndex] = this.data.regionIndexes
    if (column === 0) {
      const province = REGIONS[value]
      const city = CHINA_REGIONS[province][0]
      this.setData({
        regionColumns: [REGIONS, CHINA_REGIONS[province]],
        regionIndexes: [value, 0],
        regionDisplay: regionValue(province, city),
      })
      return
    }
    const province = REGIONS[provinceIndex]
    const city = CHINA_REGIONS[province][value]
    this.setData({ regionIndexes: [provinceIndex, value], regionDisplay: regionValue(province, city) })
  },

  handleRegionChange(e: WechatMiniprogram.PickerChange) {
    const [provinceIndex, cityIndex] = e.detail.value as number[]
    const province = REGIONS[provinceIndex]
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
      this.setData({ error: '请输入邮箱和密码' })
      return
    }
    if (!isEmail(identifier.trim())) {
      this.setData({ error: '请输入有效的邮箱地址' })
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
      this.setData({ error: '请输入邮箱和密码' })
      return
    }
    if (!isEmail(identifier.trim())) {
      this.setData({ error: '请输入有效的邮箱地址' })
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

  validateRegister(requireManualPhone = true): boolean {
    const { regEmail, regPassword, regConfirm, regName, regPhone } = this.data
    if (!regEmail.trim() || !regPassword || !regName.trim() || (requireManualPhone && !regPhone.trim())) {
      this.setData({ error: '请填写所有必填项' })
      return false
    }
    if (!isEmail(regEmail.trim())) {
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
      email: regEmail.trim(),
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

  async handleWechatRegister(event: PhoneAuthorizationEvent) {
    if (!this.validateRegister(false)) return
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const phoneCode = getAuthorizedPhoneCode(event)
      // Registration also needs a fresh, single-use WeChat credential. The
      // server creates the email account and WeChat binding in one operation.
      const code = await getWechatLoginCode()
      const res = await wechatRegister({ ...this.registerPayload(), code, phone_code: phoneCode })
      this.setData({
        mode: 'registered',
        registeredMessage: res.message || '邮箱账号已注册并完成绑定，请查收验证邮件',
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
