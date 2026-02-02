import {parseEnv} from './config/env';
import {makeConfig} from './config/config';
import {startServer} from './http/server';

const partialConfig = parseEnv();
const config = makeConfig(partialConfig);

startServer(config);
