
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { Marker, Popup } from 'maplibre-gl'
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

export default function App(){
  const [artisans, setArtisans] = useState<Item[]>([])
  const [places, setPlaces] = useState<Item[]>([])
  const [q, setQ] = useState('')
  const [selectedItem, setSelectedItem] = useState<(Item & {kind: string}) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false)
  const [editingPlace, setEditingPlace] = useState<Item | null>(null)
  const [adminMessage, setAdminMessage] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [placeForm, setPlaceForm] = useState({
    name: '',
    description: '',
    type: '',
    lat: '',
    lng: '',
    photo_url: ''
  })

  const items = useMemo(() => {
    const a = artisans.map(a => ({...a, kind:'Artesano'} as any))
    const p = places.map(p => ({...p, kind:'Lugar'} as any))
    const all = [...a, ...p]
    if(!q) return all
    const qq = q.toLowerCase()
    return all.filter(i => i.name.toLowerCase().includes(qq) || (i.description||'').toLowerCase().includes(qq) || (i.category||i.type||'').toLowerCase().includes(qq))
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
    if(!mapRef.current || map.current) return
    map.current = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-99.3389, 20.0617], // Tula
      zoom: 12
    })
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }),'top-right')
  }, [])

  useEffect(() => {
    if(!map.current || !(map.current instanceof maplibregl.Map)) return
    // clear existing markers by storing them in map instance
    // @ts-ignore
    if(map.current._customMarkers){ (map.current as any)._customMarkers.forEach((m:any)=>m.remove()) }
    // @ts-ignore
    (map.current as any)._customMarkers = []

    const markers: Marker[] = []
    items.forEach(i => {
      if(typeof i.lat !== 'number' || typeof i.lng !== 'number') return
      const el = document.createElement('div')
      el.className = `map-marker ${i.kind === 'Artesano' ? 'artisan' : 'place'}`
      try {
        const marker = new Marker({ element: el })
        if(typeof (marker as any).addTo !== 'function'){
          console.debug('Instancia de marcador inválida recibida', marker)
          return
        }
        marker.setLngLat([i.lng, i.lat])
        const popupContent = document.createElement('div')
        popupContent.className = 'map-popup'
        popupContent.innerHTML = `
          <div class="map-popup__title">${i.name}</div>
          <div class="map-popup__meta">${i.kind === 'Artesano' ? (i.category || 'Artesano local') : (i.type || 'Lugar de interés')}</div>
          ${i.description ? `<p>${i.description}</p>` : ''}
        `
        marker.setPopup(new Popup({ offset: 18 }).setDOMContent(popupContent))
        el.addEventListener('click', () => focus(i as any))
        marker.addTo(map.current!)
        // @ts-ignore
        (map.current as any)._customMarkers.push(marker)
        markers.push(marker)
      } catch (err) {
        console.debug('No se pudo crear un marcador en el mapa', err)
      }
    })
    return () => {
      markers.forEach(m => m.remove())
    }
  }, [items])

  function focus(item: Item & {kind:string}){
    if(!map.current) return
    map.current.flyTo({ center: [item.lng, item.lat], zoom: 15 })
    setSelectedItem(item)
  }

  function openCreateForm(){
    setEditingPlace(null)
    setPlaceForm({ name: '', description: '', type: '', lat: '', lng: '', photo_url: '' })
    setAdminMessage(null)
    setIsAdminPanelOpen(true)
  }

  function openEditForm(place: Item){
    setEditingPlace(place)
    setPlaceForm({
      name: place.name || '',
      description: place.description || '',
      type: place.type || '',
      lat: String(place.lat ?? ''),
      lng: String(place.lng ?? ''),
      photo_url: place.photo_url || ''
    })
    setAdminMessage(null)
    setIsAdminPanelOpen(true)
  }

  function closeAdminPanel(){
    setIsAdminPanelOpen(false)
    setEditingPlace(null)
    setAdminMessage(null)
  }

  function handlePlaceFormChange(field: string, value: string){
    setPlaceForm(prev => ({ ...prev, [field]: value }))
  }

  async function handlePlaceSubmit(event: FormEvent){
    event.preventDefault()
    const payload: Item = {
      id: editingPlace?.id ?? 0,
      name: placeForm.name.trim(),
      description: placeForm.description.trim(),
      type: placeForm.type.trim(),
      lat: Number(placeForm.lat),
      lng: Number(placeForm.lng),
      photo_url: placeForm.photo_url.trim()
    }

    if(!payload.name || Number.isNaN(payload.lat) || Number.isNaN(payload.lng)){
      setAdminMessage('Revisa que el nombre y las coordenadas sean válidos.')
      return
    }

    const method = editingPlace ? 'PUT' : 'POST'
    const url = `${API_URL}/places${editingPlace ? `/${editingPlace.id}` : ''}`

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
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
      setAdminMessage(editingPlace ? 'Lugar actualizado exitosamente.' : 'Lugar creado exitosamente.')
      if(!editingPlace){
        setPlaceForm({ name: '', description: '', type: '', lat: '', lng: '', photo_url: '' })
      }
    } catch (err){
      console.error(err)
      setPlaces(current => {
        if(editingPlace){
          return current.map(p => p.id === editingPlace.id ? { ...p, ...payload } : p)
        }
        return [...current, { ...payload, id: Date.now() }]
      })
      setAdminMessage('No se pudo contactar al servidor. El cambio se reflejará localmente.')
    }
  }

  async function handleDelete(place: Item){
    if(!window.confirm(`¿Eliminar "${place.name}"?`)) return

    setPlaces(current => current.filter(p => p.id !== place.id))
    try {
      const response = await fetch(`${API_URL}/places/${place.id}`, { method: 'DELETE' })
      if(!response.ok){
        throw new Error('No se pudo eliminar en el servidor')
      }
      setAdminMessage('Lugar eliminado correctamente.')
    } catch (err){
      console.error(err)
      setAdminMessage('No se pudo contactar al servidor. El lugar se eliminó localmente.')
    }
  }

  return (
    <div className="page">
      <div className="header">
        <div className="branding">
          <h1>Tula Turismo</h1>
          <p>Explora artesanos, rincones y experiencias inolvidables.</p>
        </div>
        <div className="headerActions">
          <input className="search" type="text" placeholder="Buscar artesanos o lugares..." value={q} onChange={e=>setQ(e.target.value)} />
          <button className="adminButton" onClick={openCreateForm}>Panel Super Admin</button>
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
            items.map((it:any) => (
              <div key={`${it.kind}-${it.id}`} className={`item ${selectedItem && selectedItem.id === it.id && selectedItem.kind === it.kind ? 'active' : ''}`} onClick={()=>focus(it)}>
                <div className="itemHeader">
                  <div>
                    <strong>{it.name}</strong>
                    <div className="itemMeta">{it.category || it.type || (it.kind === 'Artesano' ? 'Artesano local' : 'Lugar destacado')}</div>
                  </div>
                  <span className={`badge ${it.kind === 'Artesano' ? 'badge-artisan' : 'badge-place'}`}>{it.kind}</span>
                </div>
                {it.description && <p className="itemDescription">{it.description}</p>}
                {it.kind === 'Lugar' && (
                  <button className="ghostButton" onClick={(e)=>{ e.stopPropagation(); openEditForm(it) }}>Editar</button>
                )}
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
      {isAdminPanelOpen && (
        <div className="adminPanel">
          <div className="adminPanel__content">
            <div className="adminPanel__header">
              <div>
                <h3>{editingPlace ? 'Editar lugar' : 'Nuevo lugar'}</h3>
                <p>Gestiona el catálogo de lugares disponibles para los visitantes.</p>
              </div>
              <button className="closeButton" onClick={closeAdminPanel}>Cerrar</button>
            </div>
            {adminMessage && <div className="adminMessage">{adminMessage}</div>}
            <form className="adminForm" onSubmit={handlePlaceSubmit}>
              <label>
                Nombre
                <input value={placeForm.name} onChange={e=>handlePlaceFormChange('name', e.target.value)} required />
              </label>
              <label>
                Descripción
                <textarea value={placeForm.description} onChange={e=>handlePlaceFormChange('description', e.target.value)} rows={3} />
              </label>
              <label>
                Tipo de lugar
                <input value={placeForm.type} onChange={e=>handlePlaceFormChange('type', e.target.value)} placeholder="Ej. Museo, Restaurante, Zona arqueológica" />
              </label>
              <div className="grid">
                <label>
                  Latitud
                  <input value={placeForm.lat} onChange={e=>handlePlaceFormChange('lat', e.target.value)} required type="number" step="any" />
                </label>
                <label>
                  Longitud
                  <input value={placeForm.lng} onChange={e=>handlePlaceFormChange('lng', e.target.value)} required type="number" step="any" />
                </label>
              </div>
              <label>
                URL de foto (opcional)
                <input value={placeForm.photo_url} onChange={e=>handlePlaceFormChange('photo_url', e.target.value)} type="url" placeholder="https://" />
              </label>
              <div className="adminForm__actions">
                {editingPlace && <button type="button" className="danger" onClick={()=>handleDelete(editingPlace)}>Eliminar</button>}
                <div className="spacer" />
                <button type="submit" className="primary">{editingPlace ? 'Guardar cambios' : 'Crear lugar'}</button>
              </div>
            </form>
            {places.length > 0 && (
              <div className="adminPanel__list">
                <h4>Todos los lugares</h4>
                <ul>
                  {places.map(place => (
                    <li key={place.id}>
                      <div>
                        <strong>{place.name}</strong>
                        <span>{place.type || 'Lugar'}</span>
                      </div>
                      <button onClick={()=>openEditForm(place)}>Editar</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
