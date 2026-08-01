import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ALL_ENTITIES } from './entities';

/** Prefer DATABASE_URL (Render/Neon/Railway); fall back to discrete DB_* vars for local Docker. */
export function buildTypeOrmOptions(): TypeOrmModuleOptions {
  const url = process.env.DATABASE_URL;
  const base: TypeOrmModuleOptions = {
    type: 'postgres',
    entities: ALL_ENTITIES,
    synchronize: true, // demo scope; use migrations in production
    retryAttempts: 15,
    retryDelay: 2000,
  };

  if (url) {
    return {
      ...base,
      url,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    };
  }

  return {
    ...base,
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER ?? 'o2c',
    password: process.env.DB_PASSWORD ?? 'o2c',
    database: process.env.DB_NAME ?? 'o2c',
  };
}
