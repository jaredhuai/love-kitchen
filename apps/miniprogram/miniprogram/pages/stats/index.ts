import { getKitchenId } from '../../stores/kitchen.store';
import { request } from '../../utils/request';

type Review = { tasteRating: number };
type Dish = { id: string; name: string; reviews?: Review[] };
type MealLog = { id: string; dishId?: string | null; eatenAt: string; mealType: string; servings?: number };
type TimelineEvent = { id: string; eventType: string; eventDate: string; title: string; description?: string | null };
type CancelledEvent = { id: string; happenedAt: string; dishId?: string; dishName: string; mealType: string };
type StatEvent = { id: string; happenedAt: string; time: string; dishName: string; mealLabel: string; status: '完成' | '取消'; cancelled: boolean };
type StatDay = { date: string; label: string; completed: number; cancelled: number; expanded: boolean; events: StatEvent[] };
type TopDish = { name: string; count: number };

const mealLabels: Record<string, string> = { BREAKFAST: '早餐', LUNCH: '午餐', DINNER: '晚餐', SNACK: '夜宵' };

Page({
  data: {
    loading: false,
    error: '',
    todayCompleted: 0,
    todayCancelled: 0,
    weekCompleted: 0,
    weekCancelled: 0,
    averageRating: '暂无',
    favoriteMeal: '暂无',
    days: [] as StatDay[],
    topDishes: [] as TopDish[],
  },
  async onLoad() { await this.load(); },
  async onShow() { await this.load(); },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh(); },
  async load() {
    const kitchenId = getKitchenId();
    if (!kitchenId) return;
    this.setData({ loading: true, error: '' });
    try {
      const [history, dishes, timeline] = await Promise.all([
        request<MealLog[]>(`/kitchens/${kitchenId}/meal-history`),
        request<Dish[]>(`/kitchens/${kitchenId}/dishes`),
        request<TimelineEvent[]>(`/kitchens/${kitchenId}/timeline`),
      ]);
      const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
      const dates = recentDates(7);
      const dateSet = new Set(dates);
      const allCancelledEvents = timeline.filter((event) => event.eventType === 'MEAL_CANCELLED').map(toCancelledEvent);
      const cancelledEvents = allCancelledEvents.filter((event) => dateSet.has(localDate(event.happenedAt)));
      const completedLogs = history.filter((log) => dateSet.has(localDate(log.eatenAt)));
      const dayRows = buildDayRows(history, allCancelledEvents, dishById);
      const mealCounts = countBy(completedLogs.map((log) => mealLabels[log.mealType] || log.mealType));
      const topDishes = Array.from(countBy(completedLogs.map((log) => log.dishId ? dishById.get(log.dishId)?.name || '已完成菜品' : '已完成菜品')).entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
      const ratings = dishes.flatMap((dish) => dish.reviews || []).map((review) => review.tasteRating).filter((rating) => rating > 0);
      this.setData({
        todayCompleted: completedLogs.filter((log) => localDate(log.eatenAt) === dates[0]).length,
        todayCancelled: cancelledEvents.filter((event) => localDate(event.happenedAt) === dates[0]).length,
        weekCompleted: completedLogs.length,
        weekCancelled: cancelledEvents.length,
        averageRating: ratings.length ? `${(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)} 星` : '暂无',
        favoriteMeal: topEntry(mealCounts) || '暂无',
        days: dayRows,
        topDishes,
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '统计加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  toggleDay(event: WechatMiniprogram.TouchEvent) {
    const date = String(event.currentTarget.dataset.date || '');
    this.setData({ days: this.data.days.map((day) => day.date === date ? { ...day, expanded: !day.expanded } : day) });
  },
});

function recentDates(count: number) {
  const result: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    result.push(localDate(date.toISOString()));
  }
  return result;
}

function toCancelledEvent(event: TimelineEvent): CancelledEvent {
  try {
    const parsed = JSON.parse(event.description || '{}') as { dishId?: string | null; dishName?: string; mealType?: string };
    return { id: event.id, happenedAt: event.eventDate, dishName: parsed.dishName || event.title.replace(/^取消了/, ''), mealType: parsed.mealType || '', ...(parsed.dishId ? { dishId: parsed.dishId } : {}) };
  } catch {
    return { id: event.id, happenedAt: event.eventDate, dishName: event.title.replace(/^取消了/, ''), mealType: '' };
  }
}

function localDate(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function buildDayRows(history: MealLog[], cancelled: CancelledEvent[], dishById: Map<string, Dish>): StatDay[] {
  const completedEvents: StatEvent[] = history.map((log) => ({
    id: `completed-${log.id}`,
    happenedAt: log.eatenAt,
    time: formatTime(log.eatenAt),
    dishName: log.dishId ? dishById.get(log.dishId)?.name || '已完成菜品' : '已完成菜品',
    mealLabel: mealLabels[log.mealType] || log.mealType || '餐次',
    status: '完成',
    cancelled: false,
  }));
  const cancelledRows: StatEvent[] = cancelled.map((event) => ({
    id: `cancelled-${event.id}`,
    happenedAt: event.happenedAt,
    time: formatTime(event.happenedAt),
    dishName: event.dishName,
    mealLabel: mealLabels[event.mealType] || event.mealType || '餐次',
    status: '取消',
    cancelled: true,
  }));
  const grouped = new Map<string, StatEvent[]>();
  [...completedEvents, ...cancelledRows].forEach((event) => {
    const date = localDate(event.happenedAt);
    grouped.set(date, [...(grouped.get(date) || []), event]);
  });
  return Array.from(grouped.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, events], index) => {
      const sorted = events.sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime());
      return {
        date,
        label: formatDateLabel(date),
        completed: sorted.filter((event) => !event.cancelled).length,
        cancelled: sorted.filter((event) => event.cancelled).length,
        expanded: index === 0,
        events: sorted,
      };
    });
}

function formatTime(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function countBy(values: string[]) {
  return values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map<string, number>());
}

function topEntry(map: Map<string, number>) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
