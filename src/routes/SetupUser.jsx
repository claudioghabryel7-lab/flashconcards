/**
 * Rota /setup desabilitada — não cria admin com senha hardcoded.
 * Crie usuários pelo Firebase Console ou script com variáveis de ambiente.
 */
const SetupUser = () => {
  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm text-center">
      <h2 className="text-2xl font-bold text-slate-800">Setup desabilitado</h2>
      <p className="mt-4 text-sm text-slate-600">
        A criação de admin por esta página foi removida por segurança. Use o Firebase
        Authentication / Console ou o script <code className="text-xs">add-user.mjs</code> com
        <code className="text-xs"> SETUP_ADMIN_EMAIL</code> e{' '}
        <code className="text-xs">SETUP_ADMIN_PASSWORD</code>.
      </p>
      <a
        href="/login"
        className="mt-6 inline-block rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white"
      >
        Ir para login
      </a>
    </div>
  )
}

export default SetupUser
