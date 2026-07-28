import { getKitchenId } from '../../stores/kitchen.store';
import { mapWithConcurrency } from '../../utils/async';
import { request } from '../../utils/request';
import { downloadFile, uploadFile } from '../../utils/transfer';

type Dish = {
  id: string;
  name: string;
  description?: string | null;
  notes?: string | null;
  story?: string | null;
  category?: string | null;
  kind?: 'PERMANENT' | 'TEMPORARY';
  effectiveDate?: string | null;
  servings?: number | null;
  coverImageUrl?: string | null;
  images?: Array<{ id: string; uploadId: string; sortOrder: number; isCover: boolean }>;
};
type FormImage = { uploadId: string; imageUrl: string };
type ManagedDish = Dish & { imageUrl: string; imageItems: FormImage[]; displayDescription: string; addedBy: string; ingredientsText: string; stepsText: string };
type StoryComment = { id: string; content: string; authorName: string; createdAt: string };
type Story = { id: string; title: string; content: string; storyDate: string; displayDate: string; createdByName?: string; comments?: StoryComment[] };
type FormData = {
  dishId: string;
  name: string;
  description: string;
  notes: string;
  dishStory: string;
  ingredientsText: string;
  stepsText: string;
  category: string;
  kind: 'PERMANENT' | 'TEMPORARY';
  effectiveDate: string;
  temporaryMealType: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
  servings: number;
  images: FormImage[];
  legacyCoverImageUrl: string;
  imagesTouched: boolean;
};

const operators = [
  { code: '德德', label: '德德' },
  { code: '桐桐', label: '桐桐' },
];
const categoryOptions = [
  { code: 'MEAT', label: '荤菜' },
  { code: 'VEGETABLE', label: '素菜' },
  { code: 'SOUP_PORRIDGE', label: '汤羹粥' },
  { code: 'DESSERT_SNACK', label: '甜品零食' },
  { code: 'WESTERN', label: '西餐' },
  { code: 'SEAFOOD', label: '海鲜' },
  { code: 'DRINK', label: '饮品' },
  { code: 'STAPLE', label: '主食' },
  { code: 'OTHER', label: '其他' },
];
const mealTypeOptions = [
  { code: 'BREAKFAST', label: '早餐' },
  { code: 'LUNCH', label: '午餐' },
  { code: 'DINNER', label: '晚餐' },
  { code: 'SNACK', label: '夜宵' },
];
const emptyForm = (): FormData => ({ dishId: '', name: '', description: '', notes: '', dishStory: '', ingredientsText: '', stepsText: '', category: 'OTHER', kind: 'PERMANENT', effectiveDate: dateValue(new Date()), temporaryMealType: 'DINNER', servings: 2, images: [], legacyCoverImageUrl: '', imagesTouched: false });
const metaMarker = '【菜品详情】';
const legacyAddedByPattern = /(?:^|\n)添加人：([^\n]+)\s*$/;

