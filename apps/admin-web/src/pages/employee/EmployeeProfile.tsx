import React, { useState, useEffect } from 'react';
import {
  UserCircle,
  Building2,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  Plus,
  Tag,
  Star,
  Trash2,
  Zap,
  ZapOff,
  AlertTriangle,
  Edit3,
  Clock,
  Check,
} from 'lucide-react';
import { employeeApi, bankAccountApi } from '../../services/api';
import { EmployeeProfile as EmployeeProfileType, EmployeeBankAccount } from '../../types';

export const EmployeeProfile: React.FC = () => {
  const [employee, setEmployee] = useState<EmployeeProfileType | null>(null);
  const [phone, setPhone] = useState('');
  const [bankAccounts, setBankAccounts] = useState<EmployeeBankAccount[]>([]);
  const [showAccount, setShowAccount] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // New Account Modal/Inline Form
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newBankName, setNewBankName] = useState('HDFC Bank');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newIfsc, setNewIfsc] = useState('HDFC0001234');
  const [newEmployeeAccount, setNewEmployeeAccount] = useState('');
  const [newBankUsername, setNewBankUsername] = useState('');
  const [newBankPassword, setNewBankPassword] = useState('');
  const [newTags, setNewTags] = useState('Personal Float, Travel');
  const [newIsPrimary, setNewIsPrimary] = useState(false);

  // Quick Tag
  const [activeTagAccId, setActiveTagAccId] = useState<string | null>(null);
  const [quickTag, setQuickTag] = useState('');

  // Bulk Edit / Change Tags
  const [editingTagsAccId, setEditingTagsAccId] = useState<string | null>(null);
  const [editTagsText, setEditTagsText] = useState('');
  const [editTagsSaving, setEditTagsSaving] = useState(false);

  const loadProfile = async () => {
    try {
      const [emp, accs] = await Promise.all([
        employeeApi.getMyProfile(),
        employeeApi.getBankAccounts(),
      ]);
      setEmployee(emp);
      setPhone(emp.phone);
      setBankAccounts(accs);
    } catch (err) {
      console.error('Failed to load employee profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      const updated = await employeeApi.updateProfile({ phone });
      setEmployee((prev) => (prev ? { ...prev, ...updated } : updated));
      setSavedMsg('Mobile phone number updated successfully.');
    } catch (err) {
      console.error('Failed to update phone:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountNumber || !newBankName || !newIfsc) {
      alert('Bank name, Account number, and IFSC are required.');
      return;
    }
    try {
      const tags = newTags.split(',').map((t) => t.trim()).filter(Boolean);
      await employeeApi.addBankAccount({
        bankName: newBankName.trim(),
        accountNumber: newAccountNumber.trim(),
        ifscCode: newIfsc.trim().toUpperCase(),
        accountHolderName: newEmployeeAccount.trim() || employee?.name || 'Account Beneficiary',
        employeeAccount: newEmployeeAccount.trim() || employee?.name || 'Account Beneficiary',
        bankUsername: newBankUsername.trim() || undefined,
        bankPassword: newBankPassword.trim() || undefined,
        tags,
        isPrimary: newIsPrimary,
      });
      setIsAddOpen(false);
      setNewAccountNumber('');
      setNewEmployeeAccount('');
      setNewBankUsername('');
      setNewBankPassword('');
      await loadProfile();
      setSavedMsg('New bank account added. Confidential credentials securely routed to Admin/Sub-Admin.');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add bank account');
    }
  };

  const handleSetPrimary = async (bankAccountId: string) => {
    try {
      await employeeApi.setPrimaryBankAccount(bankAccountId);
      await loadProfile();
    } catch (err) {
      console.error('Failed to set primary account:', err);
    }
  };

  const handleRemoveAccount = async (bankAccountId: string) => {
    if (!confirm('Are you sure you want to remove this bank account from your profile?')) return;
    try {
      await employeeApi.removeBankAccount(bankAccountId);
      await loadProfile();
    } catch (err) {
      console.error('Failed to remove account:', err);
    }
  };

  const handleQuickAddTag = async (bankAccountId: string) => {
    if (!quickTag.trim()) return;
    try {
      await employeeApi.addTagToAccount(bankAccountId, quickTag.trim());
      setQuickTag('');
      setActiveTagAccId(null);
      await loadProfile();
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  };

  const handleRemoveTag = async (bankAccountId: string, tag: string) => {
    try {
      await employeeApi.removeTagFromAccount(bankAccountId, tag);
      await loadProfile();
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  };

  const handleStartEditTags = (acc: EmployeeBankAccount) => {
    setEditingTagsAccId(acc.bankAccountId);
    setEditTagsText((acc.tags || []).join(', '));
    setActiveTagAccId(null);
  };

  const handleSaveEditTags = async (bankAccountId: string) => {
    setEditTagsSaving(true);
    try {
      const parsedTags = editTagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await employeeApi.updateTags(bankAccountId, parsedTags);
      setEditingTagsAccId(null);
      await loadProfile();
    } catch (err) {
      console.error('Failed to update tags:', err);
    } finally {
      setEditTagsSaving(false);
    }
  };

  const handleToggleUpi = async (acc: EmployeeBankAccount) => {
    const nextActive = acc.isUpiActive === false;
    try {
      await employeeApi.setUpiStatus(acc.bankAccountId, {
        isUpiActive: nextActive,
        upiStatus: nextActive ? 'ACTIVE' : 'EXHAUSTED',
        reason: nextActive
          ? undefined
          : 'Daily UPI transfer limit exhausted (₹1,00,000 quota reached) - Please use IMPS / Netbanking',
      });
      await loadProfile();
    } catch (err) {
      console.error('Failed to toggle UPI status:', err);
    }
  };

  if (loading || !employee) {
    return <div className="p-8 text-center text-xs text-slate-400">Loading profile...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">My Employee Profile &amp; Bank Accounts</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your assigned hub information, mobile phone number, and multiple settlement bank accounts with synchronized tags.
        </p>
      </div>

      {savedMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {savedMsg}
        </div>
      )}

      {/* Read-Only Corporate Profile Info */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-12 h-12 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 font-bold text-base">
            {employee.name.charAt(0)}
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">{employee.name}</h3>
            <span className="text-xs text-slate-500">{employee.email}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block font-medium">Employee Code</span>
            <span className="font-mono font-bold text-slate-800">{employee.employeeCode}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Assigned Hub</span>
            <span className="font-semibold text-slate-800">{employee.subAdminRegion || 'General HQ'}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Supervisor</span>
            <span className="font-semibold text-slate-800">{employee.subAdminName || 'Direct Admin'}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Working Radius</span>
            <span className="font-semibold text-teal-700">{employee.assignedLocation.allowedRadiusMeters} meters</span>
          </div>
        </div>
      </div>

      {/* Editable Phone Form */}
      <form onSubmit={handleSavePhone} className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-4 text-xs">
        <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100">Contact Information</h3>
        <div className="max-w-md">
          <label className="block font-semibold text-slate-700 mb-1">Mobile Phone</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
            />
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-xs disabled:opacity-50 shrink-0"
            >
              {saving ? 'Saving...' : 'Update Phone'}
            </button>
          </div>
        </div>
      </form>

      {/* Multi-Bank Accounts Section */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              My Settlement Bank Accounts ({bankAccounts.length})
            </h3>
            <span className="text-[11px] bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-semibold border border-teal-200/60">
              Multiple Accounts Supported
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAccount(!showAccount)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              {showAccount ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showAccount ? 'Mask Numbers' : 'Unmask Numbers'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAddOpen(!isAddOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAddOpen ? 'Cancel' : 'Add Bank Account'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Add Account Form */}
        {isAddOpen && (
          <form onSubmit={handleAddAccount} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 block text-xs">Register Settlement Account</span>
              <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                🔒 Credentials Protected (Admin/Sub-Admin Eyes Only)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Employee Account :</label>
                <input
                  type="text"
                  value={newEmployeeAccount}
                  onChange={(e) => setNewEmployeeAccount(e.target.value)}
                  placeholder={employee.name}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Number :</label>
                <input
                  type="text"
                  value={newAccountNumber}
                  onChange={(e) => setNewAccountNumber(e.target.value)}
                  placeholder="50100..."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">IFSC Code :</label>
                <input
                  type="text"
                  value={newIfsc}
                  onChange={(e) => setNewIfsc(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono uppercase"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bank Name :</label>
                <input
                  type="text"
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bank Username :</label>
                <input
                  type="text"
                  value={newBankUsername}
                  onChange={(e) => setNewBankUsername(e.target.value)}
                  placeholder="Optional portal login"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bank Password :</label>
                <input
                  type="password"
                  value={newBankPassword}
                  onChange={(e) => setNewBankPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block font-semibold text-slate-700 mb-1">Custom Tags (Comma Separated)</label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="Personal, Travel Float, Salary"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px]">
              <strong>Security Protocol:</strong> Your Bank Username and Bank Password are encrypted immediately. Once submitted, these credentials are strictly restricted and accessible <strong>to authorized Admin and Sub-Admin supervisors only</strong>. They will never be exposed on employee devices.
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={newIsPrimary}
                  onChange={(e) => setNewIsPrimary(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>Set as Primary Settlement Account</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-200/60 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-xs"
                >
                  Save Account
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Bank Accounts Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {bankAccounts.map((acc) => (
            <div
              key={acc.id}
              className={`p-4 rounded-xl border transition-all ${
                acc.isPrimary
                  ? 'bg-teal-50/40 border-teal-200 shadow-xs'
                  : 'bg-slate-50/70 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between pb-2 border-b border-slate-200/70">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">{acc.bankName}</span>
                    {acc.isUpiActive !== false ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                        <Zap className="w-2.5 h-2.5 text-emerald-600" />
                        UPI Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-300">
                        <ZapOff className="w-2.5 h-2.5 text-rose-600" />
                        ⚠️ UPI Exhausted
                      </span>
                    )}
                    {acc.isPrimary && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-teal-600 text-white px-2 py-0.5 rounded-full">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        Primary
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">IFSC: {acc.ifscCode}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleToggleUpi(acc)}
                    className={`px-2 py-1 text-[10px] font-semibold rounded border transition-colors flex items-center gap-1 ${
                      acc.isUpiActive !== false
                        ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    }`}
                    title={acc.isUpiActive !== false ? 'Mark UPI as Exhausted' : 'Restore UPI to Active'}
                  >
                    {acc.isUpiActive !== false ? (
                      <>
                        <ZapOff className="w-2.5 h-2.5 text-rose-600" />
                        <span>Exhausted</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-2.5 h-2.5 text-emerald-600" />
                        <span>Active</span>
                      </>
                    )}
                  </button>
                  {!acc.isPrimary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(acc.bankAccountId)}
                      className="px-2 py-1 text-[11px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200/80"
                    >
                      Make Primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveAccount(acc.bankAccountId)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                    title="Remove Account"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Alert banner if UPI is Exhausted */}
              {acc.isUpiActive === false && (
                <div className="my-2 p-2 bg-rose-50/90 border border-rose-200 rounded-lg text-xs space-y-0.5 text-rose-800">
                  <div className="flex items-center justify-between font-bold text-[11px]">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      UPI Limit Exhausted
                    </span>
                    <span className="text-[9px] bg-rose-200 text-rose-900 px-1 py-0.2 rounded font-semibold uppercase">
                      Use IMPS / Netbanking
                    </span>
                  </div>
                  <p className="text-[10px] text-rose-700">
                    {acc.upiExhaustedReason ||
                      'UPI transfers currently unavailable. Route claims via IMPS, Netbanking, or Corporate Card.'}
                  </p>
                </div>
              )}

              <div className="py-2.5 space-y-1 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                    Employee Account :
                  </span>
                  <span className="font-semibold text-slate-800">
                    {acc.employeeAccount || acc.accountHolderName || employee.name}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                    Account Number :
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {showAccount ? acc.accountNumber : acc.maskedAccountNumber}
                  </span>
                </div>
              </div>

              {/* Tags & Quick Tag Add / Edit */}
              <div className="pt-2 border-t border-slate-200/70">
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    <Tag className="w-3 h-3 text-slate-400" />
                    <span>Synchronized Tags</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingTagsAccId !== acc.bankAccountId && activeTagAccId !== acc.bankAccountId && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTagAccId(acc.bankAccountId);
                            setQuickTag('');
                            setEditingTagsAccId(null);
                          }}
                          className="text-[11px] font-bold text-teal-700 hover:underline flex items-center gap-0.5"
                        >
                          <Plus className="w-3 h-3" /> Add Tag
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditTags(acc)}
                          className="text-[11px] font-bold text-indigo-700 hover:underline flex items-center gap-0.5"
                        >
                          <Edit3 className="w-3 h-3" /> Change Tags
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Inline Quick Tag Add */}
                {activeTagAccId === acc.bankAccountId && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <input
                      type="text"
                      value={quickTag}
                      onChange={(e) => setQuickTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleQuickAddTag(acc.bankAccountId);
                        }
                      }}
                      placeholder="e.g. Fuel Float, Highway NH-44"
                      className="px-2 py-1 text-xs border border-teal-300 rounded bg-white flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleQuickAddTag(acc.bankAccountId)}
                      className="px-2.5 py-1 bg-teal-600 text-white font-bold text-xs rounded hover:bg-teal-700"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTagAccId(null)}
                      className="px-2 py-1 text-slate-400 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Inline Change/Bulk Edit Tags */}
                {editingTagsAccId === acc.bankAccountId && (
                  <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2 mb-2">
                    <div className="flex items-center justify-between text-indigo-900 font-bold text-[11px]">
                      <span>Modify / Change Tags for this Account</span>
                      <span className="text-[10px] text-indigo-600 font-normal">Comma-separated</span>
                    </div>
                    <input
                      type="text"
                      value={editTagsText}
                      onChange={(e) => setEditTagsText(e.target.value)}
                      placeholder="e.g. Highway Fuel, Emergency Float, Travel"
                      className="w-full px-2.5 py-1.5 border border-indigo-300 rounded bg-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      autoFocus
                    />
                    <div className="flex items-center justify-between text-[10px] text-indigo-700">
                      <span>Syncs to all assigned users &amp; logs your name to Admin Audit Trail.</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingTagsAccId(null)}
                          className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-600 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEditTags(acc.bankAccountId)}
                          disabled={editTagsSaving}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded flex items-center gap-1 shadow-xs disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" />
                          <span>{editTagsSaving ? 'Saving...' : 'Save Tags'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tag Pills */}
                <div className="flex flex-wrap gap-1.5">
                  {acc.tags && acc.tags.length > 0 ? (
                    acc.tags.map((t, idx) => {
                      const logMeta = acc.tagLogs?.find((l) => l.tag.toLowerCase() === t.toLowerCase());
                      return (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200/80 text-slate-800 border border-slate-300/60 inline-flex items-center gap-1"
                          title={
                            logMeta
                              ? `Added by ${logMeta.addedByName} (${logMeta.addedByRole}) on ${
                                  logMeta.addedAt ? new Date(logMeta.addedAt).toLocaleString() : 'N/A'
                                }`
                              : undefined
                          }
                        >
                          <span>#{t}</span>
                          {logMeta && logMeta.addedByName && (
                            <span className="text-[9px] text-slate-500 font-normal">
                              · {logMeta.addedByName.split(' ')[0]}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(acc.bankAccountId, t)}
                            className="text-slate-400 hover:text-rose-600 font-bold ml-0.5 text-xs transition-colors"
                            title={`Remove tag ${t}`}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">No tags</span>
                  )}
                </div>

                {/* Tag Author Provenance History */}
                {acc.tagLogs && acc.tagLogs.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-dashed border-slate-200 text-[10px] space-y-1">
                    <div className="flex items-center gap-1 font-bold text-slate-500 uppercase tracking-wider text-[9px]">
                      <Clock className="w-2.5 h-2.5 text-slate-400" />
                      <span>Tag Author Provenance (Visible to Admin):</span>
                    </div>
                    <div className="space-y-1 max-h-16 overflow-y-auto pr-1">
                      {acc.tagLogs.map((log, lIdx) => (
                        <div
                          key={lIdx}
                          className="flex items-center justify-between bg-slate-100/70 px-2 py-0.5 rounded text-slate-600 text-[9px]"
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-slate-800">#{log.tag}</span>
                            <span className="px-1 py-0.2 rounded bg-slate-200 text-slate-700 font-medium text-[8px]">
                              {log.addedByRole}
                            </span>
                          </div>
                          <span>
                            by <strong className="text-slate-700 font-semibold">{log.addedByName}</strong>
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
          ))}
        </div>
      </div>
    </div>
  );
};
