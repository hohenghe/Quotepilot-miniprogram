// Offline flow tests: real TypeScript modules, mocked WeChat APIs and clock.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../miniprogram')

function harness() {
  const storage = new Map(), cache = new Map(), timers = new Map()
  const state = { now: 1000, route: 'pages/dashboard/dashboard', modals: [], navigations: [], requests: 0, uploads: 0, choices: 0, mediaPath: '', uploadResponse: '{}' }
  let sequence = 0, page
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    showModal: options => state.modals.push(options),
    navigateTo: options => { state.navigations.push(options.url); state.route = options.url.slice(1) },
    navigateBack: () => { state.route = 'pages/dashboard/dashboard' },
    reLaunch: options => { state.navigations.push(options.url); state.route = options.url.slice(1) },
    request: options => {
      state.requests++
      if (state.pendingRequests) { state.pendingRequests.push(options); return }
      options.success({ statusCode: state.status || 200, data: state.response || {} })
    },
    login: options => { options.success({ code: 'wechat-code' }) },
    uploadFile: options => { state.uploads++; options.success({ statusCode: state.status || 200, data: state.uploadResponse }) },
    chooseImage: () => { state.choices++ },
    chooseMedia: options => { state.choices++; if (state.mediaPath) options.success({ tempFiles: [{ tempFilePath: state.mediaPath }] }) },
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
  // The WeChat upload validator rejects optional chaining/nullish coalescing
  // retained by the project's ES2020 compilation target.
  function checkUploadSyntax(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) { checkUploadSyntax(file); continue }
      if (!/\.(ts|js)$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue
      const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText
      const syntax = ts.createSourceFile(file + '.js', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
      function visit(node) {
        assert.ok(!node.questionDotToken, file + ': optional chaining is unsupported during upload')
        assert.notEqual(node.kind, ts.SyntaxKind.QuestionQuestionToken, file + ': nullish coalescing is unsupported during upload')
        ts.forEachChild(node, visit)
      }
      visit(syntax)
    }
  }
  checkUploadSyntax(root)
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

  h = harness(); h.load('utils/visitor.ts').finishTutorial()
  h.storage.set('quotepilot_token', 'stale-token')
  h.storage.set('quotepilot_user', { user_id: 1 })
  h.loadPage('login').continueAsGuest()
  const returnedHome = h.loadPage('dashboard'); returnedHome.onShow()
  assert.equal(h.storage.has('quotepilot_token'), false)
  assert.equal(h.storage.has('quotepilot_user'), false)
  assert.equal(returnedHome.data.guest, true)
  assert.equal(h.state.requests, 0, 'continue browsing clears stale auth before returning home')

  h = harness(); h.storage.set('quotepilot_token', 'expired-token')
  h.state.pendingRequests = []
  const expiredHome = h.loadPage('dashboard')
  const expiredLoad = expiredHome.loadData()
  assert.equal(h.state.requests, 1, 'only the authenticated home summary is requested')
  assert.ok(h.state.pendingRequests[0].url.endsWith('/api/dashboard/seller-home'))
  h.state.pendingRequests[0].success({ statusCode: 401, data: {} })
  await expiredLoad
  assert.equal(h.state.requests, 1, 'invalid session never starts extra private requests')
  assert.equal(expiredHome.data.guest, true)
  assert.equal(expiredHome.data.error, '')
  assert.equal(expiredHome.data.loading, false)
  h.cancel(); h.loadPage('login').continueAsGuest(); await expiredHome.loadData()
  assert.equal(h.state.requests, 1, 'guest return does not retry rejected requests')

  h = harness(); h.storage.set('quotepilot_token', 'valid-token')
  h.state.response = {
    store_name: 'Test store', product_count: 2, inquiry_count: 3,
    pending_count: 1, replied_count: 2, inquiries: [], score: 4.5,
  }
  const signedInHome = h.loadPage('dashboard'); await signedInHome.loadData()
  assert.equal(h.state.requests, 1, 'valid session loads the complete dashboard in one request')
  assert.equal(signedInHome.data.guest, false)
  assert.equal(signedInHome.data.storeName, 'Test store')
  assert.equal(signedInHome.data.productCount, 2)
  assert.equal(signedInHome.data.pendingCount, 1)
  assert.equal(signedInHome.data.scoreText, '4.5')

  h = harness(); const guestHome = h.loadPage('dashboard'); guestHome.handleHeaderLogin()
  assert.equal(h.state.route, 'pages/login/login')
  assert.equal(h.state.modals.length, 0, 'header opens login directly')
  h.state.route = 'pages/dashboard/dashboard'; h.storage.set('quotepilot_token', 'test-token')
  guestHome.handleHeaderLogin(); assert.equal(h.state.navigations.length, 1, 'logged-in header does not open login')
  h = harness(); h.storage.set('quotepilot_token', 'test-token'); h.state.mediaPath = 'camera-product.jpg'; h.state.uploadResponse = JSON.stringify({ success: true, data: {} })
  const cameraHome = h.loadPage('dashboard'); cameraHome.handleQuickPhoto()
  assert.equal(h.state.route, 'pages/product-edit/product-edit')
  assert.equal(h.storage.get('zhermai_pending_product_recognition_image'), 'camera-product.jpg')
  const cameraEditor = h.loadPage('product-edit'); cameraEditor.onLoad({})
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.storage.has('zhermai_pending_product_recognition_image'), false, 'camera handoff is consumed once')
  assert.equal(h.state.uploads, 2, 'camera handoff recognizes and uploads the product photo')
  h = harness(); const sellerLogin = h.loadPage('login')
  await sellerLogin.handleRegister()
  assert.equal(h.state.requests, 0, 'missing distribution choice blocks registration')
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
  h = harness(); const quickLogin = h.loadPage('login')
  h.state.response = { bound: true, token: 'quick-token', user_id: 1, email: null, role: 'seller', name: '商家 1234', store_name: null, avatar_url: null, business_license_url: null, country: 'CN', phone: '13800001234', uid: 'uid', supports_distribution: null }
  await quickLogin.handleWechatLogin({ detail: { code: 'phone-code' } })
  assert.equal(h.storage.get('quotepilot_token'), 'quick-token', 'first quick login directly creates and signs in to a seller account')
  assert.equal(h.state.route, 'pages/dashboard/dashboard')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  for (const name of ['login', 'profile']) {
    const regionPage = harness().loadPage(name)
    const before = JSON.stringify(regionPage.data)
    for (const value of [-1, 9999, NaN, 0.5]) {
      regionPage.handleRegionColumnChange({ detail: { column: 0, value } })
      regionPage.handleRegionColumnChange({ detail: { column: 1, value } })
      regionPage.handleRegionChange({ detail: { value: [value, value] } })
    }
    regionPage.handleRegionChange({ detail: { value: null } })
    assert.equal(JSON.stringify(regionPage.data), before, name + ': invalid region indices must not change selection')
  }
  const boundsEditor = harness().loadPage('product-edit')
  boundsEditor.setData({ images: ['first', 'last'] })
  for (const index of [-1, 9999, NaN, 0.5]) {
    boundsEditor.handleRemoveImage({ currentTarget: { dataset: { index } } })
    boundsEditor.handleCategoryChange({ detail: { value: index } })
  }
  assert.equal(boundsEditor.data.images.join(','), 'first,last', 'invalid image index must not delete another image')
  assert.equal(boundsEditor.data.category, 'other')
  h = harness(); const reviewLogin = h.loadPage('login')
  reviewLogin.setData({ identifier: 'wechat@test', password: 'password1' })
  await reviewLogin.handleAccountLogin()
  assert.equal(h.state.requests, 1, 'admin-created identifiers reach the login API')

  h = harness(); h.storage.set('quotepilot_token', 'test-token')
  const busyEditor = h.loadPage('product-edit')
  busyEditor.setData({ name: 'Product', images: ['existing'] })
  for (const flag of ['uploading', 'recognizing', 'saving']) {
    busyEditor.setData({ [flag]: true })
    await busyEditor.handleSave()
    busyEditor.handleChooseAiImage()
    busyEditor.handleChooseImage()
    busyEditor.handleRemoveImage({ currentTarget: { dataset: { index: 0 } } })
    assert.equal(busyEditor.data.images.length, 1, 'busy editor preserves images')
    busyEditor.setData({ [flag]: false })
  }
  assert.equal(h.state.requests + h.state.uploads + h.state.choices, 0, 'busy editor blocks conflicting operations')
  await busyEditor.handleSave()
  assert.equal(h.state.requests, 1, 'save resumes after processing finishes')

  h = harness(); h.storage.set('quotepilot_token', 'test-token')
  const replyPage = h.loadPage('inquiries')
  const replyEvent = id => ({ currentTarget: { dataset: { id } } })
  await Promise.all([replyPage.handleGenerateReply(replyEvent(1)), replyPage.handleGenerateReply(replyEvent(2)), replyPage.handleGenerateReply(replyEvent(1))])
  assert.equal(h.state.requests, 1, 'A/B/A clicks cannot duplicate an in-flight generation')
  await replyPage.handleGenerateReply(replyEvent(2))
  assert.equal(h.state.requests, 2, 'generation unlocks after completion')

  h = harness(); h.storage.set('quotepilot_token', 'test-token')
  const busyProfile = h.loadPage('profile')
  busyProfile.setData({ uploadingAvatar: true })
  await busyProfile.handleSave()
  assert.equal(h.state.requests, 0, 'profile waits for image upload')
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
