import { request } from '../../utils/request';
import { uploadFile } from '../../utils/transfer';
import { getKitchenId } from '../../stores/kitchen.store';

Page({
  data: { dishId: '', name: '', description: '', servings: 2, coverImageUrl: '', saving: false, uploadProgress: 0 },
  async onLoad(options: Record<string, string>) { const dishId = options.dishId ?? ''; this.setData({ dishId }); if (!dishId) return; const id = getKitchenId(); if (!id) return; try { const dish = await request<{ name: string; description?: string; servings?: number; coverImageUrl?: string }>(`/kitchens/${id}/dishes/${dishId}`); this.setData({ name: dish.name, description: dish.description || '', servings: dish.servings || 2, coverImageUrl: dish.coverImageUrl || '' }); } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '菜品加载失败', icon: 'none' }); } },
  onName(e: WechatMiniprogram.Input) { this.setData({ name: e.detail.value }); },
  onDescription(e: WechatMiniprogram.Input) { this.setData({ description: e.detail.value }); },
  async save() {
    const id = getKitchenId();
    if (!id) return wx.showToast({ title: '未找到厨房，请重新登录', icon: 'none' });
    if (!this.data.name.trim()) return wx.showToast({ title: '请填写菜名', icon: 'none' });
    this.setData({ saving: true });
    try {
      const path = this.data.dishId ? `/kitchens/${id}/dishes/${this.data.dishId}` : `/kitchens/${id}/dishes`;
      await request(path, { method: this.data.dishId ? 'PATCH' : 'POST', data: { name: this.data.name.trim(), description: this.data.description.trim(), servings: this.data.servings, coverImageUrl: this.data.coverImageUrl || undefined } });
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (e) { wx.showToast({ title: e instanceof Error ? e.message : '保存失败', icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  },
  chooseImage() {
    wx.chooseMedia({ count: 1, mediaType: ['image'], success: (res) => {
      const file = res.tempFiles?.[0]; if (!file) return;
      const id = getKitchenId(); if (!id) return;
      const transfer = uploadFile<{ id: string }>(`/kitchens/${id}/uploads`, file.tempFilePath);
      transfer.onProgress((uploadProgress) => this.setData({ uploadProgress }));
      transfer.promise.then((result) => { this.setData({ coverImageUrl: result.id }); wx.showToast({ title: '图片已上传' }); }).catch((error: unknown) => wx.showToast({ title: error instanceof Error ? error.message : '图片上传失败', icon: 'none' }));
    } });
  }
});
