import { getToken } from './auth'

const GUIDE_KEY = 'zhermai_tutorial_seen_v1'
let timer: number | null = null
let deadline = 0
let prompted = false
let modalOpen = false

export function pauseVisitorTimer() {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

export function needsTutorial(): boolean {
  return !wx.getStorageSync(GUIDE_KEY)
}

export function openTutorial() {
  pauseVisitorTimer()
  wx.navigateTo({ url: '/pages/tutorial/tutorial' })
}

export function beginTutorial() {
  wx.setStorageSync(GUIDE_KEY, true)
  pauseVisitorTimer()
}

export function finishTutorial() {
  wx.setStorageSync(GUIDE_KEY, true)
  if (!deadline) deadline = Date.now() + 30000
}

export function openGuestLogin() {
  if (getToken()) return
  const pages = getCurrentPages()
  if (pages.length && pages[pages.length - 1].route === 'pages/login/login') return
  prompted = true
  pauseVisitorTimer()
  wx.navigateTo({ url: '/pages/login/login' })
}

export function promptLogin(): boolean {
  if (getToken()) return true
  if (modalOpen) return false
  const pages = getCurrentPages()
  if (pages.length && pages[pages.length - 1].route === 'pages/login/login') return false
  prompted = true
  pauseVisitorTimer()
  modalOpen = true
  wx.showModal({
    title: '登录后使用完整功能',
    content: '登录后可上传商品、使用拍照识别、处理询盘和管理资料。也可以暂不登录，继续浏览。',
    confirmText: '去登录',
    cancelText: '暂不登录',
    success: result => {
      if (result.confirm) wx.navigateTo({ url: '/pages/login/login' })
    },
    complete: () => { modalOpen = false },
  })
  return false
}

// One reminder per app session. Navigation cannot reset the 30-second deadline.
export function resumeVisitorTimer() {
  pauseVisitorTimer()
  if (getToken() || prompted || needsTutorial()) return
  if (!isBrowsingPage()) return
  if (!deadline) deadline = Date.now() + 30000
  timer = setTimeout(() => {
    timer = null
    if (isBrowsingPage() && !getToken()) promptLogin()
  }, Math.max(0, deadline - Date.now()))
}

function isBrowsingPage() {
  const pages = getCurrentPages()
  const route = pages.length ? pages[pages.length - 1].route : ''
  return ['pages/dashboard/dashboard', 'pages/products/products', 'pages/inquiries/inquiries', 'pages/reviews/reviews', 'pages/profile/profile'].includes(route)
}
