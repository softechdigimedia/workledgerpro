import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, IndianRupee, ShieldCheck, Upload, AlertCircle, FileText, Image as ImageIcon, Lock } from 'lucide-react';
import { FloatReplenishmentRequest } from '../../types';

interface ApproveFloatModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: FloatReplenishmentRequest | null;
  onApprove: (data: {
    referenceId: string;
    bankAccount: string;
    screenshotUrl: string;
    remarks?: string;
  }) => Promise<void>;
}

export const ApproveFloatModal: React.FC<ApproveFloatModalProps> = ({
  isOpen,
  onClose,
  request,
  onApprove,
}) => {
  const [referenceId, setReferenceId] = useState('');
  const [bankAccount, setBankAccount] = useState(request?.bankAccount || 'State Bank of India - •••• •••• 1234');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (request) {
      setBankAccount(request.bankAccount || 'State Bank of India - •••• •••• 1234');
      setReferenceId('');
      setScreenshotUrl('');
      setFileName('');
      setFileSize('');
      setRemarks('');
      setError(null);
    }
  }, [request]);

  if (!isOpen || !request) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Screenshot file size must be under 5MB.');
        return;
      }
      setFileName(file.name);
      setFileSize((file.size / 1024).toFixed(1) + ' KB');
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotUrl(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referenceId.trim()) {
      setError('Please provide a valid Reference ID / UTR number.');
      return;
    }
    if (!bankAccount.trim()) {
      setError('Please provide the destination Bank Account details.');
      return;
    }
    if (!screenshotUrl.trim()) {
      setError('Payment screenshot is mandatory. Please upload the transaction transfer proof.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onApprove({
        referenceId: referenceId.trim(),
        bankAccount: bankAccount.trim(),
        screenshotUrl: screenshotUrl.trim(),
        remarks: remarks.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to approve float request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#2D040A] to-[#540A17] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#880E23] flex items-center justify-center text-white font-bold border border-[#A81730]">
              <IndianRupee className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight">Approve Float Replenishment</h3>
              <p className="text-[11px] text-[#F8CAD1]">Disburse capital to {request.employeeName} ({request.employeeCode})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-rose-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Request Overview Card */}
          <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E8E2D8] flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Requested Amount</span>
              <span className="text-xl font-black text-[#880E23]">₹{request.amount.toLocaleString()}</span>
              {request.reason && (
                <p className="text-[11px] text-slate-600 mt-1 max-w-xs truncate">
                  <span className="font-semibold text-slate-700">Reason:</span> {request.reason}
                </p>
              )}
            </div>
            <div className="text-right">
              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                PENDING APPROVAL
              </span>
              <span className="block text-[10px] text-slate-400 mt-1 font-mono">
                {new Date(request.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Reference ID (Mandatory) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Reference ID / UTR Number <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="e.g. UTR-9928172654 / IMPS-881920"
              className="mt-1 w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-0.5">Mandatory bank transaction transfer reference code.</p>
          </div>

          {/* Destination Bank Account Details (Locked / Non-Editable) */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Destination Bank Account Details
              </label>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                <Lock className="w-3 h-3 text-slate-400" /> Non-Editable (Verified)
              </span>
            </div>
            <div className="relative mt-1">
              <input
                type="text"
                readOnly
                value={bankAccount}
                className="w-full px-3 py-2 text-xs bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-medium cursor-not-allowed select-all focus:outline-none"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
              Verified employee destination bank account &mdash; locked for security and cannot be altered.
            </p>
          </div>

          {/* Screenshot Proof Upload (Mandatory - No URL option) */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Transfer Screenshot / Payment Proof <span className="text-rose-600">*</span>
              </label>
              <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                Mandatory Image File
              </span>
            </div>

            {!screenshotUrl ? (
              <label className="mt-1.5 cursor-pointer border-2 border-dashed border-slate-300 hover:border-[#880E23] hover:bg-rose-50/20 bg-slate-50/70 rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all group">
                <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-rose-100/80 flex items-center justify-center mb-2 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400 group-hover:text-[#880E23] transition-colors" />
                </div>
                <span className="text-xs font-bold text-slate-800 group-hover:text-[#880E23]">
                  Click to Upload Payment Screenshot
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5">
                  PNG, JPG, JPEG or WEBP (Max 5MB)
                </span>
                <input
                  type="file"
                  accept="image/*"
                  required
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="mt-1.5 p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={screenshotUrl}
                    alt="Proof Preview"
                    className="w-14 h-14 object-cover rounded-lg border border-emerald-300 shrink-0 shadow-2xs"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      Payment Screenshot Attached
                    </span>
                    <p className="text-[11px] text-slate-600 truncate mt-0.5 font-medium">
                      {fileName || 'transfer_payment_proof.png'} {fileSize && `(${fileSize})`}
                    </p>
                    <span className="text-[10px] text-slate-400">Attached to audit trail</span>
                  </div>
                </div>
                <label className="cursor-pointer text-[11px] font-bold text-[#880E23] hover:text-[#540A17] hover:underline shrink-0 px-2.5 py-1.5 bg-white border border-[#880E23]/30 rounded-lg shadow-2xs transition-all">
                  Change Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Optional Remarks */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Disbursement Remarks <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Authorized by Regional Supervisor"
              className="mt-1 w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23]"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#880E23] hover:bg-[#6B081A] active:bg-[#4E0512] text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {loading ? 'Disbursing Float...' : 'Confirm Transfer & Disburse Float'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

