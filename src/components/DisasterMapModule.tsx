import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, Layers, LocateFixed, MapPin, Users, WifiOff } from 'lucide-react';
import type { AffectedFamily, Disaster, DmisDataset, Language, ModuleKey } from '../types/dmis';

interface DisasterMapModuleProps {
  lang: Language;
  dataset: DmisDataset;
  isOnline: boolean;
  onNavigate: (module: ModuleKey) => void;
}

const SRI_LANKA_CENTER: [number, number] = [7.8731, 80.7718];

function isValidCoord(lat: unknown, lng: unknown): boolean {
  if (lat === null || lat === undefined || lat === '') return false;
  if (lng === null || lng === undefined || lng === '') return false;
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180 &&
    !(nLat === 0 && nLng === 0)
  );
}

function createPopupElement(title: string, badge: string, lines: { label: string; value: string }[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'text-xs space-y-1.5 min-w-[190px]';

  const header = document.createElement('div');
  header.className = 'border-b border-slate-200 pb-1';

  const titleEl = document.createElement('div');
  titleEl.className = 'font-bold text-slate-900 text-sm';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const badgeEl = document.createElement('div');
  badgeEl.className = 'text-[11px] font-semibold text-slate-500';
  badgeEl.textContent = badge;
  header.appendChild(badgeEl);

  root.appendChild(header);

  const body = document.createElement('div');
  body.className = 'space-y-0.5 pt-0.5';

  for (const item of lines) {
    const row = document.createElement('div');
    const lbl = document.createElement('span');
    lbl.className = 'text-slate-500';
    lbl.textContent = `${item.label}: `;
    const val = document.createElement('span');
    val.className = 'font-medium text-slate-800';
    val.textContent = item.value;
    row.appendChild(lbl);
    row.appendChild(val);
    body.appendChild(row);
  }

  root.appendChild(body);
  return root;
}

function getDisasterColor(severity: Disaster['severity']): string {
  switch (severity) {
    case 'Critical':
      return '#B91C1C';
    case 'High':
      return '#DC2626';
    case 'Moderate':
      return '#D97706';
    default:
      return '#1D4ED8';
  }
}

function getFamilyColor(status: AffectedFamily['displacement_status']): string {
  switch (status) {
    case 'Safety Centre':
      return '#7C3AED';
    case 'With Relatives':
      return '#D97706';
    case 'Relocated':
      return '#15803D';
    default:
      return '#0F294A';
  }
}

function createDisasterIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'dmis-disaster-marker',
    html: `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:${color};border:2px solid #ffffff;border-radius:6px;transform:rotate(45deg);box-shadow:0 2px 6px rgba(15,23,42,0.35);"><div style="width:8px;height:8px;background:#ffffff;border-radius:9999px;"></div></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function createFamilyIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'dmis-family-marker',
    html: `<div style="width:18px;height:18px;background:${color};border:2px solid #ffffff;border-radius:9999px;box-shadow:0 2px 5px rgba(15,23,42,0.35);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

export const DisasterMapModule: React.FC<DisasterMapModuleProps> = ({
  lang,
  dataset,
  isOnline,
  onNavigate,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const disasterLayerRef = useRef<L.LayerGroup | null>(null);
  const familyLayerRef = useRef<L.LayerGroup | null>(null);

  const [showDisasters, setShowDisasters] = useState(true);
  const [showFamilies, setShowFamilies] = useState(true);
  const [selectedDisasterId, setSelectedDisasterId] = useState('');
  const [displacementFilter, setDisplacementFilter] = useState('');
  const [tileError, setTileError] = useState(false);

  const activeDisasters = useMemo(
    () => dataset.disasters.filter((d) => !d.is_deleted),
    [dataset.disasters]
  );

  const activeFamilies = useMemo(
    () => dataset.affected_families.filter((f) => !f.is_deleted),
    [dataset.affected_families]
  );

  const disasterLookup = useMemo(
    () => new Map(activeDisasters.map((d) => [d.id, d])),
    [activeDisasters]
  );

  const gnLookup = useMemo(
    () => new Map(dataset.gn_divisions.filter((g) => !g.is_deleted).map((g) => [g.id, g])),
    [dataset.gn_divisions]
  );

  const filteredDisasters = useMemo(
    () =>
      activeDisasters.filter((d) => {
        if (selectedDisasterId && d.id !== selectedDisasterId) return false;
        return isValidCoord(d.latitude, d.longitude);
      }),
    [activeDisasters, selectedDisasterId]
  );

  const filteredFamilies = useMemo(
    () =>
      activeFamilies.filter((f) => {
        if (selectedDisasterId && f.disaster_id !== selectedDisasterId) return false;
        if (displacementFilter && f.displacement_status !== displacementFilter) return false;
        return isValidCoord(f.latitude, f.longitude);
      }),
    [activeFamilies, selectedDisasterId, displacementFilter]
  );

  const unmappedDisastersCount = activeDisasters.filter(
    (d) => !isValidCoord(d.latitude, d.longitude)
  ).length;
  const unmappedFamiliesCount = activeFamilies.filter(
    (f) => !isValidCoord(f.latitude, f.longitude)
  ).length;

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: SRI_LANKA_CENTER,
      zoom: 7,
      zoomControl: true,
    });

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    tileLayer.on('tileerror', () => {
      setTileError(true);
    });
    tileLayer.on('tileload', () => {
      setTileError(false);
    });

    tileLayer.addTo(map);

    const dLayer = L.layerGroup().addTo(map);
    const fLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    disasterLayerRef.current = dLayer;
    familyLayerRef.current = fLayer;

    // Ensure container dimensions settle properly inside responsive layout
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapRef.current = null;
      disasterLayerRef.current = null;
      familyLayerRef.current = null;
    };
  }, []);

  // Sync markers whenever filtered data or layer toggles change
  useEffect(() => {
    const map = mapRef.current;
    const dLayer = disasterLayerRef.current;
    const fLayer = familyLayerRef.current;
    if (!map || !dLayer || !fLayer) return;

    dLayer.clearLayers();
    fLayer.clearLayers();

    const bounds: L.LatLngExpression[] = [];

    if (showDisasters) {
      for (const dis of filteredDisasters) {
        const lat = Number(dis.latitude);
        const lng = Number(dis.longitude);
        bounds.push([lat, lng]);

        const marker = L.marker([lat, lng], {
          icon: createDisasterIcon(getDisasterColor(dis.severity)),
        });

        const popupEl = createPopupElement(
          dis.title,
          `${dis.disaster_code} · ${dis.disaster_type}`,
          [
            { label: lang === 'si' ? 'තීව්‍රතාව' : 'Severity', value: dis.severity },
            { label: lang === 'si' ? 'තත්ත්වය' : 'Status', value: dis.status },
            { label: lang === 'si' ? 'ආරම්භක දිනය' : 'Start Date', value: dis.start_date },
            { label: 'Coordinates', value: `${lat.toFixed(5)}, ${lng.toFixed(5)}` },
          ]
        );
        marker.bindPopup(popupEl);
        marker.addTo(dLayer);
      }
    }

    if (showFamilies) {
      for (const fam of filteredFamilies) {
        const lat = Number(fam.latitude);
        const lng = Number(fam.longitude);
        bounds.push([lat, lng]);

        const dis = disasterLookup.get(fam.disaster_id);
        const gn = fam.gn_id ? gnLookup.get(fam.gn_id) : undefined;

        const marker = L.marker([lat, lng], {
          icon: createFamilyIcon(getFamilyColor(fam.displacement_status)),
        });

        const popupEl = createPopupElement(
          fam.head_name,
          `${fam.family_ref_no} · ${fam.displacement_status}`,
          [
            { label: lang === 'si' ? 'සාමාජිකයින්' : 'Members', value: String(fam.total_members) },
            { label: lang === 'si' ? 'ආපදාව' : 'Disaster', value: dis ? dis.title : '—' },
            {
              label: lang === 'si' ? 'ග්‍රා.නි. වසම' : 'GN Division',
              value: gn ? (lang === 'si' && gn.name_si ? gn.name_si : gn.name_en) : '—',
            },
            { label: lang === 'si' ? 'ලිපිනය' : 'Address', value: fam.address || '—' },
            { label: 'Coordinates', value: `${lat.toFixed(5)}, ${lng.toFixed(5)}` },
          ]
        );
        marker.bindPopup(popupEl);
        marker.addTo(fLayer);
      }
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
    }
  }, [filteredDisasters, filteredFamilies, showDisasters, showFamilies, disasterLookup, gnLookup, lang]);

  const handleFitBounds = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts: L.LatLngExpression[] = [];
    if (showDisasters) {
      filteredDisasters.forEach((d) => pts.push([Number(d.latitude), Number(d.longitude)]));
    }
    if (showFamilies) {
      filteredFamilies.forEach((f) => pts.push([Number(f.latitude), Number(f.longitude)]));
    }
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 14 });
    } else {
      map.setView(SRI_LANKA_CENTER, 7);
    }
  };

  return (
    <div className="space-y-4">
      {/* Map Controls & Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {lang === 'si' ? 'ආපදා සහ පීඩාවට පත් පවුල් සිතියම' : 'Disaster & Affected Families GIS Map'}
            </h2>
            <p className="text-xs text-slate-500 tabular-nums">
              {lang === 'si'
                ? `සිතියම්ගත ආපදා: ${filteredDisasters.length} · සිතියම්ගත පවුල්: ${filteredFamilies.length}`
                : `Mapped Disasters: ${filteredDisasters.length} · Mapped Families: ${filteredFamilies.length}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDisasters((v) => !v)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                showDisasters
                  ? 'border-[#0F294A] bg-[#0F294A] text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{lang === 'si' ? 'ආපදා ස්ථාන' : 'Disasters'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFamilies((v) => !v)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                showFamilies
                  ? 'border-[#0F294A] bg-[#0F294A] text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>{lang === 'si' ? 'පවුල් ස්ථාන' : 'Affected Families'}</span>
            </button>

            <button
              type="button"
              onClick={handleFitBounds}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              <span>{lang === 'si' ? 'සියල්ල පෙන්වන්න' : 'Fit All'}</span>
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select
            value={selectedDisasterId}
            onChange={(e) => setSelectedDisasterId(e.target.value)}
            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
          >
            <option value="">{lang === 'si' ? 'සියලු ආපදා' : 'All Disaster Events'}</option>
            {activeDisasters.map((d) => (
              <option key={d.id} value={d.id}>
                {d.disaster_code} — {d.title}
              </option>
            ))}
          </select>

          <select
            value={displacementFilter}
            onChange={(e) => setDisplacementFilter(e.target.value)}
            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
          >
            <option value="">{lang === 'si' ? 'සියලු අවතැන් තත්ත්වයන්' : 'All Displacement Statuses'}</option>
            <option value="At Home">At Home</option>
            <option value="With Relatives">With Relatives</option>
            <option value="Safety Centre">Safety Centre</option>
            <option value="Relocated">Relocated</option>
          </select>

          <div className="flex items-center gap-4 text-xs text-slate-600 px-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rotate-45 bg-red-600 border border-white shadow-sm" />
              <span>Disaster</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-[#0F294A] border border-white shadow-sm" />
              <span>Family (Home)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-violet-600 border border-white shadow-sm" />
              <span>Safety Centre</span>
            </span>
          </div>
        </div>
      </div>

      {/* Offline / Uncached Tile Warning */}
      {(!isOnline || tileError) && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            {lang === 'si'
              ? 'නොබැඳි ප්‍රකාරය: පසුබිම් සිතියම් කොටස් ලබාගැනීමට අන්තර්ජාලය අවශ්‍ය වුවද, සලකුණු කළ ස්ථාන දිස්වේ.'
              : 'Map base tiles require internet connectivity, but plotted coordinates and popups continue to work offline.'}
          </span>
        </div>
      )}

      {/* Leaflet Canvas */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <div ref={mapContainerRef} className="h-[58vh] min-h-[380px] w-full z-10" />
      </div>

      {/* Unmapped Records Callout */}
      {(unmappedDisastersCount > 0 || unmappedFamiliesCount > 0 || (filteredDisasters.length === 0 && filteredFamilies.length === 0)) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-slate-600">
            <Layers className="h-4 w-4 text-[#0F294A] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">
                {lang === 'si' ? 'ඛණ්ඩාංක නොමැති වාර්තා' : 'Coordinate Coverage Summary'}
              </p>
              <p className="mt-0.5 tabular-nums">
                {unmappedDisastersCount} disaster(s) and {unmappedFamiliesCount} affected family record(s) do not have latitude/longitude coordinates yet.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('disasters')}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>{lang === 'si' ? 'ආපදා වෙත යන්න' : 'Edit Disasters'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('affected_families')}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>{lang === 'si' ? 'පවුල් වෙත යන්න' : 'Edit Families'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
