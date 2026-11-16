import React, { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  ExternalLink,
  ShieldCheck,
  FileCheck,
  Search,
} from 'lucide-react';
import { subAdminApi } from '../../services/api';
import { EntrySubmission } from '../../types';
import { ScreenshotModal } from '../../components/common/ScreenshotModal';

export const SubAdminEntryManagement: React.FC = () => {
  const [entries, setEntries] = useState<EntrySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [unmaskedAccounts, setUnmaskedAccounts] = useState<Record<string, boolean>>({});
  const [selectedEntryForProof, setSelectedEntryForProof] = useState<EntrySubmission | null>(null);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const data = await subAdminApi.getEntries();
      setEntries(data);
    } catch (err) {
      console.error('Failed to load entries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleToggleMask = async (entry: EntrySubmission) => {
    const isCurrentlyUnmasked = unmaskedAccounts[entry.id];
    if (!isCurrentlyUnmasked) {
      try {
        await subAdminApi.logUnmaskAudit(entry.employeeId, entry.employeeName);
      } catch (err) {
        console.error('Unmask audit failed:', err);
      }
    }
    setUnmaskedAccounts((prev) => ({ ...prev, [entry.id]: !isCurrentlyUnmasked }));
  };

  const filtered = entries.filter(
    (e) =>
      e.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      e.referenceId.toLowerCase().includes(search.toLowerCase()) ||
      e.bankName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Entry & Withdrawal Log</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Auto-settled withdrawal records. All entries are immediately settled upon employee submission.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-[#E8E2D8] shadow-xs p-4 flex items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A89B85]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, employee, bank..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF8F5] border border-[#DDD5C7] text-[#2D2526] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23]"
          />
        </div>
        <span className="text-xs text-slate-500 ml-auto font-medium">
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Entries Table */}
      <div className="bg-white rounded-xl border border-[#E8E2D8] overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-[#E8E2D8] bg-[#FAF8F5] flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-[#880E23]" />
          <h3 className="font-bold text-[#2D2526] text-sm">Auto-Settled Withdrawal Records ({entries.length})</h3>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-[#FAF8F5] border-b border-[#E8E2D8] text-[#74675B] font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Employee</th>
              <th className="py-3 px-4">UPI Ref ID</th>
              <th className="py-3 px-4">Bank Details</th>
              <th className="py-3 px-4">Withdrawn Amount</th>
              <th className="py-3 px-4">Entry Timestamp</th>
              <th className="py-3 px-4 text-right">Payment Proof</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EBE5DB] text-[#2D2526]">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  Loading records...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  No withdrawal records found.
                </td>
              </tr>
            ) : (
              filtered.map((entry) => {
                const isUnmasked = unmaskedAccounts[entry.id];
                const displayAccount = isUnmasked
                  ? entry.bankAccountNumber
                  : `•••• •••• •••• ${entry.bankAccountNumber.slice(-4)}`;

                return (
                  <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 block">{entry.employeeName}</span>
                      <a
                        href={entry.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-600 text-[11px] hover:underline inline-flex items-center gap-1 mt-0.5"
                      >
                        Source Portal <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-semibold text-teal-800">
                      {entry.referenceId}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-900">{displayAccount}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleMask(entry)}
                          title={isUnmasked ? 'Mask Account' : 'Unmask (Audit Logged)'}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                        >
                          {isUnmasked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <span className="text-[11px] text-slate-500 block">
                        {entry.bankName} · {entry.ifscCode}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="text-sm font-bold text-slate-900 block">
                        ₹{entry.withdrawalAmount.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400">Gross: ₹{entry.amount.toLocaleString()}</span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-500">
                      <span className="block font-medium">
                        {new Date(entry.submittedAt).toLocaleDateString()}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(entry.submittedAt).toLocaleTimeString()}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedEntryForProof(entry)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                        View Proof
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Proof Viewer Lightbox */}
      <ScreenshotModal
        isOpen={!!selectedEntryForProof}
        entry={selectedEntryForProof}
        onClose={() => setSelectedEntryForProof(null)}
      />
    </div>
  );
};
