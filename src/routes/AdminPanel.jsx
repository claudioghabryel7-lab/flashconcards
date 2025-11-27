import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { DocumentTextIcon, TrashIcon, UserPlusIcon, PlusIcon } from '@heroicons/react/24/outline'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth, db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'

const MATERIAS = [
  'Português',
  'Área de Atuação (PL)',
  'Raciocínio Lógico',
  'Constitucional',
  'Administrativo',
  'Legislação Estadual',
  'Realidade de Goiás',
  'Redação',
]


const AdminPanel = () => {
  const { isAdmin } = useAuth()
  const [cards, setCards] = useState([])
  const [users, setUsers] = useState([])
  const [jsonInput, setJsonInput] = useState('')
  const [message, setMessage] = useState('')
  const [userForm, setUserForm] = useState({ email: '', password: '', name: '', role: 'student' })
  
  // Estado para gerenciar módulos
  const [selectedMateriaForModule, setSelectedMateriaForModule] = useState('')
  const [newModuleName, setNewModuleName] = useState('')
  const [modules, setModules] = useState({}) // { materia: [modulos] }
  
  // Estado para criação de flashcards
  const [flashcardForm, setFlashcardForm] = useState({
    materia: '',
    modulo: '',
    pergunta: '',
    resposta: '',
  })
  const [editalPrompt, setEditalPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [promptStatus, setPromptStatus] = useState(null)
  const [expandedCardMaterias, setExpandedCardMaterias] = useState({})
  const [expandedCardModulos, setExpandedCardModulos] = useState({})

  useEffect(() => {
    const cardsRef = collection(db, 'flashcards')
    const unsubCards = onSnapshot(cardsRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setCards(data)
      
      // Extrair módulos únicos por matéria dos cards existentes
      const modulesByMateria = {}
      data.forEach((card) => {
        if (card.materia && card.modulo) {
          if (!modulesByMateria[card.materia]) {
            modulesByMateria[card.materia] = []
          }
          if (!modulesByMateria[card.materia].includes(card.modulo)) {
            modulesByMateria[card.materia].push(card.modulo)
          }
        }
      })
      setModules(modulesByMateria)
    })

    const usersRef = collection(db, 'users')
    const unsubUsers = onSnapshot(usersRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        email: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setUsers(data)
    })

    return () => {
      unsubCards()
      unsubUsers()
    }
  }, [])

  const normalizeTags = (tags) => {
    if (Array.isArray(tags)) return tags
    if (!tags) return []
    return String(tags)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }

  const cardsOrganized = useMemo(() => {
    const grouped = {}
    cards.forEach((card) => {
      const materia = card.materia || 'Sem matéria'
      const modulo = card.modulo || 'Sem módulo'
      if (!grouped[materia]) {
        grouped[materia] = {}
      }
      if (!grouped[materia][modulo]) {
        grouped[materia][modulo] = []
      }
      grouped[materia][modulo].push(card)
    })
    return grouped
  }, [cards])

  const toggleCardMateria = (materia) => {
    setExpandedCardMaterias((prev) => ({
      ...prev,
      [materia]: !prev[materia],
    }))
  }

  const toggleCardModulo = (materia, modulo) => {
    const key = `${materia}::${modulo}`
    setExpandedCardModulos((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // Adicionar módulo a uma matéria
  const addModule = () => {
    if (!selectedMateriaForModule || !newModuleName.trim()) {
      setMessage('Selecione a matéria e digite o nome do módulo.')
      return
    }

    const moduleName = newModuleName.trim()
    
    // Verificar se o módulo já existe
    if (modules[selectedMateriaForModule]?.includes(moduleName)) {
      setMessage('Este módulo já existe nesta matéria.')
      return
    }

    setModules((prev) => ({
      ...prev,
      [selectedMateriaForModule]: [...(prev[selectedMateriaForModule] || []), moduleName],
    }))
    
    setNewModuleName('')
    setMessage(`Módulo "${moduleName}" adicionado a ${selectedMateriaForModule}!`)
  }

  // Remover módulo
  const removeModule = (materia, modulo) => {
    if (!window.confirm(`Deseja remover o módulo "${modulo}" de ${materia}?`)) return
    
    setModules((prev) => ({
      ...prev,
      [materia]: (prev[materia] || []).filter((m) => m !== modulo),
    }))
    setMessage(`Módulo "${modulo}" removido!`)
  }

  // Criar flashcard
  const createFlashcard = async () => {
    if (!flashcardForm.materia || !flashcardForm.modulo || !flashcardForm.pergunta || !flashcardForm.resposta) {
      setMessage('Preencha matéria, módulo, pergunta e resposta.')
      return
    }

    try {
      const cardsRef = collection(db, 'flashcards')
      await addDoc(cardsRef, {
        pergunta: flashcardForm.pergunta,
        resposta: flashcardForm.resposta,
        materia: flashcardForm.materia,
        modulo: flashcardForm.modulo,
        tags: [],
      })
      
      setFlashcardForm({
        materia: flashcardForm.materia, // Mantém a matéria selecionada
        modulo: flashcardForm.modulo, // Mantém o módulo selecionado
        pergunta: '',
        resposta: '',
      })
      setMessage('Flashcard criado com sucesso! Todos os usuários poderão vê-lo.')
    } catch (err) {
      setMessage('Erro ao criar flashcard.')
      console.error(err)
    }
  }

  const handleImport = async () => {
    try {
      const parsed = JSON.parse(jsonInput)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      const cardsRef = collection(db, 'flashcards')
      await Promise.all(
        list.map((card) =>
          addDoc(cardsRef, {
            ...card,
            tags: normalizeTags(card.tags),
          }),
        ),
      )
      setJsonInput('')
      setMessage('Flashcards importados com sucesso!')
    } catch (err) {
      setMessage('JSON inválido. Verifique a estrutura.')
    }
  }

  const createUser = async () => {
    if (!userForm.email || !userForm.password) {
      setMessage('Preencha email e senha.')
      return
    }

    try {
      const email = userForm.email.toLowerCase().trim()
      
      // Criar usuário no Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, userForm.password)
      const uid = userCredential.user.uid

      // Criar perfil no Firestore
      const userRef = doc(db, 'users', uid)
      await setDoc(userRef, {
        uid,
        email,
        displayName: userForm.name || email,
        role: userForm.role || 'student',
        favorites: [],
        createdAt: serverTimestamp(),
      })

      setUserForm({ email: '', password: '', name: '', role: 'student' })
      setMessage('Usuário criado com sucesso! O novo aluno já pode fazer login.')
    } catch (err) {
      console.error('Erro ao criar usuário:', err)
      if (err.code === 'auth/email-already-in-use') {
        setMessage('Este email já está cadastrado.')
      } else if (err.code === 'auth/weak-password') {
        setMessage('Senha muito fraca. Use pelo menos 6 caracteres.')
      } else {
        setMessage(`Erro ao criar usuário: ${err.message}`)
      }
    }
  }

  const removeUser = async (userUid) => {
    if (!window.confirm(`Deseja realmente excluir este usuário?`)) return
    try {
      // Deletar do Firestore (Firebase Auth precisa ser deletado manualmente no console)
      await deleteDoc(doc(db, 'users', userUid))
      setMessage('Usuário removido do sistema. Nota: Para remover completamente, delete também no Firebase Console > Authentication.')
    } catch (err) {
      setMessage(`Erro ao remover usuário: ${err.message}`)
    }
  }

  const removeCard = async (cardId) => {
    if (!window.confirm('Deseja realmente excluir este card?')) return
    await deleteDoc(doc(db, 'flashcards', cardId))
    setMessage('Card removido.')
  }

  // Salvar prompt/configuração do edital
  const handleSavePrompt = async () => {
    if (!editalPrompt.trim()) {
      setMessage('Digite as informações do concurso.')
      return
    }

    setSavingPrompt(true)
    setMessage('Salvando configuração...')

    try {
      const editalRef = doc(db, 'config', 'edital')
      await setDoc(editalRef, {
        prompt: editalPrompt.trim(),
        updatedAt: serverTimestamp(),
      })

      setMessage('Configuração salva com sucesso! A IA agora usará essas informações para responder perguntas.')
      setPromptStatus({
        saved: true,
        savedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error('Erro ao salvar prompt:', err)
      setMessage(`Erro ao salvar: ${err.message}`)
    } finally {
      setSavingPrompt(false)
    }
  }


  if (!isAdmin) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-alego-600">
          Acesso restrito à coordenação da mentoria.
        </p>
      </div>
    )
  }

  return (
    <section className="space-y-8">
      <div className="rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-alego-500">
          Painel administrativo
        </p>
        <h1 className="mt-2 text-3xl font-bold text-alego-700">
          Gerenciar flashcards e usuários
        </h1>
      </div>

      {message && (
        <div className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-600">
          {message}
        </div>
      )}

      {/* Configuração do Prompt da IA */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600">
          <DocumentTextIcon className="h-5 w-5" />
          Configuração da IA - Informações do Concurso
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Configure aqui as informações sobre o concurso ALEGO Policial Legislativo. A IA usará essas informações para responder perguntas dos alunos de forma precisa e objetiva.
        </p>
        
        {promptStatus?.saved && (
          <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm">
            <p className="font-semibold text-emerald-700">✓ Configuração salva</p>
            {promptStatus.savedAt && (
              <p className="text-xs text-emerald-600">
                Última atualização: {new Date(promptStatus.savedAt).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
            Informações do Concurso (Edital, Matérias, Datas, Requisitos, etc.)
          </label>
          <textarea
            value={editalPrompt}
            onChange={(e) => setEditalPrompt(e.target.value)}
            rows={15}
            placeholder="Exemplo de informações para incluir:

CONCURSO: ALEGO Policial Legislativo
ÓRGÃO: Assembleia Legislativa de Goiás
CARGO: Policial Legislativo

REQUISITOS:
- Ensino médio completo
- Idade mínima: 18 anos
- Idade máxima: 50 anos
- Altura mínima: 1,60m (homens) / 1,55m (mulheres)

MATÉRIAS DO CONCURSO:
1. Português
2. Área de Atuação (Polícia Legislativa)
3. Raciocínio Lógico
4. Direito Constitucional
5. Direito Administrativo
6. Legislação Estadual
7. Realidade de Goiás
8. Redação

DATAS IMPORTANTES:
- Inscrições: [data]
- Prova: [data]
- Resultado: [data]

INFORMAÇÕES ADICIONAIS:
[Adicione outras informações relevantes do edital, como salário, benefícios, número de vagas, etc.]"
            className="w-full rounded-xl border border-slate-200 p-4 text-sm focus:border-alego-400 focus:outline-none font-mono"
            disabled={savingPrompt}
          />
          <p className="mt-2 text-xs text-slate-400">
            💡 Dica: Cole aqui informações importantes do edital, como requisitos, datas, matérias cobradas, número de vagas, etc. A IA usará essas informações para responder perguntas dos alunos.
          </p>
        </div>
        
        <button
          type="button"
          onClick={handleSavePrompt}
          disabled={!editalPrompt.trim() || savingPrompt}
          className="mt-4 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {savingPrompt ? 'Salvando...' : 'Salvar Configuração'}
        </button>
      </div>

      {/* Gerenciar Módulos */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-lg font-bold text-alego-700">
          <PlusIcon className="h-6 w-6" />
          Gerenciar Módulos por Matéria
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Primeiro, adicione os módulos dentro de cada matéria. Depois você poderá criar flashcards atribuindo-os aos módulos.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            Selecionar Matéria
            <select
              value={selectedMateriaForModule}
              onChange={(e) => setSelectedMateriaForModule(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none"
            >
              <option value="">Selecione a matéria</option>
              {MATERIAS.map((materia) => (
                <option key={materia} value={materia}>
                  {materia}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Nome do Módulo
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addModule()}
                placeholder="Ex: Módulo 1, Aula 1, Capítulo 1..."
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={addModule}
                disabled={!selectedMateriaForModule || !newModuleName.trim()}
                className="rounded-xl bg-alego-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
          </label>
        </div>

        {/* Lista de módulos por matéria */}
        <div className="mt-6 space-y-4">
          {MATERIAS.map((materia) => {
            const modulos = modules[materia] || []
            if (modulos.length === 0) return null
            
            return (
              <div key={materia} className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 text-base font-bold text-alego-700">{materia}</h3>
                <div className="flex flex-wrap gap-2">
                  {modulos.map((modulo) => (
                    <div
                      key={modulo}
                      className="flex items-center gap-2 rounded-full bg-alego-100 px-4 py-2"
                    >
                      <span className="text-sm font-semibold text-alego-700">{modulo}</span>
                      <button
                        type="button"
                        onClick={() => removeModule(materia, modulo)}
                        className="text-rose-600 hover:text-rose-700"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Criar Flashcard */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-lg font-bold text-alego-700">
          <DocumentTextIcon className="h-6 w-6" />
          Criar Flashcard
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Selecione a matéria e o módulo (que você já criou acima), depois preencha o flashcard.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            Matéria *
            <select
              value={flashcardForm.materia}
              onChange={(e) => {
                setFlashcardForm((prev) => ({ ...prev, materia: e.target.value, modulo: '' }))
              }}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none"
            >
              <option value="">Selecione a matéria</option>
              {MATERIAS.map((materia) => (
                <option key={materia} value={materia}>
                  {materia}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Módulo *
            <select
              value={flashcardForm.modulo}
              onChange={(e) => setFlashcardForm((prev) => ({ ...prev, modulo: e.target.value }))}
              disabled={!flashcardForm.materia}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none disabled:bg-slate-50"
            >
              <option value="">{flashcardForm.materia ? 'Selecione o módulo' : 'Primeiro selecione a matéria'}</option>
              {flashcardForm.materia && (modules[flashcardForm.materia] || []).map((modulo) => (
                <option key={modulo} value={modulo}>
                  {modulo}
                </option>
              ))}
            </select>
            {flashcardForm.materia && (!modules[flashcardForm.materia] || modules[flashcardForm.materia].length === 0) && (
              <p className="mt-1 text-xs text-amber-600">
                Nenhum módulo criado para esta matéria. Crie módulos acima primeiro.
              </p>
            )}
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            Pergunta *
            <input
              type="text"
              value={flashcardForm.pergunta}
              onChange={(e) => setFlashcardForm((prev) => ({ ...prev, pergunta: e.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none"
              placeholder="Digite a pergunta..."
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Resposta *
            <input
              type="text"
              value={flashcardForm.resposta}
              onChange={(e) => setFlashcardForm((prev) => ({ ...prev, resposta: e.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none"
              placeholder="Digite a resposta..."
            />
          </label>
        </div>

        <button
          type="button"
          onClick={createFlashcard}
          disabled={!flashcardForm.materia || !flashcardForm.modulo || !flashcardForm.pergunta || !flashcardForm.resposta}
          className="mt-4 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Criar Flashcard
        </button>
      </div>

      {/* Gerenciamento de usuários */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600">
          <UserPlusIcon className="h-5 w-5" />
          Criar novo usuário
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase text-slate-500">
            Email
            <input
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-alego-400 focus:outline-none"
              placeholder="usuario@email.com"
            />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Senha
            <input
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-alego-400 focus:outline-none"
              placeholder="Senha do usuário"
            />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Nome
            <input
              type="text"
              value={userForm.name}
              onChange={(e) => setUserForm((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-alego-400 focus:outline-none"
              placeholder="Nome completo (opcional)"
            />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Tipo
            <input
              type="text"
              value="Aluno (padrão)"
              disabled
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              Todos os novos usuários são criados como alunos. Apenas o administrador principal tem acesso ao painel.
            </p>
          </label>
        </div>
        <button
          type="button"
          onClick={createUser}
          className="mt-4 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white"
        >
          Criar usuário
        </button>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-alego-600">
          {users.length} usuários cadastrados
        </p>
        <div className="mt-4 divide-y divide-slate-100">
          {users.map((user) => (
            <div
              key={user.uid || user.email}
              className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-semibold text-alego-700">{user.displayName || user.email}</p>
                <p className="text-sm text-slate-500">{user.email}</p>
                <span className="mt-1 inline-block rounded-full bg-alego-100 px-2 py-1 text-xs font-semibold text-alego-600">
                  {user.role === 'admin' ? 'Admin' : 'Aluno'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeUser(user.uid || user.email)}
                className="flex items-center gap-1 rounded-full border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-500"
              >
                <TrashIcon className="h-4 w-4" />
                Excluir
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Importar via JSON */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600">
          <DocumentTextIcon className="h-5 w-5" />
          Importar via JSON
        </p>
        <textarea
          value={jsonInput}
          onChange={(event) => setJsonInput(event.target.value)}
          rows={6}
          className="mt-3 w-full rounded-2xl border border-slate-200 p-4 text-sm focus:border-alego-400 focus:outline-none"
          placeholder='[{"pergunta":"...","resposta":"...","materia":"Português","modulo":"Módulo 1"}]'
        />
        <button
          type="button"
          onClick={handleImport}
          className="mt-4 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white"
        >
          Importar flashcards
        </button>
      </div>

      {/* Lista de cards */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-sm font-semibold text-alego-600">
            {cards.length} cards cadastrados
          </p>
          <p className="text-xs text-slate-500">
            Expanda a matéria e o módulo para visualizar e gerenciar os cards correspondentes.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {Object.keys(cardsOrganized).length === 0 && (
            <p className="text-sm text-slate-500">Nenhum card cadastrado ainda.</p>
          )}
          {Object.entries(cardsOrganized).map(([materia, modulos]) => {
            const totalCards = Object.values(modulos).reduce((acc, list) => acc + list.length, 0)
            const isMateriaOpen = expandedCardMaterias[materia]
            return (
              <div key={materia} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-3">
                <button
                  type="button"
                  onClick={() => toggleCardMateria(materia)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-alego-700">{materia}</p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      {totalCards} {totalCards === 1 ? 'card' : 'cards'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-alego-500">
                    {isMateriaOpen ? 'Ocultar' : 'Ver módulos'}
                  </span>
                </button>

                {isMateriaOpen && (
                  <div className="mt-3 space-y-2">
                    {Object.entries(modulos).map(([modulo, cardsList]) => {
                      const moduloKey = `${materia}::${modulo}`
                      const isModuloOpen = expandedCardModulos[moduloKey]
                      return (
                        <div key={modulo} className="rounded-xl border border-slate-100 bg-white">
                          <button
                            type="button"
                            onClick={() => toggleCardModulo(materia, modulo)}
                            className="flex w-full items-center justify-between px-4 py-3 text-left"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-700">{modulo}</p>
                              <p className="text-[11px] uppercase tracking-wide text-slate-400">
                                {cardsList.length} {cardsList.length === 1 ? 'card' : 'cards'}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-alego-500">
                              {isModuloOpen ? 'Ocultar' : 'Ver cards'}
                            </span>
                          </button>

                          {isModuloOpen && (
                            <div className="border-t border-slate-100 p-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                {cardsList.map((card) => (
                                  <div
                                    key={card.id}
                                    className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                                  >
                                    <p className="text-sm font-semibold text-alego-700">
                                      {card.pergunta}
                                    </p>
                                    <p className="mt-2 text-xs text-slate-500">
                                      {card.resposta}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                                      {card.tags?.map((tag) => (
                                        <span
                                          key={tag}
                                          className="rounded-full bg-alego-100 px-2 py-0.5 text-alego-700"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeCard(card.id)}
                                      className="mt-3 inline-flex items-center gap-1 rounded-full border border-rose-500 px-3 py-1 text-xs font-semibold text-rose-500"
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                      Excluir
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default AdminPanel
