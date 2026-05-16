import { Sequelize } from 'sequelize';
import { logger } from '../utils/helpers/logger';

let sequelize: Sequelize;

export async function initializeDatabase(): Promise<Sequelize> {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'ilm_db',
    process.env.DB_USER || 'ilm_user',
    process.env.DB_PASSWORD || 'ilm_password_secure_2024',
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      dialect: 'postgres',
      logging: process.env.DB_LOGGING === 'true' ? (msg: string) => logger.debug(msg) : false,
      pool: {
        max: 20,
        min: 5,
        acquire: 30000,
        idle: 10000,
      },
      dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
          require: true,
          rejectUnauthorized: false,
        } : false,
      },
      define: {
        timestamps: true,
        underscored: true,
        paranoid: true, // Soft deletes
      },
    }
  );

  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Sync models in development
    if (process.env.NODE_ENV === 'development' && process.env.DB_SYNC === 'true') {
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized');
    }

    return sequelize;
  } catch (error) {
    logger.error('Unable to connect to the database:', error);
    throw error;
  }
}

export function getSequelize(): Sequelize {
  if (!sequelize) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return sequelize;
}

export default { initializeDatabase, getSequelize };
