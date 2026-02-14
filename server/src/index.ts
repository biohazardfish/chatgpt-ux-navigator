import {parseEnv} from './config/env';
import {makeConfig} from './config/config';
import {validateConfig} from './config/validate';
import {startServer} from './http/server';
import {configureDebugLogger} from './logging/debug';

const partialConfig = parseEnv();
const hasDebugFlag = process.argv.includes('--debug');
const config = makeConfig({
    ...partialConfig,
    debug: partialConfig.debug || hasDebugFlag,
});

await validateConfig(config);
await configureDebugLogger(config.debug, config.debugLogFile);
startServer(config);
