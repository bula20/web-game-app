

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/User.js';
import { env } from './env.js';

export function configurePassport() {
  
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${env.SERVER_URL ?? 'http://localhost:3001'}/api/auth/google/callback`,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            
            let user = await User.findOne({ googleId: profile.id });

            if (!user) {
              const email = profile.emails?.[0]?.value;
              
              
              if (email) {
                user = await User.findOne({ email });
                if (user) {
                  user.googleId = profile.id;
                  await user.save();
                  return done(null, user);
                }
              }

              
              
              const baseName = (profile.displayName ?? 'user').replace(/\s+/g, '_').toLowerCase();
              let candidate = baseName;
              let suffix = 2;
              while (await User.exists({ username: candidate })) {
                candidate = `${baseName}_${suffix++}`;
              }
              user = await User.create({
                username: candidate,
                
                email: email || `${profile.id}@google.oauth`,
                googleId: profile.id,
                isGuest: false,
              });
            }

            return done(null, user);
          } catch (error) {
            return done(error as Error, undefined);
          }
        }
      )
    );
  }

  
  passport.serializeUser((user: any, done) => {
    done(null, user._id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}
