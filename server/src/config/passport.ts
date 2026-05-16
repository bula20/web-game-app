// Konfiguracja Passport.js z obsluga logowania przez Google OAuth 2.0.
// Strategia jest rejestrowana tylko jesli w env podano klucze - bez nich aplikacja
// dziala normalnie tylko z logowaniem klasycznym (email + haslo).
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/User.js';
import { env } from './env.js';

export function configurePassport() {
  // Rejestracja strategii Google tylko gdy podano poprawne credentialsy w env.
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: '/api/auth/google/callback',
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            // Najpierw szukamy po googleId - to standardowy przypadek powracajacego usera.
            let user = await User.findOne({ googleId: profile.id });

            if (!user) {
              const email = profile.emails?.[0]?.value;
              // Jesli mamy email, sprawdzamy czy user nie zalozyl konta klasycznie -
              // wtedy tylko dolaczamy googleId do istniejacego rekordu (linkowanie kont).
              if (email) {
                user = await User.findOne({ email });
                if (user) {
                  user.googleId = profile.id;
                  await user.save();
                  return done(null, user);
                }
              }

              // Brak konta - tworzymy nowe. Jezeli bazowa nazwa jest zajeta, doklejamy
              // kolejny licznik (_2, _3, ...) az znajdziemy wolna.
              const baseName = (profile.displayName ?? 'user').replace(/\s+/g, '_').toLowerCase();
              let candidate = baseName;
              let suffix = 2;
              while (await User.exists({ username: candidate })) {
                candidate = `${baseName}_${suffix++}`;
              }
              user = await User.create({
                username: candidate,
                // Fallback emaila gdy Google nie zwroci adresu - dziwny edge case ale sie zdarza.
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

  // Serializacja/deserializacja sesji - przechowujemy tylko _id, pelny user pobierany z bazy.
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
