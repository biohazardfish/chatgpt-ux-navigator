import {parseEnv} from './config/env';
import {makeConfig} from './config/config';
import {validateConfig} from './config/validate';
import {startServer} from './http/server';

const partialConfig = parseEnv();
const config = makeConfig(partialConfig);

await validateConfig(config);
startServer(config);
