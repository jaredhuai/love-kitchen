export function kitchenOpeningDay(today = new Date()) {
  const opened = new Date(2026, 7, 18);
  const startDay = new Date(opened.getFullYear(), opened.getMonth(), opened.getDate()).getTime();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (todayStart < startDay) return 0;
  return Math.floor((todayStart - startDay) / 86400000) + 1;
}
