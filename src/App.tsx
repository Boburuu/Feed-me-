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
  // Après le premier déverrouillage, l'appli reste ouverte sous l'écran du code : au retour,
  // on retrouve la page, la recherche ou la fenêtre où l'on était.
  const [opened, setOpened] = useState(false);
  // Nouvelles données (import, réinitialisation) : l'appli repart de zéro.
  const [session, setSession] = useState(0);
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
    setOpened(false);
    setSession((value) => value + 1);
  };

  const importData = (backup: AppData) => {
    setData(backup);
    setLocked(true);
    setOpened(false);
    setSession((value) => value + 1);
  };

  return (
    <main className="app-shell">
      <section className="phone" data-theme={theme}>
        {!data && (
          <Onboarding
            onCreate={(created) => { setData(created); setLocked(false); setOpened(true); }}
            onImport={importData}
          />
        )}
        {data && opened && (
          // Caché et inactif tant que le code n'est pas saisi.
          <div className="app-layer" aria-hidden={locked} inert={locked}>
            <MainApp key={session} data={data} update={update} onLock={() => setLocked(true)} onReset={reset} onImport={importData} />
          </div>
        )}
        {data && locked && (
          <div className={opened ? "lock-layer" : undefined}>
            <LockScreen data={data} onUnlock={() => { setLocked(false); setOpened(true); }} onReset={reset} />
          </div>
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
