import { Link } from 'react-router-dom'

const Register = () => {
  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm">
      <h2 className="text-3xl font-bold text-alego-700">Comece sua jornada</h2>
      <p className="mt-2 text-sm text-slate-500">
        Entre em contato com o administrador para criar sua conta e acessar a mentoria intensiva.
      </p>
      <div className="mt-6 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <p className="font-semibold">📧 Como criar sua conta:</p>
        <p className="mt-2">
          Entre em contato com o administrador ou faça o pagamento através da página de pagamento para criar sua conta automaticamente.
        </p>
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        Já é aluno?{' '}
        <Link to="/login" className="font-semibold text-alego-600">
          Faça login
        </Link>
      </p>
    </div>
  )
}

export default Register
