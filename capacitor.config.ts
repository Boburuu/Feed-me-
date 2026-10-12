import type { CapacitorConfig } from '@capacitor/cli';

// appId ne doit plus jamais changer : c'est lui qui permet au téléphone
// de reconnaître une mise à jour et de garder les données.
const config: CapacitorConfig = {
  appId: 'app.feedme.duo',
  appName: 'Feed Me',
  webDir: 'dist',
  // Débogage via chrome://inspect : par défaut, actif sur la version de test (debug)
  // et coupé sur la version finale (release) diffusée aux amis.
};

export default config;
