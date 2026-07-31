import type { Express } from 'express';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { createDatabase, type DatabaseConnection } from '../src/database/client.js';

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
