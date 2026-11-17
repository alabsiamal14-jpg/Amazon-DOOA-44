import React, { useState, useEffect, useRef, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Search, Navigation, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// Source: Google Maps Platform Code Assist

interface CheckoutDeliveryMapProps {
  onAddressSelected: (address: string, city: string, lat: number, lng: number) => void;
  defaultCity?: string;
}

export const CheckoutDeliveryMap: React.FC<CheckoutDeliveryMapProps> = ({
  onAddressSelected,
  defaultCity = 'الرياض',
}) => {
  const [markerPosition, setMarkerPosition] = useState({ lat: 24.7118, lng: 46.6744 }); // Riyadh center
  const [mapCenter, setMapCenter] = useState({ lat: 24.7118, lng: 46.6744 });
  const [mapZoom, setMapZoom] = useState(13);
  const [isLocating, setIsLocating] = useState(false);
  const [errorMsg, setErrorError] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  const autocompleteInputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary('places');

  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyBEYkV_HVYhYucgoIhgeHV1FYlkEckzJLA';

  // Reverse geocodes the coordinates to address via Geocoding REST API (CF5/Section 5 compliant)
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ar&key=${mapsApiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Geocoding response not ok');
      const data = await res.json();
      
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const formatted = result.formatted_address;
        
        // Try to find city and neighborhood
        let city = '';
        let neighborhood = '';
        
        result.address_components.forEach((comp: any) => {
          if (comp.types.includes('locality')) {
            city = comp.long_name;
          } else if (comp.types.includes('administrative_area_level_1') && !city) {
            city = comp.long_name;
          }
          if (comp.types.includes('neighborhood') || comp.types.includes('sublocality')) {
            neighborhood = comp.long_name;
          }
        });

        const displayAddress = neighborhood 
          ? `حي ${neighborhood}، ${formatted.split(',')[0]}`
          : formatted;

        setResolvedAddress(displayAddress);
        onAddressSelected(displayAddress, city || defaultCity, lat, lng);
      }
    } catch (err) {
      console.warn('Reverse geocoding warning:', err);
    }
  }, [mapsApiKey, onAddressSelected, defaultCity]);

  // Handle Map Click
  const handleMapClick = useCallback((e: any) => {
    if (!e.detail.latLng) return;
    const { lat, lng } = e.detail.latLng;
    setMarkerPosition({ lat, lng });
    reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  // Handle Geolocation
  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      setErrorError('تحديد الموقع الجغرافي غير مدعوم في متصفحك.');
      return;
    }

    setIsLocating(true);
    setErrorError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const uLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setMarkerPosition(uLoc);
        setMapCenter(uLoc);
        setMapZoom(16);
        setIsLocating(false);
        reverseGeocode(uLoc.lat, uLoc.lng);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setErrorError('فشل العثور على موقعك الحالي. يرجى اختيار الموقع يدوياً.');
        setIsLocating(false);
      },
      { timeout: 8000 }
    );
  };

  // Autocomplete Setup
  useEffect(() => {
    if (!placesLib || !autocompleteInputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(autocompleteInputRef.current, {
      types: ['geocode', 'establishment'],
      fields: ['geometry', 'formatted_address', 'address_components'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        
        const loc = { lat, lng };
        setMarkerPosition(loc);
        setMapCenter(loc);
        setMapZoom(16);
        setErrorError(null);

        let city = '';
        let neighborhood = '';

        if (place.address_components) {
          place.address_components.forEach((comp: any) => {
            if (comp.types.includes('locality')) {
              city = comp.long_name;
            } else if (comp.types.includes('administrative_area_level_1') && !city) {
              city = comp.long_name;
            }
            if (comp.types.includes('neighborhood') || comp.types.includes('sublocality')) {
              neighborhood = comp.long_name;
            }
          });
        }

        const displayAddress = neighborhood 
          ? `حي ${neighborhood}، ${place.formatted_address?.split(',')[0]}`
          : place.formatted_address || '';

        setResolvedAddress(displayAddress);
        onAddressSelected(displayAddress, city || defaultCity, lat, lng);
      }
    });
  }, [placesLib, onAddressSelected, defaultCity]);

  // Adjust center on startup according to default city coordinates if available
  useEffect(() => {
    if (defaultCity.includes('جدة')) {
      const jed = { lat: 21.5433, lng: 39.1728 };
      setMarkerPosition(jed);
      setMapCenter(jed);
    } else if (defaultCity.includes('مكة')) {
      const mk = { lat: 21.4267, lng: 39.8261 };
      setMarkerPosition(mk);
      setMapCenter(mk);
    } else if (defaultCity.includes('صنعاء')) {
      const sa = { lat: 15.3694, lng: 44.1910 };
      setMarkerPosition(sa);
      setMapCenter(sa);
    }
  }, [defaultCity]);

  return (
    <APIProvider apiKey={mapsApiKey} language="ar" region="SA">
      <div className="space-y-2 text-xs border border-stone-200 p-3 rounded-2xl bg-white shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-stone-700 flex items-center gap-1">
            📍 خريطة التوصيل الجغرافي:
          </span>
          <button
            type="button"
            onClick={handleLocateUser}
            disabled={isLocating}
            className="text-[10px] font-black text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg border border-rose-100 flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            {isLocating ? (
              <Loader2 className="w-3 h-3 animate-spin text-rose-500" />
            ) : (
              <Navigation className="w-3 h-3" />
            )}
            <span>موقعي الجغرافي</span>
          </button>
        </div>

        {/* Search Autocomplete */}
        <div className="relative">
          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
            <Search className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <input
            ref={autocompleteInputRef}
            type="text"
            placeholder="ابحث عن اسم الحي، الشارع، أو علامة مميزة..."
            className="w-full pr-8 pl-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:border-rose-500 focus:outline-hidden"
          />
        </div>

        {/* Simple Map Container with CSS heights guaranteed (CF2) */}
        <div className="w-full h-[180px] rounded-xl overflow-hidden border border-stone-200 relative bg-stone-50 shadow-inner">
          <Map
            center={mapCenter}
            zoom={mapZoom}
            onCameraChanged={(ev) => {
              setMapCenter(ev.detail.center);
              setMapZoom(ev.detail.zoom);
            }}
            onClick={handleMapClick}
            gestureHandling={'greedy'}
            disableDefaultUI={true}
            zoomControl={true}
            mapId="DEMO_MAP_ID" // REQUIRED pattern for AdvancedMarkerElement (CF9)
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']} // MANDATORY environment attribution
            style={{ width: '100%', height: '100%' }}
          >
            <AdvancedMarker 
              position={markerPosition}
              title="موقع التوصيل الخاص بكِ"
            >
              <div className="p-1 rounded-full bg-rose-600 border border-white shadow-md text-white">
                <MapPin className="w-4 h-4 fill-current" />
              </div>
            </AdvancedMarker>
          </Map>
        </div>

        {resolvedAddress && (
          <div className="p-2 bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-xl text-[11px] flex items-start gap-1.5 animate-in fade-in duration-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              تم تحديد الإحداثيات وتحديث عنوان التوصيل تلقائياً: <strong className="text-emerald-950">{resolvedAddress}</strong>
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="p-2 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-[10px] flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}
      </div>
    </APIProvider>
  );
};
