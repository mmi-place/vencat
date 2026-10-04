import { repairCourseText } from '../shared/courses.js';
import { repairText } from '../shared/text.js';
import { GROUP_TO_FEDERATION } from '../shared/groups.js';
import { postEventToCalendarEvent, icalEventToCalendarEvent, prepareEvents, type CalendarEvent, type CelcatPostEvent } from './normalize.js';
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import ical from "ical";
import { TTLCache } from '../shared/cache.js';
import type { Snapshot } from '../shared/changes.js';
import { searchRouter } from './search.js';
import { monitoringRouter } from './monitoring.js';
import { configured, redis } from './storage.js';

const app = express();

const configuredTTL = Number(process.env.CACHE_TTL_SECONDS ?? 600);
const CACHE_TTL_SECONDS = Number.isFinite(configuredTTL) && configuredTTL > 0 ? Math.min(Math.floor(configuredTTL), 3600) : 600;
const CELCAT_BASE_URL =
  process.env.CELCAT_BASE_URL ||
  "https://celcat.rambouillet.iut-velizy.uvsq.fr";
const CELCAT_EDT_URL =
  process.env.CELCAT_EDT_URL || "https://edt.iut-velizy.uvsq.fr";

app.use(cors());
app.use(express.json({ limit: '16kb' }));
app.use('/api', monitoringRouter);
app.use('/api', searchRouter);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
class AppError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

