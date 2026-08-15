import { getToken } from '../../utils/auth'
import {
  getSellerProducts,
  deleteSellerProduct,
  deleteSellerProducts,
  uploadProductFile,
} from '../../services/seller'
import { SellerProduct, DocumentUploadResult } from '../../types/product'

const PAGE_SIZE = 20

interface ProductDisplayItem {
  id: number
  name: string
  sku: string
  category: string
  description: string
  priceText: string
  coverImage: string
  moqText: string
  active: boolean
  selected: boolean
}

function formatPrice(p: SellerProduct): string {
  if (p.unit_price != null) return `$${p.unit_price}`
  if (p.price_range_low != null || p.price_range_high != null) {
    const low = p.price_range_low != null ? `$${p.price_range_low}` : '?'
    const high = p.price_range_high != null ? `$${p.price_range_high}` : '?'
    return `${low} - ${high}`
  }
  return ''
}

function toDisplay(p: SellerProduct): ProductDisplayItem {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku || '',
    category: (p.category || '').replace(/_/g, ' '),
    description: p.description || '',
    priceText: formatPrice(p),
    coverImage: p.image_url || (p.images && p.images.length > 0 ? p.images[0] : ''),
    moqText: p.moq != null ? `MOQ ${p.moq}` : '',
    active: p.is_active !== false,
    selected: false,
  }
}

Page({
  data: {
    products: [] as ProductDisplayItem[],
    total: 0,
    page: 1,
    hasNext: false,
    loading: false,
    loadingMore: false,
    error: '',
    keyword: '',
    selecting: false,
    selectedCount: 0,
    allSelected: false,
    deleting: false,
    importing: false,
    loaded: false,
  },

  onShow() {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }
    if (this.data.loaded) {
      this.refreshCurrentPage()
    } else {
      this.setData({ loaded: true })
      this.loadProducts(true)
    }
  },

  async loadProducts(reset: boolean) {
    if (this.data.loading || this.data.loadingMore) return
    if (reset) {
      this.setData({ loading: true, error: '', page: 1 })
    } else {
      this.setData({ loadingMore: true })
    }
    const page = reset ? 1 : this.data.page + 1
    const keyword = this.data.keyword.trim()
    try {
      const res = await getSellerProducts(page, PAGE_SIZE, keyword || undefined)
      const newItems = res.items.map(toDisplay)
      const items = reset ? newItems : this.data.products.concat(newItems)
      this.setData({
        products: items,
        total: res.total,
        page,
        hasNext: items.length < res.total,
        loading: false,
        loadingMore: false,
      })
    } catch (e) {
      this.setData({
        error: (e as Error).message || '加载失败',
        loading: false,
        loadingMore: false,
      })
    }
  },

  onReachBottom() {
    if (this.data.hasNext && !this.data.loading && !this.data.loadingMore) {
      this.loadProducts(false)
    }
  },

  async refreshCurrentPage() {
    if (this.data.loading || this.data.loadingMore) return
    const page = this.data.page
    const keyword = this.data.keyword.trim()
    this.setData({ loading: true, error: '' })
    try {
      const res = await getSellerProducts(page, PAGE_SIZE, keyword || undefined)
      const newItems = res.items.map(toDisplay)
      const start = (page - 1) * PAGE_SIZE
      const items = this.data.products.slice(0, start).concat(newItems)
      this.setData({
        products: items,
        total: res.total,
        hasNext: start + newItems.length < res.total,
        loading: false,
      })
    } catch (e) {
      this.setData({ error: (e as Error).message || '加载失败', loading: false })
    }
  },

  async onPullDownRefresh() {
    await this.loadProducts(true)
    wx.stopPullDownRefresh()
  },

  handleSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value })
  },

  handleSearch() {
    this.loadProducts(true)
  },

  handleClearSearch() {
    this.setData({ keyword: '' })
    this.loadProducts(true)
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/product-edit/product-edit' })
  },

  handleCardTap(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    if (this.data.selecting) {
      this.toggleSelectById(id)
    } else {
      this.navigateToEdit(id)
    }
  },

  navigateToEdit(id: number) {
    wx.navigateTo({ url: `/pages/product-edit/product-edit?id=${id}` })
  },

  goEdit(e: WechatMiniprogram.TouchEvent) {
    this.navigateToEdit(Number(e.currentTarget.dataset.id))
  },

  handleDelete(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    wx.showModal({
      title: '删除商品',
      content: '确定删除该商品吗？此操作不可撤销。',
      confirmText: '删除',
      confirmColor: '#dc2626',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await deleteSellerProduct(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadProducts(true)
        } catch (err) {
          wx.showToast({ title: (err as Error).message || '删除失败', icon: 'none' })
        }
      },
    })
  },

  toggleSelectMode() {
    const selecting = !this.data.selecting
    const products = this.data.products.map((p) => ({ ...p, selected: false }))
    this.setData({ selecting, products, selectedCount: 0, allSelected: false })
  },

  toggleSelectById(id: number) {
    const products = this.data.products.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    const selectedCount = products.filter((p) => p.selected).length
    this.setData({
      products,
      selectedCount,
      allSelected: products.length > 0 && selectedCount === products.length,
    })
  },

  selectAll() {
    const allSelected = !this.data.allSelected
    const products = this.data.products.map((p) => ({ ...p, selected: allSelected }))
    this.setData({ products, allSelected, selectedCount: allSelected ? products.length : 0 })
  },

  handleBatchDelete() {
    const ids = this.data.products.filter((p) => p.selected).map((p) => p.id)
    if (ids.length === 0) return
    wx.showModal({
      title: '批量删除',
      content: `确定删除选中的 ${ids.length} 件商品吗？此操作不可撤销。`,
      confirmText: '删除',
      confirmColor: '#dc2626',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ deleting: true })
        try {
          const r = await deleteSellerProducts(ids)
          this.setData({ selecting: false, selectedCount: 0, allSelected: false })
          wx.showToast({ title: `已删除 ${r.deleted_count} 件`, icon: 'success' })
          this.loadProducts(true)
        } catch (err) {
          wx.showToast({ title: (err as Error).message || '删除失败', icon: 'none' })
        } finally {
          this.setData({ deleting: false })
        }
      },
    })
  },

  handleImportFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'xlsx', 'docx', 'csv'],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        this.setData({ importing: true })
        wx.showLoading({ title: '上传中…', mask: true })
        try {
          const doc = await uploadProductFile(file.path)
          wx.hideLoading()
          this.showImportResult(doc)
          this.loadProducts(true)
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: (err as Error).message || '上传失败', icon: 'none' })
        } finally {
          this.setData({ importing: false })
        }
      },
    })
  },

  showImportResult(doc: DocumentUploadResult) {
    let content = ''
    if (doc.status === 'completed') {
      content = `成功导入 ${doc.products_count} 件商品`
    } else if (doc.status === 'failed') {
      content = `导入失败：${doc.error_message || '未知错误'}`
    } else {
      content = '文件已上传，正在后台处理中'
    }
    wx.showModal({ title: '导入结果', content, showCancel: false, confirmText: '知道了' })
  },
})