Page({
  data: {
    stories: [] as Story[],
    visibleStories: [] as Story[],
    selectedStoryDate: '',
    dishes: [] as ManagedDish[],
    operators,
    categoryOptions,
    mealTypeOptions,
    operatorIndex: 0,
    categoryIndex: categoryOptions.findIndex((item) => item.code === 'OTHER'),
    mealTypeIndex: 2,
    form: emptyForm(),
    addMenuOpen: false,
    editing: false,
    loading: false,
    dishesLoading: false,
    dishesExpanded: false,
    savingDish: false,
    uploadProgress: 0,
    error: '',
    dishError: '',
  },
  async onShow() { await this.load(); },
  async load() {
    if (this.data.loading || this.data.dishesLoading) return;
    const kitchenId = getKitchenId();
    if (!kitchenId) return;
    this.setData({ loading: true, dishesLoading: true, error: '', dishError: '' });
    try {
      const [stories, dishes] = await Promise.all([
        request<Story[]>(`/kitchens/${kitchenId}/stories`),
        request<Dish[]>(`/kitchens/${kitchenId}/dishes`),
      ]);
      const displayedStories = stories.map(toDisplayStory);
      this.setData({ stories: displayedStories, visibleStories: filterStories(displayedStories, this.data.selectedStoryDate), dishes: await hydrateDishes(kitchenId, dishes) });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '加载失败' });
    } finally {
      this.setData({ loading: false, dishesLoading: false });
    }
  },
  toggleDishes() { this.setData({ dishesExpanded: !this.data.dishesExpanded }); },
  onOperatorChange(event: WechatMiniprogram.PickerChange) { this.setData({ operatorIndex: Number(event.detail.value) }); },
  onCategoryChange(event: WechatMiniprogram.PickerChange) {
    const categoryIndex = Number(event.detail.value);
    this.setData({ categoryIndex, 'form.category': categoryOptions[categoryIndex]?.code || 'OTHER' });
  },
  toggleAddMenu() { this.setData({ addMenuOpen: !this.data.addMenuOpen }); },
  startAddDish(event: WechatMiniprogram.TouchEvent) {
    const kind = event.currentTarget.dataset.kind === 'TEMPORARY' ? 'TEMPORARY' : 'PERMANENT';
    this.setData({ editing: true, addMenuOpen: false, form: { ...emptyForm(), kind }, categoryIndex: categoryOptions.findIndex((item) => item.code === 'OTHER'), mealTypeIndex: 2, uploadProgress: 0, dishError: '' });
  },
  editDish(event: WechatMiniprogram.TouchEvent) {
    const dish = this.data.dishes.find((candidate) => candidate.id === event.currentTarget.dataset.id);
    if (!dish) return;
    const operatorIndex = Math.max(0, operators.findIndex((operator) => operator.code === dish.addedBy));
    const category = dish.category || 'OTHER';
    const categoryIndex = Math.max(0, categoryOptions.findIndex((item) => item.code === category));
    this.setData({
      editing: true,
      operatorIndex,
      categoryIndex,
      uploadProgress: 0,
      dishError: '',
      form: {
        dishId: dish.id,
        name: dish.name,
        description: dish.displayDescription,
        notes: dish.notes || '',
        dishStory: dish.story || '',
        ingredientsText: dish.ingredientsText,
        stepsText: dish.stepsText,
        category,
        kind: dish.kind || 'PERMANENT',
        effectiveDate: dish.effectiveDate?.slice(0, 10) || dateValue(new Date()),
        temporaryMealType: 'DINNER',
        servings: dish.servings || 2,
        images: dish.imageItems,
        legacyCoverImageUrl: dish.coverImageUrl || '',
        imagesTouched: false,
      },
    });
  },
  cancelEditDish() { this.setData({ editing: false, form: emptyForm(), uploadProgress: 0, dishError: '' }); },
  onDishName(event: WechatMiniprogram.Input) { this.setData({ 'form.name': event.detail.value }); },
  onDishDescription(event: WechatMiniprogram.Input) { this.setData({ 'form.description': event.detail.value }); },
  onDishNotes(event: WechatMiniprogram.Input) { this.setData({ 'form.notes': event.detail.value }); },
  onDishStory(event: WechatMiniprogram.Input) { this.setData({ 'form.dishStory': event.detail.value }); },
  onDishIngredients(event: WechatMiniprogram.Input) { this.setData({ 'form.ingredientsText': event.detail.value }); },
  onDishSteps(event: WechatMiniprogram.Input) { this.setData({ 'form.stepsText': event.detail.value }); },
  onDishServings(event: WechatMiniprogram.Input) { this.setData({ 'form.servings': Math.max(1, Math.min(24, Number(event.detail.value) || 2)) }); },
  onEffectiveDateChange(event: WechatMiniprogram.PickerChange) { this.setData({ 'form.effectiveDate': String(event.detail.value) }); },
  onMealTypeChange(event: WechatMiniprogram.PickerChange) {
    const mealTypeIndex = Number(event.detail.value);
    this.setData({ mealTypeIndex, 'form.temporaryMealType': mealTypeOptions[mealTypeIndex]?.code || 'DINNER' });
  },
  chooseDishImages() {
    const kitchenId = getKitchenId();
    if (!kitchenId) return wx.showToast({ title: '请先进入厨房', icon: 'none' });
    wx.chooseMedia({
      count: Math.max(1, 9 - this.data.form.images.length),
      mediaType: ['image'],
      success: async (result) => {
        const files = result.tempFiles || [];
        for (const file of files) {
          try {
            this.setData({ uploadProgress: 1 });
            const transfer = uploadFile<{ id: string }>(`/kitchens/${kitchenId}/uploads`, file.tempFilePath);
            transfer.onProgress((uploadProgress) => this.setData({ uploadProgress }));
            const uploaded = await transfer.promise;
            this.setData({ 'form.images': [...this.data.form.images, { uploadId: uploaded.id, imageUrl: file.tempFilePath }], 'form.imagesTouched': true, uploadProgress: 100 });
          } catch (error) {
            wx.showToast({ title: error instanceof Error ? error.message : '部分图片上传失败', icon: 'none' });
          }
        }
        if (files.length) wx.showToast({ title: '图片上传完成', icon: 'success' });
      },
    });
  },
  previewDishImage(event: WechatMiniprogram.TouchEvent) {
    const current = String(event.currentTarget.dataset.url || '');
    wx.previewImage({ current, urls: this.data.form.images.map((image) => image.imageUrl) });
  },
  removeDishImage(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ 'form.images': this.data.form.images.filter((_image, imageIndex) => imageIndex !== index), 'form.imagesTouched': true });
  },
  makeCover(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const images = [...this.data.form.images];
    const selected = images.splice(index, 1)[0];
    if (selected) this.setData({ 'form.images': [selected, ...images], 'form.imagesTouched': true });
  },
  moveImage(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const direction = Number(event.currentTarget.dataset.direction);
    const target = index + direction;
    if (target < 0 || target >= this.data.form.images.length) return;
    const images = [...this.data.form.images];
    [images[index], images[target]] = [images[target]!, images[index]!];
    this.setData({ 'form.images': images, 'form.imagesTouched': true });
  },
  async saveDish() {
    const kitchenId = getKitchenId();
    const form = this.data.form;
    const operator = operators[this.data.operatorIndex]?.code || '德德';
    if (!kitchenId) return wx.showToast({ title: '请先进入厨房', icon: 'none' });
    if (!form.name.trim()) return wx.showToast({ title: '请填写菜名', icon: 'none' });
    this.setData({ savingDish: true, dishError: '' });
    try {
      const path = form.dishId ? `/kitchens/${kitchenId}/dishes/${form.dishId}` : `/kitchens/${kitchenId}/dishes`;
      await request(path, {
        method: form.dishId ? 'PATCH' : 'POST',
        data: {
          name: form.name.trim(),
          description: withDishMeta(form.description.trim(), operator, form.ingredientsText.trim(), form.stepsText.trim()),
          notes: form.notes.trim(),
          story: form.dishStory.trim(),
          category: form.category,
          kind: form.kind,
          ...(form.kind === 'TEMPORARY' ? { effectiveDate: form.effectiveDate, temporaryMealType: form.temporaryMealType } : {}),
          servings: form.servings,
          ...(!form.dishId || form.imagesTouched ? { imageUploadIds: form.images.map((image) => image.uploadId) } : {}),
          coverImageUrl: form.images.length ? form.images[0]?.uploadId : form.legacyCoverImageUrl || undefined,
        },
      });
      wx.showToast({ title: form.dishId ? '菜品已更新' : '菜品已添加', icon: 'success' });
      this.setData({ editing: false, form: emptyForm(), uploadProgress: 0 });
      await this.loadDishes();
    } catch (error) {
      this.setData({ dishError: error instanceof Error ? error.message : '菜品保存失败' });
    } finally {
      this.setData({ savingDish: false });
    }
  },
  deleteDish(event: WechatMiniprogram.TouchEvent) {
    const dishId = event.currentTarget.dataset.id as string;
    const dish = this.data.dishes.find((candidate) => candidate.id === dishId);
    if (!dish) return;
    wx.showModal({
      title: '删除菜品',
      content: `确认删除「${dish.name}」吗？`,
      success: async ({ confirm }) => {
        if (!confirm) return;
        const kitchenId = getKitchenId();
        try {
          await request(`/kitchens/${kitchenId}/dishes/${dishId}`, { method: 'DELETE' });
          wx.showToast({ title: '菜品已删除', icon: 'success' });
          await this.loadDishes();
        } catch (error) {
          wx.showToast({ title: error instanceof Error ? error.message : '删除失败', icon: 'none' });
        }
      },
    });
  },
  openDish(event: WechatMiniprogram.TouchEvent) { wx.navigateTo({ url: `/pages/dishes/detail?dishId=${event.currentTarget.dataset.id}` }); },
  async loadDishes() {
    const kitchenId = getKitchenId();
    if (!kitchenId) return;
    this.setData({ dishesLoading: true, dishError: '' });
    try {
      this.setData({ dishes: await hydrateDishes(kitchenId, await request<Dish[]>(`/kitchens/${kitchenId}/dishes`)) });
    } catch (error) {
      this.setData({ dishError: error instanceof Error ? error.message : '菜品加载失败' });
    } finally {
      this.setData({ dishesLoading: false });
    }
  },
  addStory() {
    wx.showModal({
      title: '故事标题',
      editable: true,
      placeholderText: '例如：第一次一起做饭',
      success: (titleResult) => {
        const title = titleResult.content?.trim() || '';
        if (!titleResult.confirm) return;
        if (!title) return void wx.showToast({ title: '请输入故事标题', icon: 'none' });
        wx.showModal({
          title: '故事内容',
          editable: true,
          placeholderText: '写下今天值得记住的事',
          success: async (contentResult) => {
            const content = contentResult.content?.trim() || '';
            if (!contentResult.confirm) return;
            if (!content) return void wx.showToast({ title: '请输入故事内容', icon: 'none' });
            const kitchenId = getKitchenId();
            try {
              await request(`/kitchens/${kitchenId}/stories`, { method: 'POST', data: { title, content, storyDate: new Date().toISOString(), storyType: 'DAILY_MEMORY' } });
              await this.loadStories();
              wx.showToast({ title: '故事已保存', icon: 'success' });
            } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' }); }
          },
        });
      },
    });
  },
  async loadStories() {
    const kitchenId = getKitchenId();
    if (!kitchenId) return;
    const stories = await request<Story[]>(`/kitchens/${kitchenId}/stories`);
    const displayedStories = stories.map(toDisplayStory);
    this.setData({ stories: displayedStories, visibleStories: filterStories(displayedStories, this.data.selectedStoryDate) });
  },
  onStoryDateChange(event: WechatMiniprogram.PickerChange) {
    const selectedStoryDate = String(event.detail.value);
    this.setData({ selectedStoryDate, visibleStories: filterStories(this.data.stories, selectedStoryDate) });
  },
  clearStoryDate() { this.setData({ selectedStoryDate: '', visibleStories: this.data.stories }); },
  addStoryComment(event: WechatMiniprogram.TouchEvent) {
    const storyId = String(event.currentTarget.dataset.id || '');
    if (!storyId) return;
    wx.showModal({
      title: '写下评论',
      editable: true,
      placeholderText: '回复这段共同回忆',
      success: async (result) => {
        const content = result.content?.trim() || '';
        if (!result.confirm || !content) return;
        try {
          await request(`/kitchens/${getKitchenId()}/stories/${storyId}/comments`, { method: 'POST', data: { content } });
          await this.loadStories();
          wx.showToast({ title: '评论已发送', icon: 'success' });
        } catch (error) {
          const message = error instanceof Error ? error.message : '评论失败';
          wx.showToast({ title: message.includes('Cannot POST') ? '评论服务尚未更新，请先部署新版 API' : message, icon: 'none' });
        }
      },
    });
  },
  deleteStory(event: WechatMiniprogram.TouchEvent) {
    const storyId = event.currentTarget.dataset.id as string;
    const story = this.data.stories.find((candidate) => candidate.id === storyId);
    if (!story) return;
    wx.showModal({
      title: '删除故事',
      content: `确定删除「${story.title}」吗？`,
      success: async ({ confirm }) => {
        if (!confirm) return;
        try {
          await request(`/kitchens/${getKitchenId()}/stories/${storyId}`, { method: 'DELETE' });
          await this.loadStories();
          wx.showToast({ title: '故事已删除', icon: 'success' });
        } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '删除失败', icon: 'none' }); }
      },
    });
  },
  account() { wx.navigateTo({ url: '/pages/account/index' }); },
});

