import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { isDevelopment } from '../config/env';

/**
 * The exact response body every failed request returns, without exception.
 * A client that can rely on one error shape needs one error-handling path.
 */
export interface ErrorResponse {
  error: string;
  statusCode: number;
}

/**
 * Catches any request that matched no route and turns it into a normal 404
 * that flows through the error handler below, rather than Express's default
 * HTML error page.
 *
 * Registered after all routes, immediately before `errorHandler`.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

/**
 * The single place where errors become HTTP responses.
 *
 * Every route in this codebase relies on it: Express 5 forwards a rejected
 * promise from an async handler to the error middleware automatically, so
 * handlers `throw` and never write error responses themselves. That is what
 * keeps the error contract consistent — there is exactly one writer.
 *
 * Must be registered last, and must keep all four parameters: Express
 * identifies error middleware by arity, and a three-parameter function is
 * silently treated as ordinary middleware that never runs.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 500;
  let message = 'Internal server error';

  if (err instanceof ZodError) {
    // Validation failure. Surface the first field-level problem, prefixed with
    // the field name, so the client can tell the user what to fix.
    statusCode = 400;
    const issue = err.issues[0];
    const fieldPath = issue?.path.join('.');
    message = issue
      ? fieldPath
        ? `${fieldPath}: ${issue.message}`
        : issue.message
      : 'Validation failed';
  } else if (err instanceof AppError) {
    // An error we raised on purpose — its message is written for the client.
    statusCode = err.statusCode;
    message = err.message;
  }
  // Anything else keeps the 500 / "Internal server error" default. An
  // unexpected error's message may contain a query, a file path, or a
  // connection string, so it is never echoed back.

  // Full detail goes to the server log only.
  const logPrefix = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${statusCode}`;
  if (statusCode >= 500) {
    console.error(logPrefix, err);
  } else if (isDevelopment) {
    // 4xx responses are the client's fault, not a server fault — log them
    // compactly in development for debugging. Not in production (noise), and
    // not under test, where deliberately provoking 4xxs is the point and the
    // logging would bury the actual test results.
    console.warn(`${logPrefix} ${message}`);
  }

  const body: ErrorResponse = { error: message, statusCode };
  res.status(statusCode).json(body);
}
