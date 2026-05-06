import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import './App.css'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getCities, getDistrictsByCityCode } from 'turkey-neighbourhoods'
import { StatusBar as CapStatusBar, Style } from '@capacitor/status-bar'
import { Network } from '@capacitor/network'
import { Keyboard } from '@capacitor/keyboard'

// Leaflet ikon düzeltmesi
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const sahaIkonu = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})





export default function App() {
  const [kullanici, setKullanici] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [aktifEkran, setAktifEkran] = useState('anasayfa')
  const [seciliMac, setSeciliMac] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [maclar, setMaclar] = useState([])
  const [bildirimler, setBildirimler] = useState([])
  const [okunmamisSayisi, setOkunmamisSayisi] = useState(0)
  const [hedefKullanici, setHedefKullanici] = useState(null)
  const [seciliOzelMesaj, setSeciliOzelMesaj] = useState(null)
  const [degerlendirmeMac, setDegerlendirmeMac] = useState(null)
  const [degerlendirmeKatilimcilar, setDegerlendirmeKatilimcilar] = useState([])
  const [online, setOnline] = useState(true)
  const [toast, setToast] = useState(null)
  const [onboardingBitti, setOnboardingBitti] = useState(!!localStorage.getItem('onboarding_done'))
  const [klavyeYuksekligi, setKlavyeYuksekligi] = useState(0)

useEffect(() => {
  let listener

  const setup = async () => {
    const status = await Network.getStatus()
    setOnline(status.connected)
    listener = await Network.addListener('networkStatusChange', status => {
      setOnline(status.connected)
    })
  }

  setup()

  return () => {
    if (listener) listener.remove()
  }
}, [])

useEffect(() => {
  CapStatusBar.setOverlaysWebView({ overlay: false })
  CapStatusBar.setBackgroundColor({ color: '#f8f8f6' })
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  CapStatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
  const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '44')
  document.documentElement.style.setProperty('--safe-top', safeTop + 'px')
  Keyboard.setResizeMode({ mode: 'none' })
}, [])

useEffect(() => {
  Keyboard.addListener('keyboardWillShow', info => {
    setKlavyeYuksekligi(info.keyboardHeight)
  })
  Keyboard.addListener('keyboardWillHide', () => {
    setKlavyeYuksekligi(0)
  })
  return () => {
    Keyboard.removeAllListeners()
  }
}, [])

useEffect(() => {
  document.body.style.position = 'fixed'
  document.body.style.width = '100%'
  document.body.style.height = '100%'
}, [])