class ClientError extends AppError {
  constructor(message: string, statusCode = 400) {
    super(message, statusCode);
  }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
// Opportunistic per-instance cache; Vercel may recycle instances at any time.
const cache = new TTLCache(CACHE_TTL_SECONDS * 1000);

// ---------------------------------------------------------------------------
// Stratégie POST
// ---------------------------------------------------------------------------
async function fetchViaPost(
  federationId: string,
  start: string,
  end: string,
): Promise<{ events: CalendarEvent[]; fetchedAt: string }> {
  const cacheKey = `post_${federationId}_${start}_${end}`;
  const cached = cache.get<{ events: CalendarEvent[]; fetchedAt: string }>(cacheKey);
  if (cached) return cached;

  const body = new URLSearchParams({
    start,
    end,
    resType: "103",
    calView: "agendaWeek",
    "federationIds[]": federationId,
  });

  const response = await fetch(`${CELCAT_EDT_URL}/Home/GetCalendarData`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body,
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new AppError(`POST Celcat failed. Status: ${response.status}`, 502);
  }

  const raw: CelcatPostEvent[] = (await response.json()) as CelcatPostEvent[];
  if (!Array.isArray(raw)) throw new AppError('Réponse CELCAT invalide.', 502);
  const events = prepareEvents(raw.map(postEventToCalendarEvent).filter((event): event is CalendarEvent => event !== null), start, end);
  const result = { events, fetchedAt: new Date().toISOString() };
  cache.set(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// Stratégie iCal (fallback)
// ---------------------------------------------------------------------------
async function fetchViaIcal(
  groupId: string,
  startDate: Date,
  endDate?: Date,
): Promise<{ events: CalendarEvent[]; fetchedAt: string }> {
  const cacheKey = `ical_${groupId}`;
  let stored = cache.get<{ text: string; fetchedAt: string }>(cacheKey);

  if (!stored) {
    const response = await fetch(
      `${CELCAT_BASE_URL}/cal/ical/${groupId}/schedule.ics`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!response.ok) {
      if (response.status === 404)
        throw new ClientError(
          `No schedule found for group ID: ${groupId}`,
          404,
        );
      throw new AppError(`iCal fetch failed. Status: ${response.status}`, 502);
    }
    const text = await response.text();
    if (!text.includes('BEGIN:VCALENDAR') || !text.includes('END:VCALENDAR')) throw new AppError('Calendrier de secours invalide.', 502);
    stored = { text, fetchedAt: new Date().toISOString() };
    cache.set(cacheKey, stored);
  }

  const calendar = ical.parseICS(stored.text);
  const defaultEnd = new Date(startDate);
  defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 5);
  const events = prepareEvents(
    Object.values(calendar).map(event => icalEventToCalendarEvent(event as unknown as Record<string, unknown>)).filter((event): event is CalendarEvent => event !== null),
    startDate.toISOString().slice(0, 10), (endDate ?? defaultEnd).toISOString().slice(0, 10),
  );

  return { events, fetchedAt: stored.fetchedAt };
}

export async function getCalendar(groupId: string, start: string, end: string): Promise<{ snapshot: Snapshot; events: CalendarEvent[] }> {
  // Durable short-window cache is shared across Vercel instances, not tied to a visitor.
  const shortWindow = (Date.parse(end) - Date.parse(start)) / 86400000 <= 13;
  const key = `vencat:calendar:${groupId}:${start}:${end}`;
  if (shortWindow && configured()) {
    try {
      const raw = await redis<string | null>('GET', key);
      const saved = raw ? JSON.parse(raw) as { snapshot: Snapshot; events: CalendarEvent[] } : undefined;
      if (saved?.snapshot.version === 1 && saved.snapshot.groupId === groupId && saved.snapshot.start === start && saved.snapshot.end === end && Array.isArray(saved.events) && Date.now() - Date.parse(saved.snapshot.fetchedAt) < 600000) {
        saved.snapshot.courses = saved.snapshot.courses.map(repairCourseText);
        saved.events = saved.events.map(event => ({ ...event, course: repairCourseText(event.course), summary: repairText(event.summary), description: repairText(event.description), location: repairText(event.location) }));
        return saved;
      }
    } catch { /* Online retrieval remains available when durable storage is unavailable. */ }
  }
  let data: { events: CalendarEvent[]; fetchedAt: string };
  let source: Snapshot['source'] = 'post';
  const federation = GROUP_TO_FEDERATION[groupId];
  try { if (!federation) throw new Error('Unknown federation'); data = await fetchViaPost(federation, start, end); }
  catch { source = 'ical'; data = await fetchViaIcal(groupId, new Date(start), new Date(end)); }
  const result = { events: data.events, snapshot: { version: 1 as const, groupId, start, end, source, fetchedAt: data.fetchedAt, courses: data.events.map(event => event.course) } };
  if (shortWindow && configured()) {
    try { await redis('SET', key, JSON.stringify(result), 'EX', Math.max(1, Math.floor((Date.parse(data.fetchedAt) + 600000 - Date.now()) / 1000))); } catch { /* Keep the per-instance fallback. */ }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Route principale
// ---------------------------------------------------------------------------
app.get(
  ["/api/edt/:groupId", "/edt/:groupId"],
  async (req: Request, res: Response, next: NextFunction) => {
    const groupId = String(req.params.groupId);
    const { start, end } = req.query;
    if (req.query.format !== undefined && req.query.format !== 'course' && req.query.format !== 'snapshot')
      return next(new ClientError("Invalid response format."));

    if (!/^[A-Za-z0-9_-]{1,100}$/.test(groupId))
      return next(new ClientError("Invalid group ID."));

    const validDate = (value: unknown): value is string =>
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

    if (!start)
      return next(new ClientError("Missing 'start' query parameter."));

    if (!validDate(start))
      return next(new ClientError("Invalid 'start' date format."));
    if (end !== undefined && !validDate(end))
      return next(new ClientError("Invalid 'end' date format."));

    const startDate = new Date(start);
    const endDate = end ? new Date(end as string) : new Date(startDate);
    if (!end) endDate.setUTCDate(endDate.getUTCDate() + 5);
    const days = (endDate.getTime() - startDate.getTime()) / 86_400_000;
    if (days < 0 || days > 62)
      return next(new ClientError("Date range must be between 0 and 62 days."));
    const startStr = start;
    const endStr = endDate.toISOString().slice(0, 10);
    res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`);

    try {
      const { snapshot, events } = await getCalendar(groupId, startStr, endStr);
      return res.status(200).json(req.query.format === 'snapshot' ? snapshot : req.query.format === 'course' ? snapshot.courses : events);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Ping
// ---------------------------------------------------------------------------
app.all(["/api/ping", "/ping"], (_req, res) => {
  res.status(200).send("pong");
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store");
  if (err instanceof AppError) {
    console.error(
      `[${req.method} ${req.path}] AppError ${err.statusCode}: ${err.message}`,
    );
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(err.stack);
  res
    .status(500)
    .json({ error: "Le service de calendrier est indisponible. Réessayez dans quelques instants." });
});

// ---------------------------------------------------------------------------
export default app;
