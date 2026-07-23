import type { MembershipContract } from '../contracts/api';
let memberships: MembershipContract[] = [];
export function setMemberships(value: MembershipContract[]) { memberships = value; wx.removeStorageSync('memberships'); }
export function getMemberships(): MembershipContract[] { return memberships; }
export function clearMemberships() { memberships = []; wx.removeStorageSync('memberships'); }
