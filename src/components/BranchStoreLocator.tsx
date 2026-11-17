import React, { useState, useEffect, useRef, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Phone, Clock, Navigation, Search, CheckCircle2, AlertCircle, Info, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { StoreSettings } from '../types';

// Source: Google Maps Platform Code Assist

interface Branch {
  id: string;
  name_ar: string;
  name_en: string;
  address_ar: string;
  address_en: string;
  city_ar: string;
  city_en: string;
  phone: string;
  hours_ar: string;
  hours_en: string;
  lat: number;
  lng: number;
}

const BRANCHES: Branch[] = [
  {
    id: 'br-riyadh',
    name_ar: 'أتيليه الرياض - العليا الملكي',
    name_en: 'Riyadh Atelier - Al Olaya',
    address_ar: 'شارع العليا العام، مقابل برج المملكة، العليا، الرياض',
    address_en: 'Al Olaya Street, opposite Kingdom Tower, Riyadh',
    city_ar: 'الرياض',
    city_en: 'Riyadh',
    phone: '966501234567',
    hours_ar: 'يومياً: 10:00 ص - 11:00 م',
    hours_en: 'Daily: 10:00 AM - 11:00 PM',
    lat: 24.7118,
    lng: 46.6744,
  },
  {
    id: 'br-jeddah',
    name_ar: 'أتيليه جدة - لو شاتو التحلية',
    name_en: 'Jeddah Atelier - Le Chateau Tahlia',
    address_ar: 'شارع الأمير محمد بن عبدالعزيز (التحلية)، الروضة، جدة',
    address_en: 'Prince Muhammad bin Abdulaziz St (Tahlia), Al Rawdah, Jeddah',
    city_ar: 'جدة',
    city_en: 'Jeddah',
    phone: '966509876543',
    hours_ar: 'يومياً: 10:00 ص - 11:30 م',
    hours_en: 'Daily: 10:00 AM - 11:30 PM',
    lat: 21.5542,
    lng: 39.1558,
  },
  {
    id: 'br-makkah',
    name_ar: 'أتيليه مكة - برج الساعة الملكي',
    name_en: 'Makkah Atelier - Clock Tower',
    address_ar: 'أبراج البيت (برج الساعة)، الطابق الأول، الحرم، مكة المكرمة',
    address_en: 'Abraj Al Bait (Clock Tower), First Floor, Haram, Makkah',
    city_ar: 'مكة المكرمة',
    city_en: 'Makkah',
    phone: '966503334445',
    hours_ar: 'يومياً: 9:00 ص - 12:00 منتصف الليل',
    hours_en: 'Daily: 9:00 AM - 12:00 AM',
    lat: 21.4181,
    lng: 39.8263,
  },
  {
    id: 'br-sanaa',
    name_ar: 'أتيليه صنعاء - حي حدة الدبلوماسي',
    name_en: 'Sanaa Atelier - Hadda Diplomatic',
    address_ar: 'شارع حدة، بجانب فندق البستان، حي حدة، صنعاء',
    address_en: 'Hadda Street, near Al Bustan Hotel, Hadda, Sanaa',
    city_ar: 'صنعاء',
    city_en: 'Sanaa',
    phone: '967777627595',
    hours_ar: 'يومياً: 9:00 ص - 10:00 م',
    hours_en: 'Daily: 9:00 AM - 10:00 PM',
    lat: 15.3211,
    lng: 44.1867,
  }
];

// Clean warm map styles that match Amazon Duaa's cozy beauty branding
const WARM_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#faf8f5" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7c6f64" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#f3eedf" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#a89984" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#ebdcb9", weight: 0.5 }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f8e3c2" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#f2ebd9" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d9e9e6" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#928374" }] }
];

interface RouteRendererProps {
  userLocation: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  onRouteCalculated: (distanceText: string, durationText: string) => void;
  onRouteFailed: (err: string) => void;
}

