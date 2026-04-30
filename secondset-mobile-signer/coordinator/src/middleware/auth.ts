// coordinator/src/middleware/auth.ts

import { Request, Response, NextFunction } from 'express';

const COORDINATOR_API_KEY = process.env.COORDINATOR_API_KEY;

/**
 * Middleware to validate API key from web app
 * Expects Authorization header: Bearer <api-key>
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  // Skip auth check if no API key is configured (development mode)
  if (!COORDINATOR_API_KEY) {
    console.warn('⚠️  COORDINATOR_API_KEY not configured - skipping auth (DEVELOPMENT MODE ONLY)');
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing Authorization header'
    });
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid Authorization format. Expected: Bearer <token>'
    });
  }

  if (token !== COORDINATOR_API_KEY) {
    console.error('❌ Invalid API key attempt from:', req.ip);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key'
    });
  }

  // API key is valid, proceed
  next();
}

/**
 * Optional: Rate limiting per API key
 * Can be enhanced with Redis for distributed rate limiting
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers.authorization?.split(' ')[1] || 'anonymous';
    const now = Date.now();

    const limits = rateLimitMap.get(apiKey);

    if (!limits || now > limits.resetAt) {
      // Reset window
      rateLimitMap.set(apiKey, {
        count: 1,
        resetAt: now + windowMs
      });
      return next();
    }

    if (limits.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((limits.resetAt - now) / 1000)} seconds`
      });
    }

    limits.count++;
    next();
  };
}
