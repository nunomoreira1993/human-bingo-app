import { type FormEvent, useEffect, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  Download,
  Edit3,
  Lock,
  LogOut,
  Search,
  Settings,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react'
import './App.css'

type Role = 'player' | 'admin'
type GameStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'draft' | 'open' | 'closed'
type View = 'match' | 'mine' | 'ranking' | 'answers' | 'admin'

type ApiUser = {
  id: number
  name: string
  email?: string
  role?: Role
  active?: boolean
  passwordResetRequired?: boolean
}

type Fact = {
  id: number
  text: string
  active: boolean
  correctPersonId?: number
  correctPerson?: ApiUser
}

type Guess = {
  id: number
  factId: number
  selectedPersonId: number
  selectedPerson?: ApiUser
  fact?: Pick<Fact, 'id' | 'text'>
}

type Game = {
  id: number
  name: string
  status: GameStatus
  effectiveStatus: GameStatus
  closesAt: string | null
  isOpen: boolean
  isClosed: boolean
}

type RankingRow = {
  position: number
  playerId: number
  playerName: string
  correctAnswers: number
  submittedAnswers: number
  score: number
}

type ResultAnswer = {
  factId: number
  factText: string
  selectedPerson?: ApiUser | null
  correctPerson: ApiUser
  isCorrect?: boolean
  points?: number
}

type Stats = {
  players: number
  facts: number
  guesses: number
  averageProgress: number
}

type Notice = {
  tone: 'success' | 'error'
  text: string
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const emptyUserForm = {
  name: '',
  email: '',
  password: '',
  role: 'player' as Role,
  active: true,
}

const emptyFactForm = {
  text: '',
  correctPersonId: '',
  active: true,
}

async function apiRequest<T>(path: string, token?: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`/api${path}`, { ...options, headers })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(data?.message ?? 'Não foi possível concluir o pedido.')
  }

  return data as T
}

function normalizeStatus(status: GameStatus) {
  return String(status).toLowerCase()
}

