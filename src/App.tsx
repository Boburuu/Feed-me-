import { useEffect, useRef, useState } from "react";
import LockScreen from "./screens/LockScreen";
import MainApp from "./screens/MainApp";
import Onboarding from "./screens/Onboarding";
import { clearImages } from "./lib/images";
import { clearData, loadData, saveData, type AppData } from "./lib/storage";

// Au-delà de ce délai en arrière-plan, le code est redemandé au retour.
const AUTO_LOCK_MS = 60_000;

export default function App() {
  const [data, setData] = useState<AppData | null>(() => loadData());
  const [locked, setLocked] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (data) setStorageError(!saveData(data));
  }, [data]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > AUTO_LOCK_MS) setLocked(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const theme = data?.theme ?? "sauge";
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const update = (change: (current: AppData) => AppData) =>
    setData((current) => (current ? change(current) : current));

  const reset = () => {
    clearData();
    clearImages();
    setData(null);
    setLocked(true);
  };

  const importData = (backup: AppData) => {
    setData(backup);
    setLocked(true);
  };

  return (
    <main className="app-shell">
      <section className="phone" data-theme={theme}>
        {!data && (
          <Onboarding
            onCreate={(created) => { setData(created); setLocked(false); }}
            onImport={importData}
          />
        )}
        {data && locked && <LockScreen data={data} onUnlock={() => setLocked(false)} onReset={reset} />}
        {data && !locked && (
          <MainApp data={data} update={update} onLock={() => setLocked(true)} onReset={reset} onImport={importData} />
        )}
        {storageError && (
          <p className="storage-error" role="alert">
            Enregistrement impossible : l'espace de stockage est plein. Essayez une photo de profil plus légère ou exportez puis effacez des données.
          </p>
        )}
      </section>
    </main>
  );
}