useEffect(() => {
  const fix = () => {
    document.documentElement.style.height = window.innerHeight + 'px'
  }
  fix()
  window.addEventListener('resize', fix)
  window.addEventListener('focus', fix)
  return () => {
    window.removeEventListener('resize', fix)
    window.removeEventListener('focus', fix)
  }
}, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setKullanici(session?.user ?? null)
      setYukleniyor(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setKullanici(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const toastGoster = (mesaj, tip = 'hata') => {
  setToast({ mesaj, tip })
  setTimeout(() => setToast(null), 3000)
}

useEffect(() => {
  if (!kullanici) return

  const bildirimleriGetir = async () => {
    const { data } = await supabase
      .from('bildirimler')
      .select('*')
      .eq('kullanici_id', kullanici.id)
      .order('olusturuldu', { ascending: false })
    setBildirimler(data || [])
    setOkunmamisSayisi((data || []).filter(b => !b.okundu).length)
  }

  bildirimleriGetir()

const adminKontrol = async () => {
  const { data: profilData } = await supabase
    .from('kullanicilar')
    .select('rol')
    .eq('id', kullanici.id)
    .single()
  setIsAdmin(profilData?.rol === 'admin')
}
adminKontrol()

  const kanal = supabase
    .channel(`bildirimler-${kullanici.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'bildirimler',
      filter: `kullanici_id=eq.${kullanici.id}`
    }, (payload) => {
      setBildirimler(prev => [payload.new, ...prev])
      if (navigator.vibrate) navigator.vibrate(200)
      try {
        const ses = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3')
        ses.volume = 0.3
        ses.play()
      } catch(e) {}
      setOkunmamisSayisi(prev => prev + 1)
    })
    .subscribe()

  return () => supabase.removeChannel(kanal)
}, [kullanici])

if (!onboardingBitti) return (
  <div style={st.kapsayici}>
    <div style={st.telefon}>
      <OnboardingSayfa onBitti={() => setOnboardingBitti(true)} />
    </div>
  </div>
)

  if (yukleniyor) return (
    <div style={st.kapsayici}>
      <div style={st.telefon}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#aaa', fontSize: 14 }}>Yükleniyor...</p>
        </div>
      </div>
    </div>
  )

  return (
    <div style={st.kapsayici}>
      <div style={st.telefon}>
      {!online && (
            <div style={{ background: '#1a1a1a', padding: '8px 22px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>İnternet bağlantısı yok</span>
            </div>
          )}
          {toast && (
            <div style={{ position: 'fixed', bottom: 90, left: 16, right: 16, zIndex: 9999, background: toast.tip === 'hata' ? '#1a1a1a' : '#1D9E75', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
              <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{toast.mesaj}</span>
            </div>
          )}
        <StatusBar />
        {aktifEkran === 'giris' ? (
  <GirisSayfa setKullanici={setKullanici} geriDon={() => setAktifEkran('anasayfa')} />
) : (
          <>
          {aktifEkran === 'anasayfa' && (
           <AnaSayfa
  kullanici={kullanici}
  toastGoster={toastGoster}
  macaGit={(mac) => {
  if (!kullanici) { setAktifEkran('giris'); return }
  setSeciliMac(mac); setAktifEkran('detay')
}}
  onMaclarYuklendi={(data) => setMaclar(data)}
  setAktifEkran={setAktifEkran}
/>
)}
{aktifEkran === 'admin' && isAdmin && (
  <AdminSayfa kullanici={kullanici} />
)}
            {aktifEkran === 'detay' && seciliMac && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: klavyeYuksekligi, zIndex: 100, display: 'flex', flexDirection: 'column', transition: 'bottom 0.25s ease' }}>
                <DetaySayfa
                  mac={seciliMac}
                  kullanici={kullanici}
                  geriDon={() => setAktifEkran('anasayfa')}
                  onKullaniciTikla={(id) => setHedefKullanici(id)}
                  klavyeYuksekligi={klavyeYuksekligi}
                />
              </div>
            )}
            {aktifEkran === 'ilan' && kullanici && (
              <IlanSayfa
                kullanici={kullanici}
                bitti={() => setAktifEkran('anasayfa')}
                geriDon={() => setAktifEkran('anasayfa')}
              />
            )}
              {aktifEkran === 'bildirim' && kullanici && (
              <BildirimSayfa
                kullanici={kullanici}
                onKullaniciTikla={(id) => setHedefKullanici(id)}
                bildirimler={bildirimler}
                setBildirimler={setBildirimler}
                setOkunmamisSayisi={setOkunmamisSayisi}
                onBildirimTikla={(mac, aktifTab) => {
              setSeciliMac({ ...mac, baslangicTab: aktifTab })
              setAktifEkran('detay')
            }}
              />
            )}
            {aktifEkran === 'harita' && (
              <HaritaSayfa
                maclar={maclar}
                geriDon={() => setAktifEkran('anasayfa')}
                macaGit={(mac) => { setSeciliMac(mac); setAktifEkran('detay') }}
              />
            )}
            {aktifEkran === 'profil' && kullanici && (
                <ProfilSayfa 
            kullanici={kullanici} 
            setKullanici={setKullanici}
            setAktifEkran={setAktifEkran}
            onDegerlendirmeAc={(mac, katilimcilar) => {
              setDegerlendirmeMac(mac)
              setDegerlendirmeKatilimcilar(katilimcilar)
            }}
          />)}
           {aktifEkran === 'arkadaslar' && kullanici && (
             <ArkadaslarSayfa
  kullanici={kullanici}
  klavyeYuksekligi={klavyeYuksekligi}
  onKullaniciTikla={(id) => setHedefKullanici(id)}
  geriDon={() => setAktifEkran('anasayfa')}
  onMesajAc={(karsi) => setSeciliOzelMesaj(karsi)}
/>
            )}

            {seciliOzelMesaj && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: klavyeYuksekligi, background: '#f8f8f6', zIndex: 1001, display: 'flex', flexDirection: 'column', transition: 'bottom 0.25s ease' }}>
           <OzelMesajSayfa
              kullanici={kullanici}
              karsi={seciliOzelMesaj}
              klavyeYuksekligi={klavyeYuksekligi}
              geriDon={() => setSeciliOzelMesaj(null)}
              onKullaniciTikla={(id) => setHedefKullanici(id)}
            />
           </div>
            )}

            {degerlendirmeMac && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#f8f8f6', zIndex: 250, display: 'flex', flexDirection: 'column' }}>
                  <DegerlendirmeSayfa
                    kullanici={kullanici}
                    mac={degerlendirmeMac}
                    katilimcilar={degerlendirmeKatilimcilar}
                    geriDon={() => setDegerlendirmeMac(null)}
                  />
                </div>
              )}

{hedefKullanici && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#f8f8f6', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
                <KullaniciProfil
                    kullanici={kullanici}
                    hedefId={hedefKullanici}
                    geriDon={() => setHedefKullanici(null)}
                    onKullaniciTikla={(id) => setHedefKullanici(id)}
                    onMesajAc={(karsi) => {
                      setHedefKullanici(null)
                      setSeciliOzelMesaj(karsi)
                    }}
                  />
              </div>
            )}

{!seciliOzelMesaj && aktifEkran !== 'detay' && (
  <div style={{ position: 'relative', zIndex: 999, flexShrink: 0, background: '#fff', transform: 'translateZ(0)' }}>
    <AltNav aktifEkran={aktifEkran} setAktifEkran={setAktifEkran} okunmamisSayisi={okunmamisSayisi} kullanici={kullanici} isAdmin={isAdmin} />
  </div>
)}
</>
        )}
      </div>
    </div>
  )
}

function StatusBar() {
  return null
}

function OnboardingSayfa({ onBitti }) {
  const [aktif, setAktif] = useState(0)
  const [animasyon, setAnimasyon] = useState(null)

  const slides = [
    {
      baslik: 'Sahaya Gel',
      aciklama: 'Yakınındaki futbol maçlarını bul, tek dokunuşla katıl',
      renk: 'linear-gradient(160deg, #1D9E75, #0a7055)',
svg: (
  <svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260">
    <g>
      <path d="M250.81,70.42h-22.16c-.36,1-.76,2-1.19,3h23.35c4.15,0,7.52,3.38,7.52,7.53v139.88c0,4.15-3.37,7.53-7.52,7.53H49.19c-4.15,0-7.52-3.38-7.52-7.53V80.95c0-4.15,3.37-7.53,7.52-7.53h121.99c-.43-1.01-.82-2.01-1.18-3H49.19c-5.8,0-10.52,4.73-10.52,10.53v139.88c0,5.8,4.72,10.53,10.52,10.53h201.62c5.8,0,10.52-4.73,10.52-10.53V80.95c0-5.8-4.72-10.53-10.52-10.53ZM200.72,70.42c-.46.05-.92.08-1.39.08s-.93-.03-1.39-.08h-25.82c.37.99.78,1.99,1.23,3h51.95c.44-1,.85-2,1.23-3h-25.81Z" fill="#fff"/>
      <path d="M231.16,114.08c-5.8,0-10.53,4.72-10.53,10.53v52.57c0,5.8,4.73,10.52,10.53,10.52h29.06v-73.62h-29.06ZM257.22,184.7h-26.06c-4.15,0-7.53-3.37-7.53-7.52v-52.57c0-4.16,3.38-7.53,7.53-7.53h26.06v67.62Z" fill="#fff"/>
      <path d="M67.99,114.08h-29.07v73.62h29.07c5.8,0,10.52-4.72,10.52-10.52v-52.57c0-5.81-4.72-10.53-10.52-10.53ZM75.51,177.18c0,4.15-3.37,7.52-7.52,7.52h-26.07v-67.62h26.07c4.15,0,7.52,3.37,7.52,7.53v52.57Z" fill="#fff"/>
      <rect x="148.5" y="71.6" width="3" height="158.58" fill="#fff"/>
      <path d="M151.5,116.36c-.5-.03-1-.04-1.5-.04s-1,.01-1.5.04c-18.37.78-33.07,15.97-33.07,34.53s14.7,33.75,33.07,34.53c.5.03,1,.04,1.5.04s1-.01,1.5-.04c18.37-.78,33.07-15.97,33.07-34.53s-14.7-33.75-33.07-34.53ZM151.5,182.42c-.5.03-1,.04-1.5.04s-1-.01-1.5-.04c-16.72-.78-30.07-14.62-30.07-31.53s13.35-30.75,30.07-31.53c.5-.03,1-.04,1.5-.04s1,.01,1.5.04c16.72.78,30.07,14.62,30.07,31.53s-13.35,30.75-30.07,31.53Z" fill="#fff"/>
    </g>
    <path d="M211.78,31.41c-3.99-1.86-8.23-2.77-12.43-2.77-7.79,0-15.46,3.1-21.15,8.93-6.09,6.24-9.32,14.86-8.44,23.61.28,2.86,1.12,5.98,2.36,9.24.37.99.78,1.99,1.23,3,5.61,12.78,16.38,27.04,23.4,35.51.69.82,1.63,1.24,2.57,1.24s1.93-.43,2.65-1.3c6.04-7.32,11.57-14.73,16.52-22.73,2.22-3.61,4.78-8.1,6.81-12.72.44-1,.85-2,1.23-3,1.24-3.24,2.14-6.46,2.4-9.4,1.11-12.46-5.86-24.33-17.15-29.61ZM199.33,70.5c-.47,0-.93-.03-1.39-.08-6.03-.69-10.72-5.81-10.72-12.03,0-6.69,5.42-12.11,12.11-12.11s12.11,5.42,12.11,12.11c0,6.22-4.69,11.34-10.72,12.03-.46.05-.92.08-1.39.08Z" fill="#fff"/>
  </svg>
)
    },
    {
      baslik: 'İlan Aç',
      aciklama: 'Eksik oyuncun mu var? İlan aç, doğru oyuncular seni bulsun',
      renk: 'linear-gradient(160deg, #185FA5, #0d3d6b)',
    svg: (
  <svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260">
    <path d="M149.14,204.49c4.62,6.81,4.02,15.61-1.82,21.24-3.1,2.99-7.11,4.21-11.48,4.74-4.84-.78-9.87-2.62-12.82-6.96l-29.31-43c-12.18,7.98-27.85,4.4-35.82-7.49-7.76-11.58-5.58-26.95,5.83-35.35l18.75-12.75,32.4-65.4c2.38-4.81,8.52-6.71,13.38-6.73,11.8-.07,24.76,9.12,32.99,16.94,13.94,13.25,24.76,29.44,31.68,47.39,3.95,10.24,7.39,25.74,2.57,35.98-2,4.24-5.91,8.77-10.98,9.19l-60.53,5.06,25.17,37.13ZM188.34,147.61c3.48-9.34-.49-23.12-4.37-31.82-8.37-18.76-23.5-39.59-41.37-50.29-3.74-2.24-7.63-3.88-11.87-4.62-5.68-1-10.68,2.5-11.71,8.14-1.8,9.8,1.46,21.52,5.42,30.66,6.34,14.61,15.27,27.8,26.56,39.02,6.48,6.44,18.48,15.9,27.76,16.24,4.41.16,8.06-3.23,9.59-7.32ZM160.46,156.49c-6.81-4.74-12.3-9.18-17.63-14.81-10.33-10.94-18.66-23.32-24.86-37.03-2.97-6.7-4.98-13.16-6.62-20.66l-21.26,43.36,22.42,32.99,47.95-3.84ZM89.88,173.7l15.13-10.34-20.54-30.22-15.52,10.54c-8.43,5.78-10.03,16.74-4.42,25.02,5.74,8.48,16.6,10.98,25.34,5ZM143.09,209.66l-28.01-41.38c-.93-.15-2.77-.31-3.46.16l-11.36,7.75,28.81,42.43c2.62,3.86,7.59,4.8,11.38,2.43,3.53-2.21,5.38-7.34,2.64-11.39Z" fill="#fff"/>
    <path d="M206.35,81.05c-2.02,1.32-4.53.07-5.38-1.27-1.29-2.06-.63-4.32,1.36-5.63l27.24-17.87c1.97-1.3,4.45-.45,5.51,1.31,1.13,1.88.64,4.23-1.35,5.53l-27.39,17.93Z" fill="#fff"/>
    <path d="M243.98,105.66c2.27.41,3.01,3.01,2.63,4.64-.43,1.84-2.36,3.41-4.61,3.01l-32.17-5.8c-2.26-.41-3.28-2.87-2.9-4.61.46-2.1,2.37-3.5,4.68-3.08l32.37,5.84Z" fill="#fff"/>
    <path d="M188.39,59.57c-.26,2.56-2.03,4.01-4.25,3.9s-3.84-2.02-3.59-4.44l2.98-29.27c.24-2.34,2.04-3.89,4.16-3.77,2.26.13,3.94,2.07,3.69,4.52l-2.99,29.06Z" fill="#fff"/>
    <path d="M154.67,123.96c6.31-4.39,7.67-12.75,3.61-18.74s-12.57-7.82-18.88-3.62c-1.97,1.31-4.51.59-5.61-1.38-1.02-1.82-.46-4.1,1.54-5.39,9.91-6.4,23.12-3.67,29.62,6.04,6.42,9.61,4.08,22.78-5.67,29.49-1.79,1.23-4.12.89-5.4-.7s-1.27-4.28.79-5.71Z" fill="#fff"/>
  </svg>
)

    },
    {
      baslik: 'Arkadaş Edin',
      aciklama: 'Maçlarda tanıştığın oyuncularla bağlantı kur, takımını oluştur',
      renk: 'linear-gradient(160deg, #e67e22, #d35400)',
     svg: (
  <svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260">
    <path d="M161.65,170.25c-5.41-9.93-13.62-18.14-23.56-23.53,5.06-19.54,22.83-34.01,43.93-34.01.86,0,1.71-.04,2.55-.09.84.06,1.69.09,2.55.09,25.53,0,36.32,17.73,41.88,29.81,1.3,2.81,4.18,3.34,7.06,2.18h0c3.87-1.56,5.02-5.94,3.44-9.8-2.74-6.68-5.74-10.85-12.51-18.04-5.94-6.32-14.3-10.54-20.36-13.24,8.17-6.97,13.36-17.32,13.36-28.87,0-20.93-17.04-37.97-37.97-37.97s-37.97,17.04-37.97,37.97c0,12.12,5.7,22.92,14.56,29.88-3.71,1.63-7.23,3.65-10.49,5.98-.02.01-.03.02-.05.04-2.03-19.02-18.18-33.88-37.73-33.88-20.93,0-37.97,17.03-37.97,37.96,0,12.12,5.7,22.93,14.57,29.87-20.57,9.03-34.97,29.6-34.97,53.47v.94c0,13.36,10.87,24.23,24.23,24.23h68.28c13.35,0,24.22-10.87,24.22-24.23v-.94c0-5.12-.66-10.08-1.91-14.81-1.19-4.58-2.93-8.93-5.14-13ZM157.05,74.74c0-13.76,11.2-24.96,24.97-24.96s24.96,11.2,24.96,24.96-11.2,24.97-24.96,24.97-24.97-11.2-24.97-24.97ZM85.38,114.72c0-13.76,11.2-24.96,24.96-24.96s24.95,11.2,24.95,24.96-11.19,24.97-24.95,24.97-24.96-11.2-24.96-24.97ZM155.7,199c0,6.19-5.03,11.23-11.22,11.23h-68.28c-6.19,0-11.23-5.04-11.23-11.23v-.94c0-25.02,20.35-45.37,45.37-45.37,4.67,0,9.17.71,13.41,2.02,4.76,1.48,9.18,3.72,13.13,6.58,3.45,2.5,6.54,5.47,9.16,8.81,3.07,3.92,5.52,8.35,7.17,13.15,1.62,4.64,2.49,9.63,2.49,14.81v.94Z" fill="#fff"/>
    <path d="M248,185.78c-.29-3.32-3.29-5.75-6.62-5.75h-17.19c-3.43,0-6.22-2.78-6.22-6.22v-17.19c0-3.33-2.43-6.33-5.75-6.62-3.74-.33-6.88,2.62-6.88,6.29v17.51c0,3.43-2.78,6.22-6.22,6.22h-17.19c-3.33,0-6.33,2.43-6.62,5.75-.33,3.74,2.62,6.88,6.29,6.88h17.51c3.43,0,6.22,2.78,6.22,6.22v17.19c0,3.33,2.43,6.33,5.75,6.62,3.74.33,6.88-2.62,6.88-6.29v-17.51c0-3.43,2.78-6.22,6.22-6.22h17.51c3.67,0,6.61-3.14,6.29-6.88Z" fill="#fff"/>
  </svg>
)
    }
  ]

  const sonrakiSlide = () => {
    if (aktif < slides.length - 1) {
      setAnimasyon('cik')
      setTimeout(() => { setAktif(a => a + 1); setAnimasyon('gir') }, 200)
      setTimeout(() => setAnimasyon(null), 400)
    } else {
      localStorage.setItem('onboarding_done', '1')
      onBitti()
    }
  }

  const oncekiSlide = () => {
    if (aktif > 0) {
      setAnimasyon('cikGeri')
      setTimeout(() => { setAktif(a => a - 1); setAnimasyon('girGeri') }, 200)
      setTimeout(() => setAnimasyon(null), 400)
    }
  }

  const slide = slides[aktif]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: slide.renk, overflow: 'hidden', position: 'relative', transition: 'background 0.4s ease' }}>
      {/* Skip */}
      {aktif < slides.length - 1 && (
        <div style={{ padding: '16px 24px 0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={() => { localStorage.setItem('onboarding_done', '1'); onBitti() }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 20, padding: '6px 16px', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Geç
          </button>
        </div>
      )}

      {/* İllüstrasyon */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px',
        opacity: animasyon ? 0 : 1,
        transform: animasyon === 'cik' ? 'translateX(-60px)' : animasyon === 'gir' ? 'translateX(60px)' : animasyon === 'cikGeri' ? 'translateX(60px)' : animasyon === 'girGeri' ? 'translateX(-60px)' : 'translateX(0)',
        transition: 'opacity 0.2s ease, transform 0.2s ease'
      }}>
        <div style={{ width: '100%', maxWidth: 340, padding: '0 10px' }}>
          {slide.svg}
        </div>
      </div>

      {/* Metin */}
      <div style={{
        padding: '0 32px 40px', flexShrink: 0,
        opacity: animasyon ? 0 : 1,
        transform: animasyon === 'cik' ? 'translateX(-40px)' : animasyon === 'gir' ? 'translateX(40px)' : 'translateX(0)',
        transition: 'opacity 0.2s ease, transform 0.2s ease'
      }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 12px', letterSpacing: -0.8, lineHeight: 1.2 }}>{slide.baslik}</h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)', margin: '0 0 36px', lineHeight: 1.6, fontWeight: 400 }}>{slide.aciklama}</p>

        {/* Dots */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {slides.map((_, i) => (
            <div key={i} onClick={() => setAktif(i)} style={{
              height: 6, borderRadius: 3, cursor: 'pointer', transition: 'all 0.3s ease',
              width: i === aktif ? 28 : 6,
              background: i === aktif ? '#fff' : 'rgba(255,255,255,0.35)'
            }} />
          ))}
        </div>

        {/* Buton */}
        <button onClick={sonrakiSlide} style={{
          width: '100%', padding: '16px', borderRadius: 18, border: 'none', cursor: 'pointer',
          background: '#fff', color: slide.renk, fontSize: 16, fontWeight: 700, letterSpacing: -0.3,
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
        }}>
          {aktif === slides.length - 1 ? 'Başla →' : 'Devam →'}
        </button>

        {aktif > 0 && (
          <button onClick={oncekiSlide} style={{ width: '100%', padding: '12px', borderRadius: 18, border: 'none', cursor: 'pointer', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 500, marginTop: 8 }}>
            ← Geri
          </button>
        )}
      </div>
    </div>
  )
}

function GirisSayfa({ setKullanici, geriDon }) {
  const [mod, setMod] = useState('giris')
  const [email, setEmail] = useState('')
  const [sifre, setSifre] = useState('')
  const [isim, setIsim] = useState('')
  const [hata, setHata] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)

  const girisYap = async () => {
  setYukleniyor(true); setHata('')
  const { error } = await supabase.auth.signInWithPassword({ email, password: sifre })
  if (error) { setHata('Email veya şifre hatalı.'); setYukleniyor(false); return }
  setYukleniyor(false)
  if (geriDon) geriDon()
}
  const kayitOl = async () => {
  setYukleniyor(true); setHata('')
  const { data, error } = await supabase.auth.signUp({ email, password: sifre })
  if (error) { setHata(error.message); setYukleniyor(false); return }
  if (data.user) {
    await supabase.from('kullanicilar').insert({ id: data.user.id, isim })
  }
  setYukleniyor(false)
  if (geriDon) geriDon()
}

 return (
  
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

    <div style={{ background: 'linear-gradient(145deg, #1D9E75 0%, #0a7055 100%)', padding: '44px 28px 36px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
  
{geriDon && (
  <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', alignSelf: 'flex-start' }} onClick={geriDon}>
    <span style={{ fontSize: 22, color: '#fff', fontWeight: 600 }}>‹</span>
    <span style={{ fontSize: 14, color: '#fff', fontWeight: 500, opacity: 0.9 }}>Geri</span>
  </div>
)}

  {/* Dekoratif çemberler */}
  <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.1)' }} />
  <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.1)' }} />
  <div style={{ position: 'absolute', bottom: -50, left: -30, width: 140, height: 140, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.1)' }} />

  <div style={{ width: 72, height: 72, borderRadius: 20, background: '#fff', padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', marginBottom: 20, position: 'relative', zIndex: 1 }}>
    <img src="/logo.png" alt="Sahaya Gel" style={{ width: '100%', height: '100%', borderRadius: 14, objectFit: 'cover' }} />
  </div>

  <h1 style={{ fontSize: 34, fontWeight: 800, color: '#fff', margin: '0 0 8px', letterSpacing: -1, position: 'relative', zIndex: 1 }}>Sahaya Gel</h1>
  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', margin: 0, position: 'relative', zIndex: 1 }}>Maç veya Adam Bul! <br/> Ne lazımsa.</p>
</div>

    {/* Alt — form */}
    <div style={{ flex: 1, background: '#f8f8f6', padding: '24px 28px', overflowY: 'auto' }}>

      {/* Tab */}
      <div style={{ display: 'flex', background: '#eee', borderRadius: 14, padding: 4, marginBottom: 16 }}>
        {['giris', 'kayit'].map(m => (
          <button key={m} onClick={() => setMod(m)} style={{
            flex: 1, padding: '10px', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: mod === m ? 600 : 400, cursor: 'pointer', transition: 'all 0.2s',
            background: mod === m ? '#fff' : 'transparent',
            color: mod === m ? '#1a1a1a' : '#aaa',
            boxShadow: mod === m ? '0 1px 6px rgba(0,0,0,0.1)' : 'none',
          }}>
            {m === 'giris' ? 'Giriş yap' : 'Kayıt ol'}
          </button>
        ))}
      </div>

      {/* Form alanları */}
      {mod === 'kayit' && (
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Adın</p>
          <input style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#1a1a1a', background: 'none', fontWeight: 500 }}
            placeholder="örn. Ahmet Yılmaz" value={isim} onChange={e => setIsim(e.target.value)} />
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</p>
        <input style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#1a1a1a', background: 'none', fontWeight: 500 }}
          placeholder="email@ornek.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>

      <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 20, border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Şifre</p>
        <input style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#1a1a1a', background: 'none', fontWeight: 500 }}
          placeholder="En az 6 karakter" type="password" value={sifre} onChange={e => setSifre(e.target.value)} />
      </div>

      {hata && <p style={{ fontSize: 13, color: '#e74c3c', margin: '0 0 12px', fontWeight: 500 }}>{hata}</p>}

      <button onClick={mod === 'giris' ? girisYap : kayitOl} disabled={yukleniyor} style={{
        width: '100%', padding: 16, background: 'linear-gradient(135deg, #1D9E75, #0a7055)', color: '#fff', border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: 'pointer', letterSpacing: -0.2, boxShadow: '0 4px 14px rgba(29,158,117,0.35)', opacity: yukleniyor ? 0.6 : 1,
      }}>
        {yukleniyor ? 'Bekle...' : mod === 'giris' ? 'Giriş yap' : 'Hesap oluştur'}
      </button>
    </div>
  </div>
)
}

function AnaSayfa({ kullanici, macaGit, onMaclarYuklendi, setAktifEkran, toastGoster }) {
  const [maclar, setMaclar] = useState([])
  const [aktifSlide, setAktifSlide] = useState(0)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [profilAvatar, setProfilAvatar] = useState(null)
  const [profilIsim, setProfilIsim] = useState(null)

  useEffect(() => {
  if (!kullanici) return
  supabase.from('kullanicilar').select('avatar_url, isim').eq('id', kullanici.id).single()
    .then(({ data }) => {
      if (data?.avatar_url) setProfilAvatar(data.avatar_url)
      if (data?.isim) setProfilIsim(data.isim.split(' ')[0])
    })
}, [kullanici?.id])

  const [aktifFiltre, setAktifFiltre] = useState('Tümü')
  const [aramaMetni, setAramaMetni] = useState('')
  const [aramaAcik, setAramaAcik] = useState(false)
  const [ilceFiltre, setIlceFiltre] = useState('Tümü')
  const [saatFiltre, setSaatFiltre] = useState('Tümü')
  const [filtrePanelAcik, setFiltrePanelAcik] = useState(false)
  const [ilFiltre, setIlFiltre] = useState('Tümü')
  const [formatFiltre, setFormatFiltre] = useState('Tümü')
  const [seviyeFiltre, setSeviyeFiltre] = useState('Tümü')
  const [touchBaslangic, setTouchBaslangic] = useState(0)
  

  

  const filtreler = ['Tümü', 'Bu akşam']
const maclariGetir = async () => {
  setYukleniyor(true)
  try {
    const { data, error } = await supabase
      .from('maclar')
      .select(`*, kullanicilar!maclar_organizator_id_fkey(isim, avatar_url), katilimlar(id, durum, kullanici_id, kullanicilar(isim, avatar_url))`)
      .gte('saat', new Date().toISOString())
      .order('saat', { ascending: true })
    if (error || !data) {
      if (toastGoster) toastGoster('Maçlar yüklenemedi, tekrar dene')
      setYukleniyor(false)
      return
    }
    setMaclar(data || [])
    onMaclarYuklendi(data || [])
    setYukleniyor(false)
  } catch (e) {
    if (toastGoster) toastGoster('Maçlar yüklenemedi, tekrar dene')
    setYukleniyor(false)
  }
}
useEffect(() => {
  const timer = setInterval(() => {
    setAktifSlide(prev => (prev + 1) % 3)
  }, 5000)
  return () => clearInterval(timer)
}, [])
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { maclariGetir() }, [])


  const filtreliMaclar = (maclar || []).filter(m => {
    // Format filtresi
    if (aktifFiltre !== 'Tümü' && aktifFiltre !== 'Bu akşam') {
      if (m.format !== aktifFiltre) return false
    }
    
    if (aktifFiltre === 'Bu akşam') {
      const bugun = new Date()
      const mac = new Date(m.saat)
      if (mac.toDateString() !== bugun.toDateString()) return false
    }

    // Arama metni
    if (aramaMetni.trim()) {
      const aranan = aramaMetni.toLowerCase()
      const eslesme = m.saha_adi?.toLowerCase().includes(aranan) ||
        m.ilce?.toLowerCase().includes(aranan) ||
        m.aciklama?.toLowerCase().includes(aranan)
      if (!eslesme) return false
    }

    // İlçe filtresi
    if (ilceFiltre !== 'Tümü' && m.ilce !== ilceFiltre) return false

    // Saat filtresi
    if (saatFiltre !== 'Tümü') {
      const simdi = new Date()
      const macSaati = new Date(m.saat)
      if (saatFiltre === 'Bugün') {
        if (macSaati.toDateString() !== simdi.toDateString()) return false
      } else if (saatFiltre === 'Bu akşam') {
        const bugun = macSaati.toDateString() === simdi.toDateString()
        const aksam = macSaati.getHours() >= 17
        if (!bugun || !aksam) return false
      } else if (saatFiltre === 'Yarın') {
        const yarin = new Date(simdi)
        yarin.setDate(yarin.getDate() + 1)
        if (macSaati.toDateString() !== yarin.toDateString()) return false
      } else if (saatFiltre === 'Bu hafta') {
        const haftaSonu = new Date(simdi)
        haftaSonu.setDate(haftaSonu.getDate() + 7)
        if (macSaati > haftaSonu || macSaati < simdi) return false
      }
    }

    // İl filtresi
if (ilFiltre !== 'Tümü' && m.il !== ilFiltre) return false

// Format filtresi (yeni)
if (formatFiltre !== 'Tümü' && m.format !== formatFiltre) return false

// Seviye filtresi
if (seviyeFiltre !== 'Tümü' && m.seviye !== seviyeFiltre) return false

    return true
  })

const aktifFiltreVar = ilceFiltre !== 'Tümü' || saatFiltre !== 'Tümü' || ilFiltre !== 'Tümü' || formatFiltre !== 'Tümü' || seviyeFiltre !== 'Tümü'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 22px 14px', flexShrink: 0 }}>
        {aramaAcik ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, background: '#fff', borderRadius: 14, border: '1.5px solid #1D9E75', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="#1D9E75" strokeWidth="1.4" />
                <path d="M11 11l2.5 2.5" stroke="#1D9E75" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                autoFocus
                value={aramaMetni}
                onChange={e => setAramaMetni(e.target.value)}
                placeholder="Saha adı, ilçe ara..."
                style={{ border: 'none', outline: 'none', fontSize: 14, color: '#1a1a1a', background: 'none', flex: 1 }}
              />
              {aramaMetni && (
                <span onClick={() => setAramaMetni('')} style={{ fontSize: 18, color: '#bbb', cursor: 'pointer', lineHeight: 1 }}>×</span>
              )}
            </div>
            <button onClick={() => { setAramaAcik(false); setAramaMetni('') }} style={{ fontSize: 13, color: '#1D9E75', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              İptal
            </button>
          </div>
        ) : (
          <>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
  <div>
    <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 6px', fontWeight: 400, letterSpacing: 0.5, textTransform: 'uppercase' }}>Merhaba{profilIsim ? `, ${profilIsim}` : ''} 👋</p>
    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.8, color: '#1a1a1a', lineHeight: 1.1 }}>
<span style={{ color: '#1D9E75' }}>{filtreliMaclar.length} maç</span> seni bekliyor
    </h1>
  </div>
 <div onClick={() => kullanici && setAktifEkran('profil')} style={{ cursor: kullanici ? 'pointer' : 'default', flexShrink: 0 }}>
  {kullanici && profilAvatar ? (
    <img src={profilAvatar} alt="profil" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e8f7f1' }} />
  ) : kullanici ? (
    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#1D9E75', border: '2px solid #d0f0e5' }}>
      {kullanici.email?.slice(0, 1).toUpperCase() || '?'}
    </div>
  ) : (
    <img src="/logo.png" alt="Sahaya Gel" style={{ width: 48, height: 48, borderRadius: 18, objectFit: 'cover' }} />
  )}
</div>
</div>
          </>
        )}
      </div>

      {/* Arama + Filtre bar */}
      {!aramaAcik && (
        <div style={{ display: 'flex', gap: 8, padding: '0 22px', flexShrink: 0 }}>
          <div onClick={() => setAramaAcik(true)} style={{ flex: 1, background: '#fff', borderRadius: 14, border: '0.5px solid #e8e8e4', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="#aaa" strokeWidth="1.4" />
              <path d="M11 11l2.5 2.5" stroke="#aaa" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 13, color: '#bbb' }}>Saha ara, ilçe seç...</span>
          </div>
          <button onClick={() => setFiltrePanelAcik(!filtrePanelAcik)} style={{
            width: 42, height: 42, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            background: aktifFiltreVar ? '#1D9E75' : '#fff',
            boxShadow: aktifFiltreVar ? 'none' : '0 0 0 0.5px #e8e8e4',
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 4h14M5 9h8M8 14h2" stroke={aktifFiltreVar ? '#fff' : '#888'} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Filtre paneli */}
     {filtrePanelAcik && (
  <div style={{ margin: '10px 22px 0', background: '#fff', borderRadius: 16, padding: '16px 16px', border: '0.5px solid #ebebE8', flexShrink: 0, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
    
    {/* İl */}
    <p style={{ fontSize: 11, color: '#aaa', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>İl</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {['Tümü', 'İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya'].map(i => (
        <button key={i} onClick={() => setIlFiltre(i)} style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
          background: ilFiltre === i ? '#1D9E75' : '#f5f5f3',
          color: ilFiltre === i ? '#fff' : '#666',
        }}>{i}</button>
      ))}
    </div>

    {/* İlçe */}
    {ilFiltre !== 'Tümü' && (
      <>
        <p style={{ fontSize: 11, color: '#aaa', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>İlçe</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {['Tümü', ...new Set((maclar || []).filter(m => m.il === ilFiltre || ilFiltre === 'Tümü').map(m => m.ilce).filter(Boolean))].map(i => (
            <button key={i} onClick={() => setIlceFiltre(i)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
              background: ilceFiltre === i ? '#1D9E75' : '#f5f5f3',
              color: ilceFiltre === i ? '#fff' : '#666',
            }}>{i}</button>
          ))}
        </div>
      </>
    )}

    {/* Zaman */}
    <p style={{ fontSize: 11, color: '#aaa', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Zaman</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {['Tümü', 'Bugün', 'Bu akşam', 'Yarın', 'Bu hafta'].map(s => (
        <button key={s} onClick={() => setSaatFiltre(s)} style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
          background: saatFiltre === s ? '#1D9E75' : '#f5f5f3',
          color: saatFiltre === s ? '#fff' : '#666',
        }}>{s}</button>
      ))}
    </div>

    {/* Kaça Kaç */}
    <p style={{ fontSize: 11, color: '#aaa', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kaça Kaç?</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {['Tümü', '3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'].map(f => (
        <button key={f} onClick={() => setFormatFiltre(f)} style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
          background: formatFiltre === f ? '#1D9E75' : '#f5f5f3',
          color: formatFiltre === f ? '#fff' : '#666',
        }}>{f}</button>
      ))}
    </div>

    {/* Seviye */}
    <p style={{ fontSize: 11, color: '#aaa', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Seviye</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {['Tümü', 'Amatör', 'Orta', 'İyi'].map(s => (
        <button key={s} onClick={() => setSeviyeFiltre(s)} style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
          background: seviyeFiltre === s ? '#1D9E75' : '#f5f5f3',
          color: seviyeFiltre === s ? '#fff' : '#666',
        }}>{s}</button>
      ))}
    </div>

    {/* Temizle */}
    {aktifFiltreVar && (
      <button onClick={() => { setIlFiltre('Tümü'); setIlceFiltre('Tümü'); setSaatFiltre('Tümü'); setFormatFiltre('Tümü'); setSeviyeFiltre('Tümü') }} style={{ fontSize: 12, color: '#e74c3c', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 600 }}>
        Filtreleri temizle
      </button>
    )}
  </div>
)}

      {/* Format filtreleri */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 22px 0', overflowX: 'auto', flexShrink: 0 }}>
        {filtreler.map(f => (
         <button key={f} onClick={() => setAktifFiltre(f)} style={{
  padding: '7px 16px', borderRadius: 24, fontSize: 13, fontWeight: aktifFiltre === f ? 600 : 400, whiteSpace: 'nowrap', cursor: 'pointer', border: 'none', flexShrink: 0,
  background: aktifFiltre === f ? '#1a1a1a' : '#fff',
  color: aktifFiltre === f ? '#fff' : '#666',
  boxShadow: aktifFiltre === f ? 'none' : '0 0 0 1px #e8e8e4',
  letterSpacing: -0.2,
  transition: 'all 0.15s',
}}>{f}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* Banner Slider */}
<div
  style={{ margin: '12px 22px 0', position: 'relative', borderRadius: 16, overflow: 'hidden', height: 120, flexShrink: 0 }}
  onTouchStart={e => setTouchBaslangic(e.touches[0].clientX)}
  onTouchEnd={e => {
    const fark = touchBaslangic - e.changedTouches[0].clientX
    if (fark > 50) setAktifSlide(prev => (prev + 1) % 3)
    else if (fark < -50) setAktifSlide(prev => (prev - 1 + 3) % 3)
  }}
>
  {[
    {
      baslik: 'Maç bul, sahaya gel!',
      aciklama: 'Yakınındaki maçlara katıl',
      renk: 'linear-gradient(135deg, #1D9E75, #0a7055)',
      ikon: '⚽'
    },
    {
      baslik: 'Arkadaş edin',
      aciklama: 'Maçlarda tanıştığın oyuncularla bağlantı kur',
      renk: 'linear-gradient(135deg, #185FA5, #0d3d6b)',
      ikon: '🤝'
    },
    {
      baslik: 'İlan aç, oyuncu bul',
      aciklama: 'Grubundaki eksikleri tamamla',
      renk: 'linear-gradient(135deg, #e67e22, #d35400)',
      ikon: '📢'
    },
  ].map((slide, i) => (
    <div key={i} style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: slide.renk,
      display: 'flex', alignItems: 'center', padding: '20px 24px',
      gap: 16,
      opacity: aktifSlide === i ? 1 : 0,
      transition: 'opacity 0.5s ease',
      pointerEvents: aktifSlide === i ? 'auto' : 'none',
    }}>
      <div style={{ fontSize: 48 }}>{slide.ikon}</div>
      <div>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 6px', letterSpacing: -0.3 }}>{slide.baslik}</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: 0 }}>{slide.aciklama}</p>
      </div>
    </div>
  ))}

  {/* Nokta göstergesi */}
  <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
    {[0, 1, 2].map(i => (
      <div key={i} onClick={() => setAktifSlide(i)} style={{
        width: aktifSlide === i ? 20 : 6,
        height: 6, borderRadius: 3,
        background: aktifSlide === i ? '#fff' : 'rgba(255,255,255,0.4)',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
      }} />
    ))}
  </div>
</div>

<div style={{ display: 'flex', gap: 8, padding: '14px 22px 0' }}>
  {[
    { label: 'İlan aç', ekran: 'ilan' },
    { label: 'Haritada ara', ekran: 'harita' },
    { label: 'Arkadaş bul', ekran: 'arkadaslar' },
  ].map(s => (
    <button key={s.ekran} onClick={() => setAktifEkran(s.ekran)} style={{
      flex: 1, padding: '8px 4px', background: '#fff', border: '0.5px solid #ebebE8',
      borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#555',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {s.label}
    </button>
  ))}
</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 22px 8px'}}>
        <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>
          {aramaMetni ? `"${aramaMetni}" sonuçları` : 'Yakındaki maçlar'}
        </p>
      </div>
        <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
        {yukleniyor ? (
          <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>Maçlar yükleniyor...</p>
        ) : filtreliMaclar.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 22px' }}>
            <p style={{ fontSize: 40, margin: '0 0 12px' }}>⚽</p>
            <p style={{ fontSize: 14, color: '#aaa', margin: '0 0 20px' }}>
              {aramaMetni ? `"${aramaMetni}" için sonuç bulunamadı` : 'Yakınında henüz maç yok'}
            </p>
            {!aramaMetni && (
              <button onClick={() => setAktifEkran('ilan')} style={{
                padding: '12px 24px', background: '#1D9E75', color: '#fff', border: 'none',
                borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
                İlk ilanı sen aç!
              </button>
            )}
            {aramaMetni && (
              <button onClick={() => { setAramaMetni(''); setIlceFiltre('Tümü'); setSaatFiltre('Tümü'); setAktifFiltre('Tümü') }} style={{ fontSize: 13, color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                Filtreleri temizle
              </button>
            )}
          </div>
         ) : filtreliMaclar.map(mac => (
          <MacKart key={mac.id} mac={mac} onClick={() => macaGit(mac)} kullanici={kullanici} />
        ))}
      </div>
    </div>
    </div>
  )
}

function MacKart({ mac, onClick, kullanici }) {
  const katilan = mac.katilimlar?.filter(k => k.durum === 'onaylandi').length || 0
  const acikYer = mac.toplam_kisi - katilan
  const doluluk = (katilan / mac.toplam_kisi) * 100
  const acil = acikYer <= 2 && acikYer > 0
  const dolu = acikYer <= 0
  const benimKatilimim = kullanici ? mac.katilimlar?.find(k => k.kullanici_id === kullanici.id) : null
  const katilindi = benimKatilimim?.durum
  const benOrganizatorum = kullanici?.id === mac.organizator_id


  return (
   <div onClick={onClick} style={{
  background: '#fff',
  borderRadius: 20,
  overflow: 'hidden',
  border: '0.5px solid #ebebE8',
  cursor: 'pointer',
  boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
  transition: 'transform 0.15s, box-shadow 0.15s',
  display: 'flex',
}}
  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.1)' }}
  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.07)' }}
>
  <div style={{ width: 4, background: dolu ? '#ddd' : acil ? '#e74c3c' : '#1D9E75', flexShrink: 0 }} />
  <div style={{ flex: 1 }}>
      {/* Üst kısım */}
      <div style={{ padding: '14px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, marginRight: 10 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px', textTransform: 'capitalize', letterSpacing: -0.3 }}>
          {mac.saha_adi.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
  <path d="M5.5 1C3.567 1 2 2.567 2 4.5c0 2.625 3.5 5.5 3.5 5.5s3.5-2.875 3.5-5.5C9 2.567 7.433 1 5.5 1z" fill="#aaa"/>
  <circle cx="5.5" cy="4.5" r="1.2" fill="#fff"/>
</svg>
            <span style={{ fontSize: 12, color: '#888' }}>{mac.ilce}</span>
            <span style={{ fontSize: 12, color: '#ddd' }}>·</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#1D9E75', background: '#e8f7f1', padding: '1px 8px', borderRadius: 20 }}>{mac.format}</span>
          </div>
        </div>
        <div style={{
          background: acil ? '#fdecea' : dolu ? '#f5f5f3' : '#e8f7f1',
          borderRadius: 12,
          padding: '6px 10px',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: 10, color: acil ? '#c0392b' : dolu ? '#aaa' : '#0F6E56', margin: '0 0 1px', fontWeight: 500 }}>
            {new Date(mac.saat).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: acil ? '#c0392b' : dolu ? '#aaa' : '#0F6E56', margin: 0 }}>
            {new Date(mac.saat).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '0 16px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex' }}>
              {(mac.katilimlar || []).filter(k => k.durum === 'onaylandi').slice(0, 5).map((k, i) => (
                <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #fff', marginRight: -6, overflow: 'hidden', flexShrink: 0, background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: '#0F6E56' }}>
                  {k.kullanicilar?.avatar_url
                    ? <img src={k.kullanicilar.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : (k.kullanicilar?.isim?.slice(0, 1) || '?')}
                </div>
              ))}
              {katilan > 5 && (
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#f0f0ee', border: '2px solid #fff', marginRight: -6, fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontWeight: 600 }}>
                  +{katilan - 5}
                </div>
              )}
            </div>
            <span style={{ fontSize: 11, color: '#aaa', marginLeft: 10 }}>{katilan}/{mac.toplam_kisi} oyuncu</span>
          </div>
       {benOrganizatorum ? (
  <span style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 20, background: '#e8f7f1', color: '#0F6E56' }}>
    Senin ilanın
  </span>
) : (
  <button
    onClick={e => { e.stopPropagation(); onClick() }}
    style={{
      fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 20, border: 'none', cursor: dolu ? 'default' : 'pointer',
      background: katilindi === 'onaylandi' ? '#e8f7f1' : katilindi === 'bekliyor' ? '#f5f5f3' : dolu ? '#f5f5f3' : acil ? '#fdecea' : '#1D9E75',
      color: katilindi === 'onaylandi' ? '#0F6E56' : katilindi === 'bekliyor' ? '#aaa' : dolu ? '#aaa' : acil ? '#c0392b' : '#fff',
    }}
  >
    {katilindi === 'onaylandi' ? 'Katıldın' : katilindi === 'bekliyor' ? 'Bekliyor' : dolu ? 'Dolu' : acil ? `${acikYer} yer kaldı!` : 'Katıl'}
  </button>
)}
        </div>
      <div style={{ height: 4, background: '#f0f0ee', borderRadius: 2, marginTop: 12, marginBottom: 2 }}>
  <div style={{
    width: `${doluluk}%`, height: '100%', borderRadius: 2,
    background: dolu ? '#ddd' : acil ? '#e74c3c' : '#1D9E75',
    transition: 'width 0.4s ease',
    minWidth: doluluk > 0 ? 8 : 0,
  }} />
</div>
      </div>
    </div>
    </div> 
  )
}

function DetaySayfa({ mac, kullanici, geriDon, onKullaniciTikla, klavyeYuksekligi = 0 }) {
  const [katilindi, setKatilindi] = useState(false)
  const [katilimlar, setKatilimlar] = useState([])
  const [mesajlar, setMesajlar] = useState([])
  const [yeniMesaj, setYeniMesaj] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [katilimYukleniyor, setKatilimYukleniyor] = useState(true)
  const [mesajYukleniyor, setMesajYukleniyor] = useState(true)
  const [gonderiyor, setGonderiyor] = useState(false)
  const [aktifTab, setAktifTab] = useState(mac.baslangicTab || 'detay')
  const mesajSonuRef = useRef(null)
  const mesajInputRef = useRef(null)
  const [iptalModalAcik, setIptalModalAcik] = useState(false)

  const benOrganizatorum = kullanici.id === mac.organizator_id
  const katilimSayisi = katilimlar.filter(k => k.durum === 'onaylandi').length
  const bekleyenSayisi = katilimlar.filter(k => k.durum === 'bekliyor').length
  const acikYer = mac.toplam_kisi - katilimSayisi
  const tarih = new Date(mac.saat).toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

 const katilimlariGetir = useCallback(async () => {
  setKatilimYukleniyor(true)
  const { data } = await supabase
    .from('katilimlar')
    .select('*, kullanicilar(isim, pozisyon, seviye, avatar_url)')
    .eq('mac_id', mac.id)
    .order('olusturuldu', { ascending: true })
  setKatilimlar(data || [])
  const benimKatilimim = (data || []).find(k => k.kullanici_id === kullanici.id)
if (benimKatilimim) setKatilindi(benimKatilimim.durum)
    setKatilimYukleniyor(false)
}, [mac.id, kullanici.id])

const mesajlariGetir = useCallback(async () => {
  setMesajYukleniyor(true)
  const { data } = await supabase
    .from('mesajlar')
    .select('*, kullanicilar(isim, avatar_url)')
    .eq('mac_id', mac.id)
    .order('olusturuldu', { ascending: true })
  setMesajlar(data || [])
  setMesajYukleniyor(false)
}, [mac.id])
  useEffect(() => {
  if (mesajSonuRef.current) {
    mesajSonuRef.current.scrollIntoView({ behavior: 'auto' })
  }
}, [mesajlar, aktifTab])

  useEffect(() => {
    katilimlariGetir()
    mesajlariGetir()

    const kanal = supabase
      .channel(`mac-${mac.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mesajlar',
        filter: `mac_id=eq.${mac.id}`
      }, async (payload) => {
        const { data } = await supabase
          .from('mesajlar')
          .select('*, kullanicilar(isim, avatar_url)')
          .eq('id', payload.new.id)
          .single()
        if (data) setMesajlar(prev => [...prev, data])
      })
      .subscribe()

    return () => supabase.removeChannel(kanal)
  }, [mac.id])

  useEffect(() => {
  if (aktifTab !== 'sohbet' || !kullanici) return
  supabase
    .from('bildirimler')
    .update({ okundu: true })
    .eq('kullanici_id', kullanici.id)
    .eq('mac_id', mac.id)
    .eq('tip', 'mesaj')
    .eq('okundu', false)
    .then(() => {})
}, [aktifTab, kullanici.id, mac.id])

useEffect(() => {
  if (!kullanici) return

  if (aktifTab === 'sohbet') {
    // Sohbete girince aktif olarak işaretle
    supabase.from('aktif_kullanicilar').upsert({
      kullanici_id: kullanici.id,
      mac_id: mac.id,
      son_aktif: new Date().toISOString()
    }).then(() => {})
  } else {
    // Sohbetten çıkınca sil
    supabase.from('aktif_kullanicilar')
      .delete()
      .eq('kullanici_id', kullanici.id)
      .eq('mac_id', mac.id)
      .then(() => {})
  }


  return () => {
    supabase.from('aktif_kullanicilar')
      .delete()
      .eq('kullanici_id', kullanici.id)
      .eq('mac_id', mac.id)
      .then(() => {})
  }
}, [aktifTab, kullanici.id, mac.id])

 const katil = async () => {
  if (katilindi || acikYer <= 0) return
  setYukleniyor(true)
  const durum = benOrganizatorum ? 'onaylandi' : 'bekliyor'
  const { error } = await supabase
    .from('katilimlar')
    .insert({ mac_id: mac.id, kullanici_id: kullanici.id, durum })
  if (!error) {
    setKatilindi(true)
    katilimlariGetir()
    if (!benOrganizatorum && mac.organizator_id) {
      await bildirimGonder(
  mac.organizator_id,
  '👤 Yeni başvuru!',
  `Birileri "${mac.saha_adi}" maçına katılmak istiyor`,
  'basvuru',
  mac.id
)
    }
  }
  setYukleniyor(false)
}

  const katilimGuncelle = async (katilimId, yeniDurum) => {
  await supabase.from('katilimlar').update({ durum: yeniDurum }).eq('id', katilimId)

  const katilim = katilimlar.find(k => k.id === katilimId)
  if (katilim && katilim.kullanici_id) {
    if (yeniDurum === 'onaylandi') {
    await bildirimGonder(
  katilim.kullanici_id,
  '✅ Başvurun onaylandı!',
  `"${mac.saha_adi}" maçına katılımın onaylandı. Hazır ol!`,
  'onay',
  mac.id

)
    } else if (yeniDurum === 'reddedildi') {
      await bildirimGonder(
        katilim.kullanici_id,
        '❌ Başvurun reddedildi',
        `"${mac.saha_adi}" maçına katılım isteğin reddedildi.`,
        'red',
        mac.id
      )
    }
  }
  const yeniOnaylananSayisi = katilimlar.filter(k => k.durum === 'onaylandi').length + (yeniDurum === 'onaylandi' ? 1 : -1)
if (yeniDurum === 'onaylandi' && yeniOnaylananSayisi >= mac.toplam_kisi) {
  await bildirimGonder(
    mac.organizator_id,
    '🎉 Maç doldu!',
    `"${mac.saha_adi}" maçın tamamlandı, tüm yerler doldu!`,
    'onay',
    mac.id
  )
}
  katilimlariGetir()
}

const mesajGonder = async () => {
  if (!yeniMesaj.trim() || gonderiyor) return
  setGonderiyor(true)
  const icerik = yeniMesaj.trim()
  setYeniMesaj('')
  setTimeout(() => mesajInputRef.current?.focus(), 50)

  const { data: benimProfilim } = await supabase
    .from('kullanicilar')
    .select('isim, avatar_url')
    .eq('id', kullanici.id)
    .single()

  const gondereninAdi = benimProfilim?.isim || kullanici.email?.split('@')[0]
  const gondereninAvatari = benimProfilim?.avatar_url || null

  await supabase.from('mesajlar').insert({
    mac_id: mac.id,
    kullanici_id: kullanici.id,
    icerik
  })

  const { data: aktifler } = await supabase
    .from('aktif_kullanicilar')
    .select('kullanici_id')
    .eq('mac_id', mac.id)

  const aktifIdler = (aktifler || []).map(a => a.kullanici_id)

  if (kullanici.id !== mac.organizator_id && !aktifIdler.includes(mac.organizator_id)) {
  await bildirimGonder(
  mac.organizator_id,
  `${gondereninAdi}`,
  `${mac.saha_adi} sohbeti: "${icerik.slice(0, 40)}${icerik.length > 40 ? '...' : ''}"`,
  'mesaj',
  mac.id,
  gondereninAvatari,
  kullanici.id
)

  }

  const onaylananlar = katilimlar.filter(k =>
    k.durum === 'onaylandi' &&
    k.kullanici_id !== kullanici.id &&
    !aktifIdler.includes(k.kullanici_id)
  )

  for (const k of onaylananlar) {
    await bildirimGonder(
  k.kullanici_id,
  `${gondereninAdi}`,
  `${mac.saha_adi} sohbeti: "${icerik.slice(0, 40)}${icerik.length > 40 ? '...' : ''}"`,
  'mesaj',
  mac.id,
  gondereninAvatari,
  kullanici.id
)
  }

  setGonderiyor(false)
}

  const durumRenk = {
    'bekliyor': { bg: '#fdf3e8', text: '#854F0B', label: 'Bekliyor' },
    'onaylandi': { bg: '#e8f7f1', text: '#0F6E56', label: 'Onaylandı' },
    'reddedildi': { bg: '#fdecea', text: '#c0392b', label: 'Reddedildi' },
  }

  return (
<div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Yeşil header */}
      <div style={{ background: '#1D9E75', padding: '16px 22px 20px', flexShrink: 0 }}>
        <span onClick={geriDon} style={{ color: '#fff', fontSize: 26, cursor: 'pointer', opacity: 0.8, display: 'inline-block', marginBottom: 8 }}>‹</span>
        <button onClick={() => {
  const url = `https://sahayagel.vercel.app`
  const mesaj = `${mac.saha_adi} maçına katıl! ${mac.ilce} - ${new Date(mac.saat).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
  window.open(`https://wa.me/?text=${encodeURIComponent(mesaj + ' ' + url)}`, '_blank')
}} style={{ float: 'right', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, padding: '5px 12px', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', marginLeft: 8 }}>
  Paylaş
</button>
        
        {benOrganizatorum && (
  <button onClick={() => setIptalModalAcik(true)} style={{ float: 'right', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, padding: '5px 12px', color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
    İptal et
  </button>
)}
        <p style={{ fontSize: 20, fontWeight: 500, color: '#fff', margin: '0 0 4px', letterSpacing: -0.3 }}>{mac.saha_adi}</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '0 0 14px' }}>
          {benOrganizatorum ? '👑 Senin ilanın' : `Organizatör: ${mac.kullanicilar?.isim || 'Bilinmiyor'}`} · {mac.format}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[tarih, mac.ilce, mac.seviye + ' seviye'].map((chip, i) => (
            <span key={i} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, padding: '5px 12px', borderRadius: 20 }}>{chip}</span>
          ))}
        </div>
      </div>

      {/* Tab bar — organizatörse "Başvurular" tabı göster */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '0.5px solid #ebebE8', flexShrink: 0 }}>
      {['detay', 'sohbet', ...(benOrganizatorum ? ['basvurular'] : [])].map(tab => (
  <button key={tab} onClick={() => setAktifTab(tab)} style={{
    flex: 1, padding: '11px 0', fontSize: 13, fontWeight: aktifTab === tab ? 500 : 400, border: 'none', background: 'none', cursor: 'pointer',
    color: aktifTab === tab ? '#1D9E75' : '#aaa',
    borderBottom: aktifTab === tab ? '2px solid #1D9E75' : '2px solid transparent',
  }}>
    {tab === 'detay' ? 'Detay' : tab === 'sohbet' ? `Sohbet ${mesajlar.length > 0 ? `(${mesajlar.length})` : ''}` : `Başvurular ${bekleyenSayisi > 0 ? `(${bekleyenSayisi})` : ''}`}
  </button>
))}
      </div>

      {/* Detay tab */}
      {aktifTab === 'detay' && (
        <div style={{ flex: 1, padding: '20px 22px', overflowY: 'auto', background: '#f8f8f6' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 14, border: '0.5px solid #ebebE8' }}>
            {[['İlçe', mac.ilce], ['Kaça Kaç?', mac.format], ['Seviye', mac.seviye], ['Onaylanan', `${katilimSayisi}/${mac.toplam_kisi} oyuncu`], ['Açık yer', `${acikYer} kişi`]].map(([k, v], i, arr) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < arr.length - 1 ? '0.5px solid #f0f0ee' : 'none' }}>
                <span style={{ fontSize: 13, color: '#aaa' }}>{k}</span>
                <span style={{ fontSize: 13, color: i === 4 ? '#1D9E75' : '#1a1a1a', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          {mac.aciklama && (
            <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 14, border: '0.5px solid #ebebE8' }}>
              <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 6px' }}>Organizatör notu</p>
              <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.6 }}>"{mac.aciklama}"</p>
            </div>
          )}

          {/* Katılım progress */}
          <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>Katılım ({katilimSayisi}/{mac.toplam_kisi})</p>
          <div style={{ height: 6, background: '#eee', borderRadius: 3, marginBottom: 20 }}>
            <div style={{ width: `${(katilimSayisi / mac.toplam_kisi) * 100}%`, height: '100%', borderRadius: 3, background: '#1D9E75', transition: 'width 0.3s' }} />
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 8, marginBottom: 10 }}>
            {katilimlar.filter(k => k.durum === 'onaylandi').map((k, i) => (
              <div key={i} onClick={(e) => { e.stopPropagation(); onKullaniciTikla && onKullaniciTikla(k.kullanici_id) }} style={{ cursor: 'pointer' }}>
                  {k.kullanicilar?.avatar_url ? (
                  <img src={k.kullanicilar.avatar_url} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff' }} alt="" />
                ) : (
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0F6E56', border: '2px solid #fff' }}>
                    {k.kullanicilar?.isim?.slice(0, 1) || '?'}
                  </div>
                )}
              </div>
            ))}
          </div>



                    {mac.lat && mac.lng && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 14, border: '0.5px solid #ebebE8' }}>
            <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 8px' }}>Konum</p>