function formatDeadline(value: string | null) {
  if (!value) return 'Sem prazo definido'

  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function toDatetimeLocal(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000

  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toApiDate(value: string) {
  return value ? new Date(value).toISOString() : null
}

function setMetaTag(selector: string, attribute: 'content', value: string) {
  const element = document.head.querySelector<HTMLMetaElement>(selector)

  if (element) {
    element.setAttribute(attribute, value)
  }
}

function updatePageMeta(title: string, description: string) {
  document.title = title
  setMetaTag('meta[name="description"]', 'content', description)
  setMetaTag('meta[property="og:title"]', 'content', title)
  setMetaTag('meta[property="og:description"]', 'content', description)
  setMetaTag('meta[name="twitter:title"]', 'content', title)
  setMetaTag('meta[name="twitter:description"]', 'content', description)
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('bingo_token') ?? '')
  const [user, setUser] = useState<ApiUser | null>(null)
  const [view, setView] = useState<View>('match')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [game, setGame] = useState<Game | null>(null)
  const [users, setUsers] = useState<ApiUser[]>([])
  const [facts, setFacts] = useState<Fact[]>([])
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [ranking, setRanking] = useState<RankingRow[]>([])
  const [answers, setAnswers] = useState<ResultAnswer[]>([])
  const [myResults, setMyResults] = useState<ResultAnswer[]>([])
  const [allGuesses, setAllGuesses] = useState<Guess[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [personSearch, setPersonSearch] = useState('')
  const [factSearch, setFactSearch] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [userForm, setUserForm] = useState(emptyUserForm)
  const [editingFactId, setEditingFactId] = useState<number | null>(null)
  const [factForm, setFactForm] = useState(emptyFactForm)
  const [gameForm, setGameForm] = useState({ name: 'Bingo Humano', status: 'draft', closesAt: '' })
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [canInstall, setCanInstall] = useState(false)

  const isAdmin = user?.role === 'admin'
  const closed = Boolean(game?.isClosed)
  const answeredCount = guesses.length
  const totalFacts = facts.length
  const progress = totalFacts ? Math.round((answeredCount / totalFacts) * 100) : 0
  const guessedByFact = new Map(guesses.map((guess) => [guess.factId, guess]))
  const filteredFacts = facts.filter((fact) => fact.text.toLowerCase().includes(factSearch.toLowerCase()))
  const filteredPeople = users.filter((person) => person.name.toLowerCase().includes(personSearch.toLowerCase()))

  useEffect(() => {
    const gameName = game?.name ?? 'Bingo Humano'
    const viewMeta: Record<View, { title: string; description: string }> = {
      match: {
        title: `Matches | ${gameName}`,
        description: 'Associa cada curiosidade à pessoa da equipa que achas correta.',
      },
      mine: {
        title: `As minhas respostas | ${gameName}`,
        description: 'Consulta e gere as tuas respostas submetidas no Bingo Humano.',
      },
      ranking: {
        title: `Ranking | ${gameName}`,
        description: closed
          ? 'Consulta a classificação final com respostas certas, submetidas e pontuação total.'
          : 'O ranking fica disponível quando o jogo fechar.',
      },
      answers: {
        title: `Respostas corretas | ${gameName}`,
        description: closed
          ? 'Vê a correspondência correta entre cada curiosidade e a respetiva pessoa.'
          : 'As respostas corretas ficam ocultas até ao fecho do jogo.',
      },
      admin: {
        title: `Administração | ${gameName}`,
        description: 'Gere jogadores, curiosidades, estado do jogo, estatísticas e exportação de resultados.',
      },
    }

    if (!token || !user) {
      updatePageMeta('Login | Bingo Humano', 'Descobre curiosidades da equipa, conversa com colegas e participa no desafio Bingo Humano.')
      return
    }

    if (user.passwordResetRequired) {
      updatePageMeta('Primeiro acesso | Bingo Humano', 'Define uma nova password antes de aceder ao jogo.')
      return
    }

    const meta = viewMeta[view]
    updatePageMeta(meta.title, meta.description)
  }, [closed, game?.name, token, user, view])

  useEffect(() => {
    if (!notice) return

    const timeout = window.setTimeout(() => {
      setNotice(null)
    }, 4000)

    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || Boolean(navigatorWithStandalone.standalone)

    if (isStandalone) return

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
      setCanInstall(true)
    }
    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setCanInstall(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  async function loadData(authToken = token) {
    if (!authToken) return

    setLoading(true)
    try {
      const meResponse = await apiRequest<{ user: ApiUser }>('/auth/me', authToken)

      setUser(meResponse.user)

      if (meResponse.user.passwordResetRequired) {
        setGame(null)
        setUsers([])
        setFacts([])
        setGuesses([])
        setRanking([])
        setAnswers([])
        setMyResults([])
        return
      }

      const [gameResponse, usersResponse, factsResponse, guessesResponse] = await Promise.all([
        apiRequest<{ game: Game }>('/game', authToken),
        apiRequest<{ users: ApiUser[] }>('/users', authToken),
        apiRequest<{ facts: Fact[] }>('/facts', authToken),
        apiRequest<{ guesses: Guess[] }>('/guesses/me', authToken),
      ])
      setGame(gameResponse.game)
      setUsers(usersResponse.users)
      setFacts(factsResponse.facts)
      setGuesses(guessesResponse.guesses)
      setGameForm({
        name: gameResponse.game.name,
        status: normalizeStatus(gameResponse.game.status),
        closesAt: toDatetimeLocal(gameResponse.game.closesAt),
      })

      if (gameResponse.game.isClosed) {
        const [rankingResponse, answersResponse, myResultsResponse] = await Promise.all([
          apiRequest<{ ranking: RankingRow[] }>('/results/ranking', authToken),
          apiRequest<{ answers: ResultAnswer[] }>('/results/answers', authToken),
          apiRequest<{ answers: ResultAnswer[] }>('/results/me', authToken),
        ])
        setRanking(rankingResponse.ranking)
        setAnswers(answersResponse.answers)
        setMyResults(myResultsResponse.answers)
      } else {
        setRanking([])
        setAnswers([])
        setMyResults([])
      }

      if (meResponse.user.role === 'admin') {
        const [guessesResponseAdmin, statsResponse] = await Promise.all([
          apiRequest<{ guesses: Guess[] }>('/guesses', authToken),
          apiRequest<{ stats: Stats }>('/admin/stats', authToken),
        ])
        setAllGuesses(guessesResponseAdmin.guesses)
        setStats(statsResponse.stats)
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Erro inesperado.' })
      if (error instanceof Error && error.message.includes('Sessão')) {
        handleLogout()
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [token])

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      const response = await apiRequest<{ token: string; user: ApiUser }>('/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      localStorage.setItem('bingo_token', response.token)
      setToken(response.token)
      setUser(response.user)
      setCurrentPassword(password)
      setView(response.user.role === 'admin' ? 'admin' : 'match')
      setNotice({ tone: 'success', text: response.user.passwordResetRequired ? 'Define uma nova password para continuar.' : 'Login efetuado.' })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível entrar.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleInstallApp() {
    if (!installPrompt) return

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)
    setCanInstall(false)

    if (choice.outcome === 'accepted') {
      setNotice({ tone: 'success', text: 'App instalada com sucesso.' })
    }
  }

  function handleLogout() {
    localStorage.removeItem('bingo_token')
    setToken('')
    setUser(null)
    setGame(null)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault()

    if (newPassword !== confirmPassword) {
      setNotice({ tone: 'error', text: 'A confirmação não coincide com a nova password.' })
      return
    }

    setLoading(true)
    try {
      const response = await apiRequest<{ token: string; user: ApiUser }>('/auth/change-password', token, {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      localStorage.setItem('bingo_token', response.token)
      setToken(response.token)
      setUser(response.user)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice({ tone: 'success', text: 'Password alterada. Já podes jogar.' })
      await loadData(response.token)
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível alterar a password.' })
    } finally {
      setLoading(false)
    }
  }

  async function saveGuess(factId: number, selectedPersonId: string) {
    if (!selectedPersonId) return

    try {
      await apiRequest('/guesses', token, {
        method: 'POST',
        body: JSON.stringify({ factId, selectedPersonId: Number(selectedPersonId) }),
      })
      setNotice({ tone: 'success', text: 'Resposta guardada.' })
      await loadData()
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível guardar.' })
    }
  }

  async function deleteGuess(id: number) {
    try {
      await apiRequest(`/guesses/${id}`, token, { method: 'DELETE' })
      setNotice({ tone: 'success', text: 'Resposta removida.' })
      await loadData()
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível remover.' })
    }
  }

  async function submitUser(event: FormEvent) {
    event.preventDefault()
    const body = {
      ...userForm,
      password: userForm.password || undefined,
    }

    try {
      await apiRequest(editingUserId ? `/users/${editingUserId}` : '/users', token, {
        method: editingUserId ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      })
      setNotice({ tone: 'success', text: editingUserId ? 'Jogador atualizado.' : 'Jogador criado.' })
      setEditingUserId(null)
      setUserForm(emptyUserForm)
      await loadData()
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Erro ao guardar jogador.' })
    }
  }

  async function submitFact(event: FormEvent) {
    event.preventDefault()
    try {
      await apiRequest(editingFactId ? `/facts/${editingFactId}` : '/facts', token, {
        method: editingFactId ? 'PUT' : 'POST',
        body: JSON.stringify({ ...factForm, correctPersonId: Number(factForm.correctPersonId) }),
      })
      setNotice({ tone: 'success', text: editingFactId ? 'Curiosidade atualizada.' : 'Curiosidade criada.' })
      setEditingFactId(null)
      setFactForm(emptyFactForm)
      await loadData()
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Erro ao guardar curiosidade.' })
    }
  }

  async function deleteUser(id: number) {
    await apiRequest(`/users/${id}`, token, { method: 'DELETE' })
    setNotice({ tone: 'success', text: 'Jogador desativado.' })
    await loadData()
  }

  async function deleteFact(id: number) {
    await apiRequest(`/facts/${id}`, token, { method: 'DELETE' })
    setNotice({ tone: 'success', text: 'Curiosidade desativada.' })
    await loadData()
  }

  async function submitGame(event: FormEvent) {
    event.preventDefault()
    try {
      await apiRequest('/game', token, {
        method: 'PUT',
        body: JSON.stringify({
          name: gameForm.name,
          status: gameForm.status,
          closesAt: toApiDate(gameForm.closesAt),
        }),
      })
      setNotice({ tone: 'success', text: 'Configuração do jogo atualizada.' })
      await loadData()
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Erro ao atualizar jogo.' })
    }
  }

  async function setGameStatus(status: 'open' | 'close') {
    try {
      await apiRequest(`/game/${status}`, token, { method: 'POST' })
      setNotice({ tone: 'success', text: status === 'open' ? 'Jogo aberto.' : 'Jogo fechado.' })
      await loadData()
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Erro ao alterar estado.' })
    }
  }

  async function exportCsv() {
    try {
      const response = await fetch('/api/results/export', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'bingo-humano-resultados.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Exportação indisponível.' })
    }
  }

  if (!token || !user) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="brand-mark">BH</div>
          <p className="eyebrow">Festa de equipa</p>
          <h1>Bingo Humano</h1>
          <p className="login-copy">Entra, fala com colegas e tenta ligar cada curiosidade à pessoa certa.</p>
          {canInstall && (
            <button className="install-button" type="button" onClick={() => void handleInstallApp()}>
              <Download size={18} /> Instalar app
            </button>
          )}
          <form className="form-stack" onSubmit={handleLogin}>
            {notice && <div className={`notice form-notice ${notice.tone}`}>{notice.text}</div>}
            <label>
              E-mail
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </label>
            <label>
              Password
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
            </label>
            <button className="primary-button" disabled={loading} type="submit">
              <Lock size={18} /> Entrar
            </button>
          </form>
        </section>
      </main>
    )
  }

  if (user.passwordResetRequired) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="brand-mark">BH</div>
          <p className="eyebrow">Primeiro acesso</p>
          <h1>Define a tua password</h1>
          <p className="login-copy">Por segurança, troca a password inicial antes de entrares no jogo.</p>
          {canInstall && (
            <button className="install-button" type="button" onClick={() => void handleInstallApp()}>
              <Download size={18} /> Instalar app
            </button>
          )}
          <form className="form-stack" onSubmit={handleChangePassword}>
            {notice && <div className={`notice form-notice ${notice.tone}`}>{notice.text}</div>}
            <label>
              Password atual
              <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" required />
            </label>
            <label>
              Nova password
              <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={8} required />
            </label>
            <label>
              Confirmar nova password
              <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={8} required />
            </label>
            <button className="primary-button" disabled={loading} type="submit">
              <Lock size={18} /> Guardar nova password
            </button>
            <button className="ghost-button" type="button" onClick={handleLogout}>Sair</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{game?.name ?? 'Bingo Humano'}</p>
          <h1>Olá, {user.name}</h1>
        </div>
        <button className="icon-button" type="button" onClick={handleLogout} aria-label="Terminar sessão">
          <LogOut size={20} />
        </button>
      </header>

      <section className={`status-strip ${closed ? 'closed' : 'open'}`}>
        <div>
          <strong>{closed ? 'Jogo fechado' : game?.isOpen ? 'Jogo aberto' : 'Jogo em preparação'}</strong>
          <span>Até {formatDeadline(game?.closesAt ?? null)}</span>
        </div>
        <div className="progress-ring" aria-label={`${answeredCount} de ${totalFacts} respondidas`}>
          {answeredCount}/{totalFacts}
        </div>
      </section>

      {canInstall && (
        <button className="install-button app-install-button" type="button" onClick={() => void handleInstallApp()}>
          <Download size={18} /> Instalar app
        </button>
      )}

      <nav className="tabbar" aria-label="Navegação principal">
        <button className={view === 'match' ? 'active' : ''} onClick={() => setView('match')} type="button">
          <Edit3 size={18} /> Matches
        </button>
        <button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')} type="button">
          <CheckCircle2 size={18} /> Minhas
        </button>
        <button className={view === 'ranking' ? 'active' : ''} onClick={() => setView('ranking')} type="button">
          <Trophy size={18} /> Ranking
        </button>
        <button className={view === 'answers' ? 'active' : ''} onClick={() => setView('answers')} type="button">
          <BarChart3 size={18} /> Respostas
        </button>
        {isAdmin && (
          <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')} type="button">
            <Settings size={18} /> Admin
          </button>
        )}
      </nav>

      {notice && <div className={`notice ${notice.tone}`}>{notice.text}</div>}

      {view === 'match' && (
        <section className="screen-stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Progresso</p>
              <h2>{answeredCount} de {totalFacts} curiosidades respondidas</h2>
            </div>
            <span className="pill">{progress}%</span>
          </div>
          <div className="search-grid">
            <label className="search-field">
              <Search size={18} />
              <input value={factSearch} onChange={(event) => setFactSearch(event.target.value)} placeholder="Filtrar curiosidades" />
            </label>
            <label className="search-field">
              <Search size={18} />
              <input value={personSearch} onChange={(event) => setPersonSearch(event.target.value)} placeholder="Pesquisar pessoa" />
            </label>
          </div>
          <div className="fact-list">
            {filteredFacts.map((fact) => {
              const guess = guessedByFact.get(fact.id)

              return (
                <article className="fact-card" key={fact.id}>
                  <p>{fact.text}</p>
                  <select
                    disabled={!game?.isOpen}
                    value={guess?.selectedPersonId ?? ''}
                    onChange={(event) => void saveGuess(fact.id, event.target.value)}
                  >
                    <option value="">Escolher pessoa</option>
                    {filteredPeople.map((person) => (
                      <option key={person.id} value={person.id}>{person.name}</option>
                    ))}
                  </select>
                  <span className={guess ? 'match-state done' : 'match-state'}>
                    {guess ? `Resposta: ${guess.selectedPerson?.name ?? 'guardada'}` : 'Por responder'}
                  </span>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {view === 'mine' && (
        <section className="screen-stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">As minhas respostas</p>
              <h2>{closed ? 'Resultado final' : 'Ainda podes alterar enquanto estiver aberto'}</h2>
            </div>
          </div>
          <div className="answer-list">
            {guesses.map((guess) => {
              const result = myResults.find((answer) => answer.factId === guess.factId)

              return (
                <article className="answer-card" key={guess.id}>
                  <div>
                    <p>{guess.fact?.text}</p>
                    <strong>{guess.selectedPerson?.name}</strong>
                    {closed && result && (
                      <span className={result.isCorrect ? 'result good' : 'result bad'}>
                        {result.isCorrect ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                        {result.isCorrect ? 'Certa' : `Correta: ${result.correctPerson.name}`}
                      </span>
                    )}
                  </div>
                  {!closed && <button className="ghost-button" onClick={() => void deleteGuess(guess.id)} type="button">Remover</button>}
                </article>
              )
            })}
            {!guesses.length && <p className="empty-state">Ainda não submeteste respostas.</p>}
          </div>
        </section>
      )}

      {view === 'ranking' && (
        <section className="screen-stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Classificação</p>
              <h2>{closed ? 'Ranking final' : 'Disponível após o fecho'}</h2>
            </div>
          </div>
          {closed ? (
            <div className="ranking-list">
              {ranking.map((row) => (
                <article className="ranking-row" key={row.playerId}>
                  <span className="rank">#{row.position}</span>
                  <div>
                    <strong>{row.playerName}</strong>
                    <small>{row.correctAnswers} certas · {row.submittedAnswers} submetidas</small>
                  </div>
                  <b>{row.score}</b>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">A pontuação fica escondida até ao fim do jogo.</p>
          )}
        </section>
      )}

      {view === 'answers' && (
        <section className="screen-stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Respostas corretas</p>
              <h2>{closed ? 'Mapa final das curiosidades' : 'Bloqueado durante o jogo'}</h2>
            </div>
          </div>
          {closed ? (
            <div className="fact-list">
              {answers.map((answer) => (
                <article className="fact-card compact" key={answer.factId}>
                  <p>{answer.factText}</p>
                  <strong>{answer.correctPerson.name}</strong>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">As respostas certas só aparecem depois do fecho.</p>
          )}
        </section>
      )}

      {view === 'admin' && isAdmin && (
        <section className="screen-stack admin-screen">
          <div className="admin-metrics">
            <article><Users size={20} /><strong>{stats?.players ?? 0}</strong><span>Jogadores</span></article>
            <article><Edit3 size={20} /><strong>{stats?.facts ?? 0}</strong><span>Curiosidades</span></article>
            <article><BarChart3 size={20} /><strong>{stats?.guesses ?? 0}</strong><span>Respostas</span></article>
          </div>

          <div className="admin-layout">
            <div className="admin-column">
          <form className="admin-panel" onSubmit={submitGame}>
            <h2>Configuração do jogo</h2>
            <label>Nome<input value={gameForm.name} onChange={(event) => setGameForm({ ...gameForm, name: event.target.value })} /></label>
            <label>Estado<select value={gameForm.status} onChange={(event) => setGameForm({ ...gameForm, status: event.target.value })}><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select></label>
            <label>Fecho<input type="datetime-local" value={gameForm.closesAt} onChange={(event) => setGameForm({ ...gameForm, closesAt: event.target.value })} /></label>
            <div className="button-row">
              <button className="primary-button" type="submit">Guardar</button>
              <button className="ghost-button" type="button" onClick={() => void setGameStatus('open')}>Abrir</button>
              <button className="danger-button" type="button" onClick={() => void setGameStatus('close')}>Fechar</button>
            </div>
          </form>

            <form className="admin-panel" onSubmit={submitUser}>
              <h2>{editingUserId ? 'Editar jogador' : 'Criar jogador'}</h2>
              <label>Nome<input value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} required /></label>
              <label>E-mail<input value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} type="email" required /></label>
              <label>Password<input value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} type="password" required={!editingUserId} /></label>
              <label>Role<select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value as Role })}><option value="player">Player</option><option value="admin">Admin</option></select></label>
              <button className="primary-button" type="submit">Guardar jogador</button>
            </form>

            <div className="admin-panel admin-list-section">
              <h2>Lista de utilizadores</h2>
              <div className="admin-list">
                {users.map((person) => (
                  <article key={person.id}>
                    <div><strong>{person.name}</strong><small>{person.email} · {person.role} · <span className={person.active ? 'state-active' : 'state-inactive'}>{person.active ? 'Ativo' : 'Inativo'}</span></small></div>
                    <div className="button-row compact-row">
                      <button className="ghost-button" type="button" onClick={() => { setEditingUserId(person.id); setUserForm({ name: person.name, email: person.email ?? '', password: '', role: person.role ?? 'player', active: person.active ?? true }) }}>Editar</button>
                      <button className="danger-button" type="button" onClick={() => void deleteUser(person.id)}>Remover</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="admin-column">
            <form className="admin-panel" onSubmit={submitFact}>
              <h2>{editingFactId ? 'Editar curiosidade' : 'Criar curiosidade'}</h2>
              <label>Curiosidade<textarea value={factForm.text} onChange={(event) => setFactForm({ ...factForm, text: event.target.value })} required /></label>
              <label>Pessoa correta<select value={factForm.correctPersonId} onChange={(event) => setFactForm({ ...factForm, correctPersonId: event.target.value })} required><option value="">Selecionar</option>{users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
              <button className="primary-button" type="submit">Guardar curiosidade</button>
            </form>

            <div className="admin-panel admin-list-section">
              <h2>Lista de curiosidades</h2>
              <div className="admin-list">
                {facts.map((fact) => (
                  <article key={fact.id}>
                    <div><strong>{fact.text}</strong><small>{fact.correctPerson?.name ?? 'Sem pessoa'} · <span className={fact.active ? 'state-active' : 'state-inactive'}>{fact.active ? 'Ativa' : 'Inativa'}</span></small></div>
                    <div className="button-row compact-row">
                      <button className="ghost-button" type="button" onClick={() => { setEditingFactId(fact.id); setFactForm({ text: fact.text, correctPersonId: String(fact.correctPersonId ?? ''), active: fact.active }) }}>Editar</button>
                      <button className="danger-button" type="button" onClick={() => void deleteFact(fact.id)}>Remover</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>

          <div className="admin-panel">
            <h2>Respostas e exportação</h2>
            <button className="primary-button" type="button" onClick={() => void exportCsv()} disabled={!closed}>
              <Download size={18} /> Exportar CSV
            </button>
            <div className="admin-list flat">
              {allGuesses.slice(0, 20).map((guess) => (
                <article key={guess.id}>
                  <div><strong>{guess.selectedPerson?.name}</strong><small>{guess.fact?.text}</small></div>
                </article>
              ))}
            </div>
          </div>
          </div>
          </div>
        </section>
      )}

      {loading && <div className="loading">A atualizar...</div>}
    </main>
  )
}

export default App