const RouteRenderer: React.FC<RouteRendererProps> = ({
  userLocation,
  destination,
  onRouteCalculated,
  onRouteFailed,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!map || !routesLib || !userLocation || !destination) {
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];
      return;
    }

    // Clear previous routes
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    const request = {
      origin: userLocation,
      destination: destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    (routesLib.Route as any).computeRoutes(request)
      .then(({ routes }: { routes: any[] }) => {
        if (!routes || routes.length === 0) {
          onRouteFailed('لم يتم العثور على مسار توصيل صالح.');
          return;
        }

        const primaryRoute = routes[0];

        // Draw polylines
        const newPolylines = primaryRoute.createPolylines();
        newPolylines.forEach((polyline: any) => {
          polyline.setOptions({
            strokeColor: '#f43f5e', // beautiful rose-500 line
            strokeWeight: 6,
            strokeOpacity: 0.85,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = newPolylines;

        // Fit map viewport around the route
        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport);
        }

        const distText = (primaryRoute.distanceMeters / 1000).toFixed(1) + ' كم';
        const durationMins = Math.round(primaryRoute.durationMillis / 60000);
        const durText = durationMins + ' دقيقة';
        onRouteCalculated(distText, durText);
      })
      .catch((err: any) => {
        console.warn('Error calculating driving routes:', err);
        onRouteFailed('فشل حساب المسار المباشر بسبب قيود الخدمة أو المسافة.');
      });

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, userLocation, destination, onRouteCalculated, onRouteFailed]);

  return null;
};

interface BranchStoreLocatorProps {
  settings: StoreSettings;
  onBackToStore?: () => void;
}

