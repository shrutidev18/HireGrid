import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import { conflict, notFound, unauthorized } from '../utils/AppError';
import type { ChangePasswordInput, LoginInput, SignupInput } from '../utils/validators';

/**
 * Work factor for bcrypt. Each increment doubles the time to hash.
 *
 * 10 is roughly 50-100ms on typical hardware — slow enough that brute-forcing
 * a stolen hash table is impractical, fast enough that a login request does
 * not feel sluggish. The cost is stored inside the hash string itself, so
 * raising this later does not invalidate existing passwords; they simply keep
 * their old cost until the user next changes theirs.
 */
const SALT_ROUNDS = 10;

/**
 * The only user shape that ever leaves this service.
 *
 * Note what is absent: `passwordHash`. Returning the whole Prisma `User`
 * object would leak the hash into API responses the first time someone wrote
 * `res.json(user)` — the sort of mistake that is invisible in review and
 * obvious in a breach. Making the safe shape the only shape the service
 * returns removes the opportunity.
 */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

/**
 * A bcrypt hash of a throwaway string, used to burn the same CPU time on a
 * login attempt for an email that does not exist as on one that does.
 *
 * Without it, a missing email returns in ~1ms and a wrong password in ~80ms,
 * and that timing difference is a working "does this email have an account
 * here?" oracle — which is exactly what the generic error message exists to
 * prevent. Hashed once at module load, not per request.
 */
const TIMING_EQUALISER_HASH = bcrypt.hashSync('timing-equaliser-dummy-value', SALT_ROUNDS);

/**
 * Creates an account.
 *
 * @throws AppError 409 if the email is already registered.
 */
export async function createUser(input: SignupInput): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
      },
      // `select` rather than fetching the row and deleting fields afterwards:
      // the hash never travels out of PostgreSQL in the first place.
      select: { id: true, name: true, email: true },
    });

    return user;
  } catch (err: unknown) {
    // The findUnique check above has a race: two signups with the same email
    // can both read "not taken" before either writes. The database's @unique
    // constraint is what actually prevents the duplicate, and it surfaces as
    // Prisma error P2002. Translate it into the same 409 the check produces,
    // so the loser of the race gets a sensible message instead of a 500.
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    ) {
      throw conflict('An account with this email already exists');
    }
    throw err;
  }
}

/**
 * Verifies credentials.
 *
 * @throws AppError 401 with a deliberately generic message.
 */
export async function authenticateUser(input: LoginInput): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, email: true, passwordHash: true },
  });

  // Same message for "no such email" and "wrong password", every time.
  // Distinguishing them would turn the login form into an account-enumeration
  // tool: an attacker could confirm which emails are registered here and
  // target those people elsewhere.
  const invalid = () => unauthorized('Invalid credentials');

  if (!user) {
    // Burn equivalent CPU before failing, so response time does not reveal
    // what the message refuses to.
    await bcrypt.compare(input.password, TIMING_EQUALISER_HASH);
    throw invalid();
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw invalid();
  }

  return { id: user.id, name: user.name, email: user.email };
}

/**
 * Looks up the user a verified token belongs to.
 *
 * Returns null rather than throwing when the user no longer exists — a token
 * can outlive the account it was issued for (deleted account, wiped database),
 * and that is a 401, not a server error.
 */
export async function getUserById(userId: string): Promise<PublicUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
}

/**
 * Changes a signed-in user's password.
 *
 * Lives here, beside signup and login, rather than in profileService — so that
 * every line in this codebase that touches bcrypt, the work factor, or a
 * password hash is in one file. Spreading hashing across services is how one
 * of them quietly ends up using a different cost, or storing a plaintext
 * password, and nobody notices because the diff looked small.
 *
 * @throws AppError 401 if the current password does not match.
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user) {
    throw notFound('User not found');
  }

  /**
   * Re-verifying the current password is the whole point of this endpoint.
   *
   * The session cookie already proves *who* is asking, so the check adds
   * nothing against a stolen token by itself — what it defends against is the
   * unattended laptop and the borrowed session: someone who has the tab open
   * but does not know the password cannot silently change it and lock the
   * owner out. It is also why the change cannot be folded into PUT /api/profile
   * with the rest of the form.
   */
  const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);

  if (!matches) {
    // Specific, unlike login's deliberately vague "Invalid credentials". There
    // is nothing to leak here: the caller is already authenticated, so telling
    // them their current password is wrong reveals nothing they could not
    // establish by other means, and a vague message would just be unhelpful.
    throw unauthorized('Current password is incorrect');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}
