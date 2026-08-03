import {
  DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_RADIUS_PERCENT,
  DEFAULT_BORDER_WIDTH_CM,
  DEFAULT_HEIGHT_BASE_CM,
  DEFAULT_HEIGHT_PER_SLOT_CM,
  DEFAULT_WIDTH_BASE_CM,
  DEFAULT_WIDTH_PER_SLOT_CM,
} from '@binder-project-planner/shared';
import type { Express } from 'express';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { createDatabase, type DatabaseConnection } from '../src/database/client.js';
import { binders } from '../src/database/schema.js';

// Mirrors `toHundredths` in `src/routes/binders.ts` so directly inserted
// rows (bypassing POST /binders) use the same integer-hundredths storage
// representation the schema's NOT NULL columns require.
function toHundredths(value: number): number {
  return Math.round(value * 100);
}

describe('GET /health', () => {
  let connection: DatabaseConnection;

  beforeEach(() => {
    connection = createDatabase(':memory:');
  });

  afterEach(() => {
    connection.close();
  });

  it('reports that the API and migrated database are available', async () => {
    const app = createApp({
      database: connection.database,
      frontendOrigin: 'http://localhost:3000',
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'connected' });
  });
});

describe('GET /binders', () => {
  let connection: DatabaseConnection;
  let app: Express;

  beforeEach(() => {
    connection = createDatabase(':memory:');
    app = createApp({ database: connection.database, frontendOrigin: 'http://localhost:3000' });
  });

  afterEach(() => {
    connection.close();
  });

  // Inserts a binder row directly (bypassing POST /binders) so each test can
  // control its id and timestamps precisely, in order to assert the
  // documented sort order (story 5's ACs) rather than relying on real-time
  // clock ordering between requests.
  function insertBinder(overrides: {
    id: string;
    name: string;
    updatedAt: string;
    createdAt?: string;
  }) {
    connection.database
      .insert(binders)
      .values({
        id: overrides.id,
        name: overrides.name,
        normalizedName: overrides.name.toLowerCase(),
        width: 3,
        height: 3,
        pages: 20,
        // Story 24 dimension/style columns are NOT NULL; use the same
        // application defaults POST /binders falls back to so these
        // directly inserted rows satisfy the schema without asserting on
        // story 24 behavior (out of scope for these story 5 sort tests).
        widthPerSlotHundredths: toHundredths(DEFAULT_WIDTH_PER_SLOT_CM),
        widthBaseHundredths: toHundredths(DEFAULT_WIDTH_BASE_CM),
        heightPerSlotHundredths: toHundredths(DEFAULT_HEIGHT_PER_SLOT_CM),
        heightBaseHundredths: toHundredths(DEFAULT_HEIGHT_BASE_CM),
        borderColor: DEFAULT_BORDER_COLOR,
        borderRadiusHundredths: toHundredths(DEFAULT_BORDER_RADIUS_PERCENT),
        borderWidthHundredths: toHundredths(DEFAULT_BORDER_WIDTH_CM),
        previewPhysicalPage: DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
        createdAt: overrides.createdAt ?? overrides.updatedAt,
        updatedAt: overrides.updatedAt,
      })
      .run();
  }

  it('returns an empty array when no binders exist', async () => {
    const response = await request(app).get('/binders');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('sorts binders by updatedAt descending', async () => {
    insertBinder({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Oldest',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    insertBinder({
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Newest',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });
    insertBinder({
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Middle',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const response = await request(app).get('/binders');

    expect(response.status).toBe(200);
    expect(response.body.map((binder: { name: string }) => binder.name)).toEqual([
      'Newest',
      'Middle',
      'Oldest',
    ]);
  });

  it('breaks updatedAt ties using ascending binder UUID', async () => {
    insertBinder({
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      name: 'Z Binder',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    insertBinder({
      id: '00000000-0000-0000-0000-000000000000',
      name: 'A Binder',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await request(app).get('/binders');

    expect(response.status).toBe(200);
    expect(response.body.map((binder: { id: string }) => binder.id)).toEqual([
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ]);
  });

  it('returns binder-summary objects without exposing normalizedName', async () => {
    insertBinder({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'My Binder',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await request(app).get('/binders');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'My Binder',
        width: 3,
        height: 3,
        pages: 20,
        widthPerSlot: DEFAULT_WIDTH_PER_SLOT_CM,
        widthBase: DEFAULT_WIDTH_BASE_CM,
        heightPerSlot: DEFAULT_HEIGHT_PER_SLOT_CM,
        heightBase: DEFAULT_HEIGHT_BASE_CM,
        borderColor: DEFAULT_BORDER_COLOR,
        borderRadius: DEFAULT_BORDER_RADIUS_PERCENT,
        borderWidth: DEFAULT_BORDER_WIDTH_CM,
        previewPhysicalPage: DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        // Story 20's embedded preview spread for `previewPhysicalPage: 2`
        // out of 20 stored pages (40 physical pages): a two-sided spread
        // pairing physical pages 2 and 3, with no cards/art placed yet.
        preview: {
          spread: { left: 2, right: 3 },
          cards: [],
          art: [],
        },
      },
    ]);
  });
});

describe('POST /binders', () => {
  let connection: DatabaseConnection;
  let app: Express;

  // A valid request body reused/spread by individual tests so each one only
  // overrides the field it's actually exercising (story 4's ACs).
  const validBody = { name: 'My Binder', width: 3, height: 3, pages: 20 };

  beforeEach(() => {
    connection = createDatabase(':memory:');
    app = createApp({ database: connection.database, frontendOrigin: 'http://localhost:3000' });
  });

  afterEach(() => {
    connection.close();
  });

  it('creates a binder and returns 201 with a Location header and the persisted representation', async () => {
    const response = await request(app).post('/binders').send(validBody);

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe(`/binders/${response.body.id}`);
    expect(response.body).toMatchObject({
      name: 'My Binder',
      width: 3,
      height: 3,
      pages: 20,
    });
    // The backend generates the id and timestamps; assert their shape rather
    // than exact values since they're not client-supplied.
    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(response.body.createdAt).toBe(response.body.updatedAt);
    expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
    // The case-insensitive-uniqueness normalizedName column is an internal
    // detail and must never be exposed to clients.
    expect(response.body).not.toHaveProperty('normalizedName');
  });

  it('trims the stored binder name', async () => {
    const response = await request(app)
      .post('/binders')
      .send({ ...validBody, name: '  My Binder  ' });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('My Binder');
  });

  it('rejects a name that is empty after trimming with 400 Bad Request', async () => {
    const response = await request(app)
      .post('/binders')
      .send({ ...validBody, name: '   ' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.status).toBe(400);
  });

  it('returns 409 Conflict when a binder with the same case-insensitively normalized name already exists', async () => {
    await request(app).post('/binders').send(validBody);

    const response = await request(app)
      .post('/binders')
      .send({ ...validBody, name: 'MY BINDER' });

    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.status).toBe(409);
    expect(response.body.conflictingField).toBe('name');
  });

  it('allows a second binder once the conflicting name is changed', async () => {
    await request(app).post('/binders').send(validBody);

    const response = await request(app)
      .post('/binders')
      .send({ ...validBody, name: 'A Different Binder' });

    expect(response.status).toBe(201);
  });

  // The OpenAPI validation middleware (mounted in app.ts) must reject
  // requests that don't match CreateBinderRequest's documented schema -
  // including the `pages` field - before this route's own logic runs.
  it.each(['name', 'width', 'height', 'pages'] as const)(
    'rejects a request missing the required %s field with 400 Bad Request',
    async (field) => {
      const body = { ...validBody };
      delete (body as Partial<typeof body>)[field];

      const response = await request(app).post('/binders').send(body);

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    },
  );

  it.each(['width', 'height', 'pages'] as const)(
    'rejects a non-integer %s value with 400 Bad Request',
    async (field) => {
      const response = await request(app)
        .post('/binders')
        .send({ ...validBody, [field]: 1.5 });

      expect(response.status).toBe(400);
    },
  );

  it.each(['width', 'height', 'pages'] as const)(
    'rejects a %s value below the minimum of 1 with 400 Bad Request',
    async (field) => {
      const response = await request(app)
        .post('/binders')
        .send({ ...validBody, [field]: 0 });

      expect(response.status).toBe(400);
    },
  );

  it('rejects a request body with an undocumented additional property with 400 Bad Request', async () => {
    const response = await request(app)
      .post('/binders')
      .send({ ...validBody, extra: 'not allowed' });

    expect(response.status).toBe(400);
  });
});

// Shared by every story 7 route test below: a binderId that is well-formed
// but doesn't correspond to any row.
const MISSING_BINDER_ID = '99999999-9999-9999-9999-999999999999';
const MALFORMED_BINDER_ID = 'not-a-uuid';

describe('GET /binders/:binderId', () => {
  let connection: DatabaseConnection;
  let app: Express;
  const validBody = { name: 'My Binder', width: 3, height: 3, pages: 20 };

  beforeEach(() => {
    connection = createDatabase(':memory:');
    app = createApp({ database: connection.database, frontendOrigin: 'http://localhost:3000' });
  });

  afterEach(() => {
    connection.close();
  });

  it("returns 200 with the binder's details", async () => {
    const created = await request(app).post('/binders').send(validBody);

    const response = await request(app).get(`/binders/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(created.body);
  });

  it('returns 404 Not Found for a well-formed but nonexistent binder id', async () => {
    const response = await request(app).get(`/binders/${MISSING_BINDER_ID}`);

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 400 Bad Request for a malformed (non-UUID) binder id', async () => {
    const response = await request(app).get(`/binders/${MALFORMED_BINDER_ID}`);

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });
});

describe('PATCH /binders/:binderId', () => {
  let connection: DatabaseConnection;
  let app: Express;
  const validBody = { name: 'My Binder', width: 3, height: 3, pages: 20 };

  beforeEach(() => {
    connection = createDatabase(':memory:');
    app = createApp({ database: connection.database, frontendOrigin: 'http://localhost:3000' });
  });

  afterEach(() => {
    connection.close();
  });

  it('applies a partial update and returns 200 with the complete persisted binder', async () => {
    const created = await request(app).post('/binders').send(validBody);

    const response = await request(app).patch(`/binders/${created.body.id}`).send({ width: 4 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: created.body.id,
      name: 'My Binder',
      width: 4,
      height: 3,
      pages: 20,
    });
    // updatedAt must advance so clients can rely on it for cache/sort
    // freshness; createdAt is immutable.
    expect(response.body.createdAt).toBe(created.body.createdAt);
    expect(response.body).not.toHaveProperty('normalizedName');
  });

  it('applies multiple dirty fields in one request', async () => {
    const created = await request(app).post('/binders').send(validBody);

    const response = await request(app)
      .patch(`/binders/${created.body.id}`)
      .send({ name: 'Renamed Binder', pages: 30 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: 'Renamed Binder', pages: 30, width: 3, height: 3 });
  });

  it('trims a supplied name and re-validates the trimmed length', async () => {
    const created = await request(app).post('/binders').send(validBody);

    const response = await request(app)
      .patch(`/binders/${created.body.id}`)
      .send({ name: '  Renamed  ' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Renamed');
  });

  it('rejects a name that is empty after trimming with 400 Bad Request', async () => {
    const created = await request(app).post('/binders').send(validBody);

    const response = await request(app).patch(`/binders/${created.body.id}`).send({ name: '   ' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 409 Conflict when the new name collides with another binder', async () => {
    await request(app).post('/binders').send(validBody);
    const other = await request(app)
      .post('/binders')
      .send({ ...validBody, name: 'Other Binder' });

    const response = await request(app)
      .patch(`/binders/${other.body.id}`)
      .send({ name: 'MY BINDER' });

    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.conflictingField).toBe('name');
  });

  it('returns 404 Not Found for a well-formed but nonexistent binder id', async () => {
    const response = await request(app).patch(`/binders/${MISSING_BINDER_ID}`).send({ width: 4 });

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 400 Bad Request for a malformed (non-UUID) binder id', async () => {
    const response = await request(app).patch(`/binders/${MALFORMED_BINDER_ID}`).send({ width: 4 });

    expect(response.status).toBe(400);
  });

  it('returns 400 Bad Request for an empty update body', async () => {
    const created = await request(app).post('/binders').send(validBody);

    // UpdateBinderRequest's `minProperties: 1` is enforced by the OpenAPI
    // validation middleware before this route's own logic runs.
    const response = await request(app).patch(`/binders/${created.body.id}`).send({});

    expect(response.status).toBe(400);
  });

  it('rejects an undocumented additional property with 400 Bad Request', async () => {
    const created = await request(app).post('/binders').send(validBody);

    const response = await request(app)
      .patch(`/binders/${created.body.id}`)
      .send({ extra: 'not allowed' });

    expect(response.status).toBe(400);
  });
});

describe('GET /binders/:binderId/cards', () => {
  let connection: DatabaseConnection;
  let app: Express;
  const validBody = { name: 'My Binder', width: 3, height: 3, pages: 20 };

  beforeEach(() => {
    connection = createDatabase(':memory:');
    app = createApp({ database: connection.database, frontendOrigin: 'http://localhost:3000' });
  });

  afterEach(() => {
    connection.close();
  });

  it('returns 200 with an empty array (card creation does not exist yet)', async () => {
    const created = await request(app).post('/binders').send(validBody);

    const response = await request(app).get(`/binders/${created.body.id}/cards`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns 404 Not Found for a well-formed but nonexistent binder id', async () => {
    const response = await request(app).get(`/binders/${MISSING_BINDER_ID}/cards`);

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 400 Bad Request for a malformed (non-UUID) binder id', async () => {
    const response = await request(app).get(`/binders/${MALFORMED_BINDER_ID}/cards`);

    expect(response.status).toBe(400);
  });
});

describe('GET /binders/:binderId/art', () => {
  let connection: DatabaseConnection;
  let app: Express;
  const validBody = { name: 'My Binder', width: 3, height: 3, pages: 20 };

  beforeEach(() => {
    connection = createDatabase(':memory:');
    app = createApp({ database: connection.database, frontendOrigin: 'http://localhost:3000' });
  });

  afterEach(() => {
    connection.close();
  });

  it('returns 200 with an empty array (art creation does not exist yet)', async () => {
    const created = await request(app).post('/binders').send(validBody);

    const response = await request(app).get(`/binders/${created.body.id}/art`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns 404 Not Found for a well-formed but nonexistent binder id', async () => {
    const response = await request(app).get(`/binders/${MISSING_BINDER_ID}/art`);

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 400 Bad Request for a malformed (non-UUID) binder id', async () => {
    const response = await request(app).get(`/binders/${MALFORMED_BINDER_ID}/art`);

    expect(response.status).toBe(400);
  });
});
