import type { NotificationContract } from '../contracts/api';
let notifications: NotificationContract[] = [];
export function setNotifications(value: NotificationContract[]) { notifications = value; }
export function getNotifications() { return notifications; }
export function markNotificationRead(id: string) { notifications = notifications.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item); }
export function clearNotifications() { notifications = []; }
