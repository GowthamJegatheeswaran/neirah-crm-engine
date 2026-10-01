import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';

/**
 * Used by the TypeORM CLI (migration:generate / migration:run) and the seed script.
 * The running NestJS app uses typeorm.config.ts instead.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
});
