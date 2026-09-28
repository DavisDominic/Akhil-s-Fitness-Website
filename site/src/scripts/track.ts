// Analytics hook. Umami is connected in step 5 (it defines window.umami); until then this is a safe no-op.
// Only non-personal data goes through here (event name + where on the page), never form contents.
type Umami = { track?: (name: string, data?: Record<string, string | number>) => void };
export function track(name: string, data?: Record<string, string | number>) {
  try { (window as unknown as { umami?: Umami }).umami?.track?.(name, data); } catch { /* analytics must never break the page */ }
}
