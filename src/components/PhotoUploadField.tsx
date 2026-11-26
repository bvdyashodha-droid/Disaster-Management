import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, X } from 'lucide-react';
import type { Language } from '../types/dmis';

interface PhotoUploadFieldProps {
  label: string;
  lang: Language;
  maxPhotos: number;
  value: string | string[] | null | undefined;
  onChange: (next: string | string[] | null) => void;
}

const VALID_IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function isSafeImageSrc(src: unknown): src is string {
  return typeof src === 'string' && VALID_IMAGE_DATA_URL.test(src);
}

async function compressImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files (JPG, PNG, WebP) are allowed.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const maxDim = 1024;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.72);
        if (!isSafeImageSrc(compressed)) {
          reject(new Error('Compressed image failed validation.'));
          return;
        }
        resolve(compressed);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const PhotoUploadField: React.FC<PhotoUploadFieldProps> = ({
  label,
  lang,
  maxPhotos,
  value,
  onChange,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const isMulti = maxPhotos > 1;
  const photos: string[] = isMulti
    ? (Array.isArray(value) ? value : []).filter(isSafeImageSrc)
    : isSafeImageSrc(value)
      ? [value]
      : [];

  const remaining = Math.max(0, maxPhotos - photos.length);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (fileList.length === 0) return;

    setError(null);
    setProcessing(true);
    try {
      const filesToProcess = fileList.slice(0, isMulti ? remaining : 1);
      const compressedList: string[] = [];
      for (const f of filesToProcess) {
        const dataUrl = await compressImageFile(f);
        compressedList.push(dataUrl);
      }

      if (isMulti) {
        onChange([...photos, ...compressedList].slice(0, maxPhotos));
      } else {
        onChange(compressedList[0] ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemove = (index: number) => {
    if (isMulti) {
      const next = photos.filter((_, idx) => idx !== index);
      onChange(next);
    } else {
      onChange(null);
    }
  };

  return (
    <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-800">{label}</p>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {isMulti
              ? lang === 'si'
                ? `ඡායාරූප ${photos.length} / ${maxPhotos} ක් එක් කර ඇත`
                : `${photos.length} of ${maxPhotos} photos added`
              : lang === 'si'
                ? 'අවශ්‍ය නම් පමණක් ඡායාරූපයක් එක් කරන්න (Optional)'
                : 'Optional photo — leave empty if not available'}
          </p>
        </div>

        {(isMulti ? remaining > 0 : true) && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple={isMulti}
              onChange={handleFilesSelected}
              className="hidden"
            />
            <button
              type="button"
              disabled={processing}
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {isMulti ? <ImagePlus className="h-4 w-4 text-[#0F294A]" /> : <Camera className="h-4 w-4 text-[#0F294A]" />}
              <span>
                {processing
                  ? lang === 'si'
                    ? 'සැකසෙමින්...'
                    : 'Processing...'
                  : isMulti
                    ? lang === 'si'
                      ? 'ඡායාරූප එක් කරන්න'
                      : 'Add Photo'
                    : photos.length > 0
                      ? lang === 'si'
                        ? 'ඡායාරූපය මාරු කරන්න'
                        : 'Replace Photo'
                      : lang === 'si'
                        ? 'ඡායාරූපයක් ගන්න / තෝරන්න'
                        : 'Add / Capture Photo'}
              </span>
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
          {error}
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {photos.map((src, idx) => (
            <div
              key={`${idx}-${src.slice(0, 24)}`}
              className="relative group aspect-4/3 overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              <button
                type="button"
                onClick={() => setPreviewSrc(src)}
                className="h-full w-full block focus:outline-none"
              >
                <img
                  src={src}
                  alt={`Uploaded photo ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                aria-label="Remove photo"
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/75 text-white hover:bg-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {previewSrc && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-4"
          onClick={() => setPreviewSrc(null)}
        >
          <div className="relative max-h-[85vh] max-w-2xl overflow-hidden rounded-xl bg-white p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => setPreviewSrc(null)}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/80 text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={previewSrc}
              alt="Full photo preview"
              referrerPolicy="no-referrer"
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
