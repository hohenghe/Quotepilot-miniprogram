// Offline flow tests: real TypeScript modules, mocked WeChat APIs and clock.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../miniprogram')

function harness() {
  const storage = new Map(), cache = new Map(), timers = new Map()
  const state = { now: 1000, route: 'pages/dashboard/dashboard', modals: [], navigations: [], requests: 0, uploads: 0, choices: 0 }
  let sequence = 0, page
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    showModal: options => state.modals.push(options),
    navigateTo: options => { state.navigations.push(options.url); state.route = options.url.slice(1) },
    navigateBack: () => { state.route = 'pages/dashboard/dashboard' },
    reLaunch: options => { state.navigations.push(options.url); state.route = options.url.slice(1) },
    request: options => { state.requests++; options.success({ statusCode: state.status || 200, data: {} }) },
    uploadFile: options => { state.uploads++; options.success({ statusCode: state.status || 200, data: '{}' }) },
    chooseImage: () => { state.choices++ },
    chooseMedia: () => { state.choices++ },
    chooseMessageFile: () => { state.choices++ },
    stopPullDownRefresh() {}, setNavigationBarTitle() {}, showToast() {},
  }
  const context = vm.createContext({
    wx, console, Date: class extends Date { static now() { return state.now } },
    getCurrentPages: () => [{ route: 'pages/dashboard/dashboard' }, { route: state.route }],
    Page: definition => { page = definition },
    setTimeout: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, at: state.now + delay }); return id },
    clearTimeout: id => timers.delete(id),
  })
  function load(relative) {
    const file = path.resolve(root, relative)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    const run = vm.runInContext('(function(require,module,exports){' + source + '\n})', context)
    run(specifier => load(path.relative(root, path.resolve(path.dirname(file), specifier + '.ts'))), module, module.exports)
    return module.exports
  }
  function loadPage(name) {
    load(`pages/${name}/${name}.ts`)
    const instance = { ...page, data: structuredClone(page.data || {}), setData(values) { Object.assign(this.data, values) } }
    return instance
  }
  function advance(ms) {
    state.now += ms
    for (const [id, timer] of [...timers]) if (timer.at <= state.now) { timers.delete(id); timer.callback() }
  }
  function cancel() { const modal = state.modals.at(-1); modal.success({ confirm: false }); modal.complete?.() }
  return { state, storage, load, loadPage, advance, cancel, timers }
}

