/**
 * Stub para builds Next.js/Vercel — substitui firebase-functions (só usado p/ functions.config legacy).
 * Em produção Vercel as vars vêm de process.env, não de firebase functions:config.
 */
module.exports = {
  config: () => ({}),
  https: { onRequest: () => {} },
  firestore: {
    document: () => ({
      onCreate: () => {},
      onUpdate: () => {},
      onWrite: () => {},
    }),
  },
  pubsub: { schedule: () => ({ onRun: () => {} }) },
  runWith: () => ({ https: { onRequest: () => {} } }),
}
