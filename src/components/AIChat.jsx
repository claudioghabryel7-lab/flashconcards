import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { PaperAirplaneIcon } from '@heroicons/react/24/solid'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'

const AIChat = () => {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!user) return () => {}
    const chatRef = collection(db, 'chats', user.uid, 'messages')
    const q = query(chatRef, orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setMessages(data)
    })
    return () => unsub()
  }, [user])

  const simulatedResponses = useMemo(
    () => [
      'Excelente dedicação! Foque nos artigos centrais e revise com calma.',
      'Perfeito! Lembre-se de relacionar o dispositivo com casos práticos.',
      'Bom progresso. Faça um mapa mental agora para fixar.',
      'Continue firme! Releia o artigo e crie seu próprio exemplo.',
    ],
    [],
  )

  const sendMessage = async (event) => {
    event?.preventDefault()
    if (!input.trim() || !user) return
    setSending(true)
    const chatRef = collection(db, 'chats', user.uid, 'messages')
    try {
      await addDoc(chatRef, {
        text: input.trim(),
        sender: 'user',
        createdAt: serverTimestamp(),
      })
      setInput('')

      setTimeout(async () => {
        const response =
          simulatedResponses[
            Math.floor(Math.random() * simulatedResponses.length)
          ]
        await addDoc(chatRef, {
          text: response,
          sender: 'ai',
          createdAt: serverTimestamp(),
        })
        setSending(false)
      }, 800)
    } catch (err) {
      setSending(false)
    }
  }

  return (
    <div className="flex h-[28rem] flex-col rounded-2xl bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-alego-500">
          Chat IA Simulado
        </p>
        <p className="text-lg font-bold text-alego-700">
          Dúvidas rápidas para sua mentoria
        </p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            Envie uma mensagem para iniciar a conversa.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                message.sender === 'user'
                  ? 'bg-alego-600 text-white'
                  : 'bg-slate-100 text-slate-800'
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-100 px-5 py-4">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Digite sua dúvida..."
          className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-alego-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="flex items-center gap-2 rounded-full bg-alego-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
          Enviar
        </button>
      </form>
    </div>
  )
}

export default AIChat

