import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  UserPlus,
  Users,
  Search,
  Building,
  IndianRupee,
  CheckCircle2,
  Eye,
  Shield,
  Power,
  Key,
} from 'lucide-react';
import { superAdminApi } from '../../services/api';
import { SubAdminEnriched } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';

export const SubAdminManagement: React.FC = () => {
  const [subAdmins, setSubAdmins] = useState<SubAdminEnriched[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Modals
  const [selectedSubAdmin, setSelectedSubAdmin] = useState<SubAdminEnriched | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCreateSubAdminOpen, setIsCreateSubAdminOpen] = useState(false);

  // New subadmin form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRegion, setNewRegion] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  // Password Reset State (Super Admin Exclusive)
  const [passwordSubAdmin, setPasswordSubAdmin] = useState<SubAdminEnriched | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const saData = await superAdminApi.getSubAdmins();
      setSubAdmins(saData || []);
    } catch (err) {
      console.error('Failed to load sub-admins:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleStatus = async (sa: SubAdminEnriched) => {
    const nextStatus = sa.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
    try {
      await superAdminApi.toggleUserStatus(sa.id, nextStatus);
      await fetchData();
    } catch (err) {
      console.error('Failed to toggle status:', err);
      alert('Failed to update status');
    }
  };

  const handleCreateSubAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await superAdminApi.createUser({
        name: newName,
        email: newEmail,
        role: 'SUB_ADMIN',
        region: newRegion || 'Operations Hub',
        phone: newPhone,
      });
      await fetchData();
      setIsCreateSubAdminOpen(false);
      setNewName('');
      setNewEmail('');
      setNewRegion('');
      setNewPhone('');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create sub-admin');
    } finally {
      setCreating(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordSubAdmin) return;
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    setChangingPassword(true);
    setPasswordError('');
    setPasswordSuccess('');
    try {
      await superAdminApi.changeUserPassword(passwordSubAdmin.id, newPassword);
      setPasswordSuccess(`Password successfully changed for ${passwordSubAdmin.name}`);
      setTimeout(() => {
        setPasswordSubAdmin(null);
        setNewPassword('');
        setPasswordSuccess('');
      }, 1500);
    } catch (err: any) {
      setPasswordError(err.response?.data?.message || err.message || 'Failed to update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const filtered = subAdmins.filter(
    (sa) =>
      (sa.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (sa.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (sa.region && sa.region.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Sub-Admin Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage regional hub supervisors and administrative accounts. Super Admins and Sub-Admins supervise field operations and allocate funds directly to employees.
          </p>
        </div>

        <button
          onClick={() => setIsCreateSubAdminOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#880E23] hover:bg-[#6B081A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add Regional Sub-Admin
        </button>
      </div>

      {/* Sub-Admin KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 bg-white p-8 rounded-xl border border-slate-200/80 text-center text-slate-400 text-xs">
            Loading Sub-Admin records...
          </div>
        ) : subAdmins.length === 0 ? (
          <div className="col-span-3 bg-white p-8 rounded-xl border border-slate-200/80 text-center text-slate-400 text-xs">
            No Sub-Admins created yet. Click "Add Regional Sub-Admin" above to onboard your first regional supervisor.
          </div>
        ) : (
          subAdmins.map((sa) => (
            <div key={sa.id} className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 font-bold flex items-center justify-center text-sm">
                    {sa.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{sa.name}</h3>
                    <span className="text-[11px] text-slate-500 block">{sa.email}</span>
                  </div>
                </div>
                <StatusBadge status={sa.status} size="sm" />
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Operating Region:</span>
                  <span className="font-semibold text-slate-800">{sa.region || 'Operations Hub'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Role Authority:</span>
                  <span className="font-semibold text-[#880E23]">Regional Manager</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Contact:</span>
                  <span className="font-semibold text-slate-700">{sa.phone || '+91 9876543210'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setSelectedSubAdmin(sa);
                    setIsDetailsModalOpen(true);
                  }}
                  className="flex-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" /> View Profile
                </button>
                <button
                  onClick={() => {
                    setPasswordSubAdmin(sa);
                    setNewPassword('');
                    setPasswordError('');
                    setPasswordSuccess('');
                  }}
                  className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                >
                  <Key className="w-3.5 h-3.5 text-slate-500" /> Password
                </button>
                <button
                  onClick={() => handleToggleStatus(sa)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors border ${
                    sa.status === 'ACTIVE'
                      ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                      : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  {sa.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sub-Admins Detail Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">All Sub-Admin Accounts</h3>
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Sub-Admins..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Sub-Admin Name</th>
              <th className="py-3 px-4">Region / Hub</th>
              <th className="py-3 px-4">Contact Phone</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  No Sub-Admin accounts found matching your search.
                </td>
              </tr>
            ) : (
              filtered.map((sa) => (
                <tr key={sa.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{sa.name}</div>
                    <div className="text-[11px] text-slate-500">{sa.email}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{sa.region || 'Operations Hub'}</td>
                  <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                    {sa.phone || '+91 9876543210'}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={sa.status} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      onClick={() => {
                        setSelectedSubAdmin(sa);
                        setIsDetailsModalOpen(true);
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold"
                    >
                      Profile
                    </button>
                    <button
                      onClick={() => {
                        setPasswordSubAdmin(sa);
                        setNewPassword('');
                        setPasswordError('');
                        setPasswordSuccess('');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold"
                    >
                      <Key className="w-3.5 h-3.5 text-slate-500" /> Password
                    </button>
                    <button
                      onClick={() => handleToggleStatus(sa)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                        sa.status === 'ACTIVE'
                          ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                          : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {sa.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sub-Admin Profile Details Modal */}
      {isDetailsModalOpen && selectedSubAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D040A]/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-[#E8E2D8] w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E2D8] flex items-center justify-between bg-[#FAF8F5]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-teal-50 text-teal-700 rounded-lg border border-teal-200">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#2D2526] text-sm">{selectedSubAdmin.name}</h3>
                  <p className="text-[11px] text-[#74675B]">{selectedSubAdmin.region || 'Operations Hub'}</p>
                </div>
              </div>
              <button onClick={() => setIsDetailsModalOpen(false)} className="text-[#A89B85] hover:text-[#2D2526] transition-colors">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Email Address</span>
                  <span className="font-semibold text-slate-900">{selectedSubAdmin.email}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Phone</span>
                  <span className="font-semibold text-slate-900">{selectedSubAdmin.phone || '+91 9876543210'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">System Role</span>
                  <span className="font-bold text-[#880E23]">SUB_ADMIN</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Account Status</span>
                  <div className="mt-0.5"><StatusBadge status={selectedSubAdmin.status} size="sm" /></div>
                </div>
              </div>

              <div className="p-3 bg-[#FAF8F5] border border-[#E8E2D8] rounded-lg space-y-2">
                <span className="font-bold text-slate-900 block">Hub Supervision Details</span>
                <div className="flex justify-between">
                  <span className="text-slate-500">Assigned Region:</span>
                  <span className="font-bold text-slate-900">{selectedSubAdmin.region || 'Operations Hub'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Role Authority:</span>
                  <span className="font-bold text-[#880E23]">Regional Manager</span>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-slate-400">
                Created: {new Date(selectedSubAdmin.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div className="px-6 py-3 bg-[#FAF8F5] border-t border-[#E8E2D8] flex justify-end">
              <button
                onClick={() => setIsDetailsModalOpen(false)}
                className="px-4 py-2 bg-[#880E23] hover:bg-[#6B081A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Sub-Admin Modal */}
      {isCreateSubAdminOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D040A]/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-[#E8E2D8] w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E2D8] flex items-center justify-between bg-[#FAF8F5]">
              <h3 className="font-bold text-[#2D2526] text-sm">Add Sub-Admin Hub Lead</h3>
              <button onClick={() => setIsCreateSubAdminOpen(false)} className="text-[#A89B85] hover:text-[#2D2526] transition-colors">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubAdmin} className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#5A504E] mb-1">Supervisor Full Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  className="w-full px-3 py-2 border border-[#DDD5C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] bg-white text-[#2D2526]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A504E] mb-1">Corporate Email Address *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. sarah.jenkins@enterprise.com"
                  className="w-full px-3 py-2 border border-[#DDD5C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] bg-white text-[#2D2526]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#5A504E] mb-1">Assigned Region / Hub</label>
                  <input
                    type="text"
                    value={newRegion}
                    onChange={(e) => setNewRegion(e.target.value)}
                    placeholder="e.g. North Operations Hub"
                    className="w-full px-3 py-2 border border-[#DDD5C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] bg-white text-[#2D2526]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#5A504E] mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+91 98765 00000"
                    className="w-full px-3 py-2 border border-[#DDD5C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] bg-white text-[#2D2526]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[#EBE5DB] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateSubAdminOpen(false)}
                  className="px-4 py-2 border border-[#DDD5C7] rounded-lg text-[#5A504E] font-semibold hover:bg-[#FAF8F5] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-[#880E23] hover:bg-[#6B081A] text-white font-semibold rounded-lg shadow-xs disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Sub-Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal (Super Admin Exclusive) */}
      {passwordSubAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D040A]/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-[#E8E2D8] w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E2D8] flex items-center justify-between bg-[#FAF8F5]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#FDF2F4] text-[#880E23] rounded-lg border border-[#F8CAD1]">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#2D2526] text-sm">Reset Sub-Admin Password</h3>
                  <p className="text-[10px] text-[#74675B]">Super Admin Exclusive Authority</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPasswordSubAdmin(null);
                  setPasswordError('');
                  setPasswordSuccess('');
                }}
                className="text-[#A89B85] hover:text-[#2D2526] transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <p className="font-semibold text-slate-800 text-sm">{passwordSubAdmin.name}</p>
                <p className="text-slate-500 text-[11px]">{passwordSubAdmin.email}</p>
                <p className="text-slate-500 text-[11px] font-mono mt-0.5">{passwordSubAdmin.region || 'Regional Hub'}</p>
              </div>

              {passwordError && (
                <div className="p-2.5 bg-red-50 text-red-700 rounded-lg text-xs border border-red-200">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs border border-emerald-200">
                  {passwordSuccess}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  New Password (min 6 characters) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter secure new password"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] text-xs font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordSubAdmin(null);
                    setPasswordError('');
                    setPasswordSuccess('');
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPassword || newPassword.length < 6}
                  className="px-4 py-2 bg-[#880E23] hover:bg-[#6D0B1C] text-white font-semibold rounded-lg shadow-xs disabled:opacity-50 transition-colors"
                >
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
