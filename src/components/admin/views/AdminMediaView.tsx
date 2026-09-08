'use client';

import React, { useState } from 'react';
import {
  FolderUp,
  Image as ImageIcon,
  Music,
  Film,
  FileText,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  HardDrive,
} from 'lucide-react';
import { MediaUploadDropzone, MediaCategory } from '../cms/MediaUploadDropzone';

interface Props {
  showNotice: (type: 'success' | 'error', msg: string) => void;
}

interface UploadRecord {
  id: string;
  category: MediaCategory;
  url: string;
  storageKey: string;
  timestamp: string;
}

export const AdminMediaView: React.FC<Props> = ({ showNotice }) => {
  const [selectedCategory, setSelectedCategory] = useState<MediaCategory>('poster');
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentStorageKey, setCurrentStorageKey] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uploadHistory, setUploadHistory] = useState<UploadRecord[]>([]);
  const latestUrlRef = React.useRef('');

  const handleUploaded = (url: string) => {
    latestUrlRef.current = url;
    setCurrentUrl(url);
  };

  const handleStorageKeyChange = (key: string) => {
    setCurrentStorageKey(key);
    if (key) {
      const activeUrl = latestUrlRef.current || key;
      setUploadHistory((prev) => [
        {
          id: `${Date.now()}`,
          category: selectedCategory,
          url: activeUrl,
          storageKey: key,
          timestamp: new Date().toLocaleTimeString('ar-EG'),
        },
        ...prev.slice(0, 19),
      ]);
      showNotice('success', 'تم اعتماد الملف ورفعه مباشرة إلى سحابة Cloudflare R2 بنجاح');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2500);
    showNotice('success', 'تم نسخ المفتاح إلى الحافظة');
  };

  const categories: { key: MediaCategory; label: string; icon: React.ElementType }[] = [
    { key: 'poster', label: 'بوستر طولي', icon: ImageIcon },
    { key: 'hero', label: 'غلاف هيرو عريض', icon: ImageIcon },
    { key: 'audio', label: 'ملف صوتي ماستر', icon: Music },
    { key: 'video', label: 'مقطع فيديو تشويقي', icon: Film },
    { key: 'transcript', label: 'نص متزامن (SRT/JSON)', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      {/* 1. ترويسة إدارة الوسائط */}
      <div className="p-4 rounded-2xl bg-surface border border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-editorial-ivory flex items-center gap-2">
            <HardDrive size={20} className="text-crimson" />
            <span>منصة وسائط التخزين السحابية (Cloudflare R2 Direct)</span>
          </h2>
          <p className="text-xs text-editorial-muted">
            رفع مباشر وآمن من المتصفح إلى الحاوية السحابية وتوليد مفاتيح التخزين المعتمدة
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-xs font-bold shrink-0">
          <ShieldCheck size={16} />
          <span>تخزين R2 متصل ونشط</span>
        </div>
      </div>

      {/* 2. منطقة الرفع المباشر المركزية */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* عمود الرفع واختيار الفئة */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-surface border border-border-subtle space-y-5">
          <div>
            <label className="text-xs font-bold text-editorial-secondary block mb-2">
              اختر فئة الملف المرفوع:
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedCategory === cat.key;
                return (
                  <button
                    type="button"
                    key={cat.key}
                    onClick={() => {
                      setSelectedCategory(cat.key);
                      setCurrentUrl('');
                      setCurrentStorageKey('');
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                      isSelected
                        ? 'bg-crimson text-white border-crimson shadow-halo'
                        : 'bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory border-border-subtle'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <MediaUploadDropzone
            label={`رفع ${categories.find((c) => c.key === selectedCategory)?.label}`}
            category={selectedCategory}
            value={currentUrl}
            onChange={handleUploaded}
            onStorageKeyChange={handleStorageKeyChange}
            helperText="اسحب الملف هنا أو انقر للاختيار. سيتم رفعه مباشرة وبسرعة فائقة إلى R2 دون استهلاك خوادم الموقع."
          />

          {currentStorageKey && (
            <div className="p-4 rounded-xl bg-surface-elevated/70 border border-border-subtle space-y-2">
              <span className="text-[11px] text-editorial-muted font-bold block">
                مفتاح التخزين المعتمد (Storage Key):
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={currentStorageKey}
                  className="w-full bg-obsidian-900 border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-editorial-ivory font-mono"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentStorageKey)}
                  className="min-h-8 px-3 rounded-lg bg-surface hover:bg-surface-elevated border border-border-subtle text-editorial-secondary hover:text-editorial-ivory text-xs flex items-center gap-1.5 transition-colors shrink-0"
                >
                  {copiedKey === currentStorageKey ? (
                    <>
                      <Check size={13} className="text-emerald-400" />
                      <span className="text-emerald-400">تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>نسخ</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* سجل الرفع في الجلسة الحالية */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-surface border border-border-subtle space-y-4">
          <div className="border-b border-border-subtle pb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-editorial-ivory flex items-center gap-2">
              <FolderUp size={16} className="text-amber-400" />
              <span>سجل الملفات المرفوعة في هذه الجلسة</span>
            </h3>
            <span className="text-xs text-editorial-muted font-mono">{uploadHistory.length}</span>
          </div>

          <div className="space-y-2.5 max-h-[460px] overflow-y-auto scrollbar-thin scrollbar-thumb-border-subtle">
            {uploadHistory.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-surface-elevated/50 border border-border-subtle flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-surface border border-border-subtle text-[10px] font-bold text-editorial-secondary">
                      {item.category}
                    </span>
                    <span className="text-[10px] text-editorial-muted font-mono">
                      {item.timestamp}
                    </span>
                  </div>
                  <span className="text-editorial-ivory font-mono text-[11px] block truncate max-w-[200px]">
                    {item.storageKey}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(item.storageKey)}
                  className="w-8 h-8 rounded-lg bg-surface hover:bg-surface-elevated border border-border-subtle text-editorial-secondary hover:text-editorial-ivory flex items-center justify-center shrink-0 transition-colors"
                  title="نسخ مفتاح التخزين"
                >
                  {copiedKey === item.storageKey ? (
                    <Check size={13} className="text-emerald-400" />
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </div>
            ))}

            {uploadHistory.length === 0 && (
              <p className="text-xs text-editorial-muted py-12 text-center">
                لم يتم رفع ملفات جديدة في هذه الجلسة بعد
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
