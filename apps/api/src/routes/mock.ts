import { Hono } from 'hono';
import { buildMockAirbnbIcal, buildMockBookingIcal } from '../lib/mocks/booking-airbnb-ical.js';

/**
 * Endpoints de mock que sirven contenido sintético (iCal feeds, payloads de
 * webhook) para que el modo demo sea autocontenido. §1.4 del audit.
 *
 * Solo se montan si `APP_MODE=demo`. En producción no se exponen.
 */
export const mockRouter = new Hono();

mockRouter.get('/ical/airbnb.ics', (c) => {
  const ics = buildMockAirbnbIcal();
  return c.body(ics, 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  });
});

mockRouter.get('/ical/booking.ics', (c) => {
  const ics = buildMockBookingIcal();
  return c.body(ics, 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  });
});

mockRouter.get('/', (c) =>
  c.json({
    mode: 'demo',
    endpoints: {
      airbnbIcal: '/mock/ical/airbnb.ics',
      bookingIcal: '/mock/ical/booking.ics',
    },
    notes: 'Estos endpoints están montados porque APP_MODE=demo. En producción no se exponen.',
  }),
);
