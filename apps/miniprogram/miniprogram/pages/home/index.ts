import { request } from '../../utils/request';
import { downloadFile, uploadFile } from '../../utils/transfer';
import { getKitchen } from '../../stores/kitchen.store';

type Dish = { id: string; name: string; coverImageUrl?: string | null };
type MealItem = { id: string; dishId?: string; mealType: string; servings: number; name: string; imageUrl: string };
type MealSection = { type: string; label: string; items: MealItem[] };
type TimelineEvent = { id: string; eventType: string; eventDate: string; description?: string | null; createdByName?: string | null };

Page({
  data: { kitchen: {} as Record<string, string>, mealSections: [] as MealSection[], memoryText: '一起做饭的时光，比任何美食都珍贵。', memoryAuthor: '', memoryImage: '', loading: false },
  async onLoad() { await this.load(); },
  async onShow() { await this.load(); },
  async load() {
    const kitchen = getKitchen() as Record<string, string> | null;
    const kitchenId = kitchen?.kitchenId || kitchen?.id;
    if (!kitchenId) return;
    this.setData({ kitchen, loading: true });
    try {
      const [plans, dishes, timeline] = await Promise.all([
        request<Array<{ id: string; mealDate: string; mealType: string; servings: number; dishId?: string }>>(`/kitchens/${kitchenId}/meal-plans`),
        request<Dish[]>(`/kitchens/${kitchenId}/dishes`),
        request<TimelineEvent[]>(`/kitchens/${kitchenId}/timeline`),
      ]);
      const imageByDish = new Map(await Promise.all(dishes.map(async (dish) => [dish.id, await resolveDishImage(kitchenId, dish.coverImageUrl)] as const)));
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const sections: MealSection[] = [
        { type: 'BREAKFAST', label: '早餐', items: [] }, { type: 'LUNCH', label: '午餐', items: [] },
        { type: 'DINNER', label: '晚餐', items: [] }, { type: 'SNACK', label: '夜宵', items: [] },
      ];
      plans.filter((plan) => plan.mealDate.slice(0, 10) === today).forEach((plan) => {
        const section = sections.find((candidate) => candidate.type === plan.mealType);
        const dish = dishes.find((candidate) => candidate.id === plan.dishId);
        if (section) section.items.push({ id: plan.id, mealType: plan.mealType, servings: plan.servings, name: dish?.name || '已安排菜品', imageUrl: dish ? imageByDish.get(dish.id) || '' : '', ...(dish ? { dishId: dish.id } : {}) });
      });
      const memoryEvent = timeline.find((event) => event.eventType === 'HOME_MEMORY_TEXT' && dateValue(new Date(event.eventDate)) === today);
      const memoryImageEvent = timeline.find((event) => event.eventType === 'HOME_MEMORY_IMAGE' && dateValue(new Date(event.eventDate)) === today);
      const memoryFileId = memoryImageEvent?.description || '';
      const memoryImage = memoryFileId ? await resolveMemoryImage(kitchenId, memoryFileId) : '';
      this.setData({
        mealSections: sections,
        memoryImage,
        memoryText: memoryEvent?.description || '一起做饭的时光，比任何美食都珍贵。',
        memoryAuthor: memoryEvent?.createdByName || memoryImageEvent?.createdByName || '',
      });
    } finally { this.setData({ loading: false }); }
  },
  complete(event: WechatMiniprogram.TouchEvent) {
    const planId = event.currentTarget.dataset.id as string;
    const meal = this.data.mealSections.flatMap((section) => section.items).find((item) => item.id === planId);
    if (!meal) return;
    wx.showModal({ title: '完成这一餐', content: '确认这个餐次已完成吗？完成后可以给菜品评分。', success: async ({ confirm }) => {
      if (!confirm) return;
      const kitchen = getKitchen() as Record<string, string>;
      const kitchenId = kitchen.kitchenId || kitchen.id;
      try {
        await request(`/v2/kitchens/${kitchenId}/meal-history`, { method: 'POST', idempotencyKey: `complete-meal-${planId}`, data: { eatenAt: new Date().toISOString(), mealType: meal.mealType, mealPlanId: planId, dishId: meal.dishId, servings: meal.servings } });
        await request(`/kitchens/${kitchenId}/meal-plans/${planId}`, { method: 'DELETE' });
        wx.showToast({ title: '这一餐已完成', icon: 'success' });
        await this.load();
      } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' }); }
    } });
  },
  cancel(event: WechatMiniprogram.TouchEvent) { this.confirmRemoval(event.currentTarget.dataset.id as string, '取消餐次', '确认取消这个餐次吗？', '餐次已取消'); },
  confirmRemoval(planId: string, title: string, content: string, successTitle: string) {
    wx.showModal({ title, content, success: async ({ confirm }) => {
      if (!confirm) return;
      const kitchen = getKitchen() as Record<string, string>;
      const kitchenId = kitchen.kitchenId || kitchen.id;
      if (!kitchenId) { wx.showToast({ title: '请先进入厨房', icon: 'none' }); return; }
      const meal = this.data.mealSections.flatMap((section) => section.items).find((item) => item.id === planId);
      try {
        await request(`/kitchens/${kitchenId}/meal-plans/${planId}`, { method: 'DELETE' });
        if (meal && title === '取消餐次') {
          await request(`/v2/kitchens/${kitchenId}/timeline`, {
            method: 'POST',
            idempotencyKey: `cancel-meal-${planId}`,
            data: { title: `取消了${meal.name}`, eventType: 'MEAL_CANCELLED', eventDate: new Date().toISOString(), description: JSON.stringify({ dishId: meal.dishId || null, dishName: meal.name, mealType: meal.mealType }) },
          });
        }
        wx.showToast({ title: successTitle, icon: 'success' });
        await this.load();
      } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' }); }
    } });
  },
  openDish(event: WechatMiniprogram.TouchEvent) { const dishId = event.currentTarget.dataset.id; if (dishId) wx.navigateTo({ url: `/pages/dishes/detail?dishId=${dishId}` }); },
  editMemory() {
    wx.showModal({
      title: '编辑温暖记录',
      editable: true,
      content: this.data.memoryText,
      success: async (result) => {
        const content = result.content?.trim() || '';
        if (!result.confirm || !content) return;
        const kitchen = getKitchen() as Record<string, string>;
        const kitchenId = kitchen.kitchenId || kitchen.id;
        if (!kitchenId) return;
        wx.showLoading({ title: '正在同步', mask: true });
        try {
          await request(`/v2/kitchens/${kitchenId}/timeline`, {
            method: 'POST',
            idempotencyKey: `home-memory-text-${Date.now()}`,
            data: { title: '更新了今日温暖记录', eventType: 'HOME_MEMORY_TEXT', eventDate: new Date().toISOString(), description: content },
          });
          await this.load();
          wx.showToast({ title: '已同步给对方', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error instanceof Error ? error.message : '同步失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
  chooseMemoryImage() {
    wx.chooseMedia({ count: 1, mediaType: ['image'], success: async (result) => {
      const file = result.tempFiles?.[0];
      if (!file) return;
      const kitchen = getKitchen() as Record<string, string>;
      const kitchenId = kitchen.kitchenId || kitchen.id;
      if (!kitchenId) return;
      wx.showLoading({ title: '正在保存' });
      try {
        const uploaded = await uploadFile<{ id: string }>(`/kitchens/${kitchenId}/uploads`, file.tempFilePath).promise;
        await request(`/v2/kitchens/${kitchenId}/timeline`, {
          method: 'POST',
          idempotencyKey: `home-memory-${uploaded.id}`,
          data: { title: '更新了首页温馨图片', eventType: 'HOME_MEMORY_IMAGE', eventDate: new Date().toISOString(), description: uploaded.id },
        });
        this.setData({ memoryImage: file.tempFilePath });
        wx.showToast({ title: '图片已保存到线上', icon: 'success' });
      } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '图片保存失败', icon: 'none' }); }
      finally { wx.hideLoading(); }
    } });
  },
});

async function resolveDishImage(kitchenId: string, reference?: string | null) {
  if (!reference) return '';
  if (/^https?:\/\//i.test(reference)) return reference;
  try { return await downloadFile(`/kitchens/${kitchenId}/uploads/${encodeURIComponent(reference)}/thumbnail`).promise; }
  catch { return ''; }
}

async function resolveMemoryImage(kitchenId: string, fileId: string) {
  try { return await downloadFile(`/kitchens/${kitchenId}/uploads/${encodeURIComponent(fileId)}/thumbnail`).promise; }
  catch { return ''; }
}