export const BranchStoreLocator: React.FC<BranchStoreLocatorProps> = ({ settings, onBackToStore }) => {
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(BRANCHES[0]);
  const [mapCenter, setMapCenter] = useState({ lat: 24.7118, lng: 46.6744 });
  const [mapZoom, setMapZoom] = useState(13);
  const [activeInfoWindowBranchId, setActiveInfoWindowBranchId] = useState<string | null>(null);
  
  // Driving route calculation states
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Client-Side Quota Exceeded state (Section 8 GHP guidelines)
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  // Places Autocomplete reference
  const autocompleteInputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary('places');
  const map = useMap();

  useEffect(() => {
    const handleQuotaExceeded = () => {
      setQuotaExceeded(true);
    };

    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    
    // Console error interceptor for OverQuotaMapError
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      origError.apply(console, args);
      const msg = args.map((a) => String(a)).join(' ');
      if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
        setQuotaExceeded(true);
      }
    };

    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
      console.error = origError;
    };
  }, []);

  const handleBranchClick = (branch: Branch) => {
    setSelectedBranch(branch);
    setMapCenter({ lat: branch.lat, lng: branch.lng });
    setMapZoom(14);
    setActiveInfoWindowBranchId(branch.id);
    setRouteInfo(null);
    setRouteError(null);
  };

  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      setRouteError('تحديد الموقع الجغرافي غير مدعوم في متصفحك.');
      return;
    }

    setIsLocating(true);
    setRouteError(null);
    setRouteInfo(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const uLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(uLoc);
        setIsLocating(false);
        // Alert to user in toast if applicable
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setRouteError('فشل العثور على موقعك الحالي. يرجى تفعيل الـ GPS في جهازك.');
        setIsLocating(false);
      },
      { timeout: 8000 }
    );
  };

  // Autocomplete Setup
  useEffect(() => {
    if (!placesLib || !autocompleteInputRef.current) return;

    // Use PlaceAutocompleteElement or program suggestions
    // For React simple layout, use standard modern autocomplete binding
    const autocomplete = new placesLib.Autocomplete(autocompleteInputRef.current, {
      types: ['geocode', 'establishment'],
      fields: ['geometry', 'formatted_address'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry && place.geometry.location) {
        const loc = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        setUserLocation(loc);
        setRouteError(null);
        setRouteInfo(null);
      }
    });
  }, [placesLib]);

  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyBEYkV_HVYhYucgoIhgeHV1FYlkEckzJLA';

  return (
    <APIProvider 
      apiKey={mapsApiKey}
      language="ar"
      region="SA"
    >
      {/* Quota Exceeded Sticky Top Bar (Section 8 Case A Mandate) */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm animate-in slide-in-from-top duration-300">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              تم الوصول إلى الحد الأقصى لحصة Google Maps التجريبية لهذا اليوم. إذا كنت المالك المطور للمنصة، يرجى مراجعة{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                موقع مطوري خرائط جوجل
              </a>{' '}
              لتحديث الحساب وإضافة الفوترة.
            </span>
          </div>
        </div>
      )}

      <div className="bg-stone-50 min-h-screen text-stone-800">
        {/* Banner Section */}
        <div className="bg-stone-900 text-white py-12 px-4 sm:px-6 lg:px-8 text-center relative overflow-hidden border-b border-rose-200/20">
          <div className="absolute inset-0 bg-radial-gradient from-rose-950/40 via-transparent to-transparent opacity-60"></div>
          <div className="max-w-3xl mx-auto relative z-10 space-y-3">
            <span className="text-rose-400 font-bold text-xs uppercase tracking-widest bg-rose-950/60 px-3.5 py-1 rounded-full border border-rose-500/20 inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-rose-300 animate-pulse" />
              أهلاً بكِ في مراكز تجاربنا الفاخرة
            </span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">فروع وأتيليهات أمازون دعاء</h1>
            <p className="text-sm text-stone-300 max-w-xl mx-auto">
              تفضلي بزيارة فروعنا ومراكز التجميل المتكاملة لتجربة المنتجات مباشرة، والاستشارة المجانية مع خبيرات العناية والبشرة المحترفات لدينا.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Back button */}
          {onBackToStore && (
            <button
              onClick={onBackToStore}
              className="mb-6 flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-rose-600 bg-white px-4 py-2.5 rounded-xl shadow-2xs border border-stone-200 transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة للمتجر الرئيسي</span>
            </button>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden min-h-[650px]">
            {/* Sidebar Controls Panel (4/12 width) */}
            <div className="lg:col-span-4 p-6 border-l border-stone-100 flex flex-col space-y-6">
              
              {/* Route Planning / Location Autocomplete */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase text-stone-500 tracking-wider">🗺️ توجيهات القيادة وخرائط المسار:</h3>
                
                {/* Geolocation Button */}
                <button
                  onClick={handleLocateUser}
                  disabled={isLocating}
                  className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border border-rose-200/60 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isLocating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                      <span>جاري البحث عن موقعك...</span>
                    </>
                  ) : (
                    <>
                      <Navigation className="w-4 h-4" />
                      <span>استخدام موقعي الحالي للوصول</span>
                    </>
                  )}
                </button>

                {/* Places Autocomplete Search */}
                <div className="relative">
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 text-stone-400" />
                  </div>
                  <input
                    ref={autocompleteInputRef}
                    type="text"
                    placeholder="ابحث عن منطقتك لتحديد مسافة الوصول..."
                    className="w-full pr-10 pl-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:border-rose-500 focus:outline-hidden"
                  />
                </div>

                {/* Route Result Dashboard */}
                {routeInfo && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs animate-in fade-in duration-300">
                    <div className="flex items-center gap-2 font-bold mb-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>مسار الوصول جاهز:</span>
                    </div>
                    <p className="text-stone-600">
                      يبعد الفرع عن موقعك حوالي <strong className="text-emerald-900">{routeInfo.distance}</strong> ويستغرق التوصيل بالسيارة حوالي <strong className="text-emerald-900">{routeInfo.duration}</strong>.
                    </p>
                  </div>
                )}

                {routeError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed">{routeError}</p>
                  </div>
                )}
              </div>

              {/* Branches Selector list */}
              <div className="flex-1 flex flex-col space-y-3">
                <h3 className="text-xs font-black uppercase text-stone-500 tracking-wider">🏢 فروعنا وأتيليهات العرض:</h3>
                <div className="space-y-2.5 overflow-y-auto max-h-[360px] pr-1">
                  {BRANCHES.map((b) => {
                    const isSelected = selectedBranch?.id === b.id;
                    return (
                      <button
                        key={b.id}
                        onClick={() => handleBranchClick(b)}
                        className={`w-full text-right p-4 rounded-2xl border transition-all text-xs flex flex-col gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-rose-50/50 border-rose-200 shadow-3xs ring-2 ring-rose-400'
                            : 'bg-white hover:bg-stone-50/60 border-stone-200 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-extrabold text-stone-900 text-sm">{b.name_ar}</span>
                          <span className="text-[10px] bg-stone-100 text-stone-600 font-bold px-2 py-0.5 rounded-full">
                            {b.city_ar}
                          </span>
                        </div>
                        
                        <div className="flex items-start gap-1.5 text-stone-500">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <span className="line-clamp-2 leading-relaxed">{b.address_ar}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-[10px] text-stone-400 border-t border-stone-100/60 pt-2 mt-1">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-stone-400 shrink-0" />
                            <span className="truncate">{b.hours_ar}</span>
                          </div>
                          <div className="flex items-center gap-1 justify-end">
                            <Phone className="w-3 h-3 text-stone-400 shrink-0" />
                            <span className="font-mono">{b.phone}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Info Tip */}
              <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 text-[11px] text-stone-500 flex items-start gap-1.5">
                <Info className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  يمكنك حجز موعد جلسة تنظيف وترميم بشرة أو استشارة مكياج من أي فرع بمجرد الاتصال بخبيرة الفرع أو عبر الواتساب مباشرة.
                </p>
              </div>

            </div>

            {/* Map Container Panel (8/12 width) */}
            <div className="lg:col-span-8 h-[550px] lg:h-auto relative bg-stone-100">
              <Map
                center={mapCenter}
                zoom={mapZoom}
                onCameraChanged={(ev) => {
                  setMapCenter(ev.detail.center);
                  setMapZoom(ev.detail.zoom);
                }}
                gestureHandling={'greedy'}
                disableDefaultUI={false}
                zoomControl={true}
                mapTypeControl={true}
                scaleControl={true}
                streetViewControl={true}
                fullscreenControl={true}
                styles={WARM_MAP_STYLES}
                mapId="DEMO_MAP_ID" // REQUIRED pattern for AdvancedMarkerElement (CF9)
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']} // MANDATORY environment attribution
                style={{ width: '100%', height: '100%', minHeight: '100%' }}
              >
                {/* Advanced Markers for branches */}
                {BRANCHES.map((b) => (
                  <AdvancedMarker
                    key={b.id}
                    position={{ lat: b.lat, lng: b.lng }}
                    title={b.name_ar}
                    onClick={() => {
                      setSelectedBranch(b);
                      setActiveInfoWindowBranchId(b.id);
                      setRouteInfo(null);
                      setRouteError(null);
                    }}
                  >
                    {/* Custom HTML element pin matching cosmetics theme */}
                    <div className={`p-1.5 rounded-full shadow-md flex items-center justify-center border-2 transition-all ${
                      selectedBranch?.id === b.id 
                        ? 'bg-rose-600 text-white border-white scale-110' 
                        : 'bg-white text-rose-600 border-rose-500 hover:scale-105'
                    }`}>
                      <Sparkles className="w-5 h-5 fill-current" />
                    </div>
                  </AdvancedMarker>
                ))}

                {/* Info Window */}
                {activeInfoWindowBranchId && selectedBranch && (
                  <InfoWindow
                    position={{ lat: selectedBranch.lat, lng: selectedBranch.lng }}
                    onClose={() => setActiveInfoWindowBranchId(null)}
                  >
                    <div className="text-right p-2.5 max-w-[240px] text-stone-800 space-y-2 text-xs">
                      <h4 className="font-extrabold text-sm text-stone-900 border-b border-stone-100 pb-1 flex items-center gap-1.5 justify-start">
                        <Sparkles className="w-4 h-4 text-rose-500 fill-rose-500 shrink-0" />
                        <span>{selectedBranch.name_ar}</span>
                      </h4>
                      <p className="text-stone-500 leading-relaxed text-[11px]">{selectedBranch.address_ar}</p>
                      
                      <div className="space-y-1 text-stone-600 text-[10px]">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-stone-400" />
                          <span>{selectedBranch.hours_ar}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-stone-400" />
                          <span className="font-mono">{selectedBranch.phone}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-stone-100 flex gap-1.5">
                        <a
                          href={`https://wa.me/${selectedBranch.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10px] text-center transition-all inline-block shadow-2xs"
                        >
                          تواصل عبر واتساب
                        </a>
                        <button
                          onClick={() => handleBranchClick(selectedBranch)}
                          className="py-1.5 px-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg font-bold text-[10px] flex items-center gap-0.5 justify-center transition-all"
                        >
                          تحديد المسار
                        </button>
                      </div>
                    </div>
                  </InfoWindow>
                )}

                {/* Route Computation Renderer (Adhering strictly to modern promise routes API) */}
                <RouteRenderer
                  userLocation={userLocation}
                  destination={selectedBranch ? { lat: selectedBranch.lat, lng: selectedBranch.lng } : null}
                  onRouteCalculated={(dist, dur) => setRouteInfo({ distance: dist, duration: dur })}
                  onRouteFailed={(err) => setRouteError(err)}
                />
              </Map>
            </div>

          </div>
        </div>
      </div>
    </APIProvider>
  );
};

export default BranchStoreLocator;
