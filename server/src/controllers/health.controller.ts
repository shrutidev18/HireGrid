import type { Request, Response } from 'express';

/**
 * Liveness probe. Deliberately does not touch PostgreSQL or Redis: this
 * endpoint answers "is the API process up and serving HTTP?", which is what a
 * container orchestrator or the client's connectivity check needs to know.
 * A dependency-checking readiness endpoint is a separate concern.
 */
export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok' });
}
