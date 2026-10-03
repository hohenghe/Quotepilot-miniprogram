const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/login/login.ts'), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function createPage(authResult, loginResult = { token: 'new-token', user_id: 2, role: 'seller' }) {
  let saved = null
  const requests = []
  const navigations = []
  const modals = []
  const pageModule = { exports: {} }
  const fakeRequire = (name) => {
    if (name === '../../utils/visitor') return { pauseVisitorTimer() {} }
    if (name === '../../utils/auth') return {
      getToken: () => saved && saved.token,
      saveAuth: (token, user) => { saved = { token, user } },
    }
    if (name === '../../services/auth') return {
      prepareWechatSession: async () => ({ session_token: 'prepared', expires_in: 120, bound: !!authResult }),
      wechatLogin: async (credentials, phoneCode) => {
        requests.push({ credentials, phoneCode })
        if (loginResult instanceof Error) throw loginResult
        return loginResult
      },
      completeWechatRegistration: async (choiceToken) => {
        requests.push({ registration: choiceToken })
        return { token: 'registered-token', user_id: 3, role: 'seller' }
      },
      wechatBind: async (choiceToken, identifier, password) => {
        requests.push({ binding: choiceToken, identifier, password })
        return { token: 'bound-token', user_id: 4, role: 'seller', bound: true }
      },
    }
    if (name === '../../config/china-cities') return {
      CHINA_PROVINCES: ['北京'], CHINA_REGIONS: { 北京: ['北京'] }, regionValue: () => '北京',
    }
    throw new Error(`Unexpected import: ${name}`)
  }
  const context = {
    require: fakeRequire, module: pageModule, exports: pageModule.exports,
    Page: (value) => { context.page = value },
    wx: {
      login: ({ success }) => success({ code: 'wechat-code' }),
      reLaunch: ({ url }) => navigations.push(url),
      showModal: options => { modals.push(options); options.success?.() },
    },
    getCurrentPages: () => [],
    Date, Promise, setInterval, clearInterval,
  }
  vm.runInNewContext(javascript, context, { filename: 'login.js' })
  const page = context.page
  page.setData = (values) => Object.assign(page.data, values)
  return { page, requests, navigations, modals, getSaved: () => saved }
}

async function main() {
  const bound = createPage({ token: 'bound-token', user_id: 1, role: 'seller' })
  await bound.page.refreshWechatSession()
  assert.equal(bound.page.data.wechatBoundReady, true)
  await bound.page.handleWechatLogin({ detail: { code: 'authorized-phone-code' } })
  assert.equal(bound.getSaved().token, 'new-token')
  assert.equal(bound.requests.length, 1)
  assert.equal(bound.requests[0].phoneCode, 'authorized-phone-code')
  assert.equal(bound.requests[0].credentials.session_token, 'prepared')
  assert.equal(bound.navigations[0], '/pages/dashboard/dashboard')

  const unbound = createPage(null, {
    bound: false, choice_token: 'choice-ticket', phone_hint: '尾号 1234', registration_available: true,
  })
  await unbound.page.refreshWechatSession()
  assert.equal(unbound.page.data.wechatBoundReady, false)
  await unbound.page.handleWechatLogin({ detail: { code: 'phone-code' } })
  assert.equal(unbound.requests.length, 1)
  assert.equal(unbound.requests[0].credentials.session_token, 'prepared')
  assert.equal(unbound.requests[0].phoneCode, 'phone-code')
  assert.equal(unbound.getSaved(), null)
  assert.equal(unbound.page.data.mode, 'wechatUnbound')
  assert.equal(unbound.page.data.phoneHint, '尾号 1234')
  assert.equal(unbound.page.data.registrationAvailable, true)
  await unbound.page.handleChoiceRegister()
  assert.equal(unbound.requests[1].registration, 'choice-ticket')
  assert.equal(unbound.getSaved().token, 'registered-token')
  const webAccount = createPage(null, {
    bound: false, choice_token: 'web-choice', phone_hint: '尾号 5678', registration_available: false,
  })
  await webAccount.page.refreshWechatSession()
  await webAccount.page.handleWechatLogin({ detail: { code: 'phone-code' } })
  assert.equal(webAccount.page.data.registrationAvailable, false)
  webAccount.page.goWechatBind()
  webAccount.page.setData({ identifier: 'seller@example.com', password: 'password123' })
  await webAccount.page.handleBind()
  assert.equal(webAccount.requests[1].binding, 'web-choice')
  assert.equal(webAccount.requests[1].identifier, 'seller@example.com')
  assert.equal(webAccount.getSaved().token, 'bound-token')
  const denied = createPage({ token: 'bound-token', user_id: 1, role: 'seller' })
  await denied.page.refreshWechatSession()
  await denied.page.handleWechatLogin({ detail: { errMsg: 'getPhoneNumber:fail user deny' } })
  assert.equal(denied.getSaved(), null)
  assert.equal(denied.requests.length, 0)
  assert.equal(denied.navigations.length, 0)
  const mismatch = createPage({ token: 'bound-token', user_id: 1, role: 'seller' }, {
    token: 'current-token', user_id: 1, role: 'seller',
    phone_binding_warning: '微信登录成功，但授权手机号已属于其他账号，主手机号未更改。',
  })
  await mismatch.page.refreshWechatSession()
  await mismatch.page.handleWechatLogin({ detail: { code: 'phone-code' } })
  assert.equal(mismatch.getSaved().user.user_id, 1)
  assert.equal(mismatch.modals.length, 1)
  assert.equal(mismatch.navigations[0], '/pages/dashboard/dashboard')
  const existing = createPage(null, new Error('该手机号已有卖家账号，请使用账号密码登录并绑定微信'))
  await existing.page.refreshWechatSession()
  await existing.page.handleWechatLogin({ detail: { code: 'phone-code' } })
  assert.equal(existing.page.data.mode, 'bind')
  assert.equal(existing.getSaved(), null)
  const alreadyBound = createPage(null, new Error('该手机号已有账号且绑定了其他微信，请使用账号密码登录'))
  await alreadyBound.page.refreshWechatSession()
  await alreadyBound.page.handleWechatLogin({ detail: { code: 'phone-code' } })
  assert.equal(alreadyBound.page.data.mode, 'accountLogin')
  console.log('PASS: first login requires explicit registration/binding; denial cannot bypass authorization')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
