const num = (key: string, fallback: number): number => Number(process.env[key] ?? fallback);

export const config = {
    PORT: num("PORT", 4200),
    version: process.env.npm_package_version ?? "0.1.0",
} as const;

export type Config = typeof config;