<div style={{ height: 200, borderRadius: 10, overflow: 'hidden' }}>
              <MapContainer center={[mac.lat, mac.lng]} zoom={15} style={{ width: '100%', height: '100%' }} zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                <Marker position={[mac.lat, mac.lng]} icon={new L.DivIcon({
          className: '',
          html: `<div style="width:14px;height:14px;background:#1D9E75;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(29,158,117,0.5);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
            })} />
                  </MapContainer>
                </div>
              </div>
            )}

          {!benOrganizatorum && (
            <button onClick={katil} disabled={katilindi || yukleniyor || acikYer <= 0} style={{
              width: '100%', padding: 14, border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 500, cursor: katilindi ? 'default' : 'pointer',
              background: katilindi === 'onaylandi' ? '#1D9E75' : katilindi === 'reddedildi' ? '#fdecea' : katilindi ? '#e8f7f1' : acikYer <= 0 ? '#eee' : '#1D9E75',
              color: katilindi === 'onaylandi' ? '#fff' : katilindi === 'reddedildi' ? '#c0392b' : katilindi ? '#0F6E56' : acikYer <= 0 ? '#aaa' : '#fff',
            }}>
          {katilindi === 'onaylandi' ? '✓ Onaylandın!' : katilindi === 'reddedildi' ? '✗ Başvurun reddedildi' : katilindi ? '✓ Başvurun alındı, onay bekleniyor' : acikYer <= 0 ? 'Maç dolu' : yukleniyor ? 'Gönderiliyor...' : 'Katılmak istiyorum'}
            </button>
          )}
        </div>
      )}

      

      {/* Başvurular tab — sadece organizatör görür */}
      {aktifTab === 'basvurular' && (
        <div style={{ flex: 1, overflowY: 'auto', background: '#f8f8f6', padding: '16px 22px' }}>
          {katilimYukleniyor ? (
            <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>Yükleniyor...</p>
          ) : katilimlar.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: 40, margin: '0 0 10px' }}>👥</p>
              <p style={{ fontSize: 14, color: '#aaa' }}>Henüz başvuru yok</p>
              <p style={{ fontSize: 13, color: '#bbb', marginTop: 4 }}>İlan yakındaki oyunculara gönderildi</p>
            </div>
          ) : (
            <>
              {/* Bekleyenler */}
              {katilimlar.filter(k => k.durum === 'bekliyor').length > 0 && (
                <>
                  <p style={{ fontSize: 12, color: '#aaa', fontWeight: 500, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bekleyenler ({katilimlar.filter(k => k.durum === 'bekliyor').length})</p>
                  {katilimlar.filter(k => k.durum === 'bekliyor').map(k => (
                  <KatilimciKart key={k.id} katilim={k} durumRenk={durumRenk} onKullaniciTikla={onKullaniciTikla} onOnayla={() => katilimGuncelle(k.id, 'onaylandi')} onReddet={() => katilimGuncelle(k.id, 'reddedildi')} gosterButon={true} kullanici={kullanici} />
                  ))}
                </>
              )}

              {/* Onaylananlar */}
              {katilimlar.filter(k => k.durum === 'onaylandi').length > 0 && (
                <>
                  <p style={{ fontSize: 12, color: '#aaa', fontWeight: 500, margin: '16px 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Onaylananlar ({katilimlar.filter(k => k.durum === 'onaylandi').length})</p>
                  {katilimlar.filter(k => k.durum === 'onaylandi').map(k => (
                  <KatilimciKart key={k.id} katilim={k} durumRenk={durumRenk} onOnayla={() => katilimGuncelle(k.id, 'onaylandi')} onReddet={() => katilimGuncelle(k.id, 'reddedildi')} gosterButon={true} kullanici={kullanici} />
                  ))}
                </>
              )}

              {/* Reddedilenler */}
              {katilimlar.filter(k => k.durum === 'reddedildi').length > 0 && (
                <>
                  <p style={{ fontSize: 12, color: '#aaa', fontWeight: 500, margin: '16px 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reddedilenler ({katilimlar.filter(k => k.durum === 'reddedildi').length})</p>
                  {katilimlar.filter(k => k.durum === 'reddedildi').map(k => (
                    <KatilimciKart key={k.id} katilim={k} durumRenk={durumRenk} onOnayla={() => katilimGuncelle(k.id, 'onaylandi')} onReddet={() => katilimGuncelle(k.id, 'reddedildi')} gosterButon={true} kullanici={kullanici} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
{/* Sohbet tab */}
{aktifTab === 'sohbet' && (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8f8f6' }}>
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {mesajYukleniyor ? (
        <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>Yükleniyor...</p>
      ) : mesajlar.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: 40, margin: '0 0 10px' }}>💬</p>
          <p style={{ fontSize: 14, color: '#aaa' }}>Henüz mesaj yok</p>
          <p style={{ fontSize: 13, color: '#bbb', marginTop: 4 }}>İlk mesajı sen at!</p>
        </div>
      ) : mesajlar.map((m, i) => {
        const benimMesajim = m.kullanici_id === kullanici.id
        const oncekiAyni = i > 0 && mesajlar[i - 1].kullanici_id === m.kullanici_id
        const baslarf = m.kullanicilar?.isim?.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() || '?'
        const saat = new Date(m.olusturuldu).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        return (
          <div key={m.id} style={{ display: 'flex', flexDirection: benimMesajim ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
            {!benimMesajim && (
              <div onClick={() => onKullaniciTikla && onKullaniciTikla(m.kullanici_id)} style={{ width: 30, height: 30, flexShrink: 0, cursor: 'pointer' }}>
                {!oncekiAyni && (
                  m.kullanicilar?.avatar_url ? (
                    <img src={m.kullanicilar.avatar_url} alt="avatar" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, color: '#0F6E56' }}>
                      {baslarf}
                    </div>
                  )
                )}
              </div>
            )}
            <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: benimMesajim ? 'flex-end' : 'flex-start' }}>
              {!oncekiAyni && !benimMesajim && (
              <p onClick={() => onKullaniciTikla && onKullaniciTikla(m.kullanici_id)} style={{ fontSize: 11, color: '#aaa', margin: '0 0 4px', paddingLeft: 4, cursor: 'pointer' }}>{m.kullanicilar?.isim || 'İsimsiz'}</p>
              )}
              <div style={{
                padding: '9px 13px',
                borderRadius: benimMesajim ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: benimMesajim ? '#1D9E75' : '#fff',
                color: benimMesajim ? '#fff' : '#1a1a1a',
                fontSize: 14, lineHeight: 1.5,
                border: benimMesajim ? 'none' : '0.5px solid #ebebE8',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                {m.icerik}
              </div>
              <p style={{ fontSize: 10, color: '#bbb', margin: '4px 4px 0' }}>{saat}</p>
            </div>
          </div>
        )
      })}
      <div ref={mesajSonuRef} />
    </div>

    {/* Mesaj yazma alanı */}
    <div style={{ padding: '10px 16px 16px', background: '#fff', borderTop: '0.5px solid #ebebE8', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <input
        ref={mesajInputRef}
        value={yeniMesaj}
        onChange={e => setYeniMesaj(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mesajGonder() } }}
        placeholder="Mesaj yaz..."
        style={{ flex: 1, background: '#f5f5f3', border: 'none', borderRadius: 20, padding: '10px 16px', fontSize: 14, outline: 'none', color: '#1a1a1a' }}
      />
      <button
        onClick={mesajGonder}
        disabled={!yeniMesaj.trim() || gonderiyor}
        style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: yeniMesaj.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s', background: yeniMesaj.trim() ? '#1D9E75' : '#e8e8e4' }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M14 8L2 2l3 6-3 6 12-6z" fill={yeniMesaj.trim() ? '#fff' : '#bbb'} />
        </svg>
      </button>
    </div>
  </div>
)}
{iptalModalAcik && (
  <div onClick={() => setIptalModalAcik(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', paddingBottom: 'env(safe-area-inset-bottom)' }}>
    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 22px 40px', width: '100%', boxSizing: 'border-box' }}>
      <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>İlanı iptal et</p>
      <p style={{ fontSize: 13, color: '#aaa', margin: '0 0 20px' }}>Tüm katılımcılara bildirim gidecek.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button onClick={() => setIptalModalAcik(false)} style={{ padding: '12px', borderRadius: 12, border: 'none', background: '#f5f5f3', color: '#888', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          Vazgeç
        </button>
        <button onClick={async () => {
          setIptalModalAcik(false)
          const { data: katilimcilar } = await supabase.from('katilimlar').select('kullanici_id').eq('mac_id', mac.id).eq('durum', 'onaylandi')
          for (const k of katilimcilar || []) {
            await bildirimGonder(k.kullanici_id, '❌ Maç iptal edildi', `"${mac.saha_adi}" maçı iptal edildi.`, 'red', mac.id)
          }
          await supabase.from('maclar').delete().eq('id', mac.id)
          geriDon()
        }} style={{ padding: '12px', borderRadius: 12, border: 'none', background: '#fdecea', color: '#c0392b', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          İptal et
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  )
}

  function KatilimciKart({ katilim, durumRenk, onOnayla, onReddet, gosterButon, kullanici, onKullaniciTikla }) {
  const renk = durumRenk[katilim.durum] || durumRenk['bekliyor']
  const baslarf = katilim.kullanicilar?.isim?.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() || '??'
  const benimKartim = katilim.kullanici_id === kullanici?.id
  const [arkadasDurum, setArkadasDurum] = useState(null)

  useEffect(() => {
    if (!kullanici || benimKartim) return
    const kontrol = async () => {
      const { data } = await supabase
  .from('arkadasliklar')
  .select('durum, gonderen_id')
  .or(`and(gonderen_id.eq.${kullanici.id},alici_id.eq.${katilim.kullanici_id}),and(gonderen_id.eq.${katilim.kullanici_id},alici_id.eq.${kullanici.id})`)
  .maybeSingle()
      if (data) setArkadasDurum(data)
    }
    kontrol()
  }, [katilim.kullanici_id, kullanici, benimKartim])

  const arkadasEkle = async () => {
    await supabase.from('arkadasliklar').insert({
      gonderen_id: kullanici.id,
      alici_id: katilim.kullanici_id,
    })
    setArkadasDurum({ durum: 'bekliyor', gonderen_id: kullanici.id })
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '0.5px solid #ebebE8' }}>
    <div onClick={() => onKullaniciTikla && onKullaniciTikla(katilim.kullanici_id)} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: gosterButon ? 12 : 0, cursor: 'pointer', flex: 1 }}> 
          {katilim.kullanicilar?.avatar_url ? (
          <img src={katilim.kullanicilar.avatar_url} alt="avatar" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: '#0F6E56', flexShrink: 0 }}>
            {baslarf}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', margin: '0 0 3px' }}>{katilim.kullanicilar?.isim || 'İsimsiz'}</p>
          <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>
            {katilim.kullanicilar?.pozisyon || 'Pozisyon belirtilmedi'} · {katilim.kullanicilar?.seviye || 'Seviye belirtilmedi'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, background: renk.bg, color: renk.text, whiteSpace: 'nowrap' }}>
            {renk.label}
          </span>
          {!benimKartim && kullanici && (
            <button onClick={(e) => { e.stopPropagation(); arkadasEkle() }} disabled={!!arkadasDurum} style={{              fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, border: 'none', cursor: arkadasDurum ? 'default' : 'pointer', whiteSpace: 'nowrap',
              background: arkadasDurum?.durum === 'onaylandi' ? '#e8f7f1' : arkadasDurum?.durum === 'bekliyor' ? '#f5f5f3' : '#e8eef7',
              color: arkadasDurum?.durum === 'onaylandi' ? '#0F6E56' : arkadasDurum?.durum === 'bekliyor' ? '#aaa' : '#185FA5',
            }}>
              {arkadasDurum?.durum === 'onaylandi' ? '✓ Arkadaş' : arkadasDurum?.durum === 'bekliyor' ? 'İstek gönderildi' : '+ Arkadaş ekle'}
            </button>
          )}
        </div>
      </div>

      {gosterButon && katilim.durum === 'bekliyor' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={onReddet} style={{ padding: '8px', borderRadius: 10, border: 'none', background: '#fdecea', color: '#c0392b', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Reddet
          </button>
          <button onClick={onOnayla} style={{ padding: '8px', borderRadius: 10, border: 'none', background: '#e8f7f1', color: '#0F6E56', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Onayla ✓
          </button>
        </div>
      )}
    </div>
  )
}

function IlanSayfa({ kullanici, bitti, geriDon }) {
  const [sahaAdi, setSahaAdi] = useState('')
  const [ilce, setIlce] = useState('')
  const [ilceler, setIlceler] = useState([])
  const [saat, setSaat] = useState('')
  const [tarafKisi, setTarafKisi] = useState(7)
  const [toplamKisi, setToplamKisi] = useState(14)
  const [seviye, setSeviye] = useState('Orta')
  const [aciklama, setAciklama] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState('')
  const [konum, setKonum] = useState(null)
  const [haritaAcik, setHaritaAcik] = useState(false)
  const [il, setIl] = useState('')
  const [kullaniciKonum, setKullaniciKonum] = useState([41.0082, 28.9784])
  const [aramaKonum, setAramaKonum] = useState('')
  const haritaRef = useRef(null)
  const [aramaKonumSonuclari, setAramaKonumSonuclari] = useState([])
  const [aramaYukleniyor, setAramaYukleniyor] = useState(false)


  useEffect(() => {
  const timer = setTimeout(() => {
    if (aramaKonum.length >= 3) konumAra(aramaKonum)
    else setAramaKonumSonuclari([])
  }, 500)
  return () => clearTimeout(timer)
}, [aramaKonum])

  useEffect(() => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => setKullaniciKonum([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { timeout: 5000 }
    )
  }
}, [])

const konumAra = async (sorgu) => {
  if (!sorgu.trim() || sorgu.length < 3) { setAramaKonumSonuclari([]); return }
  setAramaYukleniyor(true)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(sorgu)}&format=json&limit=5&addressdetails=1&countrycodes=tr&accept-language=tr`,
      { headers: { 'Accept-Language': 'tr', 'User-Agent': 'SahayaGel/1.0' } }
    )
    const data = await res.json()
    setAramaKonumSonuclari(data || [])
  } catch (e) {
    console.log('Arama hatası:', e)
  }
  setAramaYukleniyor(false)
}
  

 const yayinla = async () => {
if (!sahaAdi || !il || !ilce || !saat) { setHata('Lütfen tüm zorunlu alanları doldur.'); return }
  setYukleniyor(true); setHata('')

  let lat = konum?.lat || null
  let lng = konum?.lng || null

  // Konum seçilmediyse ilçe adından otomatik bul
  if (!lat || !lng) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ilce + ', İstanbul, Türkiye')}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'tr' } }
      )
      const data = await res.json()
      if (data && data.length > 0) {
        lat = parseFloat(data[0].lat)
        lng = parseFloat(data[0].lon)
      }
    } catch (e) {
      console.log('Konum bulunamadı:', e)
    }
  }

  const { error } = await supabase.from('maclar').insert({
    organizator_id: kullanici.id,
    saha_adi: sahaAdi,
    il,
    ilce,
    saat: new Date(saat).toISOString(),
    format: `${tarafKisi}v${tarafKisi}`,
    seviye,
    toplam_kisi: toplamKisi,
    aciklama,
    lat,
    lng,
  })

  if (error) { setHata('Bir hata oluştu, tekrar dene.'); setYukleniyor(false); return }
  bitti()
}

  return (
  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: '#f8f8f6' }}>

    {/* Header */}
    <div style={{ background: 'linear-gradient(135deg, #1D9E75, #16a085)', padding: '16px 22px 24px', flexShrink: 0 }}>
      <span onClick={geriDon} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 24, cursor: 'pointer', display: 'inline-block', marginBottom: 12 }}>‹</span>
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', letterSpacing: -0.5, color: '#fff' }}>Oyuncu ara</h2>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Grubunun eksiklerini tamamla</p>
    </div>

    <div style={{ flex: 1, padding: '20px 22px', overflowY: 'auto' }}>

      {/* Saha adı */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Saha adı *</p>
        <input
          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#1a1a1a', background: 'none', fontWeight: 500 }}
          placeholder="örn. Bostancı Saha A"
          value={sahaAdi}
          onChange={e => setSahaAdi(e.target.value)}
        />
      </div>

      {/* İl + İlçe yan yana */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>İl *</p>
          <select style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, color: il ? '#1a1a1a' : '#bbb', background: 'none', fontWeight: 500, cursor: 'pointer' }}
            value={il} onChange={e => {
              const secilenIl = e.target.value
              setIl(secilenIl)
              setIlce('')
              const city = getCities().find(c => c.name === secilenIl)
              const ilceleriGetir = city ? getDistrictsByCityCode(city.code) : []
              setIlceler(Array.isArray(ilceleriGetir) ? ilceleriGetir : Object.values(ilceleriGetir || {}))
            }}>
            <option value="">Seç</option>
            {getCities().sort((a, b) => a.name.localeCompare(b.name)).map(i => <option key={i.code} value={i.name}>{i.name}</option>)}
          </select>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', opacity: il ? 1 : 0.5 }}>
          <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>İlçe *</p>
          <select style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, color: ilce ? '#1a1a1a' : '#bbb', background: 'none', fontWeight: 500, cursor: 'pointer' }}
            value={ilce} onChange={e => setIlce(e.target.value)} disabled={!il}>
            <option value="">{il ? 'Seç' : '—'}</option>
            {ilceler.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
      </div>

      {/* Tarih ve saat */}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
  <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
    <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tarih *</p>
    <input type="date" style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, color: saat ? '#1a1a1a' : '#bbb', background: 'none', fontWeight: 500, cursor: 'pointer' }}
      value={saat ? saat.split('T')[0] : ''}
      min={new Date().toISOString().split('T')[0]}
      onChange={e => setSaat(prev => e.target.value + 'T' + (prev?.split('T')[1] || '00:00'))} />
  </div>
  <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
    <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Saat *</p>
    <input type="time" style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, color: saat ? '#1a1a1a' : '#bbb', background: 'none', fontWeight: 500, cursor: 'pointer' }}
      value={saat ? saat.split('T')[1] : ''}
      onChange={e => setSaat(prev => (prev?.split('T')[0] || '') + 'T' + e.target.value)} />
  </div>
