import { clearAllStores } from '../../stores/store-registry';
import { request } from '../../utils/request';
import { getRefreshToken } from '../../utils/session';

type Deletion = { job: { id: string; status: string; scheduledFor: string } };
Page({
  data: { loading: false, deletion: null as Deletion['job'] | null },
  onLoad() { this.setData({ deletion: wx.getStorageSync('pendingDeletion') || null }); },
  privacy() { wx.navigateTo({ url: '/pages/legal/privacy' }); },
  terms() { wx.navigateTo({ url: '/pages/legal/terms' }); },
  async exportData() {
    this.setData({ loading: true });
    try { await request('/account/exports', { method: 'POST', idempotencyKey: `export-${Date.now()}` }); wx.showToast({ title: '数据导出已生成', icon: 'success' }); }
    catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '导出失败', icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  },
  requestDeletion() {
    wx.showModal({ title: '申请注销账号', content: '提交后进入冷静期，期间可以取消。注销会退出所有设备。', confirmText: '确认申请', confirmColor: '#c44747', success: async (answer) => {
      if (!answer.confirm) return;
      this.setData({ loading: true });
      try { const result = await request<Deletion>('/account/deletion', { method: 'POST', idempotencyKey: `delete-${Date.now()}` }); this.setData({ deletion: result.job }); wx.setStorageSync('pendingDeletion', result.job); clearAllStores(); wx.showModal({ title: '已进入注销冷静期', content: `计划执行时间：${new Date(result.job.scheduledFor).toLocaleString()}。再次登录后可在此取消。`, showCancel: false, success: () => wx.reLaunch({ url: '/pages/auth/login' }) }); }
      catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '申请失败', icon: 'none' }); }
      finally { this.setData({ loading: false }); }
    } });
  },
  async cancelDeletion() {
    if (!this.data.deletion) return;
    await request(`/account/deletion/${this.data.deletion.id}/cancel`, { method: 'POST' });
    wx.removeStorageSync('pendingDeletion'); this.setData({ deletion: null }); wx.showToast({ title: '已取消注销', icon: 'success' });
  },
  logout() {
    wx.showModal({ title: '退出登录', content: '将清除本机上的当前账号数据。', success: async (answer) => {
      if (!answer.confirm) return;
      const refreshToken = getRefreshToken();
      try { if (refreshToken) await request('/auth/logout', { method: 'POST', data: { refreshToken } }); } finally { clearAllStores(); wx.reLaunch({ url: '/pages/auth/login' }); }
    } });
  },
});
