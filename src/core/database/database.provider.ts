import { Provider } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export const DRIZZLE_PROVIDER = 'DRIZZLE_PROVIDER';

export const databaseProvider: Provider = {
  provide: DRIZZLE_PROVIDER,
  useFactory: () => {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'DATABASE_URL não foi informada nas variáveis de ambiente.'
      );
    }

    return drizzle(connectionString, { schema });
  },
};
