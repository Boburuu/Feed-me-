import { useEffect, useRef, useState } from "react";
import LockScreen from "./screens/LockScreen";
import MainApp from "./screens/MainApp";
import Onboarding from "./screens/Onboarding";
import { saveSafetyCopy } from "./lib/backup";
import { loadData, saveData, type AppData } from "./lib/storage";
import { moveDataToTrash, removeFromTrash, unreadableDataPresent } from "./lib/trash";

// Au-delà de ce délai en arrière-plan, le code est redemandé au retour.
const AUTO_LOCK_MS = 60_000;

export default function App() {
  const [data, setData] = useState<AppData | null>(() => {
    const loaded = loadData();
    // Données présentes mais illisibles : mises de côté, jamais écrasées par un nouveau compte.
    if (!loaded && unreadableDataPresent()) moveDataToTrash(true);
    return loaded;
  });
  const [eraseError, setEraseError] = useState(false);
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

  const chosenTheme = data?.theme ?? "glace-sombre";
  const [phoneDark, setPhoneDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPhoneDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const theme = chosenTheme === "auto" ? (phoneDark ? "sombre" : "clair") : chosenTheme;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const update = (change: (current: AppData) => AppData) =>
    setData((current) => (current ? change(current) : current));

  /** Effacer : copie de sécurité, puis corbeille (30 jours). Les photos des recettes restent pour la restauration. */
  const reset = async () => {
    if (data) await saveSafetyCopy(data);
    if (!moveDataToTrash()) { setEraseError(true); return; }
    setData(null);
    setLocked(true);
    setOpened(false);
    setSession((value) => value + 1);
  };

  const restoreTrash = (backup: AppData, deletedAt: string) => {
    importData(backup);
    removeFromTrash(deletedAt);
  };

  const importData = (backup: AppData) => {
    setData(backup);
    setLocked(true);
    setOpened(false);
    setSession((value) => value + 1);
  };

  return (
    <main className="app-shell">
      {eraseError && <p className="storage-error" role="alert">Rien n'a été effacé : le téléphone n'a plus assez de place pour garder une copie. Libère de l'espace puis réessaie.</p>}
      <section className="phone" data-theme={theme}>
        {!data && (
          <Onboarding
            onCreate={(created) => { setData(created); setLocked(false); setOpened(true); }}
            onImport={importData}
            onRestoreTrash={restoreTrash}
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
