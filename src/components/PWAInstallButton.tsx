import React, { useState } from 'react';
import { Check, Copy, Download, ExternalLink, Monitor, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { Language } from '../types/dmis';

export const PWAInstallButton: React.FC<{ lang: Language }> = ({ lang }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isInIframe, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isInstalled) {
    return null;
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '/';

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuide(true);
      }
      return;
    }
    setShowGuide(true);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
          isInstallable
            ? 'bg-[#0F294A] text-white hover:bg-[#1A3B66]'
            : 'border border-[#0F294A]/30 bg-[#0F294A]/5 text-[#0F294A] hover:bg-[#0F294A]/10'
        }`}
      >
        <Download className="h-4 w-4" />
        <span>{lang === 'si' ? 'යෙදුම බාගන්න / ස්ථාපනය' : 'Install App'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {lang === 'si'
                    ? 'පරිගණකයට සහ ජංගම දුරකථනයට යෙදුම ස්ථාපනය කරන්න'
                    : 'Install DMIS on Computer & Mobile Phone'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {lang === 'si'
                    ? 'මෙය Progressive Web App (PWA) එකක් බැවින් Windows, Mac, Android සහ iPhone වල Offline ලෙස භාවිතා කළ හැක.'
                    : 'DMIS is an installable offline-capable app (PWA) for Windows, macOS, Android, and iPhone/iPad.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isInIframe && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3.5 text-xs text-sky-900 space-y-2">
                <p className="font-semibold">
                  {lang === 'si'
                    ? 'පළමුව නව Browser Tab එකකින් විවෘත කරන්න'
                    : 'Step 1: Open directly in a browser tab'}
                </p>
                <p className="leading-relaxed text-sky-800">
                  {lang === 'si'
                    ? 'Preview රාමුව තුළ සිටින විට Browser Install බොත්තම සඟවා ඇත. ස්ථාපනය කිරීමට පහත බොත්තමෙන් නව Tab එකකින් විවෘත කරන්න හෝ Link එක copy කර ඔබේ දුරකථනයෙන් විවෘත කරන්න.'
                    : 'Browsers disable app installation inside embedded preview frames. Open the app in its own browser tab or copy the URL to open on your phone.'}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#0F294A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1A3B66]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{lang === 'si' ? 'නව Tab එකකින් විවෘත කරන්න' : 'Open App in New Tab'}</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>
                      {copied
                        ? lang === 'si'
                          ? 'Link එක Copy විය'
                          : 'Link Copied'
                        : lang === 'si'
                          ? 'App Link Copy කරන්න'
                          : 'Copy App Link'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3 text-xs text-slate-700">
              <div
                className={`rounded-lg border p-3.5 space-y-1.5 ${
                  !isIOS && !isAndroid ? 'border-[#0F294A]/40 bg-slate-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Monitor className="h-4 w-4 text-[#0F294A]" />
                  <span>
                    {lang === 'si'
                      ? 'පරිගණකය (Windows / Mac — Chrome හෝ Edge)'
                      : 'Computer (Windows / macOS — Chrome or Edge)'}
                  </span>
                </div>
                <p className="leading-relaxed text-slate-600">
                  {lang === 'si'
                    ? '1. Chrome හෝ Edge හි Address Bar හි දකුණු පස ඇති Install අයිකනය ක්ලික් කරන්න (හෝ Menu ⋮ → Cast, save, and share → Install page as app). 2. "Install" තහවුරු කළ පසු Desktop / Start Menu හි App එකක් ලෙස විවෘත වේ.'
                    : '1. Click the Install icon in the right side of the Chrome/Edge address bar (or open Menu ⋮ → Cast, save, and share → Install page as app). 2. Click Install to add DMIS as a standalone desktop app.'}
                </p>
              </div>

              <div
                className={`rounded-lg border p-3.5 space-y-1.5 ${
                  isAndroid ? 'border-[#0F294A]/40 bg-slate-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Smartphone className="h-4 w-4 text-[#0F294A]" />
                  <span>
                    {lang === 'si'
                      ? 'Android ජංගම දුරකථනය (Chrome)'
                      : 'Android Phone / Tablet (Chrome)'}
                  </span>
                </div>
                <p className="leading-relaxed text-slate-600">
                  {lang === 'si'
                    ? '1. Android Chrome හි මෙම වෙබ් ලිපිනය විවෘත කරන්න. 2. ඉහළ දකුණු කෙළවරේ ඇති ⋮ Menu ඔබා "Install app" හෝ "Add to Home screen" තෝරන්න.'
                    : '1. Open this app URL in Chrome on your Android phone. 2. Tap the ⋮ menu in the top-right corner and select "Install app" or "Add to Home screen".'}
                </p>
              </div>

              <div
                className={`rounded-lg border p-3.5 space-y-1.5 ${
                  isIOS ? 'border-[#0F294A]/40 bg-slate-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Smartphone className="h-4 w-4 text-[#0F294A]" />
                  <span>
                    {lang === 'si' ? 'iPhone / iPad (Safari)' : 'iPhone / iPad (Safari)'}
                  </span>
                </div>
                <p className="leading-relaxed text-slate-600">
                  {lang === 'si'
                    ? '1. Safari හි පහළ ඇති Share (□↑) බොත්තම ඔබන්න. 2. පහළට scroll කර "Add to Home Screen" තෝරන්න.'
                    : '1. Open this app URL in Safari and tap the Share button. 2. Scroll down and tap "Add to Home Screen".'}
                </p>
              </div>
            </div>

            {!isInIframe && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                <span className="font-mono text-slate-600 truncate">{appUrl}</span>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="inline-flex items-center gap-1 font-semibold text-[#0F294A] hover:underline shrink-0"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? (lang === 'si' ? 'Copy විය' : 'Copied') : lang === 'si' ? 'Link Copy' : 'Copy Link'}</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[42px] rounded-lg bg-[#0F294A] py-2 text-xs font-semibold text-white hover:bg-[#1A3B66]"
            >
              {lang === 'si' ? 'වසන්න' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

