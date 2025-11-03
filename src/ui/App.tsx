import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type Item = {
  id: number
  name: string
  description?: string
  category?: string
  type?: string
  lat: number
  lng: number
  photo_url?: string
}

type PlaceForm = {
  name: string
  description: string
  type: string
  photo_url: string
  lat: number | null
  lng: number | null
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const FALLBACK_ARTISANS: Item[] = [
  {
    id: 1,
    name: 'Artesanías de obsidiana',
    description: 'Tallado tradicional con piedra volcánica de la región.',
    category: 'Artesano',
    lat: 20.0568,
    lng: -99.3391,
    photo_url: ''
  }
]

const FALLBACK_PLACES: Item[] = [
  {
    id: 1,
    name: 'Zona Arqueológica de Tula',
    description: 'Hogar de los Atlantes de Tula y centro ceremonial tolteca.',
    type: 'Zona arqueológica',
    lat: 20.0624,
    lng: -99.3374,
    photo_url: ''
  }
]

const EMPTY_PLACE_FORM: PlaceForm = {
  name: '',
  description: '',
  type: '',
  photo_url: '',
  lat: null,
  lng: null
}

function createEmptyPlaceForm(): PlaceForm {
  return { ...EMPTY_PLACE_FORM }
}

function getRouteFromHash(){
  return window.location.hash === '#/super-admin' ? 'super-admin' : 'public'
}

export default function App(){
  const [route, setRoute] = useState<'public' | 'super-admin'>(() => getRouteFromHash())

  useEffect(() => {
    const handler = () => setRoute(getRouteFromHash())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  if(route === 'super-admin'){
    return <SuperAdminView onBack={() => { window.location.hash = '' }} />
  }

  return <PublicExplorer onOpenAdmin={() => { window.location.hash = '#/super-admin' }} />
}

type PublicExplorerProps = {
  onOpenAdmin: () => void
}

function PublicExplorer({ onOpenAdmin }: PublicExplorerProps){
  const [artisans, setArtisans] = useState<Item[]>([])
  const [places, setPlaces] = useState<Item[]>([])
  const [q, setQ] = useState('')
  const [selectedItem, setSelectedItem] = useState<(Item & {kind: string}) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstance = useRef<MapLibreMap | null>(null)

  const items = useMemo(() => {
    const a = artisans.map(a => ({ ...a, kind: 'Artesano' } as const))
    const p = places.map(p => ({ ...p, kind: 'Lugar' } as const))
    const all = [...a, ...p]
    if(!q) return all
    const qq = q.toLowerCase()
    return all.filter(i => {
      const desc = (i.description || '').toLowerCase()
      const meta = (i.category || i.type || '').toLowerCase()
      return i.name.toLowerCase().includes(qq) || desc.includes(qq) || meta.includes(qq)
    })
  }, [artisans, places, q])

  useEffect(() => {
    if(!selectedItem) return
    const stillExists = items.some(it => it.id === selectedItem.id && it.kind === selectedItem.kind)
    if(!stillExists){
      setSelectedItem(null)
    }
  }, [items, selectedItem])

  useEffect(() => {
    let cancelled = false

    async function loadData(){
      try {
        const [artisansRes, placesRes] = await Promise.all([
          fetch(`${API_URL}/artisans`),
          fetch(`${API_URL}/places`)
        ])

        if(!artisansRes.ok || !placesRes.ok){
          throw new Error('Respuesta no válida del servidor')
        }

        const [artisanData, placeData] = await Promise.all([
          artisansRes.json(),
          placesRes.json()
        ])

        if(!cancelled){
          setArtisans(Array.isArray(artisanData) ? artisanData : [])
          setPlaces(Array.isArray(placeData) ? placeData : [])
          setError(null)
        }
      } catch (err) {
        console.debug('No se pudieron cargar los datos remotos', err)
        if(!cancelled){
          setArtisans(FALLBACK_ARTISANS)
          setPlaces(FALLBACK_PLACES)
          setError('No se pudieron cargar los datos en vivo. Mostrando información de ejemplo.')
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if(!mapRef.current || mapInstance.current) return
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-99.3389, 20.0617],
      zoom: 12
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    const handleResize = () => map.resize()
    const observerSupported = typeof ResizeObserver !== 'undefined'
    const resizeObserver = observerSupported && mapRef.current ? new ResizeObserver(handleResize) : null
    if(resizeObserver && mapRef.current){
      resizeObserver.observe(mapRef.current)
    }
    window.addEventListener('resize', handleResize)

    mapInstance.current = map

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
      map.remove()
      mapInstance.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    if(!map) return

    const existing = (map as any)._publicMarkers as Marker[] | undefined
    existing?.forEach(marker => marker.remove())
    ;(map as any)._publicMarkers = []

    const markers: Marker[] = []
    items.forEach(item => {
      if(typeof item.lat !== 'number' || typeof item.lng !== 'number') return
      const el = document.createElement('div')
      el.className = `map-marker ${item.kind === 'Artesano' ? 'artisan' : 'place'}`
      el.addEventListener('click', () => focus(item as any))

      const popupContent = document.createElement('div')
      popupContent.className = 'map-popup'
      popupContent.innerHTML = `
        <div class="map-popup__title">${item.name}</div>
        <div class="map-popup__meta">${item.kind === 'Artesano' ? (item.category || 'Artesano local') : (item.type || 'Lugar de interés')}</div>
        ${item.description ? `<p>${item.description}</p>` : ''}
      `

      const marker = new maplibregl.Marker({ element: el })
      marker.setLngLat([item.lng, item.lat])
      marker.setPopup(new Popup({ offset: 18 }).setDOMContent(popupContent))
      marker.addTo(map)
      ;(map as any)._publicMarkers.push(marker)
      markers.push(marker)
    })

    return () => {
      markers.forEach(marker => marker.remove())
    }
  }, [items])

  function focus(item: Item & {kind: string}){
    if(!mapInstance.current) return
    mapInstance.current.flyTo({ center: [item.lng, item.lat], zoom: 15 })
    setSelectedItem(item)
  }

  return (
    <div className="page">
      <div className="header">
        <div className="branding">
          <h1>Tula Turismo</h1>
          <p>Explora artesanos, rincones y experiencias inolvidables.</p>
        </div>
        <div className="headerActions">
          <input
            className="search"
            type="text"
            placeholder="Buscar artesanos o lugares..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <button className="adminButton" onClick={onOpenAdmin}>Super Admin</button>
        </div>
      </div>
      <div className="container">
        <div className="sidebar">
          {error && <div className="message warning">{error}</div>}
          <div className="listHeader">
            <h2>Resultados</h2>
            <span>{items.length} elementos</span>
          </div>
          {items.length === 0 ? (
            <div className="message">No se encontraron resultados.</div>
          ) : (
            items.map(it => (
              <div
                key={`${it.kind}-${it.id}`}
                className={`item ${selectedItem && selectedItem.id === it.id && selectedItem.kind === it.kind ? 'active' : ''}`}
                onClick={() => focus(it as any)}
              >
                <div className="itemHeader">
                  <div>
                    <strong>{it.name}</strong>
                    <div className="itemMeta">{it.category || it.type || (it.kind === 'Artesano' ? 'Artesano local' : 'Lugar destacado')}</div>
                  </div>
                  <span className={`badge ${it.kind === 'Artesano' ? 'badge-artisan' : 'badge-place'}`}>{it.kind}</span>
                </div>
                {it.description && <p className="itemDescription">{it.description}</p>}
              </div>
            ))
          )}
        </div>
        <div className="map">
          <div ref={mapRef} className="mapCanvas" />
          <div className="footer">
            <div>
              <strong>Consejo:</strong> Da clic en un marcador para ver detalles.
            </div>
            <span>v{__APP_VERSION__}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

type SuperAdminViewProps = {
  onBack: () => void
}

function SuperAdminView({ onBack }: SuperAdminViewProps){
  const [token, setToken] = useState<string | null>(null)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginInfo, setLoginInfo] = useState<string | null>(null)
  const [places, setPlaces] = useState<Item[]>([])
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false)
  const [placesError, setPlacesError] = useState<string | null>(null)
  const [editingPlace, setEditingPlace] = useState<Item | null>(null)
  const [form, setForm] = useState<PlaceForm>(() => createEmptyPlaceForm())
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const selectionMarkerRef = useRef<Marker | null>(null)

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  const focusPlace = useCallback((place: Item) => {
    setEditingPlace(place)
    setForm({
      name: place.name || '',
      description: place.description || '',
      type: place.type || '',
      photo_url: place.photo_url || '',
      lat: typeof place.lat === 'number' ? place.lat : null,
      lng: typeof place.lng === 'number' ? place.lng : null
    })
    setStatusMessage(null)
    if(mapRef.current && typeof place.lat === 'number' && typeof place.lng === 'number'){
      mapRef.current.flyTo({ center: [place.lng, place.lat], zoom: 15 })
    }
  }, [])

  useEffect(() => {
    if(!mapContainerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-99.3389, 20.0617],
      zoom: 12.5
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('click', event => {
      const { lng, lat } = event.lngLat
      setForm(prev => ({ ...prev, lat, lng }))
      setStatusMessage(null)
    })
    mapRef.current = map
    const resize = () => map.resize()
    const observerSupported = typeof ResizeObserver !== 'undefined'
    const resizeObserver = observerSupported ? new ResizeObserver(resize) : null
    if(resizeObserver && mapContainerRef.current){
      resizeObserver.observe(mapContainerRef.current)
    }
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      resizeObserver?.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if(!token) return
    let cancelled = false
    async function loadPlaces(){
      setIsLoadingPlaces(true)
      setPlacesError(null)
      try {
        const response = await fetch(`${API_URL}/places`, { headers: { ...authHeaders } })
        if(!response.ok){
          throw new Error('No se pudo cargar el catálogo de lugares')
        }
        const data = await response.json()
        if(!cancelled){
          setPlaces(Array.isArray(data) ? data : [])
          if(!Array.isArray(data) || data.length === 0){
            setPlacesError('Aún no hay lugares registrados. Crea el primero usando el formulario.')
          }
        }
      } catch (err){
        console.error(err)
        if(!cancelled){
          setPlaces(FALLBACK_PLACES)
          setPlacesError('No se pudo obtener la información en vivo. Mostrando datos de ejemplo.')
        }
      } finally {
        if(!cancelled){
          setIsLoadingPlaces(false)
        }
      }
    }
    loadPlaces()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    const map = mapRef.current
    if(!map) return
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []

    places.forEach(place => {
      if(typeof place.lat !== 'number' || typeof place.lng !== 'number') return
      const el = document.createElement('div')
      el.className = `map-marker place ${editingPlace && editingPlace.id === place.id ? 'active' : ''}`
      el.addEventListener('click', () => focusPlace(place))

      const marker = new maplibregl.Marker({ element: el })
      marker.setLngLat([place.lng, place.lat])
      marker.addTo(map)
      markersRef.current.push(marker)
    })
  }, [places, editingPlace, focusPlace])

  useEffect(() => {
    const map = mapRef.current
    if(!map) return
    if(form.lat == null || form.lng == null){
      if(selectionMarkerRef.current){
        selectionMarkerRef.current.remove()
        selectionMarkerRef.current = null
      }
      return
    }

    if(!selectionMarkerRef.current){
      selectionMarkerRef.current = new maplibregl.Marker({ color: '#2563eb' })
      selectionMarkerRef.current.addTo(map)
    }
    selectionMarkerRef.current.setLngLat([form.lng, form.lat])
  }, [form.lat, form.lng])

  function resetForm(){
    setEditingPlace(null)
    setForm(createEmptyPlaceForm())
    setStatusMessage(null)
  }

  async function handleLogin(event: FormEvent){
    event.preventDefault()
    setIsAuthenticating(true)
    setLoginError(null)
    setLoginInfo(null)
    try {
      const response = await fetch(`${API_URL}/super-admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      })
      if(!response.ok){
        throw new Error('Credenciales no válidas')
      }
      const data = await response.json()
      if(!data || typeof data.token !== 'string'){
        throw new Error('Respuesta inválida del servidor')
      }
      setToken(data.token)
      setLoginInfo('Sesión iniciada correctamente.')
    } catch (err){
      console.error(err)
      if(loginForm.email === 'demo@tula.mx' && loginForm.password === 'demo123'){
        setToken('demo-local-token')
        setLoginInfo('Inicio de sesión en modo demostración. Recuerda configurar el endpoint real /super-admin/login en la API.')
      } else {
        setLoginError('No se pudo iniciar sesión. Verifica tus credenciales o el estado del servidor.')
      }
    } finally {
      setIsAuthenticating(false)
    }
  }

  function handleLogout(){
    setToken(null)
    setPlaces([])
    setForm(createEmptyPlaceForm())
    setEditingPlace(null)
    setStatusMessage(null)
    setLoginForm({ email: '', password: '' })
  }

  function handleLoginChange(field: 'email' | 'password', value: string){
    setLoginForm(prev => ({ ...prev, [field]: value }))
  }

  function handleFormChange(field: keyof PlaceForm, value: string){
    setForm(prev => ({
      ...prev,
      [field]: field === 'lat' || field === 'lng' ? Number(value) : value
    }))
  }

  async function handleSubmit(event: FormEvent){
    event.preventDefault()
    const trimmedName = form.name.trim()
    if(!trimmedName){
      setStatusMessage('Escribe el nombre del lugar antes de guardar.')
      return
    }
    if(form.lat == null || form.lng == null){
      setStatusMessage('Selecciona la ubicación del lugar haciendo clic en el mapa.')
      return
    }

    const payload: Item = {
      id: editingPlace?.id ?? 0,
      name: trimmedName,
      description: form.description.trim(),
      type: form.type.trim(),
      lat: form.lat,
      lng: form.lng,
      photo_url: form.photo_url.trim()
    }

    const method = editingPlace ? 'PUT' : 'POST'
    const url = `${API_URL}/places${editingPlace ? `/${editingPlace.id}` : ''}`

    setIsSaving(true)
    setStatusMessage(null)

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(payload)
      })

      if(!response.ok){
        throw new Error('No se pudo guardar el lugar en el servidor.')
      }

      const saved = await response.json().catch(() => payload)
      setPlaces(current => {
        if(editingPlace){
          return current.map(p => p.id === editingPlace.id ? { ...p, ...saved } : p)
        }
        return [...current, { ...saved, id: saved.id ?? Date.now() }]
      })
      setStatusMessage(editingPlace ? 'Lugar actualizado exitosamente.' : 'Lugar creado exitosamente.')
      if(!editingPlace){
        setForm(createEmptyPlaceForm())
        if(selectionMarkerRef.current){
          selectionMarkerRef.current.remove()
          selectionMarkerRef.current = null
        }
      }
    } catch (err){
      console.error(err)
      setPlaces(current => {
        if(editingPlace){
          return current.map(p => p.id === editingPlace.id ? { ...p, ...payload } : p)
        }
        return [...current, { ...payload, id: Date.now() }]
      })
      setStatusMessage('No se pudo contactar al servidor. El cambio se guardó localmente.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(place: Item){
    if(!window.confirm(`¿Eliminar "${place.name}"?`)) return
    setStatusMessage(null)
    setPlaces(current => current.filter(p => p.id !== place.id))
    if(selectionMarkerRef.current){
      selectionMarkerRef.current.remove()
      selectionMarkerRef.current = null
    }
    try {
      const response = await fetch(`${API_URL}/places/${place.id}`, {
        method: 'DELETE',
        headers: {
          ...authHeaders
        }
      })
      if(!response.ok){
        throw new Error('No se pudo eliminar en el servidor')
      }
      setStatusMessage('Lugar eliminado correctamente.')
      if(editingPlace && editingPlace.id === place.id){
        resetForm()
      }
    } catch (err){
      console.error(err)
      setStatusMessage('No se pudo contactar al servidor. El lugar se eliminó localmente.')
    }
  }

  return (
    <div className="superAdminPage">
      <header className="superAdminHeader">
        <div className="superAdminHeaderBrand">
          <h1>Panel Super Admin</h1>
          <p>Controla el catálogo oficial de lugares desde una experiencia dedicada.</p>
        </div>
        <div className="superAdminHeaderActions">
          <button className="ghostButton" onClick={onBack}>Volver al mapa público</button>
          {token ? (
            <button className="secondary" onClick={handleLogout}>Cerrar sesión</button>
          ) : null}
        </div>
      </header>
      {!token ? (
        <div className="superAdminLogin">
          <div className="superAdminLoginCard">
            <h2>Inicia sesión como Super Admin</h2>
            <p>Accede con tus credenciales para gestionar los lugares destacados.</p>
            {loginError && <div className="loginMessage error">{loginError}</div>}
            {loginInfo && <div className="loginMessage info">{loginInfo}</div>}
            <form onSubmit={handleLogin} className="loginForm">
              <label>
                Correo electrónico
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={e => handleLoginChange('email', e.target.value)}
                  placeholder="superadmin@tula.mx"
                  required
                />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={e => handleLoginChange('password', e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>
              <button type="submit" className="primary" disabled={isAuthenticating}>
                {isAuthenticating ? 'Verificando...' : 'Ingresar'}
              </button>
            </form>
            <p className="loginHint">Si el backend aún no expone el endpoint <code>/super-admin/login</code>, usa <code>demo@tula.mx</code> / <code>demo123</code> para acceder en modo demostración.</p>
          </div>
        </div>
      ) : (
        <div className="superAdminLayout">
          <aside className="superAdminSidebar">
            <div className="superAdminSidebarHeader">
              <h2>{editingPlace ? 'Editar lugar' : 'Nuevo lugar'}</h2>
              <p>Haz clic en el mapa para colocar el pin y completar la información del lugar.</p>
            </div>
            {statusMessage && <div className="superAdminStatus">{statusMessage}</div>}
            <form className="superAdminForm" onSubmit={handleSubmit}>
              <label>
                Nombre
                <input value={form.name} onChange={e => handleFormChange('name', e.target.value)} required />
              </label>
              <label>
                Descripción
                <textarea value={form.description} onChange={e => handleFormChange('description', e.target.value)} rows={3} />
              </label>
              <label>
                Tipo de lugar
                <input value={form.type} onChange={e => handleFormChange('type', e.target.value)} placeholder="Ej. Museo, Restaurante, Zona arqueológica" />
              </label>
              <label>
                URL de foto (opcional)
                <input value={form.photo_url} onChange={e => handleFormChange('photo_url', e.target.value)} type="url" placeholder="https://" />
              </label>
              <div className="superAdminCoords">
                <div>
                  <span>Latitud</span>
                  <strong>{form.lat != null ? form.lat.toFixed(6) : 'Selecciona un punto en el mapa'}</strong>
                </div>
                <div>
                  <span>Longitud</span>
                  <strong>{form.lng != null ? form.lng.toFixed(6) : 'Selecciona un punto en el mapa'}</strong>
                </div>
              </div>
              <p className="superAdminHint">Coloca el pin en el mapa para definir la ubicación exacta.</p>
              <div className="adminForm__actions">
                {editingPlace && <button type="button" className="danger" onClick={() => handleDelete(editingPlace)} disabled={isSaving}>Eliminar</button>}
                <div className="spacer" />
                <button type="submit" className="primary" disabled={isSaving}>
                  {isSaving ? 'Guardando…' : editingPlace ? 'Guardar cambios' : 'Crear lugar'}
                </button>
              </div>
            </form>
            <div className="superAdminList">
              <div className="superAdminListHeader">
                <h3>Lugares registrados</h3>
                <button type="button" onClick={resetForm}>Nuevo lugar</button>
              </div>
              {isLoadingPlaces ? (
                <p className="superAdminEmpty">Cargando catálogo…</p>
              ) : places.length === 0 ? (
                <p className="superAdminEmpty">Aún no hay lugares registrados.</p>
              ) : (
                <ul>
                  {places.map(place => (
                    <li key={place.id} className={editingPlace && editingPlace.id === place.id ? 'active' : ''}>
                      <div>
                        <strong>{place.name}</strong>
                        <span>{place.type || 'Lugar'}</span>
                      </div>
                      <button type="button" onClick={() => focusPlace(place)}>Editar</button>
                    </li>
                  ))}
                </ul>
              )}
              {placesError && <p className="superAdminEmpty warning">{placesError}</p>}
            </div>
          </aside>
          <section className="superAdminMap">
            <div ref={mapContainerRef} className="superAdminMapCanvas" />
            <div className="superAdminMapOverlay">
              <div>
                <strong>Selecciona la ubicación</strong>
                <p>Haz clic en cualquier punto para posicionar el pin azul. Puedes moverlo nuevamente con otro clic.</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
