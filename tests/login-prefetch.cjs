const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/login/login.ts'), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function createPage(authResult) {
  let saved = null
  const requests = []
  const navigations = []
  const pageModule = { exports: {} }
  const fakeRequire = (name) => {
    if (name === '../../utils/visitor') return { pauseVisitorTimer() {} }
    if (name === '../../utils/auth') return {
      getToken: () => saved && saved.token,
      saveAuth: (token, user) => { saved = { token, user } },
    }
    if (name === '../../services/auth') return {
      prepareWechatSession: async () => ({ session_token: 'prepared', expires_in: 120, auth_result: authResult }),
      wechatLogin: async (credentials, phoneCode) => {
        requests.push({ credentials, phoneCode })
        return { token: 'new-token', user_id: 2, role: 'seller' }
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
    },
    getCurrentPages: () => [],
    Date, Promise, setInterval, clearInterval,
  }
  vm.runInNewContext(javascript, context, { filename: 'login.js' })
  const page = context.page
  page.setData = (values) => Object.assign(page.data, values)
  return { page, requests, navigations, getSaved: () => saved }
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

  const unbound = createPage(null)
  await unbound.page.refreshWechatSession()
  assert.equal(unbound.page.data.wechatBoundReady, false)
  await unbound.page.handleWechatLogin({ detail: { code: 'phone-code' } })
  assert.equal(unbound.requests.length, 1)
  assert.equal(unbound.requests[0].credentials.session_token, 'prepared')
  assert.equal(unbound.requests[0].phoneCode, 'phone-code')
  assert.equal(unbound.getSaved().token, 'new-token')
  const denied = createPage({ token: 'bound-token', user_id: 1, role: 'seller' })
  await denied.page.refreshWechatSession()
  await denied.page.handleWechatLogin({ detail: { errMsg: 'getPhoneNumber:fail user deny' } })
  assert.equal(denied.getSaved(), null)
  assert.equal(denied.requests.length, 0)
  assert.equal(denied.navigations.length, 0)
  console.log('PASS: bound and new logins authorize a phone; denial cannot bypass authorization')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
