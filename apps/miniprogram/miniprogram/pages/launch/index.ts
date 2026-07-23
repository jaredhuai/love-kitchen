Page({
  onLoad() {
    wx.removeStorageSync('kitchen');
    wx.removeStorageSync('memberships');
    setTimeout(() => wx.reLaunch({ url: '/pages/auth/login' }), 500);
  },
});
