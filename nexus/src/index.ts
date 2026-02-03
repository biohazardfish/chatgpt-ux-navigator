import {bootstrap} from './app/bootstrap.ts';

async function main() {
    try {
        console.log('Nexus — starting...');
        await bootstrap();
        console.log('Nexus — ready');
    } catch (error) {
        console.error('Fatal error during startup:', error);
        process.exit(1);
    }
}

main();
