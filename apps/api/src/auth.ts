import { createDb, schema } from '@impacto/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, twoFactor } from 'better-auth/plugins';
import { env } from './env.js';
import { renderInvitationEmail, sendMail } from './lib/email.js';
import { logger } from './logger.js';

const db = createDb(env.APP_DATABASE_URL ?? env.DATABASE_URL);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', usePlural: true, schema }),

  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification:
      env.REQUIRE_EMAIL_VERIFICATION === 'true' ||
      (env.REQUIRE_EMAIL_VERIFICATION !== 'false' && env.NODE_ENV === 'production'),
    minPasswordLength: 8,
  },

  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET
      ? {
          facebook: {
            clientId: env.FACEBOOK_CLIENT_ID,
            clientSecret: env.FACEBOOK_CLIENT_SECRET,
          },
        }
      : {}),
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  trustedOrigins: [env.PUBLIC_WEB_URL],

  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 5,
      membershipLimit: 50,
      sendInvitationEmail: async (data) => {
        const inviteUrl = `${env.PUBLIC_WEB_URL}/accept-invitation/${data.id}`;
        const tpl = renderInvitationEmail({
          inviterName: data.inviter.user.name ?? data.inviter.user.email,
          organizationName: data.organization.name,
          inviteUrl,
          recipientEmail: data.email,
        });
        const result = await sendMail({
          to: data.email,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
        });
        if (!result.sent) {
          logger.warn(
            { to: data.email, reason: result.reason, inviteUrl },
            'invitation email no enviado (revisar SMTP_HOST)',
          );
        }
      },
    }),
    twoFactor({
      issuer: 'Impacto',
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type Organization = typeof auth.$Infer.Organization;
