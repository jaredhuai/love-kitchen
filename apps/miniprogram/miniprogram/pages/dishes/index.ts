import { getKitchenId } from '../../stores/kitchen.store';
import { getUser } from '../../stores/user.store';
import { request } from '../../utils/request';
import { downloadFile } from '../../utils/transfer';

type Review = { id?: string; userId: string; tasteRating: number; content?: string | null; createdAt?: string; updatedAt?: string };
type Dish = { id: string; name: string; description?: string | null; coverImageUrl?: string | null; reviews?: Review[] };
type MealLog = { id: string; dishId?: string | null; eatenAt: string; mealType: string };
type CompletedCard = { logId: string; dishId: string; name: string; description: string; imageUrl: string; mealLabel: string; rating: number; reviewText: string; stars: Array<{ value: number; active: boolean }> };
type HistoryReview = { id: string; dishId: string; dishName: string; imageUrl: string; reviewerLabel: string; rating: number; content: string; displayDate: string; stars: Array<{ value: number; active: boolean }> };
const mealLabels: Record<string, string> = { BREAKFAST: '早餐', LUNCH: '午餐', DINNER: '晚餐', SNACK: '夜宵' };

Page({
  data: { completed: [] as CompletedCard[], historyReviews: [] as HistoryReview[], showHistory: false, loading: false, ratingDishId: '', error: '' },
  async onLoad() { await this.load(); },
  async onShow() { await this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
  async load() {
    const kitchenId = getKitchenId(); if (!kitchenId) return;
    this.setData({ loading: true, error: '' });
    try {
      const [history, dishes] = await Promise.all([request<MealLog[]>(`/kitchens/${kitchenId}/meal-history`), request<Dish[]>(`/kitchens/${kitchenId}/dishes`)]);
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const userId = getUser()?.id;
      const todaysLogs = history.filter((log) => log.dishId && localDate(log.eatenAt) === today);
      const imageByDish = new Map(await Promise.all([...new Set(todaysLogs.map((log) => log.dishId!))].map(async (dishId) => {
        const dish = dishes.find((candidate) => candidate.id === dishId);
        return [dishId, await resolveDishImage(kitchenId, dish?.coverImageUrl)] as const;
      })));
      const reviewedDishes = dishes.filter((dish) => dish.reviews?.length);
      const historyImageByDish = new Map(await Promise.all(reviewedDishes.map(async (dish) => [dish.id, await resolveDishImage(kitchenId, dish.coverImageUrl)] as const)));
      const historyReviews = reviewedDishes.flatMap((dish) => (dish.reviews || []).map((review, index) => {
        const dateValue = review.updatedAt || review.createdAt || '';
        const date = dateValue ? new Date(dateValue) : null;
        return {
          id: review.id || `${dish.id}-${review.userId}-${index}`,
          dishId: dish.id,
          dishName: dish.name,
          imageUrl: historyImageByDish.get(dish.id) || '',
          reviewerLabel: review.userId === userId ? '我的评价' : '另一半的评价',
          rating: review.tasteRating,
          content: review.content || '没有留下文字评价',
          displayDate: date && !Number.isNaN(date.getTime()) ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日` : '',
          sortTime: date?.getTime() || 0,
          stars: [1, 2, 3, 4, 5].map((value) => ({ value, active: value <= review.tasteRating })),
        };
      })).sort((left, right) => right.sortTime - left.sortTime).map(({ sortTime: _sortTime, ...review }) => review);
      this.setData({ historyReviews, completed: todaysLogs.map((log) => {
        const dish = dishes.find((candidate) => candidate.id === log.dishId);
        const review = dish?.reviews?.find((candidate) => candidate.userId === userId);
        const rating = review?.tasteRating || 0;
        return { logId: log.id, dishId: log.dishId!, name: dish?.name || '已完成菜品', description: dish?.description || '今天完成的美味', imageUrl: imageByDish.get(log.dishId!) || '', mealLabel: mealLabels[log.mealType] || log.mealType, rating, reviewText: review?.content || '', stars: [1, 2, 3, 4, 5].map((value) => ({ value, active: value <= rating })) };
      }) });
    } catch (error) { this.setData({ error: error instanceof Error ? error.message : '评价列表加载失败' }); }
    finally { this.setData({ loading: false }); }
  },
  toggleHistory() { this.setData({ showHistory: !this.data.showHistory }); },
  openDish(event: WechatMiniprogram.TouchEvent) { wx.navigateTo({ url: `/pages/dishes/detail?dishId=${event.currentTarget.dataset.id}` }); },
  async rate(event: WechatMiniprogram.TouchEvent) {
    const dishId = event.currentTarget.dataset.dishId as string;
    const rating = Number(event.currentTarget.dataset.rating);
    if (!dishId || rating < 1 || rating > 5 || this.data.ratingDishId) return;
    const current = this.data.completed.find((item) => item.dishId === dishId)?.reviewText || '';
    wx.showModal({
      title: `给 ${rating} 星评价`,
      editable: true,
      placeholderText: '写一句今天的味道，例如：火候刚好，下次还想吃',
      content: current,
      success: async ({ confirm, content }) => {
        if (!confirm) return;
        this.setData({ ratingDishId: dishId });
        try {
          await request(`/kitchens/${getKitchenId()}/dishes/${dishId}/reviews`, { method: 'POST', data: { tasteRating: rating, appearanceRating: rating, careRating: rating, content: (content || '').trim(), eatAgain: rating >= 3 } });
          wx.showToast({ title: `已评 ${rating} 星`, icon: 'success' });
          await this.load();
        } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '评分失败', icon: 'none' }); }
        finally { this.setData({ ratingDishId: '' }); }
      },
    });
  },
});

function localDate(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function resolveDishImage(kitchenId: string, reference?: string | null) {
  if (!reference) return '';
  if (/^https?:\/\//i.test(reference)) return reference;
  try { return await downloadFile(`/kitchens/${kitchenId}/uploads/${encodeURIComponent(reference)}/thumbnail`).promise; }
  catch { return ''; }
}
