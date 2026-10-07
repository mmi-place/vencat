import type { ObjectDirective } from 'vue';

// Keep the header's wallpaper aligned with the fixed application canvas.
// A faint portion of the scrolling courses remains visible beneath this layer.
const cleanups = new WeakMap<HTMLElement, () => void>();
export const wallpaperBackdrop: ObjectDirective<HTMLElement> = {
  mounted(element) {
    let frame = 0;
    function position() {
      frame = 0;
      const bounds = element.getBoundingClientRect();
      element.style.setProperty('--wallpaper-left', `${-bounds.left}px`);
      element.style.setProperty('--wallpaper-top', `${-bounds.top}px`);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(position); }
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    position();
    cleanups.set(element, () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    });
  },
  unmounted(element) { cleanups.get(element)?.(); cleanups.delete(element); },
};
