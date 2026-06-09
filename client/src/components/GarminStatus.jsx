import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { formatDistanceToNow } from 'date-fns';

export default function GarminStatus() {
  const [status, setStatus] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [importJson, setImportJson] = useState('');
  const [exportJson, setExportJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshPlansDone, setRefreshPlansDone] = useState(false);
  const [message, setMessage] = useState('');

  const fetchStatus = useCallback(async () => {
    try { setStatus(await api.garminStatus()); } catch {}
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (!status?.syncInProgress) return;
    const t = setInterval(fetchStatus, 3000);
    return () => clearInterval(t);
  }, [status?.syncInProgress, fetchStatus]);

  const handleConnect = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.garminConnect(username, password);
      setShowForm(false); setUsername(''); setPassword('');
      fetchStatus();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleImport = async () => {
    setLoading(true); setError('');
    try {
      const parsed = JSON.parse(importJson);
      await api.garminSessionImport(parsed);
      setShowImport(false); setImportJson('');
      fetchStatus();
    } catch (err) {
      setError(err.message.includes('JSON') ? 'Invalid JSON — paste the full export from your local instance' : err.message);
    }
    finally { setLoading(false); }
  };

  const handleExport = async () => {
    setLoading(true); setError('');
    try {
      const data = await api.garminSessionExport();
      setExportJson(JSON.stringify(data, null, 2));
      setShowExport(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(exportJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSync = async () => {
    setLoading(true); setError('');
    try { await api.garminSync(); fetchStatus(); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleRefreshPlans = async () => {
    setLoading(true); setError(''); setMessage(''); setRefreshPlansDone(false);
    try {
      await api.garminRefreshPlans();
      const r = await api.reparseAll();
      setRefreshPlansDone(true);
      setMessage(`Plans updated · reparsed ${r.activitiesReparsed} activities (${r.totalSets} sets)`);
      setTimeout(() => { setRefreshPlansDone(false); setMessage(''); }, 5000);
    }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleReparse = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const r = await api.reparseAll();
      setMessage(`Reparsed ${r.activitiesReparsed} activities (${r.totalSets} sets)`);
      setTimeout(() => setMessage(''), 5000);
    }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Garmin?')) return;
    await api.garminDisconnect();
    setStatus(null); setShowExport(false); fetchStatus();
  };

  if (!status) return null;

  // ── Not connected ────────────────────────────────────────────────────
  if (!status.connected) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
          <span className="text-white/40 text-xs">Not connected</span>
        </div>

        {/* Password login form */}
        {showForm && !showImport && (
          <form onSubmit={handleConnect} className="space-y-2">
            <input type="text" placeholder="Garmin email" value={username}
              onChange={(e) => setUsername(e.target.value)} required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500" />
            <input type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500" />
            <div className="flex gap-2">
              <button type="submit" disabled={loading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                {loading ? 'Connecting…' : 'Connect'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setError(''); }}
                className="text-white/40 hover:text-white/70 text-xs px-2 transition-colors">
                Cancel
              </button>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </form>
        )}

        {/* Import session form */}
        {showImport && (
          <div className="space-y-2">
            <p className="text-white/40 text-xs leading-relaxed">
              Paste the JSON exported from your local instance:
            </p>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder={'{\n  "oauth1Token": "...",\n  "oauth2Token": "..."\n}'}
              rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 font-mono resize-none"
            />
            <div className="flex gap-2">
              <button onClick={handleImport} disabled={loading || !importJson.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                {loading ? 'Importing…' : 'Import session'}
              </button>
              <button onClick={() => { setShowImport(false); setError(''); }}
                className="text-white/40 hover:text-white/70 text-xs px-2 transition-colors">
                Cancel
              </button>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>
        )}

        {/* Buttons when neither form is showing */}
        {!showForm && !showImport && (
          <>
            <button onClick={() => setShowForm(true)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 rounded-lg transition-colors">
              Connect Garmin
            </button>
            <button onClick={() => setShowImport(true)}
              className="w-full text-white/30 hover:text-white/60 text-xs py-1 transition-colors text-center">
              Import session from local →
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Connected ────────────────────────────────────────────────────────
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${status.syncInProgress ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400'}`} />
        <span className="text-white/70 text-xs font-medium">
          {status.syncInProgress ? 'Syncing…' : 'Garmin connected'}
        </span>
      </div>

      {status.lastSyncedAt && !status.syncInProgress && (
        <p className="text-white/30 text-xs">
          Synced {formatDistanceToNow(new Date(status.lastSyncedAt))} ago
        </p>
      )}
      {status.lastSyncResult?.error && (
        <p className="text-red-400 text-xs">Sync error: {status.lastSyncResult.error}</p>
      )}
      {status.lastSyncResult && !status.lastSyncResult.error && (
        <p className="text-white/30 text-xs">{status.lastSyncResult.imported} imported</p>
      )}

      <div className="flex gap-3 flex-wrap">
        {!status.syncInProgress && (
          <>
            <button onClick={handleSync} disabled={loading}
              className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors disabled:opacity-50">
              Sync now
            </button>
            <button onClick={handleRefreshPlans} disabled={loading}
              className={`text-xs transition-colors disabled:opacity-50 ${
                refreshPlansDone
                  ? 'text-emerald-400'
                  : 'text-white/20 hover:text-white/50'
              }`}>
              {refreshPlansDone ? '✓ Plans refreshed' : 'Refresh plans'}
            </button>
            <button onClick={handleReparse} disabled={loading}
              className="text-white/20 hover:text-white/50 text-xs transition-colors disabled:opacity-50">
              Reparse
            </button>
          </>
        )}
        <button onClick={handleDisconnect}
          className="text-white/20 hover:text-red-400 text-xs transition-colors">
          Disconnect
        </button>
      </div>

      {/* Export session */}
      {!status.syncInProgress && (
        <div>
          {!showExport ? (
            <button onClick={handleExport} disabled={loading}
              className="text-white/20 hover:text-white/50 text-xs transition-colors">
              Export session →
            </button>
          ) : (
            <div className="space-y-1.5 mt-1">
              <p className="text-white/30 text-xs">Copy this to your production instance:</p>
              <textarea
                readOnly
                value={exportJson}
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/60 font-mono resize-none focus:outline-none"
              />
              <div className="flex gap-2">
                <button onClick={handleCopy}
                  className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">
                  {copied ? '✓ Copied' : 'Copy to clipboard'}
                </button>
                <button onClick={() => { setShowExport(false); setExportJson(''); }}
                  className="text-white/20 hover:text-white/50 text-xs transition-colors">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {message && <p className="text-emerald-400/80 text-xs">{message}</p>}
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
