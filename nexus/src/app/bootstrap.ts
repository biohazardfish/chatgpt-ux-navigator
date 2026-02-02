import { loadConfig } from '../config/config';

export async function bootstrap(): Promise<void> {
  loadConfig();
}