async function main() {
  let h = harness(), visitor = h.load('utils/visitor.ts')
  const dashboard = h.loadPage('dashboard')
  dashboard.onShow()
  assert.equal(h.state.route, 'pages/tutorial/tutorial')
  assert.equal(h.state.requests, 0)
  const guide = h.loadPage('tutorial'); guide.onLoad(); guide.onShow()
  h.advance(60000); assert.equal(h.state.modals.length, 0)
  guide.closeTutorial(); guide.onUnload(); dashboard.onShow()
  assert.equal(dashboard.data.guest, true)
  h.advance(29999); assert.equal(h.state.modals.length, 0)
  h.advance(1); assert.equal(h.state.modals.length, 1)
  h.cancel(); visitor.resumeVisitorTimer(); h.advance(60000)
  assert.equal(h.state.modals.length, 1, 'cancel suppresses repeat timed reminders')
  assert.equal(visitor.promptLogin(), false)
  assert.equal(h.state.modals.length, 2, 'explicit protected actions still prompt')
  h.cancel()

  h = harness(); visitor = h.load('utils/visitor.ts'); visitor.finishTutorial(); visitor.resumeVisitorTimer()
  h.advance(10000); visitor.pauseVisitorTimer(); h.state.route = 'pages/products/products'; visitor.resumeVisitorTimer()
  h.advance(19999); assert.equal(h.state.modals.length, 0)
  h.advance(1); assert.equal(h.state.modals.length, 1, 'navigation preserves original deadline')

  h = harness(); visitor = h.load('utils/visitor.ts'); visitor.finishTutorial(); visitor.resumeVisitorTimer()
  visitor.pauseVisitorTimer(); h.advance(60000); assert.equal(h.state.modals.length, 0, 'background stays quiet')
  visitor.resumeVisitorTimer(); h.advance(0); assert.equal(h.state.modals.length, 1)

  h = harness(); visitor = h.load('utils/visitor.ts'); visitor.finishTutorial(); visitor.resumeVisitorTimer()
  h.state.route = 'pages/tutorial/tutorial'; h.advance(30000)
  assert.equal(h.state.modals.length, 0, 'timer rechecks current page')

  h = harness(); visitor = h.load('utils/visitor.ts'); visitor.finishTutorial(); visitor.resumeVisitorTimer()
  h.storage.set('quotepilot_token', 'test-token'); h.advance(30000)
  assert.equal(h.state.modals.length, 0, 'authenticated users are not prompted')
  assert.equal(visitor.promptLogin(), true)

  h = harness(); visitor = h.load('utils/visitor.ts')
  visitor.promptLogin(); visitor.promptLogin()
  assert.equal(h.state.modals.length, 1, 'concurrent guards share one dialog')
  h.state.modals[0].success({ confirm: true }); h.state.modals[0].complete()
  assert.equal(h.state.route, 'pages/login/login')
  assert.equal(visitor.promptLogin(), false); assert.equal(h.state.modals.length, 1)

  h = harness(); const nativeGuide = h.loadPage('tutorial')
  nativeGuide.onLoad(); nativeGuide.onShow(); nativeGuide.onUnload()
  h.state.route = 'pages/dashboard/dashboard'; h.loadPage('dashboard').onShow()
  assert.equal(h.state.navigations.length, 0, 'native back does not reopen tutorial')
  h.advance(30000); assert.equal(h.state.modals.length, 1)

  for (const name of ['products', 'inquiries', 'reviews', 'profile']) {
    h = harness(); const page = h.loadPage(name); page.onLoad?.(); page.onShow()
    assert.equal(page.data.guest, true, name)
    await page.onPullDownRefresh?.()
    assert.equal(h.state.requests, 0, name + ' guest must not load private data')
    assert.equal(h.state.modals.length, name === 'profile' ? 1 : 0)
    if (name === 'profile') { h.cancel(); page.onShow(); assert.equal(h.state.modals.length, 1, 'returning from canceled login does not loop') }
  }

  h = harness(); const products = h.loadPage('products')
  products.goCreate(); h.cancel(); products.handleImportFile(); h.cancel(); products.handleBatchDelete()
  assert.equal(h.state.modals.length, 3); assert.equal(h.state.choices, 0); assert.equal(h.state.navigations.length, 0)
  h = harness(); const editor = h.loadPage('product-edit'); editor.onLoad({ id: '1' }); h.cancel()
  editor.handleChooseAiImage(); h.cancel(); editor.handleChooseImage(); h.cancel(); await editor.handleSave()
  assert.equal(h.state.requests + h.state.uploads + h.state.choices, 0)

  h = harness(); const seller = h.load('services/seller.ts')
  for (const operation of [() => seller.getSellerProducts(), () => seller.createSellerProduct({}), () => seller.deleteSellerProduct(1), () => seller.uploadProductFile('test'), () => seller.recognizeProductImage('test'), () => seller.generateSellerReply(1), () => seller.updateProfile({})]) {
    await assert.rejects(operation, /请先登录/); h.cancel()
  }
  assert.equal(h.state.requests + h.state.uploads, 0, 'service guard blocks guest requests')
  h.storage.set('quotepilot_token', 'test-token'); await seller.getSellerProducts(); await seller.uploadProductFile('test')
  assert.equal(h.state.requests, 1); assert.equal(h.state.uploads, 1)
  h.state.status = 401; await assert.rejects(() => seller.getSellerProducts())
  assert.equal(h.storage.has('quotepilot_token'), false); assert.equal(h.state.navigations.length, 0, 'expired login never forces redirect')
  h.cancel()
  const login = h.loadPage('login'); login.continueAsGuest()
  assert.equal(h.state.route, 'pages/dashboard/dashboard')
  h = harness(); const guestHome = h.loadPage('dashboard'); guestHome.handleHeaderLogin()
  assert.equal(h.state.route, 'pages/login/login')
  assert.equal(h.state.modals.length, 0, 'header opens login directly')
  h.state.route = 'pages/dashboard/dashboard'; h.storage.set('quotepilot_token', 'test-token')
  guestHome.handleHeaderLogin(); assert.equal(h.state.navigations.length, 1, 'logged-in header does not open login')
  h = harness(); const sellerLogin = h.loadPage('login')
  await sellerLogin.handleRegister(); await sellerLogin.handleWechatRegister({ detail: {} })
  assert.equal(h.state.requests, 0, 'missing distribution choice blocks both registration paths')
  assert.equal(sellerLogin.data.error, '请选择是否支持铺货')
  sellerLogin.handleDistributionChange({ detail: { value: 'no' } })
  assert.equal(sellerLogin.data.supportsDistribution, false); assert.equal(sellerLogin.requireDistribution(), true)
  assert.equal(sellerLogin.registerPayload().supports_distribution, false)
  sellerLogin.handleDistributionChange({ detail: { value: 'yes' } })
  assert.equal(sellerLogin.data.supportsDistribution, true); assert.equal(sellerLogin.requireDistribution(), true)
  assert.equal(sellerLogin.registerPayload().supports_distribution, true)
  sellerLogin.setData({ supportsDistribution: null, identifier: 'seller@example.com', password: 'password1' })
  await sellerLogin.handleAccountLogin()
  assert.equal(h.state.requests, 1, 'email login no longer requires a distribution choice')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.equal(manifest.pages[0], 'pages/dashboard/dashboard')
  for (const route of manifest.pages) {
    for (const extension of ['.ts', '.json', '.wxml']) assert.ok(fs.existsSync(path.join(root, route + extension)), route + extension)
    const name = route.split('/')[1], page = harness().loadPage(name)
    const markup = fs.readFileSync(path.join(root, route + '.wxml'), 'utf8')
    for (const match of markup.matchAll(/(?:bind|catch)\w+="([A-Za-z]\w*)"/g)) assert.equal(typeof page[match[1]], 'function', route + ': ' + match[1])
  }
  console.log('PASS: tutorial, 30-second timer, navigation/background, cancellation, profile, guest action and service guards, authenticated requests, 401, login exit')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
