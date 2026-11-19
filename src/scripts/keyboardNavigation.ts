import { minuteOf } from '../../shared/calendar';
import type { ObjectDirective } from 'vue';

function focus(element?: HTMLElement) { element?.focus(); element?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
function enabledButtons(container: HTMLElement, selector = 'button') {
  return [...container.querySelectorAll<HTMLButtonElement>(selector)].filter(button => !button.disabled && button.getClientRects().length);
}
function choices(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const container = event.currentTarget as HTMLElement, buttons = enabledButtons(container);
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  focus(buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]);
}
function courses(event: KeyboardEvent) {
  if (event.altKey || event.metaKey || event.shiftKey) return;
  const container = event.currentTarget as HTMLElement, current = (event.target as HTMLElement).closest<HTMLButtonElement>('.course');
  if (!current || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const column = current.closest<HTMLElement>('.list-day, .timeline-column');
  if (!column) return;
  let target: HTMLButtonElement | undefined;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (event.ctrlKey) return;
    const columns = [...container.querySelectorAll<HTMLElement>('.list-day, .timeline-column')];
    const other = columns[columns.indexOf(column) + (event.key === 'ArrowRight' ? 1 : -1)];
    const time = minuteOf(current.dataset.courseStart!);
    target = other ? enabledButtons(other, '.course').sort((a, b) => Math.abs(minuteOf(a.dataset.courseStart!) - time) - Math.abs(minuteOf(b.dataset.courseStart!) - time))[0] : undefined;
  } else {
    const buttons = enabledButtons(event.ctrlKey ? container : column, '.course');
    const index = buttons.indexOf(current);
    if (event.ctrlKey && event.key !== 'Home' && event.key !== 'End') return;
    target = buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1)];
  }
  event.preventDefault(); event.stopPropagation(); focus(target);
}
const directive = (listener: (event: KeyboardEvent) => void): ObjectDirective<HTMLElement> => ({
  mounted(element) { element.addEventListener('keydown', listener); },
  unmounted(element) { element.removeEventListener('keydown', listener); },
});
export const arrowNavigation = directive(choices);

// The planning is a single Tab stop: only one course is focusable with Tab (the last one used,
// else the ongoing course, else the next one), the arrows move between courses.
function roving(container: HTMLElement, chosen?: HTMLElement) {
  const list = [...container.querySelectorAll<HTMLElement>('.course')];
  // Without courses, the scrolling area itself stays reachable.
  container.tabIndex = list.length ? -1 : 0;
  if (!list.length) return;
  const active = chosen && list.includes(chosen) ? chosen
    : list.find(course => course.dataset.roving === 'true')
    ?? list.find(course => course.classList.contains('ongoing-course'))
    ?? list.find(course => !course.classList.contains('past-course'))
    ?? list[0]!;
  for (const course of list) { course.tabIndex = course === active ? 0 : -1; course.dataset.roving = String(course === active); }
}
const rovingFocus = (event: FocusEvent) => {
  const course = (event.target as HTMLElement).closest<HTMLElement>('.course');
  if (course) roving(event.currentTarget as HTMLElement, course);
};
export const courseNavigation: ObjectDirective<HTMLElement> = {
  mounted(element) { element.addEventListener('keydown', courses); element.addEventListener('focusin', rovingFocus); roving(element); },
  updated(element) { roving(element); },
  unmounted(element) { element.removeEventListener('keydown', courses); element.removeEventListener('focusin', rovingFocus); },
};
