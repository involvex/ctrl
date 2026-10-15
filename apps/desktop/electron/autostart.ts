import { app } from 'electron';

export type AutostartSettings = {
  openAtLogin: boolean;
};

export function getAutostart(): AutostartSettings {
  const settings = app.getLoginItemSettings();
  return {
    openAtLogin: settings.openAtLogin,
  };
}

export function setAutostart(next: {
  openAtLogin: boolean;
}): AutostartSettings {
  app.setLoginItemSettings({
    openAtLogin: next.openAtLogin,
  });
  return getAutostart();
}
