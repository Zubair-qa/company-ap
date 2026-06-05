import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type Dept = { id: string; name: string };

function apiErrorMessage(error: unknown, fallback: string) {
  const maybe = error as {
    message?: string;
    response?: { data?: { message?: string | string[]; error?: string } };
  };
  const message = maybe.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? maybe.response?.data?.error ?? maybe.message ?? fallback;
}

export function UploadPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [procurementMode, setProcurementMode] = useState<'PURCHASE_ORDER' | 'NON_PURCHASE_ORDER'>(
    'PURCHASE_ORDER',
  );
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [poFile, setPoFile] = useState<File | null>(null);
  const [grnFile, setGrnFile] = useState<File | null>(null);
  const [departmentId, setDepartmentId] = useState(user?.departmentId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canCreateInvoice = user?.role === 'DEPT_USER';
  const isDepartmentUser = user?.role === 'DEPT_USER';

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    enabled: canCreateInvoice,
    queryFn: async () => {
      const { data } = await api.get<Dept[]>('/api/departments');
      return data;
    },
  });

  useEffect(() => {
    if (isDepartmentUser && user?.departmentId) {
      setDepartmentId(user.departmentId);
    }
  }, [isDepartmentUser, user?.departmentId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!invoiceFile || !departmentId) return;
    if (procurementMode === 'PURCHASE_ORDER' && (!poFile || !grnFile)) {
      setError('Purchase order, GRN, and invoice slips are required for PO invoices.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('procurementMode', procurementMode);
      fd.append('purchaseOrderRequired', procurementMode === 'PURCHASE_ORDER' ? 'true' : 'false');
      fd.append('invoiceFile', invoiceFile);
      if (procurementMode === 'PURCHASE_ORDER') {
        if (poFile) fd.append('poFile', poFile);
        if (grnFile) fd.append('grnFile', grnFile);
      }
      fd.append('departmentId', departmentId);
      const { data } = await api.post<{ id: string }>('/api/invoice-files/upload', fd);
      nav(`/invoices/${data.id}`);
    } catch (uploadError) {
      setError(
        apiErrorMessage(
          uploadError,
          'Invoice could not be created. Check file size, department, and access scope.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  if (!canCreateInvoice) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Invoice creation is department-owned</h2>
        <p className="muted">
          Department users create invoices. Agent validation checks the synced invoice, PO,
          payment plan, and supporting documents before AP receives the request.
        </p>
        <p className="muted">
          Current session: {user?.name} / {user?.role.replaceAll('_', ' ')}. Log in as a
          department requester to create a new invoice.
        </p>
        <Link to="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          Back to AP board
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Create invoice</h2>
      <p className="muted">
        Department users submit invoices here. Purchase-order invoices require PO, GRN, and
        invoice slips; non-PO invoices use the existing single invoice flow.
      </p>
      <div className="card">
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Invoice type</label>
            <div className="procurement-toggle" role="group" aria-label="Invoice type">
              <label className={procurementMode === 'PURCHASE_ORDER' ? 'selected' : ''}>
                <input
                  type="checkbox"
                  checked={procurementMode === 'PURCHASE_ORDER'}
                  onChange={() => setProcurementMode('PURCHASE_ORDER')}
                />
                Purchase order
              </label>
              <label className={procurementMode === 'NON_PURCHASE_ORDER' ? 'selected' : ''}>
                <input
                  type="checkbox"
                  checked={procurementMode === 'NON_PURCHASE_ORDER'}
                  onChange={() => setProcurementMode('NON_PURCHASE_ORDER')}
                />
                Non purchase order
              </label>
            </div>
          </div>
          <div className="field">
            <label htmlFor="dept">Department (cost center owner)</label>
            <select
              id="dept"
              required
              value={departmentId}
              disabled={isDepartmentUser}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">Select...</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          {procurementMode === 'PURCHASE_ORDER' ? (
            <div className="upload-pack-grid">
              <FileInput
                id="poFile"
                label="Purchase order slip"
                file={poFile}
                onFile={setPoFile}
              />
              <FileInput id="grnFile" label="GRN slip" file={grnFile} onFile={setGrnFile} />
              <FileInput
                id="invoiceFile"
                label="Invoice slip"
                file={invoiceFile}
                onFile={setInvoiceFile}
              />
            </div>
          ) : (
            <FileInput
              id="invoiceFile"
              label="Invoice slip"
              file={invoiceFile}
              onFile={setInvoiceFile}
              allowSpreadsheet
            />
          )}
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating...' : 'Create invoice'}
          </button>
        </form>
      </div>

      <h3>Google Sheets</h3>
      <p className="muted">
        Publish or export the sheet as CSV, then paste the published CSV URL below.
      </p>
      <GoogleCsvImport departmentId={departmentId} />
    </div>
  );
}

function FileInput({
  id,
  label,
  file,
  onFile,
  allowSpreadsheet = false,
}: {
  id: string;
  label: string;
  file: File | null;
  onFile: (file: File | null) => void;
  allowSpreadsheet?: boolean;
}) {
  return (
    <div className="field upload-file-card">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept={allowSpreadsheet ? '.pdf,.xlsx,.xls,.csv,image/*' : '.pdf,image/*'}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        required
      />
      <small>{file ? file.name : 'No file selected'}</small>
    </div>
  );
}

function GoogleCsvImport({ departmentId }: { departmentId: string }) {
  const nav = useNavigate();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go(e: FormEvent) {
    e.preventDefault();
    if (!departmentId) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post<{ id: string }>('/api/invoices/import/google-csv', {
        url,
        departmentId,
      });
      nav(`/invoices/${data.id}`);
    } catch {
      setError('Import failed. Use an HTTPS link that returns CSV bytes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <form onSubmit={go}>
        <div className="field">
          <label htmlFor="csvurl">Published CSV URL</label>
          <input
            id="csvurl"
            type="url"
            placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=0"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="btn btn-secondary" disabled={busy || !departmentId}>
          {busy ? 'Importing...' : 'Import from URL'}
        </button>
      </form>
    </div>
  );
}
