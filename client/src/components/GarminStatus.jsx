import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { formatDistanceToNow } from 'date-fns';

export default function GarminStatus() {
  const [status, setStatus] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleSync = async () => {
    setLoading(true); setError('');
    try { await api.garminSync(); fetchStatus(); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleResync = async () => {
    if (!confirm('Re-import all activities from the last 30 days?')) return;
    setLoading(true); setError('');
    try { await api.garminResync(); fetchStatus(); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Garmin?')) return;
    await api.garminDisconnect();
    setStatus(null); fetchStatus();
  };

  if (!status) return null;

  if (!status.connected) {
    return showForm ? (
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
          <button type="button" onClick={() => setShowForm(false)}
            className="text-white/40 hover:text-white/70 text-xs px-2 transition-colors">
            Cancel
          </button>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </form>
    ) : (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>
          <span className="text-white/40 text-xs">Not connected</span>
        </div>
        <button onClick={() => setShowForm(true)}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 rounded-lg transition-colors">
          Connect Garmin
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${status.syncInProgress ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400'}`}></span>
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
      <div className="flex gap-3">
        {!status.syncInProgress && (
          <>
            <button onClick={handleSync} disabled={loading}
              className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors disabled:opacity-50">
              Sync now
            </button>
            <button onClick={handleResync} disabled={loading}
              className="text-white/20 hover:text-white/50 text-xs transition-colors disabled:opacity-50">
              Re-sync 30d
            </button>
          </>
        )}
        <button onClick={handleDisconnect}
          className="text-white/20 hover:text-red-400 text-xs transition-colors">
          Disconnect
        </button>
      </div>
    </div>
  );
}
