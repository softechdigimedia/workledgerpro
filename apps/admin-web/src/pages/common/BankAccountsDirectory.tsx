import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Building2,
  ShieldCheck,
  Eye,
  EyeOff,
  Plus,
  Search,
  Tag,
  Trash2,
  Users,
  Copy,
  Check,
  Clock,
  Lock,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Zap,
  ZapOff,
  Edit3,
} from 'lucide-react';
import { bankAccountApi, subAdminApi, superAdminApi } from '../../services/api';
import { BankAccount, EmployeeProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';

export const BankAccountsDirectory: React.FC = () => {
  const { user, isSuperAdmin, isSubAdmin } = useAuth();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [allEmployees, setAllEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [upiFilter, setUpiFilter] = useState<'ALL' | 'ACTIVE' | 'EXHAUSTED'>('ALL');

  // Security Unmask State
  const [unmaskedAccounts, setUnmaskedAccounts] = useState<Record<string, boolean>>({});
  const [isGlobalUnmasked, setIsGlobalUnmasked] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Inline Tag Add State
  const [activeTagAccountId, setActiveTagAccountId] = useState<string | null>(null);
  const [quickTagText, setQuickTagText] = useState('');
  const [tagAdding, setTagAdding] = useState(false);

  // Bulk Edit / Change Tags State
  const [editingTagsAccountId, setEditingTagsAccountId] = useState<string | null>(null);
  const [bulkEditTagsText, setBulkEditTagsText] = useState('');
  const [bulkTagsSaving, setBulkTagsSaving] = useState(false);

  // UPI Exhaustion State & Modal
  const [upiExhaustModalAccount, setUpiExhaustModalAccount] = useState<BankAccount | null>(null);
  const [upiExhaustReason, setUpiExhaustReason] = useState('Daily UPI transfer limit exhausted (₹1,00,000 quota reached) - Please use IMPS / Netbanking');
  const [upiToggling, setUpiToggling] = useState(false);

  // Register Bank Account Modal State
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [formEmployeeAccount, setFormEmployeeAccount] = useState('');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formIfscCode, setFormIfscCode] = useState('HDFC0001248');
  const [formBankName, setFormBankName] = useState('HDFC Bank');
  const [formBankUsername, setFormBankUsername] = useState('');
  const [formBankPassword, setFormBankPassword] = useState('');
  const [formTags, setFormTags] = useState('Primary, Field Float');
  const [formAssignEmployeeId, setFormAssignEmployeeId] = useState('');

  const fetchAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const [accs, emps] = await Promise.all([
        bankAccountApi.getAll(),
        isSuperAdmin ? superAdminApi.getAllEmployees().catch(() => []) : subAdminApi.getEmployees().catch(() => []),
      ]);
      setAccounts(accs);
      setAllEmployees(emps);
    } catch (err: any) {
      console.error('Failed to load bank accounts directory:', err);
      setError('Failed to fetch enterprise bank accounts directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Distinct tags list
  const availableTags = Array.from(
    new Set(
      accounts.flatMap((a) => a.tags || [])
    )
  ).filter(Boolean);

  // Filtered accounts
  const filteredAccounts = accounts.filter((acc) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      acc.bankName.toLowerCase().includes(q) ||
      acc.accountNumber.toLowerCase().includes(q) ||
      (acc.accountHolderName && acc.accountHolderName.toLowerCase().includes(q)) ||
      (acc.employeeAccount && acc.employeeAccount.toLowerCase().includes(q)) ||
      (acc.ifscCode && acc.ifscCode.toLowerCase().includes(q)) ||
      (acc.tags && acc.tags.some((t) => t.toLowerCase().includes(q)));

    const matchesTag =
      selectedTag === 'ALL' ||
      (acc.tags && acc.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase()));

    const isUpiActive = acc.isUpiActive !== false;
    const matchesUpi =
      upiFilter === 'ALL' ||
      (upiFilter === 'ACTIVE' && isUpiActive) ||
      (upiFilter === 'EXHAUSTED' && !isUpiActive);

    return matchesSearch && matchesTag && matchesUpi;
  });

  const toggleUnmaskAccount = async (account: BankAccount) => {
    const currentlyUnmasked = isGlobalUnmasked || unmaskedAccounts[account.id];
    if (!currentlyUnmasked) {
      try {
        await subAdminApi.logUnmaskAudit(
          account.id,
          account.employeeAccount || account.accountHolderName || account.bankName
        );
      } catch (e) {
        console.warn('Audit logging for account unmask:', e);
      }
    }
    setUnmaskedAccounts((prev) => ({
      ...prev,
      [account.id]: !currentlyUnmasked,
    }));
  };

  const toggleGlobalUnmask = async () => {
    const nextState = !isGlobalUnmasked;
    if (nextState) {
      try {
        await subAdminApi.logUnmaskAudit('master_directory', 'Global Bank Directory');
      } catch (e) {
        console.warn('Audit logging for global unmask:', e);
      }
    }
    setIsGlobalUnmasked(nextState);
    if (!nextState) {
      setUnmaskedAccounts({});
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleQuickAddTag = async (accountId: string) => {
    if (!quickTagText.trim()) return;
    setTagAdding(true);
    try {
      await bankAccountApi.addTag(accountId, quickTagText.trim());
      setQuickTagText('');
      setActiveTagAccountId(null);
      await fetchAccounts();
    } catch (err) {
      console.error('Failed to add tag:', err);
    } finally {
      setTagAdding(false);
    }
  };

  const handleRemoveTag = async (accountId: string, tag: string) => {
    try {
      await bankAccountApi.removeTag(accountId, tag);
      await fetchAccounts();
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  };

  const handleStartBulkEditTags = (account: BankAccount) => {
    setEditingTagsAccountId(account.id);
    setBulkEditTagsText((account.tags || []).join(', '));
    setActiveTagAccountId(null);
  };

  const handleSaveBulkTags = async (accountId: string) => {
    setBulkTagsSaving(true);
    try {
      const parsedTags = bulkEditTagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await bankAccountApi.updateTags(accountId, parsedTags);
      setEditingTagsAccountId(null);
      await fetchAccounts();
    } catch (err) {
      console.error('Failed to update tags:', err);
    } finally {
      setBulkTagsSaving(false);
    }
  };

  const handleToggleUpiStatus = async (account: BankAccount, isUpiActive: boolean, reason?: string) => {
    setUpiToggling(true);
    try {
      await bankAccountApi.setUpiStatus(account.id, {
        isUpiActive,
        upiStatus: isUpiActive ? 'ACTIVE' : 'EXHAUSTED',
        reason,
      });
      setUpiExhaustModalAccount(null);
      await fetchAccounts();
    } catch (err) {
      console.error('Failed to toggle UPI status:', err);
      alert('Failed to update UPI operational status. Please check connectivity.');
    } finally {
      setUpiToggling(false);
    }
  };

  const handleRegisterAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    try {
      const parsedTags = formTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const targetEmpId = formAssignEmployeeId || (allEmployees[0]?.id || 'default');

      await bankAccountApi.assignToEmployee(targetEmpId, {
        accountNumber: formAccountNumber.trim(),
        bankName: formBankName.trim(),
        ifscCode: formIfscCode.trim().toUpperCase(),
        accountHolderName: formEmployeeAccount.trim() || 'Account Beneficiary',
        employeeAccount: formEmployeeAccount.trim() || 'Account Beneficiary',
        bankUsername: formBankUsername.trim() || undefined,
        bankPassword: formBankPassword.trim() || undefined,
        tags: parsedTags,
        customTags: parsedTags,
        isPrimary: false,
      });

      setIsRegisterModalOpen(false);
      // Reset form
      setFormEmployeeAccount('');
      setFormAccountNumber('');
      setFormBankUsername('');
      setFormBankPassword('');
      setFormTags('Primary, Field Float');
      await fetchAccounts();
    } catch (err) {
      console.error('Failed to register bank account:', err);
    } finally {
      setRegistering(false);
    }
  };

  const maskAcc = (accNumber: string) => {
    if (!accNumber) return '•••• •••• •••• 0000';
    const clean = accNumber.replace(/[\s-]/g, '');
    if (clean.length <= 4) return clean;
    return `•••• •••• •••• ${clean.slice(-4)}`;
  };

  return (
    <div className="space-y-6">
      {/* ========================================================= */}
      {/* PAGE HEADER */}
      {/* ========================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-[#880E23]/10 text-[#880E23] rounded-lg">
              <CreditCard className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-[#2D2526] tracking-tight">
              Enterprise Bank Accounts Directory
            </h1>
            <span className="text-[10px] font-bold bg-[#880E23] text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
              {isSuperAdmin ? 'Super Admin' : 'Sub-Admin'} Exclusive
            </span>
          </div>
          <p className="text-xs text-[#74675B]">
            Centralized directory for multi-bank account routing, confidential netbanking credentials, and synchronized tag provenance across all regional hubs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Global Unmask Toggle */}
          <button
            type="button"
            onClick={toggleGlobalUnmask}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
              isGlobalUnmasked
                ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {isGlobalUnmasked ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                <span>Mask All Credentials</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-slate-600" />
                <span>Unmask Credentials (Audited)</span>
              </>
            )}
          </button>

          {/* Register New Account */}
          <button
            type="button"
            onClick={() => setIsRegisterModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#880E23] hover:bg-[#6B081A] text-white rounded-lg text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Bank Account</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* KPI SUMMARY CARDS */}
      {/* ========================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Total Registered</span>
            <Building2 className="w-4 h-4 text-[#880E23]" />
          </div>
          <span className="text-2xl font-bold text-slate-900">{accounts.length}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Enterprise bank routes</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">1-to-Many Shared</span>
            <Users className="w-4 h-4 text-teal-600" />
          </div>
          <span className="text-2xl font-bold text-teal-700">
            {accounts.filter((a) => (a.assignedUsersCount || 0) > 1).length}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Multi-employee pool</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">UPI Active</span>
            <Zap className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-bold text-emerald-700">
            {accounts.filter((a) => a.isUpiActive !== false).length}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Instant UPI enabled</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">UPI Exhausted</span>
            <ZapOff className="w-4 h-4 text-rose-600" />
          </div>
          <span className="text-2xl font-bold text-rose-700">
            {accounts.filter((a) => a.isUpiActive === false).length}
          </span>
          <span className="text-[10px] text-rose-500 block mt-0.5 font-medium">Route via IMPS/Netbanking</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Security Mode</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-xs font-bold text-emerald-700 uppercase block mt-1.5">
            Admin / Sub-Admin Only
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">100% Encrypted &amp; Masked</span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SEARCH & TAG FILTER CONTROLS */}
      {/* ========================================================= */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Bank Name, Account Number, Employee Account, IFSC, or Tag..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23]/20 focus:border-[#880E23]"
            />
          </div>

          <button
            type="button"
            onClick={fetchAccounts}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {/* UPI Status & Tag Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          {/* UPI Capability Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
              Payment Method:
            </span>
            <button
              type="button"
              onClick={() => setUpiFilter('ALL')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                upiFilter === 'ALL'
                  ? 'bg-slate-800 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Channels ({accounts.length})
            </button>
            <button
              type="button"
              onClick={() => setUpiFilter('ACTIVE')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors shrink-0 flex items-center gap-1 ${
                upiFilter === 'ACTIVE'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <Zap className="w-3 h-3" />
              UPI Active ({accounts.filter((a) => a.isUpiActive !== false).length})
            </button>
            <button
              type="button"
              onClick={() => setUpiFilter('EXHAUSTED')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors shrink-0 flex items-center gap-1 ${
                upiFilter === 'EXHAUSTED'
                  ? 'bg-rose-700 text-white shadow-2xs'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
              }`}
            >
              <ZapOff className="w-3 h-3" />
              ⚠️ UPI Exhausted ({accounts.filter((a) => a.isUpiActive === false).length})
            </button>
          </div>

          {/* Tag Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
              Tag:
            </span>
            <button
              type="button"
              onClick={() => setSelectedTag('ALL')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                selectedTag === 'ALL'
                  ? 'bg-[#880E23] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Tags
            </button>
            {availableTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTag(t)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                  selectedTag.toLowerCase() === t.toLowerCase()
                    ? 'bg-teal-700 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ACCOUNTS DIRECTORY GRID */}
      {/* ========================================================= */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <div className="w-6 h-6 border-2 border-[#880E23] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span className="text-xs text-slate-500">Loading bank accounts directory...</span>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-400 text-xs">
          No bank accounts found matching the active search or tag criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredAccounts.map((acc) => {
            const isUnmasked = isGlobalUnmasked || !!unmaskedAccounts[acc.id];
            const displayAccountNum = isUnmasked ? acc.accountNumber : maskAcc(acc.accountNumber);

            return (
              <div
                key={acc.id}
                className="bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col justify-between"
              >
                {/* Account Card Header */}
                <div className="p-4 bg-slate-50/70 border-b border-slate-200/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 font-bold shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-900 text-sm">{acc.bankName}</h3>
                          {acc.isUpiActive !== false ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                              <Zap className="w-2.5 h-2.5 text-emerald-600" />
                              UPI Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-300 animate-pulse">
                              <ZapOff className="w-2.5 h-2.5 text-rose-600" />
                              ⚠️ UPI Exhausted
                            </span>
                          )}
                          {(acc.assignedUsersCount || 0) > 1 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-teal-100 text-teal-800 px-2 py-0.2 rounded-full border border-teal-200">
                              <Users className="w-2.5 h-2.5" />
                              Shared by {acc.assignedUsersCount} Users
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[11px] text-slate-500">
                          IFSC: {acc.ifscCode}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* UPI Status Quick Toggle Button */}
                      {acc.isUpiActive !== false ? (
                        <button
                          type="button"
                          onClick={() => {
                            setUpiExhaustModalAccount(acc);
                            setUpiExhaustReason(
                              'Daily UPI transfer limit exhausted (₹1,00,000 quota reached) - Please use IMPS / Netbanking'
                            );
                          }}
                          className="px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded flex items-center gap-1 transition-colors"
                          title="Mark UPI limit exhausted to warn team to use IMPS/Netbanking"
                        >
                          <ZapOff className="w-3 h-3 text-rose-600" />
                          <span>Mark Exhausted</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleUpiStatus(acc, true)}
                          disabled={upiToggling}
                          className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded flex items-center gap-1 transition-colors"
                          title="Restore UPI operational status to Active"
                        >
                          <Zap className="w-3 h-3 text-emerald-600" />
                          <span>Restore UPI</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleUnmaskAccount(acc)}
                        className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors flex items-center gap-1 ${
                          isUnmasked
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Toggle confidential credentials visibility (Audited)"
                      >
                        {isUnmasked ? (
                          <>
                            <EyeOff className="w-3 h-3 text-amber-700" />
                            <span>Mask</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3 text-slate-600" />
                            <span>Unmask</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Account Card Body (6 Standardized Fields) */}
                <div className="p-4 space-y-3 text-xs flex-1">
                  {/* Alert Callout if UPI is Exhausted */}
                  {acc.isUpiActive === false && (
                    <div className="p-2.5 bg-rose-50/90 border border-rose-200 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between text-rose-900 font-bold">
                        <span className="flex items-center gap-1 text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          ⚠️ UPI LIMIT EXHAUSTED / INACTIVE
                        </span>
                        <span className="text-[9px] bg-rose-200/90 text-rose-900 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                          Use IMPS / Netbanking
                        </span>
                      </div>
                      <p className="text-rose-700 text-[11px] leading-relaxed">
                        {acc.upiExhaustedReason ||
                          'Daily UPI limit exhausted. Do not initiate UPI transfers. All team members must route withdrawals or settlements via IMPS, Netbanking, or Corporate Card.'}
                      </p>
                      {acc.upiExhaustedBy && (
                        <div className="text-[10px] text-rose-600 flex items-center gap-1 pt-0.5 border-t border-rose-200/60">
                          <Clock className="w-2.5 h-2.5" />
                          <span>
                            Flagged by <strong>{acc.upiExhaustedBy}</strong>
                            {acc.upiExhaustedAt &&
                              ` · ${new Date(acc.upiExhaustedAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Beneficiary & Account Number */}
                  <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                        Employee Account :
                      </span>
                      <span className="font-semibold text-slate-900 text-xs block truncate mt-0.5">
                        {acc.employeeAccount || acc.accountHolderName || 'Corporate Operations Float'}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                          Account Number :
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(acc.accountNumber, `acc_${acc.id}`)}
                          className="text-slate-400 hover:text-slate-700 p-0.5"
                          title="Copy account number"
                        >
                          {copiedId === `acc_${acc.id}` ? (
                            <Check className="w-3 h-3 text-teal-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <span className="font-mono font-bold text-slate-900 text-xs block mt-0.5">
                        {displayAccountNum}
                      </span>
                    </div>
                  </div>

                  {/* Confidential Netbanking Credentials Card */}
                  <div className="p-2.5 bg-amber-50/60 border border-amber-200/80 rounded-lg">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-700" />
                        Confidential Netbanking Credentials
                      </span>
                      <span className="text-[9px] bg-amber-200/80 text-amber-900 px-1.5 py-0.2 rounded font-bold">
                        Admin / Sub-Admin Only
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Bank Username :</span>
                        <span className="font-mono font-bold text-slate-800">
                          {isUnmasked ? (acc.bankUsername || 'Not provided') : '••••••••'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Bank Password :</span>
                        <span className="font-mono font-bold text-slate-800">
                          {isUnmasked ? (acc.bankPassword || 'Not provided') : '••••••••'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Setted Synchronized Tags Section */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                        <Tag className="w-3 h-3 text-slate-400" />
                        <span>Setted Tags &amp; Sync Status</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingTagsAccountId !== acc.id && activeTagAccountId !== acc.id && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTagAccountId(acc.id);
                                setQuickTagText('');
                                setEditingTagsAccountId(null);
                              }}
                              className="text-[11px] font-bold text-teal-700 hover:underline flex items-center gap-0.5"
                            >
                              <Plus className="w-3 h-3" /> Add Tag
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartBulkEditTags(acc)}
                              className="text-[11px] font-bold text-indigo-700 hover:underline flex items-center gap-0.5"
                            >
                              <Edit3 className="w-3 h-3" /> Change Tags
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Inline Tag Addition Input */}
                    {activeTagAccountId === acc.id && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <input
                          type="text"
                          value={quickTagText}
                          onChange={(e) => setQuickTagText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleQuickAddTag(acc.id);
                            }
                          }}
                          placeholder="e.g. Highway Fuel, Emergency Pool"
                          className="px-2 py-1 text-xs border border-teal-300 rounded bg-white font-medium focus:outline-none focus:ring-1 focus:ring-teal-500 flex-1"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleQuickAddTag(acc.id)}
                          disabled={tagAdding}
                          className="px-2.5 py-1 bg-teal-600 text-white font-bold text-xs rounded hover:bg-teal-700 disabled:opacity-50"
                        >
                          {tagAdding ? '...' : 'Add'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTagAccountId(null)}
                          className="px-1.5 py-1 text-slate-400 hover:text-slate-600 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Inline Bulk Edit/Change Tags Input */}
                    {editingTagsAccountId === acc.id && (
                      <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2 mb-2">
                        <div className="flex items-center justify-between text-indigo-900 font-bold text-[11px]">
                          <span>Modify / Change Tags for this Account</span>
                          <span className="text-[10px] text-indigo-600 font-normal">Comma-separated</span>
                        </div>
                        <input
                          type="text"
                          value={bulkEditTagsText}
                          onChange={(e) => setBulkEditTagsText(e.target.value)}
                          placeholder="e.g. Primary, Highway Fuel, Field Float"
                          className="w-full px-2.5 py-1.5 border border-indigo-300 rounded bg-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          autoFocus
                        />
                        <div className="flex items-center justify-between text-[10px] text-indigo-700">
                          <span>Syncs to all assigned users &amp; logs to Admin Audit Trail.</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingTagsAccountId(null)}
                              className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-600 hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveBulkTags(acc.id)}
                              disabled={bulkTagsSaving}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded flex items-center gap-1 shadow-xs disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" />
                              <span>{bulkTagsSaving ? 'Saving...' : 'Save Tags'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tag Pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {acc.tags && acc.tags.length > 0 ? (
                        acc.tags.map((tag, idx) => {
                          const logMeta = acc.tagLogs?.find(
                            (l) => l.tag.toLowerCase() === tag.toLowerCase()
                          );
                          return (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200"
                              title={
                                logMeta
                                  ? `Attached by ${logMeta.addedByName} (${logMeta.addedByRole}) on ${
                                      logMeta.addedAt ? new Date(logMeta.addedAt).toLocaleString() : 'N/A'
                                    }`
                                  : undefined
                              }
                            >
                              <span>#{tag}</span>
                              {logMeta && logMeta.addedByName && (
                                <span className="text-[9px] text-slate-500 font-normal">
                                  · {logMeta.addedByName.split(' ')[0]}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveTag(acc.id, tag)}
                                className="text-slate-400 hover:text-rose-600 font-bold ml-0.5"
                                title={`Remove ${tag}`}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No tags attached</span>
                      )}
                    </div>

                    {/* Tag User Audit Trail List */}
                    {acc.tagLogs && acc.tagLogs.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-dashed border-slate-200 text-[10px] space-y-1">
                        <div className="flex items-center gap-1 font-bold text-slate-500 uppercase tracking-wider text-[9px]">
                          <Clock className="w-2.5 h-2.5 text-slate-400" />
                          <span>Tag Author &amp; Provenance History:</span>
                        </div>
                        <div className="space-y-1 max-h-20 overflow-y-auto pr-1">
                          {acc.tagLogs.map((log, lIdx) => (
                            <div
                              key={lIdx}
                              className="flex items-center justify-between bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60 text-slate-600 text-[9px]"
                            >
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-slate-800">#{log.tag}</span>
                                <span className="px-1 py-0.2 rounded bg-slate-200 text-slate-700 font-medium">
                                  {log.addedByRole}
                                </span>
                              </div>
                              <span className="text-slate-500">
                                Added by <strong className="text-slate-700 font-semibold">{log.addedByName}</strong>
                                {log.addedAt && (
                                  <span className="text-slate-400 ml-1">
                                    · {new Date(log.addedAt).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Metadata */}
                <div className="px-4 py-2 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>ID: {acc.id}</span>
                  <span>Updated: {new Date(acc.updatedAt || acc.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* REGISTER NEW BANK ACCOUNT MODAL */}
      {/* ========================================================= */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="p-4 bg-[#880E23] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-white" />
                <div>
                  <h3 className="font-bold text-sm">Register Enterprise Bank Account</h3>
                  <p className="text-[10px] text-white/80">
                    6 Standardized Fields · Multi-User Assignment · Confidential Storage
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(false)}
                className="text-white/70 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegisterAccount} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Employee Account / Beneficiary Name *
                </label>
                <input
                  type="text"
                  required
                  value={formEmployeeAccount}
                  onChange={(e) => setFormEmployeeAccount(e.target.value)}
                  placeholder="e.g. Acme Corporate Pool Float"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23]/20 focus:border-[#880E23]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Bank Name *</label>
                  <select
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23]/20 focus:border-[#880E23] bg-white"
                  >
                    <option value="HDFC Bank">HDFC Bank</option>
                    <option value="State Bank of India">State Bank of India</option>
                    <option value="ICICI Bank">ICICI Bank</option>
                    <option value="Axis Bank">Axis Bank</option>
                    <option value="Punjab National Bank">Punjab National Bank</option>
                    <option value="Bank of Baroda">Bank of Baroda</option>
                    <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">IFSC Code *</label>
                  <input
                    type="text"
                    required
                    value={formIfscCode}
                    onChange={(e) => setFormIfscCode(e.target.value.toUpperCase())}
                    placeholder="HDFC0001248"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#880E23]/20 focus:border-[#880E23]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Number *</label>
                <input
                  type="text"
                  required
                  value={formAccountNumber}
                  onChange={(e) => setFormAccountNumber(e.target.value)}
                  placeholder="e.g. 50100492817264"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#880E23]/20 focus:border-[#880E23]"
                />
              </div>

              {/* Confidential Netbanking Credentials */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 text-xs flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    Confidential Netbanking Credentials
                  </span>
                  <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded font-bold">
                    Admin / Sub-Admin Only
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Bank Username</label>
                    <input
                      type="text"
                      value={formBankUsername}
                      onChange={(e) => setFormBankUsername(e.target.value)}
                      placeholder="e.g. corp_ops_hdfc"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Bank Password</label>
                    <input
                      type="password"
                      value={formBankPassword}
                      onChange={(e) => setFormBankPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Custom Tags */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Custom Synchronized Tags (Comma Separated)
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="Primary, Field Float, Highway Fuel"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23]/20 focus:border-[#880E23]"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  These tags will synchronize across all devices and Android dropdowns.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registering}
                  className="px-4 py-2 bg-[#880E23] hover:bg-[#6B081A] text-white rounded-lg font-bold disabled:opacity-50 transition-colors"
                >
                  {registering ? 'Registering...' : 'Register Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CONFIRM MARK UPI EXHAUSTED MODAL */}
      {/* ========================================================= */}
      {upiExhaustModalAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="p-4 bg-rose-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ZapOff className="w-5 h-5 text-white" />
                <div>
                  <h3 className="font-bold text-sm">Mark UPI Limit Exhausted</h3>
                  <p className="text-[10px] text-white/80">
                    Syncs Warning to All Mobile &amp; Web Users
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUpiExhaustModalAccount(null)}
                className="text-white/70 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Target Bank Account:
                </span>
                <span className="font-bold text-slate-900 text-sm block mt-0.5">
                  {upiExhaustModalAccount.bankName}
                </span>
                <span className="font-mono text-slate-600 text-xs block">
                  {maskAcc(upiExhaustModalAccount.accountNumber)} (IFSC: {upiExhaustModalAccount.ifscCode})
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Exhaustion Reason / Quota Note *
                </label>
                <textarea
                  rows={3}
                  value={upiExhaustReason}
                  onChange={(e) => setUpiExhaustReason(e.target.value)}
                  placeholder="e.g. Daily UPI limit exhausted (₹1,00,000 quota reached) - Please use IMPS / Netbanking"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] space-y-1">
                <strong>Real-Time Team Synchronization:</strong>
                <p className="text-amber-800 leading-relaxed">
                  Marking this account as <strong>UPI Exhausted</strong> will immediately flag the account with a warning badge across all assigned field agents on Android and the Web Portal, instructing them to route payments via <strong>IMPS, Netbanking, or Corporate Card</strong> instead.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUpiExhaustModalAccount(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleUpiStatus(upiExhaustModalAccount, false, upiExhaustReason)}
                  disabled={upiToggling}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <ZapOff className="w-3.5 h-3.5" />
                  <span>{upiToggling ? 'Updating...' : 'Confirm UPI Exhausted'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

