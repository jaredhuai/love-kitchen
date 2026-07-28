import { getKitchenId } from '../../stores/kitchen.store';
import { request } from '../../utils/request';
import { downloadFile } from '../../utils/transfer';

type DishIngredient = { id?: string; displayName: string; quantity?: string | number | null; unit?: string | null };
type RecipeStep = { id?: string; content: string };
type DishReview = { id?: string; content?: string | null; tasteRating?: number };
type Dish = {
  id: string;
  name: string;
  description?: string | null;
  notes?: string | null;
  category?: string | null;
  servings?: number | null;
  coverImageUrl?: string | null;
  images?: Array<{ id: string; uploadId: string; sortOrder: number }>;
  ratingAverage?: number | null;
  ratingCount?: number;
  ingredients?: DishIngredient[];
  steps?: RecipeStep[];
  reviews?: DishReview[];
};
type DetailDish = Dish & { imageUrl: string; imageUrls: string[]; categoryLabel: string; displayDescription: string; addedBy: string; ingredients: DishIngredient[]; steps: RecipeStep[]; reviews: DishReview[] };

const metaMarker = '【菜品详情】';
const legacyAddedByPattern = /(?:^|\n)添加人：([^\n]+)\s*$/;

Page({
  data: { dish: null as DetailDish | null, loading: true, error: '' },
  async onLoad(options: Record<string, string>) {
    const kitchenId = getKitchenId();
    if (!kitchenId || !options.dishId) { this.setData({ loading: false, error: '菜品不存在' }); return; }
    try {
      const dish = await request<Dish>(`/kitchens/${kitchenId}/dishes/${options.dishId}`);
      this.setData({ dish: await toDetailDish(kitchenId, dish) });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
});

async function toDetailDish(kitchenId: string, dish: Dish): Promise<DetailDish> {
  const parsed = parseDescription(dish.description);
  const storedIngredients = dish.ingredients?.length ? dish.ingredients : parsed.ingredients.map((displayName, index) => ({ id: `meta-ingredient-${index}`, displayName }));
  const storedSteps = dish.steps?.length ? dish.steps : parsed.steps.map((content, index) => ({ id: `meta-step-${index}`, content }));
  const imageUrls = await Promise.all((dish.images?.length ? dish.images.map((image) => image.uploadId) : dish.coverImageUrl ? [dish.coverImageUrl] : []).map((uploadId) => resolveDishImage(kitchenId, uploadId)));
  return {
    ...dish,
    imageUrls,
    imageUrl: imageUrls[0] || '',
    categoryLabel: categoryLabel(dish.category),
    displayDescription: parsed.description,
    addedBy: parsed.addedBy,
    ingredients: storedIngredients,
    steps: storedSteps,
    reviews: dish.reviews || [],
  } as DetailDish;
}

function parseDescription(value?: string | null) {
  const raw = value || '';
  const [descriptionPart = '', metaPart = ''] = raw.split(metaMarker);
  const meta = parseMeta(metaPart);
  const legacyMatch = descriptionPart.match(legacyAddedByPattern);
  return {
    description: descriptionPart.replace(legacyAddedByPattern, '').trim(),
    addedBy: displayOperatorName(meta.addedBy || legacyMatch?.[1] || ''),
    ingredients: meta.ingredients,
    steps: meta.steps,
  };
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
  return { addedBy, ingredients, steps };
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

function categoryLabel(code?: string | null) {
  return ({ MEAT: '荤菜', VEGETABLE: '素菜', SOUP_PORRIDGE: '汤羹粥', DESSERT_SNACK: '甜品零食', WESTERN: '西餐', SEAFOOD: '海鲜', DRINK: '饮品', STAPLE: '主食', OTHER: '其他' } as Record<string, string>)[code || ''] || '其他';
}
