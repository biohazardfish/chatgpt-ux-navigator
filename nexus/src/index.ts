import { bootstrap } from './app/bootstrap';

console.log('Nexus — starting...');

try {
  await bootstrap();
  console.log('Nexus — ready');
} catch (error) {
  console.error(error);
  process.exit(1);
}
