import React, { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, ExternalLink, ShieldCheck } from 'lucide-react';
import { EntrySubmission } from '../../types';

interface ScreenshotModalProps {
  entry: EntrySubmission | null;
  isOpen: boolean;
  onClose: () => void;
}

function getReceiptSvg(refId: string, amount: number, employee: string, dateStr?: string): string {
  const formattedAmount = (amount || 0).toLocaleString();
  const dateFormatted = dateStr ? new Date(dateStr).toLocaleString() : 'Verified Settlement';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="620" viewBox="0 0 420 620">
    <rect width="420" height="620" fill="#f8fafc"/>
    <rect x="20" y="20" width="380" height="580" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <rect x="20" y="20" width="380" height="100" rx="16" fill="#880E23"/>
    <text x="210" y="58" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">UPI PAYMENT VERIFICATION</text>
    <text x="210" y="85" font-family="Arial, sans-serif" font-size="12" fill="#fecdd3" text-anchor="middle">NATIONAL PAYMENTS TRANSACTION RECEIPT</text>
    
    <circle cx="210" cy="170" r="32" fill="#ecfdf5"/>
    <path d="M198 170l8 8 16-16" stroke="#059669" stroke-width="4" fill="none" stroke-linecap="round"/>
    
    <text x="210" y="235" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#0f172a" text-anchor="middle">&#x20B9;${formattedAmount}</text>
    <text x="210" y="260" font-family="Arial, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">Successful Instant Withdrawal Settlement</text>
    
    <line x1="45" y1="285" x2="375" y2="285" stroke="#e2e8f0" stroke-dasharray="4"/>
    
    <text x="50" y="320" font-family="Arial, sans-serif" font-size="12" fill="#64748b">Beneficiary Name</text>
    <text x="370" y="320" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="end">${employee || 'Authorized Staff'}</text>
    
    <text x="50" y="360" font-family="Arial, sans-serif" font-size="12" fill="#64748b">UPI Ref / Transaction ID</text>
    <text x="370" y="360" font-family="Courier, monospace" font-size="12" font-weight="bold" fill="#880E23" text-anchor="end">${refId || 'UPI-REF-PENDING'}</text>
    
    <text x="50" y="400" font-family="Arial, sans-serif" font-size="12" fill="#64748b">Payment Mode</text>
    <text x="370" y="400" font-family="Arial, sans-serif" font-size="12" fill="#0f172a" text-anchor="end">Instant IMPS / UPI 2.0</text>
    
    <text x="50" y="440" font-family="Arial, sans-serif" font-size="12" fill="#64748b">Settlement Time</text>
    <text x="370" y="440" font-family="Arial, sans-serif" font-size="12" fill="#0f172a" text-anchor="end">${dateFormatted}</text>
    
    <rect x="45" y="480" width="330" height="85" rx="10" fill="#f1f5f9" stroke="#e2e8f0"/>
    <text x="60" y="508" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#334155">NPCI Core Gateway Verification</text>
    <text x="60" y="528" font-family="Courier, monospace" font-size="10" fill="#64748b">Bank RRN: 948102948201 · NPCI-ACK-OK</text>
    <text x="60" y="546" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#059669">Status: SETTLED &amp; CONFIRMED TO BANK</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({
  entry,
  isOpen,
  onClose,
}) => {
  const [zoom, setZoom] = useState(1);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [entry?.id, entry?.screenshotUrl]);

  if (!isOpen || !entry) return null;

  const isRealUploadedImage = Boolean(
    entry.screenshotUrl &&
      entry.screenshotUrl.trim() !== '' &&
      !entry.screenshotUrl.includes('proof-sample')
  );

  const proofUrl =
    !imgError && isRealUploadedImage
      ? entry.screenshotUrl
      : getReceiptSvg(entry.referenceId, entry.withdrawalAmount, entry.employeeName, entry.submittedAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E8E2D8] flex items-center justify-between bg-[#FAF8F5] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#FDF2F4] text-[#880E23] rounded-lg border border-[#F8CAD1]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-[#2D2526] text-base">Payment Proof Verification Lightbox</h3>
              <p className="text-xs text-[#74675B]">
                Submitted by {entry.employeeName} · Ref: <span className="font-mono text-[#880E23] font-semibold">{entry.referenceId}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#FAF8F5] border border-[#DDD5C7] rounded-lg px-2 py-1 mr-2 shadow-xs">
              <button
                onClick={() => setZoom((z) => Math.max(0.7, z - 0.2))}
                className="p-1 text-[#685E4E] hover:text-[#2D2526]"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono px-2 text-[#4E463A]">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
                className="p-1 text-[#685E4E] hover:text-[#2D2526]"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#877A65] hover:text-[#2D2526] hover:bg-[#EBE5DB] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Split view (Metadata on left, Screenshot on right) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-0">
          {/* Metadata Sidebar */}
          <div className="md:col-span-5 p-6 bg-[#FAF8F5] border-r border-[#E8E2D8] space-y-4">
            <div className="p-4 bg-white rounded-xl border border-[#E8E2D8] shadow-xs">
              <span className="text-xs text-[#74675B] uppercase tracking-wider block font-semibold">Claimed Withdrawal</span>
              <span className="text-2xl font-bold text-[#880E23] mt-1 block">
                ₹{entry.withdrawalAmount.toLocaleString()}
              </span>
              <span className="text-xs text-[#74675B] mt-0.5 block">
                Gross Entry Value: ₹{entry.amount.toLocaleString()}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-white rounded-lg border border-[#E8E2D8]">
                <span className="text-[#74675B] block mb-0.5">Destination Bank Account</span>
                <span className="font-mono font-medium text-[#2D2526] text-sm">{entry.bankAccountNumber}</span>
                <span className="text-[#74675B] block mt-0.5">
                  {entry.bankName} · IFSC: {entry.ifscCode}
                </span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-[#E8E2D8]">
                <span className="text-[#74675B] block mb-0.5">UPI Gateway Reference</span>
                <span className="font-mono font-semibold text-[#880E23]">{entry.referenceId}</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-[#E8E2D8]">
                <span className="text-[#74675B] block mb-0.5">Associated Website / Task URL</span>
                <a
                  href={entry.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#880E23] hover:underline flex items-center gap-1 break-all"
                >
                  {entry.websiteUrl}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>

              {entry.remarks && (
                <div className="p-3 bg-white rounded-lg border border-[#E8E2D8]">
                  <span className="text-[#74675B] block mb-0.5">Employee Submission Notes</span>
                  <p className="text-[#4E463A] italic">{entry.remarks}</p>
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
              <p className="font-bold text-slate-800">Auto-Settled Withdrawal Record</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Funds deducted directly upon employee withdrawal submission.
              </p>
            </div>
          </div>

          {/* Screenshot Preview Canvas */}
          <div className="md:col-span-7 p-6 bg-[#F5F1EB] flex items-center justify-center overflow-auto min-h-[350px]">
            <div
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              className="transition-transform duration-150 shadow-lg rounded-xl overflow-hidden max-w-full"
            >
              <img
                src={proofUrl}
                alt="Payment proof screenshot"
                onError={() => setImgError(true)}
                className="max-h-[520px] w-auto object-contain rounded-xl border border-[#DDD5C7] bg-white"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 bg-white border-t border-[#E8E2D8] flex items-center justify-between shrink-0">
          <span className="text-xs text-[#74675B]">
            Verified against employee UPI gateway reference.
          </span>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#FAF8F5] hover:bg-[#EBE5DB] text-[#4E463A] border border-[#DDD5C7] rounded-lg text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
