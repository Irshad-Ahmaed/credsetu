export function shouldStartSwipe(dx: number, dy: number, touches: number, disabled: boolean) {
  return Number.isFinite(dx + dy) && !disabled && touches === 1 && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.6;
}

export function shouldDeleteSwipe(dx: number, dy: number, velocityX: number, width: number) {
  if (!Number.isFinite(dx + dy + velocityX + width) || width <= 0) return false;
  if (Math.abs(dx) <= Math.abs(dy) * 1.6) return false;
  const threshold = Math.min(84, Math.max(56, width * 0.25));
  const deliberateFlick = Math.abs(dx) >= 40 && Math.abs(velocityX) >= 0.8 && Math.sign(dx) === Math.sign(velocityX);
  return Math.abs(dx) >= threshold || deliberateFlick;
}
