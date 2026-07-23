type KitchenContext = { id?: string; kitchenId?: string; name?: string };
let current: KitchenContext | null = null;
export function setKitchen(kitchen: KitchenContext) { current = kitchen; wx.removeStorageSync('kitchen'); }
export function getKitchen(): KitchenContext | null { return current; }
export function getKitchenId() { const kitchen = getKitchen(); return kitchen?.kitchenId || kitchen?.id || ''; }
export function clearKitchen() { current = null; wx.removeStorageSync('kitchen'); }
