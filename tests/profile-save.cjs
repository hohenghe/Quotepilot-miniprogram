const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/profile/profile.ts'), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function createPage({ fail = false, stackLength = 2 } = {}) {
  const calls = { updates: [], toasts: [], timers: [], back: 0, relaunch: [] }
  const context = {
    exports: {},
    Page: (definition) => { context.page = definition },
    require: (name) => {
      if (name === '../../utils/visitor') return { promptLogin: () => true }
      if (name === '../../utils/auth') return { getToken: () => 'token' }
      if (name === '../../services/seller') return {
        updateProfile: async (payload) => {
          calls.updates.push(payload)
          if (fail) throw new Error('保存失败')
        },
      }
      if (name === '../../config/china-cities') return {
        CHINA_PROVINCES: ['北京'], CHINA_REGIONS: { 北京: ['北京'] },
        regionValue: () => '北京',
      }
      throw new Error(`Unexpected import: ${name}`)
    },
    wx: {
      showToast: (options) => calls.toasts.push(options),
      navigateBack: () => { calls.back++ },
      reLaunch: (options) => calls.relaunch.push(options.url),
    },
    getCurrentPages: () => Array(stackLength).fill({}),
    setTimeout: (callback, delay) => { calls.timers.push({ callback, delay }) },
  }
  vm.runInNewContext(javascript, context, { filename: 'profile.js' })
  const page = context.page
  page.setData = (values) => Object.assign(page.data, values)
  Object.assign(page.data, { name: ' 公司 ', storeName: ' 店铺 ', country: '北京' })
  return { page, calls }
}

async function main() {
  const success = createPage()
  await success.page.handleSave()
  assert.equal(success.calls.updates.length, 1)
  assert.equal(success.calls.updates[0].store_name, '店铺')
  assert.equal(success.calls.toasts[0].title, '保存成功')
  assert.equal(success.calls.timers[0].delay, 500)
  assert.equal(success.calls.back, 0)
  success.calls.timers[0].callback()
  assert.equal(success.calls.back, 1)
  assert.deepEqual(success.calls.relaunch, [])

  const direct = createPage({ stackLength: 1 })
  await direct.page.handleSave()
  direct.calls.timers[0].callback()
  assert.equal(direct.calls.back, 0)
  assert.deepEqual(direct.calls.relaunch, ['/pages/dashboard/dashboard'])

  const failure = createPage({ fail: true })
  await failure.page.handleSave()
  assert.equal(failure.calls.toasts[0].title, '保存失败')
  assert.equal(failure.calls.timers.length, 0)
  assert.equal(failure.calls.back, 0)
  assert.equal(failure.page.data.saving, false)
  console.log('PASS: profile save exits only after success')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
