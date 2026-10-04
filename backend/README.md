# CELCAT backend

Imported from https://github.com/mmi-place/celcat-back at commit
`e9c5b518727db6863c3a573bd0447b46f7e70978` (mmi-place, GPL-3.0).
Original license preserved in `LICENSE.md`.

`app.ts` preserves POST retrieval and iCalendar fallback.
It exports Express without starting a server. `api/` serves it on Vercel;
`dev.ts` starts it locally for the Vite proxy.

Adaptations: `/api` routes, request timeouts, date/group validation, consistent
default date ranges, bounded cache without background timer, CDN cache headers
on success and no caching of errors.

Normalization now lives in `normalize.ts` and produces the shared CourseDTO
contract (`format=course`). It preserves multiple teachers/rooms, decodes HTML,
normalizes module identifiers, converts Paris timestamps to UTC, filters by Paris
calendar dates, and removes exact duplicate events. Legacy response fields remain
available. Group definitions live in `shared/groups.ts` for both client and server.

Memory cache is temporary and isolated per Vercel instance. CDN caching reduces
repeat requests without Redis. Fresh schedules depend on CELCAT availability.
