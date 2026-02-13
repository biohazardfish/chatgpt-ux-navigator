import {parseEnv} from './config/env';
import {makeConfig} from './config/config';
import {validateConfig} from './config/validate';
import {startServer} from './http/server';

const partialConfig = parseEnv();
const hasDebugFlag = process.argv.includes('--debug');
const config = makeConfig({
    ...partialConfig,
    debugLogs: partialConfig.debugLogs || hasDebugFlag,
});

await validateConfig(config);
startServer(config);
