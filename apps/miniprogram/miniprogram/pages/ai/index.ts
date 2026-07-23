import { request } from '../../utils/request';
import { getKitchen } from '../../stores/kitchen.store';

type Recommendation = { name: string; reason: string; ingredients: string[] };
type RecommendationResult = { recommendations: Recommendation[] };

const quickRequests = [
  '30 分钟内，清淡一点',
  '今晚想吃下饭菜',
  '用家里现有的菜推荐',
];

Page({
  data: {
    requestText: '',
    servings: 2,
    quickRequests,
    recommendations: [] as Recommendation[],
    loading: false,
    error: '',
  },

  onInput(event: WechatMiniprogram.Input) {
    this.setData({ requestText: event.detail.value });
  },

  chooseQuickRequest(event: WechatMiniprogram.TouchEvent) {
    this.setData({ requestText: event.currentTarget.dataset.text as string });
  },

  changeServings(event: WechatMiniprogram.PickerChange) {
    this.setData({ servings: Number(event.detail.value) + 1 });
  },

  async ask() {
    const requestText = this.data.requestText.trim();
    if (!requestText) {
      wx.showToast({ title: '先告诉 AI 想吃什么', icon: 'none' });
      return;
    }
    const kitchen = getKitchen() as Record<string, string> | null;
    const kitchenId = kitchen?.kitchenId || kitchen?.id;
    if (!kitchenId) {
      wx.showToast({ title: '请先进入厨房', icon: 'none' });
      return;
    }

    this.setData({ loading: true, error: '', recommendations: [] });
    try {
      const result = await request<RecommendationResult>(
        `/kitchens/${kitchenId}/ai/recommendations`,
        {
          method: 'POST',
          idempotencyKey: `ai-recommend-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          data: { request: requestText, servings: this.data.servings },
          timeout: 25_000,
        },
      );
      this.setData({ recommendations: result.recommendations || [] });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : 'AI 暂时不可用' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
