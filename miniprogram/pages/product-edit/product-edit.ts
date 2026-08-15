import { getToken } from '../../utils/auth'
import { getSellerProduct, createSellerProduct, updateSellerProduct, deleteSellerProduct, uploadProductImage } from '../../services/seller'
import { ProductPayload } from '../../types/product'

const MAX_IMAGES = 10

const CATEGORIES = [
  'led_lighting', 'electronics', 'machinery', 'textiles',
  'furniture', 'packaging', 'auto_parts', 'hardware', 'other',
]

const CATEGORY_LABELS = CATEGORIES.map((c) => c.replace(/_/g, ' '))

function intOrNull(v: string): number | null {
  const s = v.trim()
  if (s === '') return null
  const n = parseInt(s, 10)
  return isNaN(n) ? null : n
}

function floatOrNull(v: string): number | null {
  const s = v.trim()
  if (s === '') return null
  const n = Number(s)
  return isNaN(n) ? null : n
}

Page({
  data: {
    id: null as number | null,
    loading: false,
    saving: false,
    uploading: false,
    name: '',
    sku: '',
    category: 'other',
    categories: CATEGORIES,
    categoryLabels: CATEGORY_LABELS,
    categoryIndex: CATEGORIES.length - 1,
    description: '',
    technicalSpecs: '',
    certifications: '',
    moq: '',
    unitPrice: '',
    priceLow: '',
    priceHigh: '',
    pricing: '',
    leadTime: '',
    images: [] as string[],
  },

  onLoad(options: Record<string, string | undefined>) {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }
    const id = options.id ? Number(options.id) : null
    this.setData({ id })
    wx.setNavigationBarTitle({ title: id ? '编辑商品' : '新增商品' })
    if (id) {
      this.loadProduct(id)
    }
  },

  async loadProduct(id: number) {
    this.setData({ loading: true })
    try {
      const p = await getSellerProduct(id)
      const idx = CATEGORIES.indexOf(p.category || 'other')
      this.setData({
        name: p.name || '',
        sku: p.sku || '',
        category: p.category || 'other',
        categoryIndex: idx >= 0 ? idx : CATEGORIES.length - 1,
        description: p.description || '',
        technicalSpecs: p.technical_specs || '',
        certifications: p.certifications || '',
        moq: p.moq != null ? String(p.moq) : '',
        unitPrice: p.unit_price != null ? String(p.unit_price) : '',
        priceLow: p.price_range_low != null ? String(p.price_range_low) : '',
        priceHigh: p.price_range_high != null ? String(p.price_range_high) : '',
        pricing: p.pricing || '',
        leadTime: p.lead_time_days != null ? String(p.lead_time_days) : '',
        images: p.images || [],
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
    }
  },

  handleInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string
    this.setData({ [field]: e.detail.value } as any)
  },

  handleCategoryChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value)
    this.setData({ categoryIndex: index, category: this.data.categories[index] })
  },

  handleChooseImage() {
    const remaining = MAX_IMAGES - this.data.images.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传 10 张图片', icon: 'none' })
      return
    }
    wx.chooseImage({
      count: remaining,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.uploadImages(res.tempFilePaths || [])
      },
    })
  },

  async uploadImages(paths: string[]) {
    if (this.data.uploading) return
    this.setData({ uploading: true })
    const images = this.data.images.slice()
    try {
      for (const p of paths) {
        const res = await uploadProductImage(p)
        images.push(res.url)
      }
      this.setData({ images })
    } catch (e) {
      this.setData({ images })
      wx.showToast({ title: (e as Error).message || '图片上传失败', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  handlePreviewImage(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const images = this.data.images
    if (images[index]) {
      wx.previewImage({ current: images[index], urls: images })
    }
  },

  handleRemoveImage(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const images = this.data.images.slice()
    images.splice(index, 1)
    this.setData({ images })
  },

  buildPayload(): ProductPayload {
    const d = this.data
    return {
      name: d.name.trim(),
      sku: d.sku.trim() || null,
      category: d.category,
      description: d.description.trim() || null,
      technical_specs: d.technicalSpecs.trim() || null,
      certifications: d.certifications.trim() || null,
      moq: intOrNull(d.moq),
      unit_price: floatOrNull(d.unitPrice),
      price_range_low: floatOrNull(d.priceLow),
      price_range_high: floatOrNull(d.priceHigh),
      pricing: d.pricing.trim() || null,
      lead_time_days: intOrNull(d.leadTime),
      images: d.images,
    }
  },

  async handleSave() {
    if (!this.data.name.trim()) {
      wx.showToast({ title: '请填写商品名称', icon: 'none' })
      return
    }
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      if (this.data.id) {
        await updateSellerProduct(this.data.id, this.buildPayload())
      } else {
        await createSellerProduct(this.buildPayload())
      }
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 500)
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  handleDelete() {
    const id = this.data.id
    if (!id) return
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
          setTimeout(() => {
            wx.navigateBack()
          }, 500)
        } catch (e) {
          wx.showToast({ title: (e as Error).message || '删除失败', icon: 'none' })
        }
      },
    })
  },
})