function toDisplayStory(story: Story): Story {
  const date = new Date(story.storyDate);
  const displayDate = Number.isNaN(date.getTime()) ? story.storyDate : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  return { ...story, displayDate };
}

function filterStories(stories: Story[], date: string) {
  return date ? stories.filter((story) => story.storyDate.slice(0, 10) === date) : stories;
}

async function hydrateDishes(kitchenId: string, dishes: Dish[]): Promise<ManagedDish[]> {
  return mapWithConcurrency(dishes, 3, async (dish) => {
    const parsed = parseDescription(dish.description);
    const editableUploadIds = dish.images?.length
      ? dish.images.map((image) => image.uploadId)
      : dish.coverImageUrl?.match(/^[0-9a-f-]{36}$/i) ? [dish.coverImageUrl] : [];
    const imageItems = await mapWithConcurrency(editableUploadIds, 2,
      async (uploadId) => ({ uploadId, imageUrl: await resolveDishImage(kitchenId, uploadId) }));
    return { ...dish, imageUrl: imageItems[0]?.imageUrl || await resolveDishImage(kitchenId, dish.coverImageUrl), imageItems, displayDescription: parsed.description, addedBy: parsed.addedBy, ingredientsText: parsed.ingredientsText, stepsText: parsed.stepsText };
  });
}

