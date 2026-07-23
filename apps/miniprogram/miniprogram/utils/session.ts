let refreshToken: string | null = null;
export function setRefreshToken(value: string) { refreshToken = value; wx.setStorageSync('refreshToken', value); }
export function getRefreshToken() { return refreshToken || wx.getStorageSync('refreshToken') || ''; }
export function clearRefreshToken() { refreshToken = null; wx.removeStorageSync('refreshToken'); }
