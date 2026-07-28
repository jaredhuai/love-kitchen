import { z } from 'zod';
export const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    ACCESS_TOKEN_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, '必须使用如 15m、30d 的有效期格式')
      .default('15m'),
    REFRESH_TOKEN_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, '必须使用如 15m、30d 的有效期格式')
      .default('30d'),
    LOVE_LETTER_ENCRYPTION_KEY: z.string().min(16),
    LOVE_LETTER_KEY_VERSION: z.coerce.number().int().min(1).max(100).default(1),
    WECHAT_APP_ID: z.string().optional(),
    WECHAT_APP_SECRET: z.string().optional(),
    KITCHEN_ACCESS_PASSWORD: z.string().min(8).optional(),
    SINGLE_KITCHEN_MODE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    WECHAT_LOGIN_TIMEOUT_MS: z.coerce.number().int().min(500).max(15000).default(5000),
    UPLOAD_DRIVER: z.enum(['local', 'cos']).default('local'),
    UPLOAD_LOCAL_DIR: z.string().default('./uploads'),
    UPLOAD_COS_FALLBACK_LOCAL: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    COS_SECRET_ID: z.string().optional(),
    COS_SECRET_KEY: z.string().optional(),
    COS_BUCKET: z.string().optional(),
    COS_REGION: z.string().optional(),
    MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().max(10).default(10),
    MAX_ACTIVE_KITCHENS_PER_USER: z.coerce.number().int().positive().default(1),
    ACCOUNT_DELETION_COOLING_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    ACCOUNT_PERMANENT_PURGE_ENABLED: z
      .literal('false')
      .default('false')
      .transform(() => false),
  })
  .superRefine((config, context) => {
    if (config.UPLOAD_DRIVER === 'cos') {
      for (const key of ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET', 'COS_REGION'] as const) {
        if (!config[key])
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'UPLOAD_DRIVER=cos 时必填',
          });
      }
    }
  });
