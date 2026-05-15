import type { FormEvent } from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

type Dept = { id: string; name: string };

export function UploadPage() {
  const nav = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [departmentId, setDepartmentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data } = await api.get<Dept[]>('/api/departments');
      return data;
    },
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !departmentId) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('departmentId', departmentId);
      const { data } = await api.post<{ id: string }>('/api/invoice-files/upload', fd);
      nav(`/invoices/${data.id}`);
    } catch {
      setError('Upload failed. Check file size (max 15 MB) and department.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Upload invoice</h2>
      <p className="muted">
        Supports Excel (<code>.xlsx</code>), CSV (including Google Sheets → Download as CSV), and
        images (manual entry after upload).
      </p>
      <div className="card">
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="dept">Department (cost center owner)</label>
            <select
              id="dept"
              required
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">Select…</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="file">File</label>
            <input
              id="file"
              type="file"
              accept=".xlsx,.xls,.csv,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </form>
      </div>

      <h3>Google Sheets</h3>
      <p className="muted">
        In Google Sheets use <strong>File → Share → Publish to web</strong> (or export CSV) and
        paste the published CSV URL below.
      </p>
      <GoogleCsvImport />
    </div>
  );
}

function GoogleCsvImport() {
  const nav = useNavigate();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post<{ id: string }>('/api/invoices/import/google-csv', {
        url,
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
        <button type="submit" className="btn btn-secondary" disabled={busy}>
          {busy ? 'Importing…' : 'Import from URL'}
        </button>
      </form>
    </div>
  );
}
