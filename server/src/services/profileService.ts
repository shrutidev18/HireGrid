import { prisma, type TransactionClient } from '../config/db';
import { conflict, notFound } from '../utils/AppError';
import type { UpdateProfileInput } from '../utils/validators';

/**
 * The profile, which is two database rows presented as one object.
 *
 * `name` and `email` live on User because authentication needs them and they
 * exist for every account. Everything else lives on Profile, which is optional
 * — a user who has never opened this page has no Profile row at all. The API
 * hides that split: the client sees one flat object, and the fields that have
 * no row behind them come back as null rather than absent.
 */

export interface ProfileResponse {
  name: string;
  email: string;
  targetRole: string | null;
  skills: string[];
  education: string | null;
  experienceLevel: 'STUDENT' | 'FRESHER' | 'EXPERIENCED' | null;
  graduationYear: number | null;
  phone: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
}

/** The columns the profile half contributes. */
const profileSelect = {
  targetRole: true,
  skills: true,
  education: true,
  experienceLevel: true,
  graduationYear: true,
  phone: true,
  linkedinUrl: true,
  portfolioUrl: true,
} as const;

interface ProfileRow {
  targetRole: string | null;
  skills: string[];
  education: string | null;
  experienceLevel: ProfileResponse['experienceLevel'];
  graduationYear: number | null;
  phone: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
}

/**
 * Flattens the two rows into the shape the client expects.
 *
 * The null-filled defaults are not cosmetic. A React form bound to `undefined`
 * renders an uncontrolled input, and the first keystroke flips it to
 * controlled — which React warns about and which loses the value. Sending
 * explicit nulls means every field has a defined value from the first render.
 */
function toResponse(
  user: { name: string; email: string },
  profile: ProfileRow | null,
): ProfileResponse {
  return {
    name: user.name,
    email: user.email,
    targetRole: profile?.targetRole ?? null,
    skills: profile?.skills ?? [],
    education: profile?.education ?? null,
    experienceLevel: profile?.experienceLevel ?? null,
    graduationYear: profile?.graduationYear ?? null,
    phone: profile?.phone ?? null,
    linkedinUrl: profile?.linkedinUrl ?? null,
    portfolioUrl: profile?.portfolioUrl ?? null,
  };
}

/** GET /api/profile */
export async function getProfile(userId: string): Promise<ProfileResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      // One query, not two: the profile comes back on the same round trip.
      profile: { select: profileSelect },
    },
  });

  if (!user) {
    // A valid token whose user no longer exists — a deleted account, or a
    // database restored from before the signup.
    throw notFound('User not found');
  }

  return toResponse(user, user.profile);
}

/**
 * Translates PostgreSQL's unique-constraint violation on email into a 409.
 *
 * Checking "is this email taken?" before updating would still race: two
 * requests can both read "free" before either writes. The constraint is what
 * actually prevents the duplicate, so this handles the outcome rather than
 * trying to predict it — the same approach signup takes.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

/**
 * PUT /api/profile
 *
 * Both writes happen in one transaction. They are two halves of one intention:
 * the user pressed Save once. Committed separately, a failure between them
 * leaves a renamed account whose target role never changed — a state the user
 * has no way to detect, because the page would show a generic error while half
 * the form had in fact been saved.
 */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<ProfileResponse> {
  const { name, email, ...profileFields } = input;

  try {
    return await prisma.$transaction(async (tx: TransactionClient) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { name, email },
        select: { name: true, email: true },
      });

      /**
       * Upsert, because a Profile row may not exist yet.
       *
       * A plain update would throw for every user who has never opened this
       * page — which is every user, the first time. Upsert makes "create it"
       * and "change it" the same operation, so the caller never has to know
       * which case it is.
       */
      const profile = await tx.profile.upsert({
        where: { userId },
        update: profileFields,
        create: { userId, ...profileFields },
        select: profileSelect,
      });

      return toResponse(user, profile);
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict('An account with this email already exists');
    }
    throw err;
  }
}
