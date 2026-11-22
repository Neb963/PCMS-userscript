export const APP_URL = 'https://perchance.org/welcome#pcms';
export const APP_NAME = 'PCMS_OPERATOR';

export function isAppPage(location) {
  return location.origin === 'https://perchance.org' && location.pathname === '/welcome' && location.hash === '#pcms';
}

// Explicit operator action only. Reuse an existing UI without reloading its forms.
export function openPCMS(win) {
  const target = win.open('', APP_NAME);
  if (!target || target.closed) return { opened: false, reason: 'popup-blocked' };
  try {
    if (target.location.href === 'about:blank') target.location.replace(APP_URL);
    else if (target.location.href !== APP_URL) return { opened: false, reason: 'tab-unavailable' };
    target.focus();
    return { opened: true };
  } catch {
    return { opened: false, reason: 'tab-unavailable' };
  }
}

export function installLauncher(doc, launch) {
  const insert = () => {
    if (doc.getElementById('pcms-launch')) return;
    const bar = doc.querySelector('#menuBarEl .container > :first-child');
    if (!bar) return;
    const button = doc.createElement('button');
    button.id = 'pcms-launch';
    button.type = 'button';
    button.textContent = 'PCMS';
    button.setAttribute('aria-label', 'Open PCMS');
    button.addEventListener('click', launch);
    bar.append(button);
  };
  insert();
  const observer = new MutationObserver(insert);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}
