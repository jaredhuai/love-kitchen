import { clearAuth } from './auth.store';
import { clearFeatureFlags } from './feature-flag.store';
import { clearKitchen } from './kitchen.store';
import { clearMemberships } from './membership.store';
import { clearNotifications } from './notification.store';
import { clearUser } from './user.store';

export function clearAllStores() {
  clearAuth(); clearUser(); clearKitchen(); clearMemberships(); clearNotifications(); clearFeatureFlags();
}
