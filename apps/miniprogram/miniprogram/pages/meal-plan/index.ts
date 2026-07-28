import { getKitchenId } from '../../stores/kitchen.store';
import { request } from '../../utils/request';
import { downloadFile } from '../../utils/transfer';

type Dish = { id: string; name: string; description?: string | null; category?: string | null; kind?: 'PERMANENT' | 'TEMPORARY'; coverImageUrl?: string | null };
type DishCard = Dish & { dishInitial: string; imageUrl: string };
type CategoryCard = { code: string; name: string; icon: string; count: number };
type MealPlan = { id: string; mealDate: string; mealType: string; servings: number; dishId?: string | null };
type UpcomingMeal = { id: string; dishName: string; mealLabel: string; time: string };
type UpcomingDay = { date: string; label: string; items: UpcomingMeal[] };

const mealOptions = [
  { type: 'BREAKFAST', label: '早餐', time: '08:00' },
  { type: 'LUNCH', label: '午餐', time: '12:00' },
  { type: 'DINNER', label: '晚餐', time: '18:00' },
  { type: 'SNACK', label: '夜宵', time: '21:00' },
];
const categoryDefinitions = [
  { code: 'MEAT', name: '荤菜', icon: '/assets/category-icons/meat.png' },
  { code: 'VEGETABLE', name: '素菜', icon: '/assets/category-icons/vegetable.png' },
  { code: 'SOUP_PORRIDGE', name: '汤羹粥', icon: '/assets/category-icons/soup.png' },
  { code: 'DESSERT_SNACK', name: '甜品零食', icon: '/assets/category-icons/dessert.png' },
  { code: 'WESTERN', name: '西餐', icon: '/assets/category-icons/western.png' },
  { code: 'SEAFOOD', name: '海鲜', icon: '/assets/category-icons/seafood.png' },
  { code: 'DRINK', name: '饮品', icon: '/assets/category-icons/drink.png' },
  { code: 'STAPLE', name: '主食', icon: '/assets/category-icons/staple.png' },
  { code: 'OTHER', name: '其他', icon: '/assets/category-icons/other.png' },
] as const;

Page({
  data: {
    dishes: [] as DishCard[],
    visibleDishes: [] as DishCard[],
    categories: categoryDefinitions.map((category) => ({ ...category, count: 0 })) as CategoryCard[],
    activeCategory: '',
    activeCategoryLabel: '',
    searchQuery: '',
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
      const permanentDishes = dishes.filter((dish) => dish.kind !== 'TEMPORARY');
      const cards = await Promise.all(permanentDishes.map(async (dish) => ({
          ...dish,
          dishInitial: dish.name.charAt(0),
          imageUrl: await resolveDishImage(kitchenId, dish.coverImageUrl),
        })));
      this.setData({
        dishes: cards,
        visibleDishes: filterMenuDishes(cards, this.data.activeCategory, this.data.searchQuery),
        categories: categoryDefinitions.map((category) => ({
          ...category,
          count: cards.filter((dish) => normalizedCategory(dish.category) === category.code).length,
        })),
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
  chooseCategory(event: WechatMiniprogram.TouchEvent) {
    const activeCategory = String(event.currentTarget.dataset.category || '');
    const activeCategoryLabel = categoryDefinitions.find((category) => category.code === activeCategory)?.name || '其他';
    this.setData({
      activeCategory,
      activeCategoryLabel,
      visibleDishes: filterMenuDishes(this.data.dishes, activeCategory, this.data.searchQuery),
    });
  },
  clearCategory() {
    this.setData({ activeCategory: '', activeCategoryLabel: '', visibleDishes: filterMenuDishes(this.data.dishes, '', this.data.searchQuery) });
  },
  onSearchInput(event: WechatMiniprogram.Input) {
    const searchQuery = event.detail.value.trim();
    this.setData({
      searchQuery,
      visibleDishes: filterMenuDishes(this.data.dishes, this.data.activeCategory, searchQuery),
    });
  },
  clearSearch() {
    this.setData({ searchQuery: '', visibleDishes: filterMenuDishes(this.data.dishes, this.data.activeCategory, '') });
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

function normalizedCategory(value?: string | null) {
  if (categoryDefinitions.some((category) => category.code === value)) return value!;
  return 'OTHER';
}

function filterMenuDishes(dishes: DishCard[], category: string, query: string) {
  const keyword = query.trim().toLocaleLowerCase();
  return dishes.filter((dish) => {
    if (keyword) return dish.name.toLocaleLowerCase().includes(keyword);
    return category ? normalizedCategory(dish.category) === category : false;
  });
}
