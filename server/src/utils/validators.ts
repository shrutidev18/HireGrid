import { z } from 'zod';

/**
 * Every request body and query string in the API is validated by a schema in
 * this file before a controller touches it.
 *
 * The pattern throughout: define the schema, then derive the TypeScript type
 * from it with `z.infer`. The runtime check and the compile-time type come
 * from one definition, so they cannot drift apart the way a hand-written
 * interface next to a hand-written validator eventually does.
 */

/** POST /api/auth/signup */
export const signupSchema = z.object({
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or fewer'),

  email: z
    .email({ error: 'Enter a valid email address' })
    // Normalised before it reaches the database so that Shruti@x.com and
    // shruti@x.com cannot become two accounts. The @unique constraint
    // compares bytes, not intent — this is what makes it behave as expected.
    .toLowerCase()
    .trim(),

  password: z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    // bcrypt silently truncates input beyond 72 bytes, so anything longer
    // would give a false sense of strength. Rejecting is more honest than
    // silently ignoring the tail.
    .max(72, 'Password must be 72 characters or fewer'),
});

export type SignupInput = z.infer<typeof signupSchema>;

/** POST /api/auth/login */
export const loginSchema = z.object({
  email: z.email({ error: 'Enter a valid email address' }).toLowerCase().trim(),

  /**
   * Deliberately only `min(1)`, not `min(8)` like signup.
   *
   * If login enforced the signup password rules, a 7-character guess would
   * come back 400 "must be at least 8 characters" while a wrong 9-character
   * guess came back 401. That difference tells an attacker about the password
   * policy and splits failures into distinguishable buckets. Every wrong
   * credential should fail the same way.
   */
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