function parseDescription(value?: string | null) {
  const raw = value || '';
  const [descriptionPart = '', metaPart = ''] = raw.split(metaMarker);
  const meta = parseMeta(metaPart);
  const legacyMatch = descriptionPart.match(legacyAddedByPattern);
  return {
    description: descriptionPart.replace(legacyAddedByPattern, '').trim(),
    addedBy: displayOperatorName(meta.addedBy || legacyMatch?.[1] || ''),
    ingredientsText: meta.ingredientsText,
    stepsText: meta.stepsText,
  };
}

function withDishMeta(description: string, operator: string, ingredientsText: string, stepsText: string) {
  const clean = description.split(metaMarker)[0]?.replace(legacyAddedByPattern, '').trim() || '';
  return `${clean}\n\n${metaMarker}\n添加人：${operator}\n食材清单：\n${ingredientsText}\n步骤：\n${stepsText}`.trim();
}

function parseMeta(value: string) {
  const lines = value.split(/\r?\n/);
  let section = '';
  const ingredients: string[] = [];
  const steps: string[] = [];
  let addedBy = '';
  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    if (text.startsWith('添加人：')) { addedBy = text.replace('添加人：', '').trim(); continue; }
    if (text === '食材清单：') { section = 'ingredients'; continue; }
    if (text === '步骤：') { section = 'steps'; continue; }
    if (section === 'ingredients') ingredients.push(text);
    if (section === 'steps') steps.push(text);
  }
  return { addedBy, ingredientsText: ingredients.join('\n'), stepsText: steps.join('\n') };
}

function displayOperatorName(value: string) {
  if (value === 'HZH') return '德德';
  if (value === 'ZXT') return '桐桐';
  return value || '未记录';
}

async function resolveDishImage(kitchenId: string, reference?: string | null) {
  if (!reference) return '';
  if (/^https?:\/\//i.test(reference)) return reference;
  try { return await downloadFile(`/kitchens/${kitchenId}/uploads/${encodeURIComponent(reference)}/thumbnail`).promise; }
  catch { return ''; }
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