</div>

      {/* Kaça Kaç */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '16px 16px 14px', marginBottom: 12, border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: '#aaa', margin: 0, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Kaça Kaç?</p>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#1D9E75', letterSpacing: -0.5 }}>{tarafKisi}v{tarafKisi}</span>
        </div>
        <input type="range" min="3" max="11" step="1" value={tarafKisi}
          onChange={e => { const yeni = parseInt(e.target.value); setTarafKisi(yeni); setToplamKisi(yeni * 2) }}
          style={{ width: '100%', accentColor: '#1D9E75', cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          {[3,4,5,6,7,8,9,10,11].map(n => (
            <span key={n} style={{ fontSize: 10, color: tarafKisi === n ? '#1D9E75' : '#ddd', fontWeight: tarafKisi === n ? 700 : 400 }}>{n}</span>
          ))}
        </div>
      </div>

      {/* Maksimum kişi */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '16px 16px 14px', marginBottom: 12, border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: '#aaa', margin: 0, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Maksimum kişi</p>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', letterSpacing: -0.5 }}>{toplamKisi}</span>
        </div>
        <input type="range" min="1" max={tarafKisi * 2} step="1" value={toplamKisi}
          onChange={e => setToplamKisi(parseInt(e.target.value))}
          style={{ width: '100%', accentColor: '#1D9E75', cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#aaa' }}>Min 1</span>
          <span style={{ fontSize: 11, color: '#1D9E75', fontWeight: 600 }}>Max {tarafKisi * 2}</span>
        </div>
      </div>

      {/* Seviye */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Seviye</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {['Amatör', 'Orta', 'İyi'].map(s => (
            <button key={s} onClick={() => setSeviye(s)} style={{
              padding: '10px', borderRadius: 12, textAlign: 'center', fontSize: 13, cursor: 'pointer', border: 'none',
              background: seviye === s ? '#1D9E75' : '#f5f5f3',
              color: seviye === s ? '#fff' : '#666',
              fontWeight: seviye === s ? 600 : 400,
              transition: 'all 0.15s',
            }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Açıklama */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Açıklama</p>
        <textarea style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, color: '#1a1a1a', resize: 'none', height: 70, fontFamily: 'inherit', background: 'none' }}
          placeholder="örn. Kaleci arıyoruz, orta seviye..."
          value={aciklama} onChange={e => setAciklama(e.target.value)} />
      </div>

      {/* Konum */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 8px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Konum (isteğe bağlı)</p>
        {haritaAcik ? (
          <div style={{ borderRadius: 16, overflow: 'hidden', border: '0.5px solid #ebebE8' }}>
  <div style={{ padding: '10px', background: '#fff', borderBottom: '0.5px solid #ebebE8', position: 'relative' }}>
  <div style={{ display: 'flex', gap: 8 }}>
    <input
      placeholder="Saha veya konum ara..."
      value={aramaKonum}
     onChange={e => setAramaKonum(e.target.value)}
      style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: '#1a1a1a', background: '#f5f5f3', borderRadius: 10, padding: '8px 12px' }}
    />
    {aramaYukleniyor && <span style={{ fontSize: 12, color: '#aaa', alignSelf: 'center' }}>...</span>}
  </div>

  {aramaKonumSonuclari.length > 0 && (
    <div style={{ position: 'absolute', left: 10, right: 10, top: 52, background: '#fff', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000, overflow: 'hidden', border: '0.5px solid #ebebE8' }}>
      {aramaKonumSonuclari.map((s, i) => (
        <div key={i} onClick={() => {
          const lat = parseFloat(s.lat)
          const lng = parseFloat(s.lon)
          setKonum({ lat, lng })
          setAramaKonum(s.display_name.split(',').slice(0, 2).join(','))
          setAramaKonumSonuclari([])
        }} style={{
          padding: '10px 14px', fontSize: 13, color: '#1a1a1a', cursor: 'pointer',
          borderBottom: i < aramaKonumSonuclari.length - 1 ? '0.5px solid #f0f0ee' : 'none',
          lineHeight: 1.4,
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#f5f5f3'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
        >
          <p style={{ margin: '0 0 2px', fontWeight: 500 }}>
  {s.name || s.display_name.split(',')[0]}
</p>
<p style={{ margin: 0, fontSize: 11, color: '#aaa' }}>
  {[s.address?.neighbourhood, s.address?.suburb, s.address?.district, s.address?.city].filter(Boolean).join(', ')}
</p>
      </div>
      ))}
    </div>
  )}
</div>
  <div style={{ height: 200 }}>
    <MapContainer center={konum ? [konum.lat, konum.lng] : kullaniciKonum} zoom={15} style={{ width: '100%', height: '100%' }}>
      <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
      <KonumSecici onKonumSec={(k) => setKonum(k)} />
      {konum && <Marker position={[konum.lat, konum.lng]} icon={sahaIkonu} />}
      <Marker position={kullaniciKonum} icon={new L.DivIcon({
        className: '',
        html: `<div style="width:18px;height:18px;background:#1D9E75;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(29,158,117,0.5);position:relative;"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:6px;height:6px;background:#fff;border-radius:50%;"></div></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })} />
      <HaritaMerkezi konum={konum} aramaKonum={aramaKonum} />
    </MapContainer>
  </div>
</div>
        ) : (
          <button onClick={() => setHaritaAcik(true)} style={{
            width: '100%', padding: '14px 16px', background: '#fff', border: '0.5px solid #ebebE8', borderRadius: 16, fontSize: 14, color: konum ? '#1D9E75' : '#aaa', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <span style={{ fontSize: 18 }}>📍</span>
            <span style={{ fontWeight: konum ? 500 : 400 }}>{konum ? `${konum.lat.toFixed(4)}, ${konum.lng.toFixed(4)} — seçildi ✓` : 'Haritadan konum seç'}</span>
          </button>
        )}
      </div>

      {hata && <p style={{ fontSize: 13, color: '#e74c3c', margin: '0 0 12px' }}>{hata}</p>}

      <button onClick={yayinla} disabled={yukleniyor} style={{
        width: '100%', padding: 16, background: 'linear-gradient(135deg, #1D9E75, #16a085)', color: '#fff', border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: 'pointer', letterSpacing: -0.2, boxShadow: '0 4px 12px rgba(29,158,117,0.3)', opacity: yukleniyor ? 0.6 : 1, marginBottom: 8,
      }}>
        {yukleniyor ? 'Yayınlanıyor...' : '⚽ İlanı yayınla'}
      </button>
    </div>
  </div>
)
}

function BildirimSayfa({ kullanici, bildirimler, setBildirimler, setOkunmamisSayisi, onBildirimTikla, onKullaniciTikla }) {
      const tumunuOku = async () => {
    await supabase
      .from('bildirimler')
      .update({ okundu: true })
      .eq('kullanici_id', kullanici.id)
      .eq('okundu', false)
    setBildirimler(prev => prev.map(b => ({ ...b, okundu: true })))
    setOkunmamisSayisi(0)
  }

 const bildirimOku = async (bildirim) => {
  await supabase.from('bildirimler').update({ okundu: true }).eq('id', bildirim.id)
  setBildirimler(prev => prev.map(b => b.id === bildirim.id ? { ...b, okundu: true } : b))
  setOkunmamisSayisi(prev => Math.max(0, prev - 1))

  if (bildirim.tip === 'mesaj' && !bildirim.mac_id && bildirim.gonderen_id) {
    // Özel mesaj bildirimi — özel sohbete git
    onKullaniciTikla && onKullaniciTikla(bildirim.gonderen_id)
    return
  }

  if (bildirim.mac_id && (bildirim.tip === 'mesaj' || bildirim.tip === 'basvuru' || bildirim.tip === 'onay' || bildirim.tip === 'red')) {
    const { data: mac } = await supabase
      .from('maclar')
      .select('*, kullanicilar!maclar_organizator_id_fkey(isim), katilimlar(id, durum)')
      .eq('id', bildirim.mac_id)
      .single()
    if (mac) {
      const aktifTab = bildirim.tip === 'mesaj' ? 'sohbet' : bildirim.tip === 'basvuru' ? 'basvurular' : 'detay'
      onBildirimTikla(mac, aktifTab)
    }
  }
}

  const tipIkon = {
    'mesaj': '💬',
    'basvuru': '👤',
    'onay': '✅',
    'red': '❌',
  }

  return (
  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
    <div style={{ padding: '14px 22px 12px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid #ebebE8' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>Bildirimler</h2>
      {bildirimler.some(b => !b.okundu) && (
        <button onClick={tumunuOku} style={{ fontSize: 13, color: '#1D9E75', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
          Tümünü oku
        </button>
      )}
    </div>

    <div style={{ flex: 1, overflowY: 'auto' }}>
      {bildirimler.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>🔔</div>
          <p style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', margin: '0 0 6px' }}>Bildirim yok</p>
          <p style={{ fontSize: 13, color: '#aaa', margin: 0 }}>Yeni bildirimler burada görünecek</p>
        </div>
      ) : bildirimler.map((b, i) => {
        const tipRenk = {
          'mesaj': { bg: '#e8f7f1', color: '#0F6E56' },
          'basvuru': { bg: '#e8eef7', color: '#185FA5' },
          'onay': { bg: '#e8f7f1', color: '#0F6E56' },
          'red': { bg: '#fdecea', color: '#c0392b' },
        }
        const renk = tipRenk[b.tip] || { bg: '#f0f0ee', color: '#888' }

        return (
          <div key={b.id} onClick={() => bildirimOku(b)} style={{
            display: 'flex', gap: 12, padding: '14px 22px',
            borderBottom: '1px solid #f0f0ee',
            background: b.okundu ? 'transparent' : '#f0faf6',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}>
         <div style={{ position: 'relative', flexShrink: 0 }}>
  {b.tip === 'mesaj' && b.gonderen_avatar ? (
    <img src={b.gonderen_avatar} style={{ width: 42, height: 42, borderRadius: 14, objectFit: 'cover' }} alt="profil" />
  ) : (
        <div onClick={(e) => { e.stopPropagation(); onKullaniciTikla && onKullaniciTikla(b.gonderen_id) }} style={{
      width: 42, height: 42, borderRadius: 14, flexShrink: 0,
      background: b.okundu ? '#f5f5f3' : renk.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
      cursor: 'pointer',
    }}>
      {tipIkon[b.tip] || '🔔'}
    </div>
  )}
 
</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                <p style={{ fontSize: 13, fontWeight: b.okundu ? 500 : 700, color: '#1a1a1a', margin: 0, letterSpacing: -0.2 }}>{b.baslik}</p>
                {!b.okundu && (
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#1D9E75', flexShrink: 0, marginTop: 4, marginLeft: 6 }} />
                )}
              </div>
              <p style={{ fontSize: 12, color: '#888', margin: '0 0 4px', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.icerik}</p>
              <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>
                {new Date(b.olusturuldu).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  </div>
)
}

function ProfilSayfa({ kullanici, setKullanici, onDegerlendirmeAc, setAktifEkran }) {
  const [profil, setProfil] = useState(null)
  const [duzenle, setDuzenle] = useState(false)
  const [isim, setIsim] = useState('')
  const [bio, setBio] = useState('')
  const [pozisyon, setPozisyon] = useState('')
  const [seviye, setSeviye] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [fotografYukleniyor, setFotografYukleniyor] = useState(false)
  const [maclarim, setMaclarim] = useState([])
  const [ilanlarim, setIlanlarim] = useState([])
  const [seciliMac, setSeciliMac] = useState(null)
  const [degerlendirilenMaclar, setDegerlendirilenMaclar] = useState([])
  const [arkadasSayisi, setArkadasSayisi] = useState(0)
  const [aktifProfilTab, setAktifProfilTab] = useState('ilanlar')
  const [ilanGoster, setIlanGoster] = useState(4)
  const [macGoster, setMacGoster] = useState(4)
  const [yorumlar, setYorumlar] = useState([])
  const [yorumGoster, setYorumGoster] = useState(2)
  

  const pozisyonlar = ['Kaleci', 'Defans', 'Orta saha', 'Forvet', 'Belirtilmedi']
  const seviyeler = ['Amatör', 'Orta', 'İyi', 'Profesyonel']

  const pozisyonRenk = {
    'Kaleci': { bg: '#fdecea', text: '#c0392b' },
    'Defans': { bg: '#e8eef7', text: '#185FA5' },
    'Orta saha': { bg: '#e8f7f1', text: '#0F6E56' },
    'Forvet': { bg: '#fdf3e8', text: '#854F0B' },
    'Belirtilmedi': { bg: '#f0f0ee', text: '#888' },
  }

  const seviyeRenk = {
    'Amatör': { bg: '#f0f0ee', text: '#888' },
    'Orta': { bg: '#e8f7f1', text: '#0F6E56' },
    'İyi': { bg: '#e8eef7', text: '#185FA5' },
    'Profesyonel': { bg: '#fdf3e8', text: '#854F0B' },
  }
  

  useEffect(() => {
    const profilGetir = async () => {
      console.log('kullanici id:', kullanici.id)  
      setYukleniyor(true)
      const { data: profilData } = await supabase
        .from('kullanicilar')
        .select('*')
        .eq('id', kullanici.id)
        .single()

      if (profilData) {
        setProfil(profilData)
        setIsim(profilData.isim || '')
        setBio(profilData.bio || '')
        setPozisyon(profilData.pozisyon || 'Belirtilmedi')
        setSeviye(profilData.seviye || 'Orta')
        if (profilData.avatar_url) setAvatarUrl(profilData.avatar_url)
      }

      const { data: katilimData } = await supabase
        .from('katilimlar')
        .select('*, maclar(id, saha_adi, ilce, saat, format, organizator_id)')
        .eq('kullanici_id', kullanici.id)
        .order('olusturuldu', { ascending: false })

      setMaclarim(katilimData || [])
      setYukleniyor(false)

      const { data: ilanlarimData } = await supabase
       .from('maclar')
        .select('*, katilimlar(id, durum)')
       .eq('organizator_id', kullanici.id)
       .order('saat', { ascending: false })

setIlanlarim(ilanlarimData || [])

const { count } = await supabase
  .from('arkadasliklar')
  .select('*', { count: 'exact', head: true })
  .or(`gonderen_id.eq.${kullanici.id},alici_id.eq.${kullanici.id}`)
  .eq('durum', 'onaylandi')
setArkadasSayisi(count || 0)

const { data: degerData } = await supabase
  .from('degerlendirmeler')
  .select('mac_id')
  .eq('degerlendiren_id', kullanici.id)
setDegerlendirilenMaclar((degerData || []).map(d => d.mac_id))

const { data: yorumData } = await supabase  
  .from('degerlendirmeler')
  .select('yorum, degerlendiren:degerlendiren_id(isim, avatar_url), guvenilirlik, beceri, takim_ruhu')
  .eq('degerlendirilen_id', kullanici.id)
  .not('yorum', 'is', null)
  .neq('yorum', '')
  .order('olusturuldu', { ascending: false })
  .limit(10)
  console.log('yorumlar:', yorumData)
  

setYorumlar(yorumData || [])
      
    }
    profilGetir()
  }, [kullanici.id])


  const fotografSec = async (e) => {
    const dosya = e.target.files[0]
    if (!dosya) return
    setFotografYukleniyor(true)

    const dosyaAdi = `${kullanici.id}/${Date.now()}.${dosya.name.split('.').pop()}`
    const { error: yukleHata } = await supabase.storage
      .from('avatars')
      .upload(dosyaAdi, dosya, { upsert: true })

    if (yukleHata) { setFotografYukleniyor(false); return }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(dosyaAdi)
    const yeniUrl = urlData.publicUrl

    await supabase.from('kullanicilar').update({ avatar_url: yeniUrl }).eq('id', kullanici.id)
    setAvatarUrl(yeniUrl)
    setProfil(prev => ({ ...prev, avatar_url: yeniUrl }))
    setFotografYukleniyor(false)
  }

  const kaydet = async () => {
    setKaydediliyor(true)
    const { error } = await supabase
      .from('kullanicilar')
      .update({ isim, bio, pozisyon, seviye })
      .eq('id', kullanici.id)
    if (!error) {
      setProfil(prev => ({ ...prev, isim, bio, pozisyon, seviye }))
      setDuzenle(false)
    }
    setKaydediliyor(false)
  }

const cikisYap = async () => {
  await supabase.auth.signOut()
  setKullanici(null)
  setAktifEkran('anasayfa')
}

  if (yukleniyor) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#aaa', fontSize: 14 }}>Yükleniyor...</p>
    </div>
  )
if (seciliMac) return (
  <DetaySayfa
    mac={{...seciliMac, organizator_id: seciliMac.organizator_id || kullanici.id}}
    kullanici={kullanici}
    geriDon={() => setSeciliMac(null)}
  />
)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px 12px', borderBottom: '0.5px solid #ebebE8', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Profilim</h2>
        <button onClick={() => setDuzenle(!duzenle)} style={{ fontSize: 13, color: '#1D9E75', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
          {duzenle ? 'İptal' : 'Düzenle'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
<div style={{ background: 'linear-gradient(135deg, #0a7055 0%, #1D9E75 60%, #25c48a 100%)', padding: '32px 22px 40px', position: 'relative', overflow: 'hidden' }}>
  <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
  <div style={{ position: 'absolute', bottom: -20, left: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />


          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16, position: 'relative', zIndex: 1, width: '100%', textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 88, height: 88, marginBottom: 14 }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="profil" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.3)' }} />
            ) : (
              <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>⚽</div>
            )}
            {duzenle && (
              <label style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={fotografSec} />
                {fotografYukleniyor ? (
                  <span style={{ fontSize: 10 }}>...</span>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 2v8M2 6h8" stroke="#1D9E75" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
              </label>
            )}
          </div>

          {duzenle ? (
            <input
              style={{ fontSize: 20, fontWeight: 500, background: 'rgba(255,255,255,0.15)', border: 'none', borderBottom: '1.5px solid rgba(255,255,255,0.5)', color: '#fff', padding: '4px 0', marginBottom: 10, width: '100%', outline: 'none' }}
              value={isim}
              onChange={e => setIsim(e.target.value)}
              placeholder="Adın"
            />
          ) : (
            <p style={{ fontSize: 20, fontWeight: 500, color: '#fff', margin: '0 0 6px', letterSpacing: -0.3 }}>{profil?.isim || 'İsimsiz'}</p>
          )}
          {profil?.rozet === 'guvenilir_organizator' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 20, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>🏅</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>Güvenilir Organizatör</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[profil?.pozisyon || 'Belirtilmedi', (profil?.seviye || 'Orta') + ' seviye', maclarim.length + ' maç'].map((chip, i) => (
              <span key={i} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, padding: '4px 12px', borderRadius: 20 }}>{chip}</span>
            ))}
          </div>
        </div>
        </div>


        <div style={{ padding: '20px 22px' }}>

          {/* İstatistikler */}
         <div style={{ marginBottom: 20 }}>
  {/* Puan kartı */}
  {profil?.ortalama_puan > 0 && (
    <div style={{ background: 'linear-gradient(135deg, #1D9E75, #0a7055)', borderRadius: 16, padding: '16px 20px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px', fontWeight: 500 }}>Ortalama Puan</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: -0.5 }}>{profil.ortalama_puan}</span>
          <span style={{ fontSize: 20 }}>⭐</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>({profil.degerlendirme_sayisi} değerlendirme)</span>
        </div>
      </div>
      <div style={{ fontSize: 40, opacity: 0.3 }}>🏆</div>
    </div>
  )}

  {/* İstatistik kartları */}
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
    {[
      { sayi: maclarim.length, label: 'Toplam maç', renk: '#1D9E75' },
      { sayi: maclarim.filter(m => new Date(m.maclar?.saat) < new Date()).length, label: 'Oynandı', renk: '#854F0B' },
      { sayi: arkadasSayisi, label: 'Arkadaş', renk: '#185FA5' },
    ].map((s, i) => (
      <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '14px 10px', textAlign: 'center', border: '0.5px solid #ebebE8', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderTop: `3px solid ${s.renk}` }}>
  <p style={{ fontSize: 26, fontWeight: 700, color: s.renk, margin: '0 0 4px', letterSpacing: -0.5 }}>{s.sayi}</p>
  <p style={{ fontSize: 11, color: '#aaa', margin: 0, fontWeight: 500 }}>{s.label}</p>
</div>
    ))}
  </div>
</div>

          {/* Bio */}
          <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 14, border: '0.5px solid #ebebE8' }}>
            <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 8px', fontWeight: 500 }}>Hakkımda</p>
            {duzenle ? (
              <textarea
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: 13, color: '#1a1a1a', resize: 'none', height: 70, fontFamily: 'inherit' }}
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Kendini tanıt, hangi pozisyonda oynadığını yaz..."
              />
            ) : (
              <p style={{ fontSize: 13, color: profil?.bio ? '#555' : '#bbb', margin: 0, lineHeight: 1.6 }}>
                {profil?.bio || 'Henüz bir şey yazılmamış.'}
              </p>
            )}
          </div>

          {/* Pozisyon ve Seviye — sadece düzenleme modunda */}
          {duzenle && (
            <>
              <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 14, border: '0.5px solid #ebebE8' }}>
                <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 10px', fontWeight: 500 }}>Pozisyon</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {pozisyonlar.map(p => (
                    <button key={p} onClick={() => setPozisyon(p)} style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
                      background: pozisyon === p ? pozisyonRenk[p]?.bg : '#f5f5f3',
                      color: pozisyon === p ? pozisyonRenk[p]?.text : '#888',
                    }}>{p}</button>
                  ))}
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 14, border: '0.5px solid #ebebE8' }}>
                <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 10px', fontWeight: 500 }}>Seviye</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {seviyeler.map(s => (
                    <button key={s} onClick={() => setSeviye(s)} style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
                      background: seviye === s ? seviyeRenk[s]?.bg : '#f5f5f3',
                      color: seviye === s ? seviyeRenk[s]?.text : '#888',
                    }}>{s}</button>
                  ))}
                </div>
              </div>

              <button onClick={kaydet} disabled={kaydediliyor} style={{ width: '100%', padding: 14, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 500, cursor: 'pointer', marginBottom: 10, opacity: kaydediliyor ? 0.6 : 1 }}>
                {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </>
          )}
{!duzenle && (
  <>
    <div style={{ display: 'flex', borderBottom: '0.5px solid #ebebE8', marginBottom: 16, marginLeft: -22, marginRight: -22, paddingLeft: 22 }}>
      {[
        { id: 'ilanlar', label: `İlanlarım (${ilanlarim.length})` },
        { id: 'maclar', label: `Maçlarım (${maclarim.length})` },
      ].map(tab => (
        <button key={tab.id} onClick={() => setAktifProfilTab(tab.id)} style={{
          padding: '10px 16px', fontSize: 13, fontWeight: aktifProfilTab === tab.id ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer',
          color: aktifProfilTab === tab.id ? '#1D9E75' : '#aaa',
          borderBottom: aktifProfilTab === tab.id ? '2px solid #1D9E75' : '2px solid transparent',
        }}>{tab.label}</button>
      ))}
    </div>

    {aktifProfilTab === 'ilanlar' && (
      ilanlarim.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <p style={{ fontSize: 13, color: '#aaa' }}>Henüz ilan açmadın</p>
        </div>
      ) : ilanlarim.slice(0, ilanGoster).map((mac, i) => {
        const onaylanan = mac.katilimlar?.filter(k => k.durum === 'onaylandi').length || 0
        const bekleyen = mac.katilimlar?.filter(k => k.durum === 'bekliyor').length || 0
        const tarih = new Date(mac.saat).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        const gecti = new Date(mac.saat) < new Date()
        return (
          <div key={i} onClick={() => setSeciliMac(mac)} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '0.5px solid #ebebE8', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', margin: '0 0 3px', textTransform: 'capitalize' }}>{mac.saha_adi}</p>
                <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{mac.ilce} · {tarih}</p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, background: gecti ? '#f5f5f3' : '#e8f7f1', color: gecti ? '#aaa' : '#0F6E56', whiteSpace: 'nowrap' }}>
                {gecti ? 'Tamamlandı' : 'Aktif'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#e8f7f1', color: '#0F6E56', fontWeight: 500 }}>✓ {onaylanan} onaylı</span>
              {bekleyen > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#fdf3e8', color: '#854F0B', fontWeight: 500 }}>⏳ {bekleyen} bekliyor</span>}
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f5f5f3', color: '#888' }}>{mac.format}</span>
            </div>
            {gecti && onaylanan > 0 && !degerlendirilenMaclar.includes(mac.id) && (
              <button onClick={async (e) => {
                e.stopPropagation()
                const { data: katilimData } = await supabase
                  .from('katilimlar')
                  .select('*, kullanicilar(isim, avatar_url)')
                  .eq('mac_id', mac.id)
                  .eq('durum', 'onaylandi')
                onDegerlendirmeAc({ ...mac }, katilimData || [])
              }} style={{ width: '100%', padding: '8px', background: '#e8f7f1', color: '#0F6E56', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 10 }}>
                ⭐ Oyuncuları değerlendir
              </button>
            )}
          </div>
        )
})
    )}
          {ilanlarim.length > ilanGoster && (
  <button onClick={() => setIlanGoster(prev => prev + 4)} style={{ width: '100%', padding: '10px', background: 'none', border: '0.5px solid #ebebE8', borderRadius: 12, fontSize: 13, color: '#1D9E75', fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
    Daha fazla göster ({ilanlarim.length - ilanGoster} ilan daha)
  </button>
)}

    {aktifProfilTab === 'maclar' && (
      maclarim.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <p style={{ fontSize: 32, margin: '0 0 10px' }}>⚽</p>
          <p style={{ fontSize: 13, color: '#aaa' }}>Henüz hiç maça katılmadın</p>
        </div>
      ) : maclarim.slice(0, macGoster).map((k, i) => {
        const gecti = new Date(k.maclar?.saat) < new Date()
        const tarih = new Date(k.maclar?.saat).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        return (
          <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '0.5px solid #ebebE8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: gecti ? 10 : 0 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', margin: '0 0 3px', textTransform: 'capitalize' }}>{k.maclar?.saha_adi}</p>
                <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{k.maclar?.ilce} · {tarih}</p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, background: gecti ? '#f5f5f3' : '#e8f7f1', color: gecti ? '#aaa' : '#0F6E56' }}>
                {gecti ? 'Oynandı' : 'Yaklaşıyor'}
              </span>
            </div>
            {gecti && !degerlendirilenMaclar.includes(k.mac_id) && (
              <button onClick={async () => {
                const macId = k.mac_id
                const { data: katilimData } = await supabase
                  .from('katilimlar')
                  .select('*, kullanicilar(isim, avatar_url)')
                  .eq('mac_id', macId)
                  .eq('durum', 'onaylandi')
                onDegerlendirmeAc({ ...k.maclar, id: macId }, katilimData || [])
              }} style={{ width: '100%', padding: '8px', background: '#e8f7f1', color: '#0F6E56', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ⭐ Oyuncuları değerlendir
              </button>
            )}
          </div>
        )
})
    )}
        {maclarim.length > macGoster && (
  <button onClick={() => setMacGoster(prev => prev + 4)} style={{ width: '100%', padding: '10px', background: 'none', border: '0.5px solid #ebebE8', borderRadius: 12, fontSize: 13, color: '#1D9E75', fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
    Daha fazla göster ({maclarim.length - macGoster} maç daha)
  </button>
)}
  </>
)}
{yorumlar.length > 0 && (
  <>
    <p style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 12px', color: '#1a1a1a' }}>Hakkımdaki yorumlar</p>
    {yorumlar.slice(0, yorumGoster).map((y, i) => (
      <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '0.5px solid #ebebE8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {y.degerlendiren?.avatar_url
            ? <img src={y.degerlendiren.avatar_url} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} alt="" />
            : <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#0F6E56' }}>{y.degerlendiren?.isim?.slice(0,1)}</div>
          }
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{y.degerlendiren?.isim}</span>
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>⭐ {((y.guvenilirlik + y.beceri + y.takim_ruhu) / 3).toFixed(1)}</span>
        </div>
        <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.5 }}>{y.yorum}</p>
      </div>
    ))}
    {yorumlar.length > yorumGoster && (
  <button onClick={() => setYorumGoster(yorumlar.length)} style={{ fontSize: 13, color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: '4px 0' }}>
    Tümünü gör ({yorumlar.length - yorumGoster} yorum daha)
  </button>
)}
  </>
)}
          {!duzenle && (
            <button onClick={cikisYap} style={{ width: '100%', padding: 14, background: '#fdecea', color: '#c0392b', border: 'none', borderRadius: 14, fontSize: 14, fontWeight: 500, cursor: 'pointer', marginTop: 10 }}>
              Çıkış yap
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
async function bildirimGonder(kullaniciId, baslik, icerik, tip, macId, gonderenAvatar = null, gonderenId = null) {
  await supabase.from('bildirimler').insert({
    kullanici_id: kullaniciId,
    baslik,
    icerik,
    tip,
    mac_id: macId,
    gonderen_avatar: gonderenAvatar,
    gonderen_id: gonderenId,
  })
}

function KonumSecici({ onKonumSec }) {
  useMapEvents({
    click(e) {
      onKonumSec({ lat: e.latlng.lat, lng: e.latlng.lng })
    }
  })
  return null
}

function HaritaMerkezi({ konum }) {
  const map = useMapEvents({})
  useEffect(() => {
    if (konum) {
      map.setView([konum.lat, konum.lng], 16)
    }
  }, [konum, map])
  return null
}

function HaritaSayfa({ maclar, geriDon, macaGit }) {
  const [aktifTip, setAktifTip] = useState('hepsi')
  const istanbul = [41.0082, 28.9784]
  const [merkez, setMerkez] = useState(istanbul)
  const [konumYukleniyor, setKonumYukleniyor] = useState(true)
  const haritaRef = useRef(null)

useEffect(() => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
     (pos) => {
  const yeniMerkez = [pos.coords.latitude, pos.coords.longitude]
  setMerkez(yeniMerkez)
  setKonumYukleniyor(false)
  if (haritaRef.current) {
    haritaRef.current.setView(yeniMerkez, 14)
  }
},
      () => {
        setKonumYukleniyor(false)
      },
      { timeout: 5000 }
    )
  } else {
    setKonumYukleniyor(false)
  }
}, [])

  const sahalar = maclar.filter(m => m.lat && m.lng && (!m.katilimlar || m.toplam_kisi > (m.katilimlar?.filter(k => k.durum === 'onaylandi').length || 0)))

  return (
  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
    <div style={{ padding: '14px 22px 10px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>Harita</h2>
      <button onClick={geriDon} style={{ fontSize: 13, color: '#1D9E75', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Kapat</button>
    </div>

    {/* Filtre + legend */}
    <div style={{ padding: '0 22px 10px', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {[
          { id: 'hepsi', label: 'Hepsi' },
          { id: 'ilan', label: 'İlanlar' },
          { id: 'saha', label: 'Sahalar' },
        ].map(f => (
          <button key={f.id} onClick={() => setAktifTip(f.id)} style={{
            padding: '6px 16px', borderRadius: 24, fontSize: 13, fontWeight: aktifTip === f.id ? 600 : 400, cursor: 'pointer', border: 'none',
            background: aktifTip === f.id ? '#1a1a1a' : '#fff',
            color: aktifTip === f.id ? '#fff' : '#666',
            boxShadow: aktifTip === f.id ? 'none' : '0 0 0 1px #e8e8e4',
            transition: 'all 0.15s',
          }}>{f.label}</button>
        ))}
      </div>
      
    </div>

    {/* Harita — tam genişlik, kenarsız */}
    <div style={{ flex: 1, overflow: 'hidden' }}>
      <MapContainer center={merkez} zoom={14} style={{ flex: 1, overflow: 'hidden', borderRadius: 0, width: '100%', height: '100%' }} ref={haritaRef} whenCreated={map => haritaRef.current = map} zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://carto.com/" style="font-size:9px;opacity:0.5">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        {/* Kullanıcı konumu */}
        {!konumYukleniyor && merkez !== istanbul && (
          <Marker position={merkez} icon={new L.DivIcon({
            className: '',
            html: `
              <div style="width:22px;height:22px;background:#1D9E75;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(29,158,117,0.5);position:relative;">
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;background:#fff;border-radius:50%;"></div>
              </div>
            `,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          })}>
            <Popup><p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Buradasın</p></Popup>
          </Marker>
        )}

        {/* İlanlar */}
        {sahalar.map(mac => (
          (aktifTip === 'hepsi' || aktifTip === 'ilan') && (
            <Marker key={mac.id} position={[mac.lat, mac.lng]} icon={new L.DivIcon({
              className: '',
              html: `
                <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
                  <div style="width:42px;height:42px;border-radius:50%;border:3px solid #1D9E75;overflow:hidden;background:#e8f7f1;box-shadow:0 2px 10px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#0F6E56;">
                    ${mac.kullanicilar?.avatar_url
                      ? `<img src="${mac.kullanicilar.avatar_url}" style="width:100%;height:100%;object-fit:cover;" />`
                      : `<span>${(mac.kullanicilar?.isim || '?').slice(0, 2).toUpperCase()}</span>`
                    }
                  </div>
                  <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #1D9E75;margin-top:-1px;"></div>
                </div>
              `,
              iconSize: [42, 50],
              iconAnchor: [21, 50],
              popupAnchor: [0, -52],
            })}>
             <Popup>
              <div style={{ minWidth: 160 }}>
                <p style={{ fontWeight: 600, margin: '0 0 4px', fontSize: 13 }}>{mac.saha_adi}</p>
                <p style={{ color: '#888', margin: '0 0 4px', fontSize: 12 }}>{mac.ilce} · {mac.format}</p>
                <p style={{ color: '#1D9E75', margin: '0 0 8px', fontSize: 12, fontWeight: 600 }}>
                  {mac.toplam_kisi - (mac.katilimlar?.filter(k => k.durum === 'onaylandi').length || 0)} yer açık
                </p>
                <button onClick={() => macaGit(mac)} style={{ width: '100%', padding: '6px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Detaya git →
                </button>
              </div>
            </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  </div>
)
}

function DegerlendirmeSayfa({ kullanici, mac, katilimcilar, geriDon }) {
  const [degerlendirmeler, setDegerlendirmeler] = useState({})
  const [yorumlar, setYorumlar] = useState({})
  const [gonderiyor, setGonderiyor] = useState(false)
  const [tamamlandi, setTamamlandi] = useState(false)
  const [organizator, setOrganizator] = useState(null)

  const degerlendirilecekler = katilimcilar.filter(k => 
  k.kullanici_id !== kullanici.id
)
useEffect(() => {
  if (!mac.organizator_id || mac.organizator_id === kullanici.id) return
  const getir = async () => {
    const { data } = await supabase
      .from('kullanicilar')
      .select('id, isim, avatar_url')
      .eq('id', mac.organizator_id)
      .single()
    if (data) setOrganizator(data)
  }
  getir()
}, [mac.organizator_id, kullanici.id])

// Organizatörü de ekle
const organizatorVar = mac.organizator_id && mac.organizator_id !== kullanici.id

  const puanSec = (kullaniciId, kriter, puan) => {
    setDegerlendirmeler(prev => ({
      ...prev,
      [kullaniciId]: { ...prev[kullaniciId], [kriter]: puan }
    }))
  }

  const gonder = async () => {
    setGonderiyor(true)
    for (const k of degerlendirilecekler) {
      const d = degerlendirmeler[k.kullanici_id]
      if (!d || !d.guvenilirlik) continue
      
     await supabase.from('degerlendirmeler').upsert({
  mac_id: mac.id,
  degerlendiren_id: kullanici.id,
  degerlendirilen_id: k.kullanici_id,
  guvenilirlik: d.guvenilirlik || 0,
  beceri: d.beceri || 0,
  takim_ruhu: d.takim_ruhu || 0,
  yorum: yorumlar[k.kullanici_id] || null,
  
}, 
{ onConflict: 'mac_id,degerlendiren_id,degerlendirilen_id' })

      // Ortalama güncelle
      const { data: tumDeger } = await supabase
        .from('degerlendirmeler')
        .select('guvenilirlik, beceri, takim_ruhu')
        .eq('degerlendirilen_id', k.kullanici_id)

      if (tumDeger && tumDeger.length > 0) {
  const ort = tumDeger.reduce((acc, d) => 
    acc + (d.guvenilirlik + d.beceri + d.takim_ruhu) / 3, 0) / tumDeger.length
  
  const { error: updateError } = await supabase
    .from('kullanicilar')
    .update({ 
      ortalama_puan: Math.round(ort * 10) / 10,
      degerlendirme_sayisi: tumDeger.length 
    })
    .eq('id', k.kullanici_id)
  }
    }
    // Organizatörü değerlendir
if (organizator) {
  const d = degerlendirmeler[organizator.id]
  if (d?.guvenilirlik) {
    await supabase.from('degerlendirmeler').upsert({
      mac_id: mac.id,
      degerlendiren_id: kullanici.id,
      degerlendirilen_id: organizator.id,
      guvenilirlik: d.guvenilirlik || 0,
      beceri: d.beceri || 0,
      takim_ruhu: d.takim_ruhu || 0,
    }, { onConflict: 'mac_id,degerlendiren_id,degerlendirilen_id' })

    const { data: tumDeger } = await supabase
      .from('degerlendirmeler')
      .select('guvenilirlik, beceri, takim_ruhu')
      .eq('degerlendirilen_id', organizator.id)

    if (tumDeger && tumDeger.length > 0) {
      const ort = tumDeger.reduce((acc, d) => 
        acc + (d.guvenilirlik + d.beceri + d.takim_ruhu) / 3, 0) / tumDeger.length
      await supabase.from('kullanicilar')
        .update({ 
          ortalama_puan: Math.round(ort * 10) / 10,
          degerlendirme_sayisi: tumDeger.length 
        })
        .eq('id', organizator.id)
    }
  }
}

// Rozet kontrolü — tüm değerlendirilenler için
const kontrolEdilecekler = [
  ...degerlendirilecekler.map(k => k.kullanici_id),
  ...(organizator?.id ? [organizator.id] : [])
].filter(Boolean)

for (const hedefId of kontrolEdilecekler) {
  const { data: hedefProfil } = await supabase
    .from('kullanicilar')
    .select('ortalama_puan, degerlendirme_sayisi')
    .eq('id', hedefId)
    .single()

  const { count: macSayisi } = await supabase
    .from('maclar')
    .select('*', { count: 'exact', head: true })
    .eq('organizator_id', hedefId)


  if (
    hedefProfil?.ortalama_puan >= 4.5 &&
    hedefProfil?.degerlendirme_sayisi >= 5 &&
    macSayisi >= 5
  ) {
    await supabase
      .from('kullanicilar')
      .update({ rozet: 'guvenilir_organizator' })
      .eq('id', hedefId)
  }
}

    setGonderiyor(false)
    setTamamlandi(true)
  }

const YildizPuan = ({ kullaniciId, kriter, label }) => {
  const puan = degerlendirmeler[kullaniciId]?.[kriter] || 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <p style={{ fontSize: 12, color: '#aaa', margin: 0, fontWeight: 500 }}>{label}</p>
        <p style={{ fontSize: 12, color: '#1D9E75', margin: 0, fontWeight: 700 }}>{puan > 0 ? puan + '/5' : '—'}</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4, 5].map(y => (
          <div key={y} onClick={() => puanSec(kullaniciId, kriter, y)} style={{
            flex: 1, height: 8, borderRadius: 4, cursor: 'pointer',
            background: puan >= y ? '#1D9E75' : '#f0f0ee',
            transition: 'background 0.2s',
          }} />
        ))}
      </div>
    </div>
  )
}

  if (tamamlandi) return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <p style={{ fontSize: 48, margin: '0 0 16px' }}>🎉</p>
      <p style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px' }}>Teşekkürler!</p>
      <p style={{ fontSize: 14, color: '#aaa', textAlign: 'center', margin: '0 0 24px' }}>Değerlendirmelerin kaydedildi.</p>
      <button onClick={geriDon} style={{ padding: '12px 32px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
        Tamam
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px 12px', borderBottom: '0.5px solid #ebebE8', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span onClick={geriDon} style={{ fontSize: 28, color: '#1D9E75', cursor: 'pointer', fontWeight: 600 }}>‹</span>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Oyuncuları değerlendir</p>
          <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>{mac.saha_adi}</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
        {degerlendirilecekler.length === 0 && !organizator ? (
  <div style={{ textAlign: 'center', padding: '40px 0' }}>
    <p style={{ fontSize: 14, color: '#aaa' }}>Değerlendirilecek oyuncu yok</p>
  </div>
) : <>
  {organizator && (
    <div style={{ background: '#fff', borderRadius: 16, padding: '16px', marginBottom: 14, border: '0.5px solid #ebebE8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        {organizator.avatar_url ? (
          <img src={organizator.avatar_url} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} alt="avatar" />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, color: '#0F6E56' }}>
            {organizator.isim?.slice(0, 2).toUpperCase() || '?'}
          </div>
        )}
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 2px' }}>{organizator.isim || 'İsimsiz'}</p>
          <span style={{ fontSize: 11, color: '#1D9E75', fontWeight: 500 }}>👑 Organizatör</span>
        </div>
      </div>
      <YildizPuan kullaniciId={organizator.id} kriter="guvenilirlik" label="Güvenilirlik" />
      <YildizPuan kullaniciId={organizator.id} kriter="beceri" label="Beceri" />
      <YildizPuan kullaniciId={organizator.id} kriter="takim_ruhu" label="Takım ruhu" />
    </div>
  )}
  {degerlendirilecekler.map(k => (
          <div key={k.kullanici_id} style={{ background: '#fff', borderRadius: 16, padding: '16px', marginBottom: 14, border: '0.5px solid #ebebE8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              {k.kullanicilar?.avatar_url ? (
                <img src={k.kullanicilar.avatar_url} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} alt="avatar" />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, color: '#0F6E56' }}>
                  {k.kullanicilar?.isim?.slice(0, 2).toUpperCase() || '?'}
                </div>
              )}
              <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{k.kullanicilar?.isim || 'İsimsiz'}</p>
            </div>

            <YildizPuan kullaniciId={k.kullanici_id} kriter="guvenilirlik" label="Güvenilirlik (geldi mi?)" />
            <YildizPuan kullaniciId={k.kullanici_id} kriter="beceri" label="Beceri" />
            <YildizPuan kullaniciId={k.kullanici_id} kriter="takim_ruhu" label="Takım ruhu" />

            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 4px', fontWeight: 500 }}>Yorum (isteğe bağlı)</p>
              <input
                placeholder="Bu oyuncu hakkında ne düşünüyorsun?"
                value={yorumlar[k.kullanici_id] || ''}
                onChange={e => setYorumlar(prev => ({ ...prev, [k.kullanici_id]: e.target.value }))}
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: 13, color: '#1a1a1a', background: '#f5f5f3', borderRadius: 10, padding: '10px 12px' }}
              />
            </div>
          </div>
        ))}
</>}

        <button onClick={gonder} disabled={gonderiyor} style={{
          width: '100%', padding: 16, background: 'linear-gradient(135deg, #1D9E75, #0a7055)', color: '#fff', border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 16, opacity: gonderiyor ? 0.6 : 1
        }}>
          {gonderiyor ? 'Gönderiliyor...' : 'Değerlendirmeleri gönder'}
        </button>
      </div>
    </div>
  )
}

function KullaniciProfil({ kullanici, hedefId, geriDon, onMesajAc, onKullaniciTikla }) {
  const [profil, setProfil] = useState(null)
  const [arkadasDurum, setArkadasDurum] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [maclar, setMaclar] = useState([])
  const [yorumlar, setYorumlar] = useState([])
  const [yorumGoster, setYorumGoster] = useState(2)


  useEffect(() => {
    const getir = async () => {
      setYukleniyor(true)

      const { data: profilData } = await supabase
        .from('kullanicilar')
        .select('*')
        .eq('id', hedefId)
        .single()
      setProfil(profilData)

      const { data: arkData } = await supabase
        .from('arkadasliklar')
        .select('*')
        .or(`and(gonderen_id.eq.${kullanici.id},alici_id.eq.${hedefId}),and(gonderen_id.eq.${hedefId},alici_id.eq.${kullanici.id})`)
        .maybeSingle()
      if (arkData) setArkadasDurum(arkData)

      const { data: katilimData } = await supabase
        .from('katilimlar')
        .select('*, maclar(saha_adi, ilce, saat, format)')
        .eq('kullanici_id', hedefId)
        .eq('durum', 'onaylandi')
        .order('olusturuldu', { ascending: false })
        .limit(5)
      setMaclar(katilimData || [])
      const { data: yorumData } = await supabase
        .from('degerlendirmeler')
        .select('yorum, degerlendiren:degerlendiren_id(isim, avatar_url), guvenilirlik, beceri, takim_ruhu')
        .eq('degerlendirilen_id', hedefId)
        .not('yorum', 'is', null)
        .neq('yorum', '')
        .order('olusturuldu', { ascending: false })
        .limit(10)
      setYorumlar(yorumData || [])

      setYukleniyor(false)
    }
    getir()
  }, [hedefId, kullanici.id])

  const arkadasEkle = async () => {
    const { data } = await supabase.from('arkadasliklar').insert({
      gonderen_id: kullanici.id,
      alici_id: hedefId,
    }).select().single()
    if (data) setArkadasDurum(data)
  }

  const arkadasKabul = async () => {
    await supabase.from('arkadasliklar').update({ durum: 'onaylandi' }).eq('id', arkadasDurum.id)
    setArkadasDurum(prev => ({ ...prev, durum: 'onaylandi' }))
  }


  const benimProfil = hedefId === kullanici.id
  const arkadaş = arkadasDurum?.durum === 'onaylandi'
  const istekGonderildi = arkadasDurum?.durum === 'bekliyor' && arkadasDurum?.gonderen_id === kullanici.id
  const istekAlindi = arkadasDurum?.durum === 'bekliyor' && arkadasDurum?.alici_id === kullanici.id

  if (yukleniyor) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#aaa' }}>Yükleniyor...</p>
    </div>
  )

  return (
  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
    
    {/* Header bar */}
    <div style={{ padding: '14px 22px 0', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span onClick={geriDon} style={{ fontSize: 28, color: '#1D9E75', cursor: 'pointer', fontWeight: 600 }}>‹</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>Profil</span>
    </div>

    <div style={{ flex: 1, overflowY: 'auto' }}>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(to bottom, #1D9E75, #0a7055)', padding: '24px 22px 32px', position: 'relative', overflow: 'hidden' }}>
        {/* Dekoratif çember */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.1)' }} />
        <div style={{ position: 'absolute', bottom: -30, left: -20, width: 120, height: 120, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.1)' }} />

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          {/* Avatar */}
          <div style={{ flexShrink: 0 }}>
            {profil?.avatar_url ? (
              <img src={profil.avatar_url} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.4)' }} alt="avatar" />
            ) : (
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, border: '3px solid rgba(255,255,255,0.3)' }}>⚽</div>
            )}
          </div>

          {/* Bilgi */}
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 6px', letterSpacing: -0.5 }}>{profil?.isim || 'İsimsiz'}</p>
            {profil?.rozet === 'guvenilir_organizator' && (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 20, marginBottom: 8 }}>
    <span style={{ fontSize: 14 }}>🏅</span>
    <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>Güvenilir Organizatör</span>
  </div>
)}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {profil?.pozisyon && profil.pozisyon !== 'Belirtilmedi' && (
                <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>{profil.pozisyon}</span>
              )}
              {profil?.seviye && (
                <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>{profil.seviye}</span>
              )}
              {profil?.ortalama_puan > 0 && (
                <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
                  ⭐ {profil.ortalama_puan} ({profil.degerlendirme_sayisi} değerlendirme)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Aksiyon butonları */}
        {!benimProfil && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, position: 'relative', zIndex: 1 }}>
            {arkadaş ? (
              <button onClick={() => onMesajAc && onMesajAc(profil)} style={{ flex: 1, padding: '10px', borderRadius: 12, background: '#fff', color: '#1D9E75', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                💬 Mesaj gönder
              </button>
            ) : istekGonderildi ? (
              <div style={{ flex: 1, padding: '10px', borderRadius: 12, background: 'rgba(255,255,255,0.15)', color: '#fff', textAlign: 'center', fontSize: 13, fontWeight: 500 }}>
                ⏳ İstek gönderildi
              </div>
            ) : istekAlindi ? (
              <button onClick={arkadasKabul} style={{ flex: 1, padding: '10px', borderRadius: 12, background: '#fff', color: '#1D9E75', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                ✓ Arkadaşlığı kabul et
              </button>
            ) : (
              <>
                <button onClick={arkadasEkle} style={{ flex: 1, padding: '10px', borderRadius: 12, background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  + Arkadaş ekle
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* İstatistikler */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '16px 22px 0' }}>
        {[
          { sayi: maclar.length, label: 'Maç' },
          { sayi: profil?.ortalama_puan ? `${profil.ortalama_puan}` : '—', label: 'Ort. Puan', kucuk: true },
          { sayi: profil?.degerlendirme_sayisi || 0, label: 'Değerlendirme' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '12px 10px', textAlign: 'center', border: '0.5px solid #ebebE8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <p style={{ fontSize: s.kucuk ? 14 : 24, fontWeight: 700, color: '#1D9E75', margin: '0 0 4px', letterSpacing: -0.3 }}>{s.sayi}</p>
            <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 22px' }}>

        {/* Bio */}
        {profil?.bio && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 14, border: '0.5px solid #ebebE8' }}>
            <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 6px', fontWeight: 500 }}>Hakkında</p>
            <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.6 }}>{profil.bio}</p>
          </div>
        )}

        {/* Son maçlar */}
        {maclar.length > 0 ? (
          <>
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: '#1a1a1a' }}>Son maçlar</p>
            {maclar.map((k, i) => {
              const gecti = new Date(k.maclar?.saat) < new Date()
              const tarih = new Date(k.maclar?.saat).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
              return (
                <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '0.5px solid #ebebE8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', margin: '0 0 3px', textTransform: 'capitalize' }}>{k.maclar?.saha_adi}</p>
                    <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{k.maclar?.ilce} · {tarih}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#f5f5f3', color: '#888' }}>{k.maclar?.format}</span>
                    <span style={{ fontSize: 10, color: gecti ? '#aaa' : '#1D9E75', fontWeight: 500 }}>{gecti ? 'Oynandı' : 'Yaklaşıyor'}</span>
                  </div>
                </div>
              )
            })}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <p style={{ fontSize: 32, margin: '0 0 10px' }}>⚽</p>
            <p style={{ fontSize: 13, color: '#aaa' }}>Henüz maç yok</p>
          </div>
        )}
        {yorumlar.length > 0 && (
  <>
    <p style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 12px', color: '#1a1a1a' }}>Yorumlar</p>
    {yorumlar.slice(0, yorumGoster).map((y, i) => (
      <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '0.5px solid #ebebE8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {y.degerlendiren?.avatar_url
            ? <img src={y.degerlendiren.avatar_url} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} alt="" />
            : <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#0F6E56' }}>{y.degerlendiren?.isim?.slice(0,1)}</div>
          }
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{y.degerlendiren?.isim}</span>
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>⭐ {((y.guvenilirlik + y.beceri + y.takim_ruhu) / 3).toFixed(1)}</span>
        </div>
        <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.5 }}>{y.yorum}</p>
      </div>
    ))}
    {yorumlar.length > yorumGoster && (
  <button onClick={() => setYorumGoster(yorumlar.length)} style={{ fontSize: 13, color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: '4px 0' }}>
    Tümünü gör ({yorumlar.length - yorumGoster} yorum daha)
  </button>
)}
  </>
)}
      </div>
    </div>
  </div>
)
}

function ArkadaslarSayfa({ kullanici, geriDon, onKullaniciTikla, klavyeYuksekligi, onMesajAc }) {
  const [arkadaslar, setArkadaslar] = useState([])
  const [istekler, setIstekler] = useState([])
  const [aktifTab, setAktifTab] = useState('arkadaslar')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [arama, setArama] = useState('')

  useEffect(() => {
    const getir = async () => {
      setYukleniyor(true)
      const { data } = await supabase
        .from('arkadasliklar')
        .select('*, gonderen:gonderen_id(id, isim, avatar_url, pozisyon, seviye), alici:alici_id(id, isim, avatar_url, pozisyon, seviye)')
        .or(`gonderen_id.eq.${kullanici.id},alici_id.eq.${kullanici.id}`)

      const onaylananlar = (data || []).filter(a => a.durum === 'onaylandi')
      const bekleyenler = (data || []).filter(a => a.durum === 'bekliyor' && a.alici_id === kullanici.id)

      setArkadaslar(onaylananlar)
      setIstekler(bekleyenler)
      setYukleniyor(false)
    }
    getir()
  }, [kullanici.id])

  const istekKabul = async (id) => {
    await supabase.from('arkadasliklar').update({ durum: 'onaylandi' }).eq('id', id)
    setIstekler(prev => prev.filter(i => i.id !== id))
    const kabul = istekler.find(i => i.id === id)
    if (kabul) setArkadaslar(prev => [...prev, { ...kabul, durum: 'onaylandi' }])
  }

  const istekReddet = async (id) => {
    await supabase.from('arkadasliklar').delete().eq('id', id)
    setIstekler(prev => prev.filter(i => i.id !== id))
  }

  const arkadasBilgi = (a) => a.gonderen_id === kullanici.id ? a.alici : a.gonderen

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px 12px', borderBottom: '0.5px solid #ebebE8', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>Arkadaşlar</h2>
      </div>

      <div style={{ display: 'flex', borderBottom: '0.5px solid #ebebE8', flexShrink: 0 }}>
        {[{ id: 'arkadaslar', label: `Arkadaşlar (${arkadaslar.length})` }, { id: 'istekler', label: `İstekler ${istekler.length > 0 ? `(${istekler.length})` : ''}` }].map(tab => (
          <button key={tab.id} onClick={() => setAktifTab(tab.id)} style={{
            flex: 1, padding: '11px 0', fontSize: 13, fontWeight: aktifTab === tab.id ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer',
            color: aktifTab === tab.id ? '#1D9E75' : '#aaa',
            borderBottom: aktifTab === tab.id ? '2px solid #1D9E75' : '2px solid transparent',
          }}>{tab.label}</button>
        ))}
      </div>
      <div style={{ padding: '12px 22px', borderBottom: '0.5px solid #ebebE8', flexShrink: 0 }}>
  <div style={{ background: '#f5f5f3', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="#aaa" strokeWidth="1.4" />
      <path d="M11 11l2.5 2.5" stroke="#aaa" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
    <input
      placeholder="Arkadaş ara..."
      value={arama}
      onChange={e => setArama(e.target.value)}
      style={{ border: 'none', outline: 'none', fontSize: 14, color: '#1a1a1a', background: 'none', flex: 1 }}
    />
    {arama && <span onClick={() => setArama('')} style={{ fontSize: 18, color: '#bbb', cursor: 'pointer' }}>×</span>}
  </div>
</div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
        {yukleniyor ? (
          <p style={{ color: '#aaa', textAlign: 'center', padding: '40px 0' }}>Yükleniyor...</p>
        ) : aktifTab === 'arkadaslar' ? (
          arkadaslar.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: 40, margin: '0 0 12px' }}>👥</p>
              <p style={{ fontSize: 14, color: '#aaa' }}>Henüz arkadaşın yok</p>
              <p style={{ fontSize: 13, color: '#bbb', marginTop: 4 }}>Maçlardaki oyunculardan arkadaş ekle</p>
            </div>
          ) : arkadaslar.filter(a => {
            const ark = arkadasBilgi(a)
            return ark?.isim?.toLowerCase().includes(arama.toLowerCase())
          }).map(a => {
            const ark = arkadasBilgi(a)
            return (
      <div key={a.id} style={{ background: '#fff', borderRadius: 16, marginBottom: 10, border: '0.5px solid #ebebE8', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
  <div style={{ height: 4, background: 'linear-gradient(90deg, #1D9E75, #0a7055)' }} />
  <div style={{ padding: '14px 14px 12px' }}>
    <div onClick={() => onKullaniciTikla && onKullaniciTikla(ark.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: 'pointer' }}>
  {ark?.avatar_url ? (
    <img src={ark.avatar_url} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e8f7f1' }} alt="avatar" />
  ) : (
    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #1D9E75, #0a7055)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff' }}>
      {ark?.isim?.slice(0, 1).toUpperCase() || '?'}
    </div>
  )}
  <div style={{ flex: 1 }}>
    <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', margin: '0 0 6px', letterSpacing: -0.3 }}>{ark?.isim || 'İsimsiz'}</p>
    <div style={{ display: 'flex', gap: 6 }}>
      {ark?.pozisyon && ark.pozisyon !== 'Belirtilmedi' && (
        <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#e8f7f1', color: '#0F6E56' }}>{ark.pozisyon}</span>
      )}
      {ark?.seviye && (
        <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#f5f5f3', color: '#888' }}>{ark.seviye}</span>
      )}
    </div>
  </div>
      <button onClick={e => { e.stopPropagation(); onMesajAc && onMesajAc(ark) }} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#e8f7f1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#1D9E75" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </button>
</div>
  </div>
</div>
            )
          })
        ) : (
          istekler.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: 40, margin: '0 0 12px' }}>📭</p>
              <p style={{ fontSize: 14, color: '#aaa' }}>Bekleyen istek yok</p>
            </div>
          ) : istekler.map(i => {
            const ark = i.gonderen
            return (
              <div key={i.id} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '0.5px solid #ebebE8' }}>
                <div onClick={() => onKullaniciTikla && onKullaniciTikla(ark.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: 'pointer' }}>
                  {ark?.avatar_url ? (
                    <img src={ark.avatar_url} style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover' }} alt="avatar" />
                  ) : (
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: '#0F6E56' }}>
                      {ark?.isim?.slice(0, 2).toUpperCase() || '?'}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', margin: '0 0 3px' }}>{ark?.isim || 'İsimsiz'}</p>
                    <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>{ark?.pozisyon || 'Pozisyon belirtilmedi'}</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={() => istekReddet(i.id)} style={{ padding: '8px', borderRadius: 10, border: 'none', background: '#fdecea', color: '#c0392b', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Reddet</button>
                  <button onClick={() => istekKabul(i.id)} style={{ padding: '8px', borderRadius: 10, border: 'none', background: '#e8f7f1', color: '#0F6E56', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Kabul et ✓</button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function OzelMesajSayfa({ kullanici, karsi, geriDon, onKullaniciTikla, klavyeYuksekligi }) {
  const [mesajlar, setMesajlar] = useState([])
  const [yeniMesaj, setYeniMesaj] = useState('')
  const [gonderiyor, setGonderiyor] = useState(false)
  const mesajSonuRef = useRef(null)

useEffect(() => {
  const getir = async () => {
    const { data } = await supabase
      .from('ozel_mesajlar')
      .select('*')
      .or(`and(gonderen_id.eq.${kullanici.id},alici_id.eq.${karsi.id}),and(gonderen_id.eq.${karsi.id},alici_id.eq.${kullanici.id})`)
      .order('olusturuldu', { ascending: true })
    setMesajlar(data || [])
  }
  getir()

const kanalAdi = `ozel-${[kullanici.id, karsi.id].sort().join('-')}-${Date.now()}`  
  const kanal = supabase
    .channel(kanalAdi)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'ozel_mesajlar',
    }, (payload) => {
      if (
        (payload.new.gonderen_id === kullanici.id && payload.new.alici_id === karsi.id) ||
        (payload.new.gonderen_id === karsi.id && payload.new.alici_id === kullanici.id)
      ) {
        setMesajlar(prev => [...prev, payload.new])
      }
    })
    .subscribe()

  return () => supabase.removeChannel(kanal)
}, [kullanici.id, karsi.id])

  useEffect(() => {
    if (mesajSonuRef.current) {
      mesajSonuRef.current.scrollIntoView({ behavior: 'auto' })
    }
  }, [mesajlar])

const gonder = async () => {
  if (!yeniMesaj.trim() || gonderiyor) return
  setGonderiyor(true)
  const icerik = yeniMesaj.trim()
  setYeniMesaj('')

  await supabase.from('ozel_mesajlar').insert({
    gonderen_id: kullanici.id,
    alici_id: karsi.id,
    icerik,
  })

  const { data: benimProfilim } = await supabase
    .from('kullanicilar')
    .select('isim, avatar_url')
    .eq('id', kullanici.id)
    .single()

  await bildirimGonder(
  karsi.id,
  `${benimProfilim?.isim || 'Biri'}`,
  `"${icerik.slice(0, 40)}${icerik.length > 40 ? '...' : ''}"`,
  'mesaj',
  null,
  benimProfilim?.avatar_url || null,
  kullanici.id
)

  setGonderiyor(false)
}

  return (
  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', height: '100%', position: 'relative' }}>
            <div style={{ padding: '14px 22px 12px', borderBottom: '0.5px solid #ebebE8', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
       <span onClick={geriDon} style={{ fontSize: 24, color: '#1D9E75', cursor: 'pointer' }}>‹</span>
       <div onClick={() => onKullaniciTikla && onKullaniciTikla(karsi?.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1 }}>
          {karsi?.avatar_url ? (
            <img src={karsi.avatar_url} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} alt="avatar" />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#0F6E56' }}>
              {karsi?.isim?.slice(0, 2).toUpperCase() || '?'}
            </div>
          )}
          <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#1a1a1a' }}>{karsi?.isim || 'İsimsiz'}</p>
        </div>
  </div>

        <div style={{ flex: 1, overflowY: 'scroll', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12, background: '#f8f8f6', WebkitOverflowScrolling: 'touch' }}>
          {mesajlar.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ fontSize: 32, margin: '0 0 10px' }}>💬</p>
            <p style={{ fontSize: 13, color: '#aaa' }}>Henüz mesaj yok</p>
          </div>
        )}
        {mesajlar.map((m, i) => {
          const benim = m.gonderen_id === kullanici.id
          const saat = new Date(m.olusturuldu).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: benim ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: benim ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  padding: '9px 13px',
                  borderRadius: benim ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: benim ? '#1D9E75' : '#fff',
                  color: benim ? '#fff' : '#1a1a1a',
                  fontSize: 14, lineHeight: 1.5,
                  border: benim ? 'none' : '0.5px solid #ebebE8',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}>
                  {m.icerik}
                </div>
                <p style={{ fontSize: 10, color: '#bbb', margin: '4px 4px 0' }}>{saat}</p>
              </div>
            </div>
          )
        })}
        <div ref={mesajSonuRef} />
      </div>

      <div style={{ padding: '10px 16px 16px', background: '#fff', borderTop: '0.5px solid #ebebE8', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <input
          value={yeniMesaj}
          onChange={e => setYeniMesaj(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); gonder() } }}
          placeholder="Mesaj yaz..."
          style={{ flex: 1, background: '#f5f5f3', border: 'none', borderRadius: 20, padding: '10px 16px', fontSize: 14, outline: 'none', color: '#1a1a1a' }}
        />
        <button onClick={gonder} disabled={!yeniMesaj.trim() || gonderiyor} style={{
          width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: yeniMesaj.trim() ? 'pointer' : 'default',
          background: yeniMesaj.trim() ? '#1D9E75' : '#e8e8e4',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 8L2 2l3 6-3 6 12-6z" fill={yeniMesaj.trim() ? '#fff' : '#bbb'} />
          </svg>
        </button>
      </div>
    </div>
  )
}

function AdminSayfa({ kullanici }) {
  const [aktifTab, setAktifTab] = useState('kullanicilar')
  const [kullanicilar, setKullanicilar] = useState([])
  const [ilanlar, setIlanlar] = useState([])
  const [istatistikler, setIstatistikler] = useState({})
  const [yukleniyor, setYukleniyor] = useState(true)
  const [arama, setArama] = useState('')
  const [sikayetler, setSikayetler] = useState([])
  const [seciliKullanici, setSeciliKullanici] = useState(null)
  const [silinecekIlan, setSilinecekIlan] = useState(null)

  useEffect(() => {
    const getir = async () => {
      setYukleniyor(true)

      const { data: sikayetData } = await supabase
        .from('sikayetler')
        .select('*, sikayet_eden:sikayet_eden_id(isim, avatar_url), sikayet_edilen:sikayet_edilen_id(isim, avatar_url)')
        .order('olusturuldu', { ascending: false })
      setSikayetler(sikayetData || [])

      const { data: kullaniciData } = await supabase
        .from('kullanicilar')
        .select('*')
        .order('olusturuldu', { ascending: false })
      setKullanicilar(kullaniciData || [])

      const { data: ilanData } = await supabase
        .from('maclar')
        .select('*, kullanicilar!maclar_organizator_id_fkey(isim)')
        .order('olusturuldu', { ascending: false })
        .limit(20)
      setIlanlar(ilanData || [])

      const { count: kullaniciSayisi } = await supabase
        .from('kullanicilar')
        .select('*', { count: 'exact', head: true })

      const { count: macSayisi } = await supabase
        .from('maclar')
        .select('*', { count: 'exact', head: true })

      const { count: katilimSayisi } = await supabase
        .from('katilimlar')
        .select('*', { count: 'exact', head: true })
        .eq('durum', 'onaylandi')

      setIstatistikler({ kullaniciSayisi, macSayisi, katilimSayisi })
      setYukleniyor(false)
    }
    getir()
  }, [])

  const rozetVer = async (kullaniciId, rozet) => {
    await supabase.from('kullanicilar').update({ rozet }).eq('id', kullaniciId)
    setKullanicilar(prev => prev.map(k => k.id === kullaniciId ? { ...k, rozet } : k))
  }

 const ilanSil = async (ilanId) => {
    await supabase.from('maclar').delete().eq('id', ilanId)
    setIlanlar(prev => prev.filter(i => i.id !== ilanId))
    setSilinecekIlan(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px 12px', borderBottom: '0.5px solid #ebebE8', flexShrink: 0 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>Admin Paneli</h2>
      </div>

      {/* İstatistikler */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '14px 22px', flexShrink: 0 }}>
        {[
          { sayi: istatistikler.kullaniciSayisi, label: 'Kullanıcı', renk: '#1D9E75' },
          { sayi: istatistikler.macSayisi, label: 'Toplam maç', renk: '#185FA5' },
          { sayi: istatistikler.katilimSayisi, label: 'Katılım', renk: '#854F0B' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '12px 10px', textAlign: 'center', border: `0.5px solid #ebebE8`, borderTop: `3px solid ${s.renk}` }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: s.renk, margin: '0 0 4px' }}>{s.sayi}</p>
            <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tab */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid #ebebE8', flexShrink: 0, paddingLeft: 22 }}>
          {[
            { id: 'kullanicilar', label: 'Kullanıcılar' },
            { id: 'ilanlar', label: 'İlanlar' },
            { id: 'sikayetler', label: 'Şikayetler' },
            { id: 'istatistikler', label: 'İstatistikler' },
          ].map(tab => (
          <button key={tab.id} onClick={() => { setAktifTab(tab.id); setArama('') }} style={{
            padding: '10px 16px', fontSize: 13, fontWeight: aktifTab === tab.id ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer',
            color: aktifTab === tab.id ? '#1D9E75' : '#aaa',
            borderBottom: aktifTab === tab.id ? '2px solid #1D9E75' : '2px solid transparent',
          }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ padding: '10px 22px', flexShrink: 0, borderBottom: '0.5px solid #ebebE8' }}>
  <div style={{ background: '#f5f5f3', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="#aaa" strokeWidth="1.4" />
      <path d="M11 11l2.5 2.5" stroke="#aaa" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
    <input
      placeholder={aktifTab === 'kullanicilar' ? 'İsim ara...' : 'Saha adı ara...'}
      value={arama}
      onChange={e => setArama(e.target.value)}
      style={{ border: 'none', outline: 'none', fontSize: 14, color: '#1a1a1a', background: 'none', flex: 1 }}
    />
    {arama && <span onClick={() => setArama('')} style={{ fontSize: 18, color: '#bbb', cursor: 'pointer' }}>×</span>}
  </div>
</div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
        {yukleniyor ? (
          <p style={{ color: '#aaa', textAlign: 'center', padding: '40px 0' }}>Yükleniyor...</p>
        ) : seciliKullanici ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px', border: '0.5px solid #ebebE8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span onClick={() => setSeciliKullanici(null)} style={{ fontSize: 24, color: '#1D9E75', cursor: 'pointer' }}>‹</span>
              <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Kullanıcı Detayı</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {seciliKullanici.avatar_url ? (
                <img src={seciliKullanici.avatar_url} style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover' }} alt="avatar" />
              ) : (
                <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, color: '#0F6E56' }}>
                  {seciliKullanici.isim?.slice(0, 2).toUpperCase() || '?'}
                </div>
              )}
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{seciliKullanici.isim || 'İsimsiz'}</p>
                <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>{seciliKullanici.email}</p>
              </div>
            </div>
            {[
              ['Rol', seciliKullanici.rol || 'kullanici'],
              ['Pozisyon', seciliKullanici.pozisyon || '—'],
              ['Seviye', seciliKullanici.seviye || '—'],
              ['Ortalama Puan', seciliKullanici.ortalama_puan || '—'],
              ['Değerlendirme', seciliKullanici.degerlendirme_sayisi || 0],
              ['Rozet', seciliKullanici.rozet || 'Yok'],
              ['Kayıt Tarihi', new Date(seciliKullanici.olusturuldu).toLocaleDateString('tr-TR')],
            ].map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid #f0f0ee' }}>
                <span style={{ fontSize: 13, color: '#aaa' }}>{k}</span>
                <span style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => rozetVer(seciliKullanici.id, seciliKullanici.rozet === 'guvenilir_organizator' ? null : 'guvenilir_organizator')} style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', background: '#fdf3e8', color: '#854F0B' }}>
                {seciliKullanici.rozet === 'guvenilir_organizator' ? '🏅 Rozeti kaldır' : '🏅 Rozet ver'}
              </button>
              <button onClick={async () => {
                const yeniRol = seciliKullanici.rol === 'admin' ? 'kullanici' : 'admin'
                await supabase.from('kullanicilar').update({ rol: yeniRol }).eq('id', seciliKullanici.id)
                setKullanicilar(prev => prev.map(k => k.id === seciliKullanici.id ? { ...k, rol: yeniRol } : k))
                setSeciliKullanici(prev => ({ ...prev, rol: yeniRol }))
              }} style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', background: '#e8eef7', color: '#185FA5' }}>
                {seciliKullanici.rol === 'admin' ? '👤 Admin kaldır' : '👤 Admin yap'}
              </button>
            </div>
          </div>
        ) : aktifTab === 'kullanicilar' ? (
         kullanicilar
          .filter(k => k.isim?.toLowerCase().includes(arama.toLowerCase()) || k.email?.toLowerCase().includes(arama.toLowerCase()))
          .map((k, i) => (
                  <div key={i} onClick={() => setSeciliKullanici(k)} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '0.5px solid #ebebE8', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                {k.avatar_url ? (
                  <img src={k.avatar_url} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} alt="avatar" />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e8f7f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: '#0F6E56' }}>
                    {k.isim?.slice(0, 2).toUpperCase() || '?'}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px' }}>{k.isim || 'İsimsiz'}</p>
                  <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{k.email || ''} · {k.rol || 'kullanici'}</p>
                </div>
                {k.ortalama_puan > 0 && (
                  <span style={{ fontSize: 12, color: '#1D9E75', fontWeight: 600 }}>⭐ {k.ortalama_puan}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => rozetVer(k.id, k.rozet === 'guvenilir_organizator' ? null : 'guvenilir_organizator')} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none',
                  background: k.rozet === 'guvenilir_organizator' ? '#fdf3e8' : '#f5f5f3',
                  color: k.rozet === 'guvenilir_organizator' ? '#854F0B' : '#666',
                }}>
                  {k.rozet === 'guvenilir_organizator' ? '🏅 Rozeti kaldır' : '🏅 Rozet ver'}
                </button>
              </div>
            </div>
          ))
        ) : aktifTab === 'ilanlar' ? (
          ilanlar
  .filter(ilan => ilan.saha_adi?.toLowerCase().includes(arama.toLowerCase()) || ilan.ilce?.toLowerCase().includes(arama.toLowerCase()))
  .map((ilan, i) => {
            const tarih = new Date(ilan.saat).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            const gecti = new Date(ilan.saat) < new Date()
            return (
              <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '0.5px solid #ebebE8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 3px', textTransform: 'capitalize' }}>{ilan.saha_adi}</p>
                    <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{ilan.ilce} · {tarih} · {ilan.kullanicilar?.isim}</p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, background: gecti ? '#f5f5f3' : '#e8f7f1', color: gecti ? '#aaa' : '#0F6E56' }}>
                    {gecti ? 'Geçti' : 'Aktif'}
                  </span>
                </div>
               <button onClick={() => setSilinecekIlan(ilan.id)} style={{ padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', background: '#fdecea', color: '#c0392b' }}>
                  Sil
                </button>
              </div>
            )
          })
        ) : aktifTab === 'sikayetler' ? (
          sikayetler.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: 40, margin: '0 0 12px' }}>✅</p>
              <p style={{ fontSize: 14, color: '#aaa' }}>Şikayet yok</p>
            </div>
          ) : sikayetler.filter(s => s.sikayet_edilen?.isim?.toLowerCase().includes(arama.toLowerCase())).map((s, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '0.5px solid #ebebE8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 3px' }}>Şikayet edilen: {s.sikayet_edilen?.isim || '?'}</p>
                  <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>Şikayet eden: {s.sikayet_eden?.isim || '?'}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, background: s.durum === 'cozuldu' ? '#e8f7f1' : '#fdecea', color: s.durum === 'cozuldu' ? '#0F6E56' : '#c0392b' }}>
                  {s.durum === 'cozuldu' ? 'Çözüldü' : 'Bekliyor'}
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#555', margin: '0 0 10px' }}>{s.sebep}</p>
              {s.durum !== 'cozuldu' && (
                <button onClick={async () => {
                  await supabase.from('sikayetler').update({ durum: 'cozuldu' }).eq('id', s.id)
                  setSikayetler(prev => prev.map(x => x.id === s.id ? { ...x, durum: 'cozuldu' } : x))
                }} style={{ padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', background: '#e8f7f1', color: '#0F6E56' }}>
                  ✓ Çözüldü olarak işaretle
                </button>
              )}
            </div>
          ))
        ) : aktifTab === 'istatistikler' ? (
          <div>
            {[
              { label: 'Toplam kullanıcı', sayi: istatistikler.kullaniciSayisi, renk: '#1D9E75' },
              { label: 'Toplam maç', sayi: istatistikler.macSayisi, renk: '#185FA5' },
              { label: 'Toplam katılım', sayi: istatistikler.katilimSayisi, renk: '#854F0B' },
              { label: 'Toplam şikayet', sayi: sikayetler.length, renk: '#e74c3c' },
              { label: 'Bekleyen şikayet', sayi: sikayetler.filter(s => s.durum === 'bekliyor').length, renk: '#e67e22' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: 10, border: '0.5px solid #ebebE8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#555' }}>{s.label}</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: s.renk }}>{s.sayi}</span>
              </div>
            ))}
          </div>
    ) : null}
      </div>

      {silinecekIlan && (
        <div onClick={() => setSilinecekIlan(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 22px 40px', width: '100%', boxSizing: 'border-box' }}>
            <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>İlanı sil</p>
            <p style={{ fontSize: 13, color: '#aaa', margin: '0 0 20px' }}>Bu ilanı silmek istediğine emin misin? Bu işlem geri alınamaz.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setSilinecekIlan(null)} style={{ padding: '12px', borderRadius: 12, border: 'none', background: '#f5f5f3', color: '#888', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Vazgeç
              </button>
              <button onClick={() => ilanSil(silinecekIlan)} style={{ padding: '12px', borderRadius: 12, border: 'none', background: '#fdecea', color: '#c0392b', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AltNav({ aktifEkran, setAktifEkran, okunmamisSayisi, kullanici, isAdmin }) {
  const items = [
    { id: 'anasayfa', label: 'Keşfet', path: <path d="M3 10L11 3l8 7v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9z" stroke="currentColor" strokeWidth="1.5" /> },
    { id: 'ilan', label: 'İlan aç', path: <><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" /><path d="M11 8v6M8 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></> },
    { id: 'bildirim', label: 'Bildirim', badge: okunmamisSayisi, path: <><path d="M11 2a7 7 0 017 7v3l1.5 3H2.5L4 12V9a7 7 0 017-7z" stroke="currentColor" strokeWidth="1.5" /><path d="M9 18a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" /></> },
    { id: 'arkadaslar', label: 'Arkadaşlar', badge: 0, path: <><circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/><circle cx="16" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M2 19c0-3 2.5-5 6-5M12 19c0-3 2.5-5 6-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></> },
    { id: 'profil', label: 'Profil', path: <><circle cx="11" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" /><path d="M4 19c0-3.866 3.134-6 7-6s7 2.134 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></> },
...(isAdmin ? [{ id: 'admin', label: 'Admin', badge: 0, path: <><path d="M3 3h18v18H3z" stroke="currentColor" strokeWidth="1.5"/><path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.5"/></> }] : []),
  ]
  
  return (
<div style={{ background: '#fff', borderTop: '0.5px solid #ebebE8', display: 'flex', flexShrink: 0, padding: '10px 0 0', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        {items.map(item => {
        return (
          <button key={item.id} onClick={() => {
            if (!kullanici && item.id !== 'anasayfa') {
              setAktifEkran('giris')
              return
            }
            setAktifEkran(item.id)
          }} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '10px 0 6px', border: 'none', background: 'none', cursor: 'pointer', position: 'relative'
          }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                width: 44, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: aktifEkran === item.id ? '#e8f7f1' : 'transparent',
                transition: 'background 0.2s',
              }}>
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none" style={{ color: aktifEkran === item.id ? '#1D9E75' : '#bbb' }}>
                  {item.path}
                </svg>
              </div>
              {item.badge > 0 && (
                <div style={{ position: 'absolute', top: -3, right: -3, width: 15, height: 15, borderRadius: '50%', background: '#e74c3c', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' }}>
                  <span style={{ fontSize: 8, color: '#fff', fontWeight: 600 }}>{item.badge > 9 ? '9+' : item.badge}</span>
                </div>
              )}
            </div>
            <span style={{
  fontSize: 10, letterSpacing: -0.2,
  color: aktifEkran === item.id ? '#1D9E75' : '#bbb',
  fontWeight: aktifEkran === item.id ? 600 : 400,
  opacity: 1,
}}>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

const st = {
  kapsayici: { height: '100%', display: 'flex', flexDirection: 'column', background: '#f8f8f6', overflow: 'hidden' },
  telefon: { width: '100%', maxWidth: '100vw', background: '#f8f8f6', borderRadius: 0, display: 'flex', flexDirection: 'column', height: '100%', boxShadow: 'none', overflow: 'hidden', position: 'relative' },
  anaButon: { width: '100%', padding: 14, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  label: { fontSize: 12, color: '#888', margin: '0 0 6px' },
  input: { width: '100%', background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: '11px 14px', fontSize: 14, color: '#1a1a1a', marginBottom: 16, outline: 'none' },
}