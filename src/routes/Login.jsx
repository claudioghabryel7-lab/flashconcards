import { useState } from 'react'
import {
  EnvelopeIcon,
  LockClosedIcon,
  ArrowRightCircleIcon,
} from '@heroicons/react/24/solid'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'

const Login = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/dashboard')
    } catch (err) {
      console.error('Erro no login:', err)
      setError(err.message || 'Credenciais inválidas. Confira e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm">
      <h2 className="text-3xl font-bold text-alego-700">Bem-vindo de volta!</h2>
      <p className="mt-2 text-sm text-slate-500">
        Acesse sua mentoria exclusiva para o concurso de Polícia Legislativa.
      </p>
      {error && (
        <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold text-slate-600">
          Email
          <div className="mt-1 flex items-center rounded-full border border-slate-200 px-4">
            <EnvelopeIcon className="h-4 w-4 text-alego-500" />
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full border-none bg-transparent px-3 py-3 text-sm focus:outline-none"
              placeholder="seuemail@email.com"
            />
          </div>
        </label>

        <label className="block text-sm font-semibold text-slate-600">
          Senha
          <div className="mt-1 flex items-center rounded-full border border-slate-200 px-4">
            <LockClosedIcon className="h-4 w-4 text-alego-500" />
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              className="w-full border-none bg-transparent px-3 py-3 text-sm focus:outline-none"
              placeholder="••••••••"
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-alego-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-alego-700 disabled:opacity-50"
        >
          <ArrowRightCircleIcon className="h-5 w-5" />
          Entrar
        </button>
      </form>
    </div>
  )
}

export default Login
