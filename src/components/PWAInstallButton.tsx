import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleAction = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleAction}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#E5484D] text-white font-medium transition-colors duration-150 hover:bg-[#D13B40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5484D] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0C0F] whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'min-h-[40px] px-3 text-xs' : 'min-h-[44px] px-4 py-2 text-sm'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{isIOS ? 'Add to iPhone' : isInstallable ? 'Install App' : 'Get Mobile App'}</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-guide-title"
            className="w-full md:max-w-md rounded-t-3xl md:rounded-2xl bg-[#13151B] border border-white/10 p-6 pb-8 md:pb-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4 md:hidden" />

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#1D2029] border border-white/10 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-[#E5484D]" />
                </div>
                <div>
                  <h3 id="install-guide-title" className="font-display text-lg font-semibold text-[#F4F5F7]">
                    Install Movies and Games on Your Phone
                  </h3>
                  <p className="text-xs text-[#9499A6]">Works natively on Android and iPhone</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close install guide"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#9499A6] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-sm text-[#C9CDD6]">
              <div className={`p-4 rounded-xl bg-[#0B0C0F] border ${isIOS ? 'border-[#E5484D]/50' : 'border-white/[0.07]'}`}>
                <p className="font-semibold text-[#F4F5F7] mb-1.5">iPhone &amp; iPad (Safari)</p>
                <ol className="space-y-1.5 text-xs text-[#9499A6] leading-relaxed list-decimal list-inside">
                  <li>
                    Tap the <span className="inline-flex items-center gap-1 text-[#F4F5F7] font-medium"><Share className="w-3.5 h-3.5" /> Share</span> icon in Safari&apos;s bottom toolbar.
                  </li>
                  <li>Scroll down and tap <span className="text-[#F4F5F7] font-medium">Add to Home Screen</span>.</li>
                  <li>Tap <span className="text-[#F4F5F7] font-medium">Add</span> to launch Movies and Games full-screen like a native app.</li>
                </ol>
              </div>

              <div className={`p-4 rounded-xl bg-[#0B0C0F] border ${isAndroid ? 'border-[#E5484D]/50' : 'border-white/[0.07]'}`}>
                <p className="font-semibold text-[#F4F5F7] mb-1.5">Android (Chrome / Edge)</p>
                <ol className="space-y-1.5 text-xs text-[#9499A6] leading-relaxed list-decimal list-inside">
                  <li>Open the browser menu (three dots in the top-right corner).</li>
                  <li>Tap <span className="text-[#F4F5F7] font-medium">Install app</span> or <span className="text-[#F4F5F7] font-medium">Add to Home screen</span>.</li>
                  <li>Confirm to pin Movies and Games to your Android app drawer.</li>
                </ol>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-white/10 text-sm font-medium text-white hover:bg-white/15 transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
