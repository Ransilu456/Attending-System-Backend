// Compatibility entrypoint for old desktop launchers and deployment commands.
import { startServer } from './bootstrap/startServer.js';

startServer().catch((error) => {
  console.error(`Server failed to start: ${error.message}`);
  process.exitCode = 1;
});
