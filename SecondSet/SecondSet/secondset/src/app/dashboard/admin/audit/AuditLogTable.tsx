'use client';

import { useState } from 'react';
import Link from 'next/link';

interface AuditEvent {
  id: string;
  eventType: string;
  createdAt: Date;
  metadata: any;
  user: {
    name: string;
    email: string;
  };
  paymentRequest?: {
    id: string;
    payee: {
      name: string;
    };
  } | null;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuditLogTableProps {
  initialEvents: AuditEvent[];
  users: User[];
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  REQUEST_CREATED: 'Request Created',
  REQUEST_SUBMITTED: 'Request Submitted',
  REQUEST_APPROVED: 'Request Approved',
  REQUEST_REJECTED: 'Request Rejected',
  REQUEST_RELEASED: 'Request Released',
  REQUEST_BROADCASTED: 'Request Broadcasted',
  REQUEST_CONFIRMED: 'Request Confirmed',
  USER_CREATED: 'User Created',
  USER_ROLES_UPDATED: 'User Roles Updated',
  VAULT_CREATED: 'Vault Created',
  PAYEE_CREATED: 'Payee Created',
};

const EVENT_TYPE_BADGE_CLASS: Record<string, string> = {
  REQUEST_CREATED: 'bg-[#F3F4F6] text-[#6B7280]',
  REQUEST_SUBMITTED: 'badge-warning',
  REQUEST_APPROVED: 'badge-primary',
  REQUEST_REJECTED: 'badge-danger',
  REQUEST_RELEASED: 'badge-info',
  REQUEST_BROADCASTED: 'badge-info',
  REQUEST_CONFIRMED: 'badge-success',
  USER_CREATED: 'badge-primary',
  USER_ROLES_UPDATED: 'badge-primary',
  VAULT_CREATED: 'badge-success',
  PAYEE_CREATED: 'badge-success',
};

export default function AuditLogTable({ initialEvents, users }: AuditLogTableProps) {
  const [events] = useState(initialEvents);
  const [filterEventType, setFilterEventType] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredEvents = events.filter((event) => {
    if (filterEventType && event.eventType !== filterEventType) return false;
    if (filterUserId && event.user.email !== filterUserId) return false;
    
    const eventDate = new Date(event.createdAt);
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (eventDate < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (eventDate > end) return false;
    }
    
    return true;
  });

  const exportToCSV = () => {
    // CSV headers
    const headers = [
      'Timestamp',
      'Event Type',
      'User Name',
      'User Email',
      'Payment Request ID',
      'Payee Name',
      'Amount (USDC)',
      'Asset',
      'Transaction Hash',
      'Confirmations',
      'Roles',
      'New Roles',
      'New User Email',
      'Chain',
      'Vault Address',
      'Payee Name (Metadata)',
      'Rejection Reason',
      'Block Number',
      'Explorer URL',
    ];

    // Convert events to CSV rows
    const rows = filteredEvents.map((event) => {
      const metadata = event.metadata || {};
      
      return [
        new Date(event.createdAt).toISOString(),
        EVENT_TYPE_LABELS[event.eventType] || event.eventType,
        event.user.name,
        event.user.email,
        event.paymentRequest?.id || '',
        event.paymentRequest?.payee.name || '',
        metadata.amount ? (parseInt(metadata.amount) / 1_000_000).toFixed(2) : '',
        metadata.asset || '',
        metadata.txHash || '',
        metadata.confirmations || '',
        metadata.roles ? metadata.roles.join('; ') : '',
        metadata.newRoles ? metadata.newRoles.join('; ') : '',
        metadata.newUserEmail || '',
        metadata.chain || '',
        metadata.address || '',
        metadata.payeeName || '',
        metadata.reason || '',
        metadata.blockNumber || '',
        metadata.explorerUrl || '',
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(cell => {
          // Escape cells that contain commas, quotes, or newlines
          const cellStr = String(cell);
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',')
      )
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const filename = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      {/* Filters */}
      <div className="card-modern rounded-modern-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <h4 className="font-bold text-[#1F2937]">Filters</h4>
          </div>
          
          <button
            onClick={exportToCSV}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export to CSV ({filteredEvents.length} events)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-[#1F2937] mb-2">
              Event Type
            </label>
            <select
              value={filterEventType}
              onChange={(e) => setFilterEventType(e.target.value)}
              className="input-modern w-full"
            >
              <option value="">All Events</option>
              {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1F2937] mb-2">
              User
            </label>
            <select
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="input-modern w-full"
            >
              <option value="">All Users</option>
              {users.map((user) => (
                <option key={user.id} value={user.email}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1F2937] mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input-modern w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1F2937] mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input-modern w-full"
            />
          </div>
        </div>

        {(filterEventType || filterUserId || startDate || endDate) && (
          <div className="mt-4 flex items-center justify-between pt-4 border-t border-[#E5E7EB]">
            <p className="text-sm text-[#6B7280]">
              Showing <span className="font-semibold text-[#1F2937]">{filteredEvents.length}</span> of {events.length} events
            </p>
            <button
              onClick={() => {
                setFilterEventType('');
                setFilterUserId('');
                setStartDate('');
                setEndDate('');
              }}
              className="text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Events Table */}
      <div className="card-modern rounded-modern-lg overflow-hidden">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Event</th>
              <th>User</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <svg className="w-12 h-12 mx-auto mb-3 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-[#9CA3AF]">No audit events found</p>
                </td>
              </tr>
            ) : (
              filteredEvents.map((event) => (
                <tr key={event.id}>
                  <td className="text-[#6B7280]">
                    <div>{new Date(event.createdAt).toLocaleDateString()}</div>
                    <div className="text-xs text-[#9CA3AF]">{new Date(event.createdAt).toLocaleTimeString()}</div>
                  </td>
                  <td>
                    <span className={`badge-modern ${EVENT_TYPE_BADGE_CLASS[event.eventType] || 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                      {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-xs">
                        {event.user.name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <div className="font-semibold text-[#1F2937]">{event.user.name}</div>
                        <div className="text-xs text-[#9CA3AF]">{event.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {event.paymentRequest && (
                      <Link
                        href={`/dashboard/requests/${event.paymentRequest.id}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors"
                      >
                        Payment to {event.paymentRequest.payee.name}
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    )}
                    
                    {/* Render metadata in human-readable format */}
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <div className="text-xs text-[#6B7280] mt-2 space-y-1">
                        {/* Amount */}
                        {event.metadata.amount && (
                          <div className="flex items-center gap-1">
                            <span className="text-[#9CA3AF]">Amount:</span>
                            <span className="font-semibold text-[#1F2937]">${(parseInt(event.metadata.amount) / 1_000_000).toFixed(2)} USDC</span>
                          </div>
                        )}
                        
                        {/* Asset */}
                        {event.metadata.asset && event.metadata.asset !== 'USDC' && (
                          <div className="flex items-center gap-1">
                            <span className="text-[#9CA3AF]">Asset:</span>
                            <span className="font-semibold">{event.metadata.asset}</span>
                          </div>
                        )}
                        
                        {/* Transaction Hash with Explorer Link */}
                        {event.metadata.txHash && (
                          <div className="flex items-center gap-1">
                            <span className="text-[#9CA3AF]">Tx:</span>
                            {event.metadata.explorerUrl ? (
                              <a
                                href={event.metadata.explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-mono text-[#1DBFA4] hover:text-[#179983] transition-colors"
                              >
                                {event.metadata.txHash.slice(0, 10)}...{event.metadata.txHash.slice(-8)}
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ) : (
                              <span className="font-mono text-[#6B7280]">
                                {event.metadata.txHash.slice(0, 10)}...{event.metadata.txHash.slice(-8)}
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Block Number */}
                        {event.metadata.blockNumber && (
                          <div className="flex items-center gap-1">
                            <span className="text-[#9CA3AF]">Block:</span>
                            <span className="font-mono text-[#6B7280]">{event.metadata.blockNumber}</span>
                          </div>
                        )}
                        
                        {/* Confirmations */}
                        {event.metadata.confirmations && (
                          <div className="flex items-center gap-1">
                            <span className="badge-modern badge-success text-xs">{event.metadata.confirmations} confirmations</span>
                          </div>
                        )}
                        
                        {/* Roles */}
                        {event.metadata.roles && Array.isArray(event.metadata.roles) && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[#9CA3AF]">Roles:</span>
                            {event.metadata.roles.map((role: string) => (
                              <span key={role} className="badge-modern badge-primary text-xs">{role}</span>
                            ))}
                          </div>
                        )}
                        
                        {event.metadata.newRoles && Array.isArray(event.metadata.newRoles) && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[#9CA3AF]">New Roles:</span>
                            {event.metadata.newRoles.map((role: string) => (
                              <span key={role} className="badge-modern badge-primary text-xs">{role}</span>
                            ))}
                          </div>
                        )}
                        
                        {/* User Email */}
                        {event.metadata.newUserEmail && (
                          <div className="flex items-center gap-1">
                            <span className="text-[#9CA3AF]">User:</span>
                            <span className="font-semibold">{event.metadata.newUserEmail}</span>
                          </div>
                        )}
                        
                        {/* Vault Address */}
                        {event.metadata.address && event.metadata.chain && (
                          <div className="flex items-center gap-1">
                            <span className="text-[#9CA3AF]">{event.metadata.chain}:</span>
                            <span className="font-mono text-[#6B7280]">
                              {event.metadata.address.slice(0, 10)}...{event.metadata.address.slice(-8)}
                            </span>
                          </div>
                        )}
                        
                        {/* Payee Name */}
                        {event.metadata.payeeName && (
                          <div className="flex items-center gap-1">
                            <span className="text-[#9CA3AF]">Payee:</span>
                            <span className="font-semibold">{event.metadata.payeeName}</span>
                          </div>
                        )}
                        
                        {/* Rejection Reason */}
                        {event.metadata.reason && (
                          <div className="flex items-start gap-1 bg-red-50 p-2 rounded-md -mx-1">
                            <svg className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-red-700 text-xs">{event.metadata.reason}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}