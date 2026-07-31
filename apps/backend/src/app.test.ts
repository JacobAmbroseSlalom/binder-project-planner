import request from 'supertest';

import { createApp } from './app.js';
import { createDatabase, type DatabaseConnection } from './database/client.js';

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
