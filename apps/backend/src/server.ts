import { createApp } from './app.js';
import { config } from './config.js';
import { createDatabase } from './database/client.js';

const connection = createDatabase(config.databaseFile);
const app = createApp({
  database: connection.database,
  frontendOrigin: config.frontendOrigin,
  imagesDirectory: config.imagesDirectory,
});

const server = app.listen(config.port, config.host, () => {
  console.log(`Backend listening at http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close(() => {
    connection.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
