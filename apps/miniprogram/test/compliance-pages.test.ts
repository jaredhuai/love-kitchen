import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../miniprogram/${path}`, import.meta.url), 'utf8');

describe('compliance and core page smoke', () => {
  it('uses handwritten accents without changing form and button typography', () => {
    const globalStyle = read('app.wxss');
    expect(globalStyle).toContain('"Kaiti SC", "STKaiti", "KaiTi"');
    expect(globalStyle).toContain('.memory-note');
    expect(globalStyle).not.toMatch(/button[^}]*font-family/);
    expect(globalStyle).not.toMatch(/input[^}]*font-family/);
  });
  it('uses wx.login and privacy authorization while hiding dev login by environment', () => {
    const login = read('pages/auth/login.ts');
    expect(login).toContain('wx.login()'); expect(login).toContain('requirePrivacyAuthorize'); expect(login).toContain("ENV.environment === 'development'");
  });
  it('ships reachable privacy, terms, export, logout and deletion actions', () => {
    const app = read('app.json'); const account = read('pages/account/index.ts');
    expect(app).toContain('pages/legal/privacy'); expect(app).toContain('pages/legal/terms'); expect(app).toContain('pages/account/index');
    for (const endpoint of ['/account/exports', '/account/deletion', '/auth/logout']) expect(account).toContain(endpoint);
  });
  it.each(['features/pantry/index.wxml', 'features/shopping/index.wxml', 'features/love-letters/index.wxml', 'pages/our/index.wxml'])('%s has loading, empty/error and retry states', (path) => {
    const page = read(path); expect(page).toContain('loading'); expect(page).toMatch(/error|没有|还没有/); expect(page).toMatch(/重试|load/);
  });
  it('separates catalog scheduling from today actions and keeps dish management on our page', () => {
    const manifest = read('app.json');
    const ratingPage = read('pages/dishes/index.ts');
    const ratingView = read('pages/dishes/index.wxml');
    const dishDetail = read('pages/dishes/detail.wxml');
    const mealPlan = read('pages/meal-plan/index.ts');
    const view = read('pages/meal-plan/index.wxml');
    const style = read('pages/meal-plan/index.wxss');
    const home = read('pages/home/index.ts');
    const homeView = read('pages/home/index.wxml');
    const homeStyle = read('pages/home/index.wxss');
    expect(ratingPage).toContain('/meal-history'); expect(ratingPage).toContain('/reviews');
    expect(ratingView).toContain('wx:for="{{completed}}"'); expect(ratingView).toContain('data-rating="{{star.value}}"');
    expect(ratingPage).toContain('placeholderText'); expect(ratingPage).toContain('content: (content ||'); expect(ratingView).toContain('review-text');
    expect(ratingPage).toContain('historyReviews'); expect(ratingPage).toContain('toggleHistory'); expect(ratingView).toContain('查看历史评价');
    expect(dishDetail).not.toContain('bindtap="edit"'); expect(manifest).not.toContain('pages/dishes/edit');
    expect(mealPlan).toContain('downloadFile(`/kitchens/${kitchenId}/uploads/${encodeURIComponent(reference)}/thumbnail`)');
    expect(mealPlan).toContain("method: 'POST'");
    expect(mealPlan).toContain("method: 'DELETE'");
    expect(mealPlan).toContain('removeUpcoming');
    expect(view).toContain('bindtap="removeUpcoming"');
    expect(view).toContain('class="meal-grid"'); expect(view).toContain('bindtap="openDish"'); expect(view).not.toContain('catchtap="complete"'); expect(view).not.toContain('catchtap="cancel"');
    expect(view).toContain("{{adding ? '加入中…' : '加入餐次'}}");
    expect(style).toContain('grid-template-columns:repeat(2,minmax(0,1fr))'); expect(style).toContain('aspect-ratio:1/1');
    expect(home).toContain('/v2/kitchens/${kitchenId}/meal-history'); expect(home).toContain('/meal-plans/${planId}'); expect(home).toContain("method: 'DELETE'"); expect(home).not.toContain('/dishes/${planId}');
    expect(home.indexOf('/meal-history')).toBeLessThan(home.indexOf('/meal-plans/${planId}'));
    expect(homeView).toContain('class="today-list"'); expect(homeView).toContain('catchtap="complete"'); expect(homeView).toContain('catchtap="cancel"');
    expect(homeView).toContain('德德与桐桐厨房'); expect(homeView).toContain('<view class="avatar">德德</view>'); expect(homeView).toContain('<view class="avatar partner">桐桐</view>');
    expect(homeView).not.toContain('item.description'); expect(homeView).not.toContain('dish-description');
    expect(home).not.toMatch(/type Dish = \{[^}]*description/); expect(home).not.toContain('dish.description');
    expect(homeStyle).toContain('.today-list{display:flex;flex-direction:column');
    expect(homeStyle).not.toContain('.dish-description');
    expect(homeView).toContain('class="memory-photo"'); expect(homeView).toContain('mode="aspectFit"');
    expect(homeStyle).toContain('.memory-photo{display:block;width:100%;height:100%');
    expect(home).toContain('HOME_MEMORY_IMAGE'); expect(home).toContain('uploadFile<{ id: string }>'); expect(home).toContain('/timeline');
    expect(home).not.toContain('homeMemoryImage:'); expect(home).not.toContain('wx.setStorageSync(`${memoryImageStoragePrefix}${kitchenId}`, path)');
    const ourPage = read('pages/our/index.ts');
    const ourView = read('pages/our/index.wxml');
    expect(ourPage).toContain("operators = ["); expect(ourPage).toContain("'德德'"); expect(ourPage).toContain("'桐桐'");
    expect(ourPage).toContain("if (value === 'HZH') return '德德'");
    expect(ourPage).toContain("method: form.dishId ? 'PATCH' : 'POST'"); expect(ourPage).toContain("method: 'DELETE'"); expect(ourPage).toContain('uploadFile<{ id: string }>');
    expect(ourView).toContain('菜单菜品管理'); expect(ourView).toContain('添加人：{{item.addedBy}}'); expect(ourView).toContain('bindtap="saveDish"');
    expect(read('pages/our/index.wxss')).toMatch(/\.story-delete\{[^}]*align-items:center;justify-content:center/); expect(ourView).toContain('catchtap="deleteStory"');
    expect(ourView).toContain('class="form-input"'); expect(ourView).not.toContain('class="two-col"');
    expect(read('pages/our/index.wxss')).toContain('.form-input{width:100%;height:82rpx');
    for (const category of ['MEAT', 'VEGETABLE', 'SOUP_PORRIDGE', 'DESSERT_SNACK', 'WESTERN', 'SEAFOOD', 'DRINK', 'STAPLE', 'OTHER']) expect(ourPage).toContain(category);
    expect(ourView).toContain('永久菜品'); expect(ourView).toContain('临时菜品');
    expect(ourView).toContain('备注详情'); expect(ourView).toContain('form.images');
    expect(ourView).toContain('bindchange="onCategoryChange"'); expect(ourView).not.toContain('菜系');
    expect(ourPage).not.toContain('onDishCuisine'); expect(ourPage).not.toContain('form.cuisine');
    expect(ourView).toContain('食材清单'); expect(ourView).toContain('bindinput="onDishIngredients"');
    expect(ourView).toContain('bindinput="onDishSteps"'); expect(ourPage).toContain('withDishMeta');
    expect(ourView).toContain('例如：德德爱心牛排'); expect(ourView).toContain('例如：眼肉牛排 200g'); expect(ourView).toContain('例如：牛排两面各煎 4min，等待美拉德反应');
    expect(read('pages/dishes/detail.ts')).toContain('downloadFile(`/kitchens/${kitchenId}/uploads/${encodeURIComponent(reference)}/thumbnail`)');
    expect(read('pages/dishes/detail.wxml')).toContain('src="{{dish.imageUrl}}"');
  });
  it('places menu, rating and statistics in the requested tab order', () => {
    const manifest = JSON.parse(read('app.json')) as { tabBar: { list: Array<{ pagePath: string; text: string }> } };
    const statsPage = read('pages/stats/index.ts');
    const statsView = read('pages/stats/index.wxml');
    expect(manifest.tabBar.list.slice(0, 4).map(({ pagePath, text }) => ({ pagePath, text }))).toEqual([
      { pagePath: 'pages/home/index', text: '首页' },
      { pagePath: 'pages/meal-plan/index', text: '菜单' },
      { pagePath: 'pages/dishes/index', text: '评价' },
      { pagePath: 'pages/stats/index', text: '统计' },
    ]);
    expect(statsPage).toContain('/meal-history'); expect(statsPage).toContain('MEAL_CANCELLED'); expect(statsPage).toContain('/timeline'); expect(statsPage).not.toContain('readMealStatEvents');
    expect(statsView).toContain('今日完成'); expect(statsView).toContain('每天完成记录'); expect(statsView).toContain('常吃菜品');
  });
});
