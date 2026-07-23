import { runtimeConfig } from './runtime.config';

export type Environment = 'development' | 'staging' | 'production';
export type EnvironmentConfig = { environment: Environment; apiBaseUrl: string; useMock: boolean; enableDebugLog: boolean };

declare const __LOVE_KITCHEN_ENV__: Environment | undefined;
declare const __LOVE_KITCHEN_API_BASE_URL__: string | undefined;

const injectedEnvironment = runtimeConfig.environment || (typeof __LOVE_KITCHEN_ENV__ !== 'undefined' ? __LOVE_KITCHEN_ENV__ : undefined);
const injectedApiBaseUrl = runtimeConfig.apiBaseUrl || (typeof __LOVE_KITCHEN_API_BASE_URL__ !== 'undefined' ? __LOVE_KITCHEN_API_BASE_URL__ : undefined);

const inferred: Environment = injectedEnvironment
  ? injectedEnvironment as Environment
  : ({ develop: 'development', trial: 'staging', release: 'production' } as const)[wx.getAccountInfoSync?.().miniProgram.envVersion ?? 'develop'];

const defaults: Record<Environment, string> = {
  development: 'http://localhost:3000/api',
  staging: 'https://staging-api.example.com/api',
  production: 'https://api.example.com/api',
};

export function resolveEnvironment(environment: Environment, injectedBaseUrl?: string): EnvironmentConfig {
  const apiBaseUrl = (injectedBaseUrl || defaults[environment]).replace(/\/$/, '');
  if (environment === 'production') {
    if (!apiBaseUrl.startsWith('https://')) throw new Error('Production API must use HTTPS');
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0|example\.(com|org|net)|\/dev(?:\/|$)/i.test(apiBaseUrl)) throw new Error('Production API domain is not configured');
  }
  return { environment, apiBaseUrl, useMock: environment === 'development' && false, enableDebugLog: environment === 'development' };
}

export function assertAllowedRequest(environment: Environment, path: string) {
  if (environment === 'production' && /(?:^|\/)dev-login(?:\/|$)/i.test(path)) throw new Error('Development login is disabled in production');
}

export const ENV = resolveEnvironment(inferred, injectedApiBaseUrl);
