import { getKitchenId } from '../../stores/kitchen.store';
import { request } from '../../utils/request';
import { downloadFile } from '../../utils/transfer';

type Dish = { id: string; name: string; description?: string | null; coverImageUrl?: string | null };
type DishCard = Dish & { dishInitial: string; imageUrl: string };
type MealPlan = { id: string; mealDate: string; mealType: string; servings: number; dishId?: string | null };
type UpcomingMeal = { id: string; dishName: string; mealLabel: string; time: string };
type UpcomingDay = { date: string; label: string; items: UpcomingMeal[] };

const mealOptions = [
  { type: 'BREAKFAST', label: '早餐', time: '08:00' },
  { type: 'LUNCH', label: '午餐', time: '12:00' },
  { type: 'DINNER', label: '晚餐', time: '18:00' },
  { type: 'SNACK', label: '夜宵', time: '21:00' },
];

Page({
  data: {
    dishes: [] as DishCard[],
    upcomingDays: [] as UpcomingDay[],
    loading: false,
    adding: false,
    error: '',
    scheduling: false,
    selectedDishId: '',
    selectedDishName: '',
    selectedDate: '',
    minDate: '',
    tomorrowDate: '',
    maxDate: '',
    selectedMealType: 'DINNER',
    mealOptions,
  },
  onShow() { void this.load(); },
  async load() {
    const kitchenId = getKitchenId();
    if (!kitchenId) return;
    this.setData({ loading: true, error: '' });
    try {
      const [dishes, plans] = await Promise.all([
        request<Dish[]>(`/kitchens/${kitchenId}/dishes`),
        request<MealPlan[]>(`/kitchens/${kitchenId}/meal-plans`),
      ]);
      this.setData({
        dishes: await Promise.all(dishes.map(async (dish) => ({
          ...dish,
          dishInitial: dish.name.charAt(0),
          imageUrl: await resolveDishImage(kitchenId, dish.coverImageUrl),
        }))),
        upcomingDays: buildUpcomingDays(plans, dishes),
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '菜单加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  openDish(event: WechatMiniprogram.TouchEvent) {
    wx.navigateTo({ url: `/pages/dishes/detail?dishId=${event.currentTarget.dataset.id}` });
  },
  addToMeal(event: WechatMiniprogram.TouchEvent) {
    const dish = this.data.dishes.find((candidate) => candidate.id === event.currentTarget.dataset.id);
    if (!dish) return;
    const today = dateValue(new Date());
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const max = new Date(); max.setFullYear(max.getFullYear() + 1);
    this.setData({
      scheduling: true,
      selectedDishId: dish.id,
      selectedDishName: dish.name,
      selectedDate: today,
      minDate: today,
      tomorrowDate: dateValue(tomorrow),
      maxDate: dateValue(max),
      selectedMealType: 'DINNER',
    });
  },
  chooseToday() { this.setData({ selectedDate: dateValue(new Date()) }); },
  chooseTomorrow() { const date = new Date(); date.setDate(date.getDate() + 1); this.setData({ selectedDate: dateValue(date) }); },
  onDateChange(event: WechatMiniprogram.PickerChange) { this.setData({ selectedDate: String(event.detail.value) }); },
  chooseMeal(event: WechatMiniprogram.TouchEvent) { this.setData({ selectedMealType: String(event.currentTarget.dataset.type) }); },
  closeSchedule() { if (!this.data.adding) this.setData({ scheduling: false }); },
  stopPropagation() {},
  async confirmSchedule() {
    if (this.data.adding) return;
    const option = mealOptions.find((item) => item.type === this.data.selectedMealType) || mealOptions[2]!;
    this.setData({ adding: true });
    try {
      await request(`/kitchens/${getKitchenId()}/meal-plans`, {
        method: 'POST',
        data: { mealDate: `${this.data.selectedDate}T${option.time}:00`, mealType: option.type, servings: 2, dishId: this.data.selectedDishId },
      });
      wx.showToast({ title: `已安排${formatDateLabel(this.data.selectedDate)}${option.label}`, icon: 'success' });
      this.setData({ scheduling: false });
      await this.load();
    } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '安排失败', icon: 'none' }); }
    finally { this.setData({ adding: false }); }
  },
  async removeUpcoming(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    try {
      await request(`/kitchens/${getKitchenId()}/meal-plans/${id}`, { method: 'DELETE' });
      wx.showToast({ title: '已取消安排', icon: 'success' });
      await this.load();
    } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '取消失败', icon: 'none' }); }
  },
});

async function resolveDishImage(kitchenId: string, reference?: string | null) {
  if (!reference) return '';
  if (/^https?:\/\//i.test(reference)) return reference;
  try { return await downloadFile(`/kitchens/${kitchenId}/uploads/${encodeURIComponent(reference)}/thumbnail`).promise; }
  catch { return ''; }
}

function buildUpcomingDays(plans: MealPlan[], dishes: Dish[]): UpcomingDay[] {
  const today = dateValue(new Date());
  const dishById = new Map(dishes.map((dish) => [dish.id, dish.name]));
  const grouped = new Map<string, UpcomingMeal[]>();
  plans.filter((plan) => plan.mealDate.slice(0, 10) > today).forEach((plan) => {
    const date = plan.mealDate.slice(0, 10);
    const option = mealOptions.find((item) => item.type === plan.mealType);
    const item = { id: plan.id, dishName: plan.dishId ? dishById.get(plan.dishId) || '已安排菜品' : '已安排菜品', mealLabel: option?.label || plan.mealType, time: option?.time || '' };
    grouped.set(date, [...(grouped.get(date) || []), item]);
  });
  return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, label: formatDateLabel(date), items }));
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}
