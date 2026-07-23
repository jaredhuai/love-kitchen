import { setKitchen } from '../../stores/kitchen.store';
import { setMemberships } from '../../stores/membership.store';
import { request } from '../../utils/request';

type Kitchen = { id: string; name: string; slogan?: string | null; defaultServings?: number };

Page({
  data: { name: '两个人的厨房', loading: false },
  onNameInput(event: WechatMiniprogram.Input) {
    this.setData({ name: event.detail.value });
  },
  async create() {
    const name = this.data.name.trim();
    if (!name) return void wx.showToast({ title: '请输入厨房名称', icon: 'none' });
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const kitchen = await request<Kitchen>('/kitchens', {
        method: 'POST',
        data: { name, slogan: '和你做饭的日子就是幸福的时刻', defaultServings: 2 },
      });
      setKitchen(kitchen);
      setMemberships([{ kitchenId: kitchen.id, role: 'OWNER' }]);
      wx.reLaunch({ url: '/pages/home/index' });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '创建厨房失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
