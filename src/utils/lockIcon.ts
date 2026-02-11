/**
 * Lock icon as SVG data URL for drawing on canvas.
 * Based on Lucide "Lock" (https://lucide.dev) – clean 24×24 outline icon.
 * @param strokeColor CSS color for the stroke (e.g. "#a1a1aa" or "rgba(161,161,170,0.95)")
 */
export function getLockIconDataUrl(strokeColor: string): string {
  const encoded = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
  );
  return `data:image/svg+xml,${encoded}`;
}
